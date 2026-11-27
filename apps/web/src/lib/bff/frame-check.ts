import 'server-only';
import { lookup as dnsLookup, type LookupAddress } from 'node:dns';
import { request, type RequestOptions } from 'node:https';
import { type IncomingHttpHeaders } from 'node:http';
import { BlockList, isIP } from 'node:net';
import { framePolicyOf, type FramePolicy } from './frame-policy';

/** `unknown`: the site could not be asked (down, slow, refused HEAD, private address); the page tries the frame. */
export type FrameCheck = FramePolicy | 'unknown';

const MAX_REDIRECTS = 3;
/** One budget for the whole chain, redirects included. */
const CHECK_TIMEOUT_MS = 5_000;
const KNOWN_TTL_MS = 60 * 60 * 1000;
const UNKNOWN_TTL_MS = 2 * 60 * 1000;
const MAX_CACHE_ENTRIES = 300;
const USER_AGENT = 'Mozilla/5.0 (compatible; VideoStudio/1.0)';

/**
 * Addresses the check never connects to: this machine, private and carrier networks, link-local
 * (cloud metadata), multicast, reserved and documentation ranges, and IPv4-mapped IPv6, which
 * could otherwise smuggle any of them.
 */
const NON_PUBLIC = new BlockList();
for (const [network, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8], ['169.254.0.0', 16],
  ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24], ['192.168.0.0', 16], ['198.18.0.0', 15],
  ['198.51.100.0', 24], ['203.0.113.0', 24], ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) NON_PUBLIC.addSubnet(network, prefix, 'ipv4');
for (const [network, prefix] of [
  // No `::ffff:0:0/96` here: BlockList maps IPv4 into it, so it would match every IPv4 address.
  ['::', 128], ['::1', 128], ['64:ff9b::', 96], ['100::', 64], ['2001:db8::', 32],
  ['fc00::', 7], ['fe80::', 10], ['ff00::', 8],
] as const) NON_PUBLIC.addSubnet(network, prefix, 'ipv6');

function isPublicAddress(address: string): boolean {
  // IPv4-mapped IPv6 is judged by the IPv4 inside it; the hex spelling is refused outright.
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address);
  if (mapped?.[1] !== undefined) return isPublicAddress(mapped[1]);
  if (/^::ffff:/i.test(address)) return false;
  const family = isIP(address);
  if (family === 0) return false;
  return !NON_PUBLIC.check(address, family === 4 ? 'ipv4' : 'ipv6');
}

class FrameCheckRefusedError extends Error {
  constructor(reason: string) {
    super(`Frame check refused: ${reason}`);
    this.name = 'FrameCheckRefusedError';
  }
}

/**
 * DNS lookup that fails when any answer is not public. The connection uses the address checked here,
 * so a name that changes its answer between check and connect (DNS rebinding) cannot reach this machine.
 */
const publicOnlyLookup: NonNullable<RequestOptions['lookup']> = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses: LookupAddress[]) => {
    if (error !== null) {
      callback(error, '', 0);
      return;
    }
    const first = addresses[0];
    if (first === undefined || addresses.some((entry) => !isPublicAddress(entry.address))) {
      callback(new FrameCheckRefusedError(`${hostname} resolves to a non-public address`), '', 0);
      return;
    }
    if (options.all === true) callback(null, addresses);
    else callback(null, first.address, first.family);
  });
};

interface HeadAnswer {
  status: number;
  headers: IncomingHttpHeaders;
}

/** One HEAD request; the response has no body and the socket is closed as soon as the headers arrive. */
function head(url: URL, signal: AbortSignal): Promise<HeadAnswer> {
  return new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      { method: 'HEAD', lookup: publicOnlyLookup, signal, headers: { 'User-Agent': USER_AGENT, Accept: 'text/html' } },
      (incoming) => {
        resolve({ status: incoming.statusCode ?? 0, headers: incoming.headers });
        incoming.destroy();
      },
    );
    outgoing.on('error', reject);
    outgoing.end();
  });
}

function checkableUrl(url: URL): boolean {
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '') return false;
  const bare = url.hostname.replace(/^\[|\]$/g, '');
  // An address literal skips DNS, so the lookup guard never sees it.
  return isIP(bare) === 0 || isPublicAddress(bare);
}

async function askSite(start: URL, studioOrigin: URL): Promise<FrameCheck> {
  const signal = AbortSignal.timeout(CHECK_TIMEOUT_MS);
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    if (!checkableUrl(url)) return 'unknown';
    const answer = await head(url, signal);
    const location = answer.headers.location;
    if (answer.status >= 300 && answer.status < 400 && typeof location === 'string') {
      url = new URL(location, url);
      continue;
    }
    if (answer.status < 200 || answer.status >= 300) return 'unknown';
    return framePolicyOf({ csp: answer.headers['content-security-policy'], xFrameOptions: answer.headers['x-frame-options'] }, studioOrigin);
  }
  return 'unknown';
}

interface CacheEntry {
  check: FrameCheck;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();
const inFlight = new Map<string, Promise<FrameCheck>>();

function remember(key: string, check: FrameCheck): void {
  if (cache.size >= MAX_CACHE_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { check, expiresAt: Date.now() + (check === 'unknown' ? UNKNOWN_TTL_MS : KNOWN_TTL_MS) });
}

/**
 * Whether the studio may frame a saved website, from the `X-Frame-Options` and CSP `frame-ancestors`
 * headers of one HEAD request per hop. Failures of any kind answer `unknown`; nothing is thrown.
 */
export async function checkSiteFraming(link: URL, studioOrigin: URL): Promise<FrameCheck> {
  const key = link.href;
  const cached = cache.get(key);
  if (cached !== undefined && cached.expiresAt > Date.now()) return cached.check;
  const pending = inFlight.get(key);
  if (pending !== undefined) return pending;

  const work = askSite(link, studioOrigin)
    .catch((error: unknown): FrameCheck => {
      console.warn(`[frame-check] ${link.hostname}: ${error instanceof Error ? error.message : 'failed'}`);
      return 'unknown';
    })
    .then((check) => {
      remember(key, check);
      return check;
    })
    .finally(() => inFlight.delete(key));
  inFlight.set(key, work);
  return work;
}
