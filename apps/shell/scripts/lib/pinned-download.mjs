// Downloads one pinned input into the cache and proves it before use: plain HTTPS GET, every
// redirect hop on an allowed host, a byte cap at the pinned size, then size and SHA-256 against the
// pin. A cached file is re-proved on every run; a mismatch deletes it (fail closed, ticket 03
// "every downloaded input is checksum-verified against a pinned value").
import { createWriteStream } from 'node:fs';
import { lstat, mkdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fail, hasErrorCode, say } from './failure.mjs';
import { sha256File } from './hashing.mjs';
import { ALLOWED_DOWNLOAD_HOSTS, assertPinned } from './pins.mjs';

const MAX_REDIRECTS = 5;
const REQUEST_TIMEOUT_MS = 30 * 60 * 1000;

function checkedHop(rawUrl, pin) {
  const url = new URL(rawUrl);
  if (url.protocol !== 'https:' || !ALLOWED_DOWNLOAD_HOSTS.includes(url.hostname) || url.username !== '' || url.password !== '') {
    fail(`${pin.constant}: refusing redirect to ${url.protocol}//${url.hostname}; only https on ${ALLOWED_DOWNLOAD_HOSTS.join(', ')}.`);
  }
  return url;
}

/** Follows at most MAX_REDIRECTS hops by hand so each hop's host is checked before it is contacted. */
async function openPinned(pin, fetchImpl) {
  let url = checkedHop(pin.url, pin);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    const response = await fetchImpl(url, {
      method: 'GET',
      redirect: 'manual',
      credentials: 'omit',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location === null) fail(`${pin.constant}: redirect without a location.`);
      url = checkedHop(new URL(location, url).href, pin);
      continue;
    }
    if (response.status !== 200 || response.body === null) fail(`${pin.constant}: ${url.hostname} answered ${response.status}.`);
    return response.body;
  }
  return fail(`${pin.constant}: more than ${MAX_REDIRECTS} redirects.`);
}

function byteCap(pin) {
  let received = 0;
  return new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > pin.bytes) {
        callback(new Error(`${pin.constant}: more than the pinned ${pin.bytes} bytes`));
        return;
      }
      callback(null, chunk);
    },
  });
}

async function matchesPin(filePath, pin) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
  if (!stats.isFile() || stats.size !== pin.bytes) return false;
  return (await sha256File(filePath)) === pin.sha256;
}

/**
 * Returns the absolute path of the verified file in `cacheDir`. Downloads only when the cached copy
 * is absent or does not match. `fetchImpl` is injected (global `fetch` by default).
 */
export async function ensurePinnedFile(pin, { cacheDir, fetchImpl = fetch }) {
  assertPinned(pin);
  await mkdir(cacheDir, { recursive: true, mode: 0o700 });
  const target = join(cacheDir, pin.fileName);
  if (await matchesPin(target, pin)) {
    say(`cache ok: ${pin.label} (${pin.bytes} bytes, sha-256 ${pin.sha256})`);
    return target;
  }
  await rm(target, { force: true });
  const temporary = join(cacheDir, `.${pin.fileName}.download`);
  await rm(temporary, { force: true });
  say(`downloading ${pin.label} from ${new URL(pin.url).hostname} (${pin.bytes} bytes)`);
  try {
    const body = await openPinned(pin, fetchImpl);
    await pipeline(Readable.fromWeb(body), byteCap(pin), createWriteStream(temporary, { flags: 'wx', mode: 0o600 }));
  } catch (error) {
    await rm(temporary, { force: true });
    fail(`${pin.constant}: download failed (${error instanceof Error ? error.message : 'unknown error'}).`);
  }
  if (!(await matchesPin(temporary, pin))) {
    await rm(temporary, { force: true });
    fail(`${pin.constant}: downloaded file does not match the pinned size and SHA-256; it was deleted.`);
  }
  await rename(temporary, target);
  say(`verified: ${pin.label} sha-256 ${pin.sha256}`);
  return target;
}
