import {
  InstallPairingSchema,
  InstallPresenceSchema,
  InstallStatusSchema,
  apiPaths,
  type InstallPairing,
  type InstallPresence,
  type InstallStatus,
  type PairCode,
} from '@studio/shared/api';
import type { z } from 'zod';

/**
 * `RequestInit` plus Local Network Access's `targetAddressSpace` (vetting 0006 section 2.2 item 5).
 * The DOM lib may not declare it yet; a value of this type is still assignable to `RequestInit`
 * (extra properties are allowed outside object literals), so no cast is needed.
 */
export interface LoopbackRequestInit extends RequestInit {
  targetAddressSpace: 'loopback';
}

/** The one network primitive the client needs; injected so tests never touch the network. */
export type LoopbackFetch = (url: string, init: LoopbackRequestInit) => Promise<Response>;

/** Every way a local call can end. A body is only ever handed out after the C1 schema accepted it. */
export type LoopbackResult<T> =
  | { kind: 'ok'; value: T }
  /** 401: bad pairing code, or the token is unknown or revoked. */
  | { kind: 'unauthorized' }
  /** 503: the installed app runs on a platform it does not support. */
  | { kind: 'unavailable' }
  /** The body failed the strict C1 schema, or carried a contract number this page does not know. */
  | { kind: 'contract-mismatch' }
  /** Connection refused, loopback blocked or denied, aborted, or a CORS failure: the browser does not say which. */
  | { kind: 'network-error' }
  | { kind: 'http-error'; status: number };

export interface LoopbackClient {
  presence(signal?: AbortSignal): Promise<LoopbackResult<InstallPresence>>;
  pair(code: PairCode, signal?: AbortSignal): Promise<LoopbackResult<InstallPairing>>;
  status(token: string, signal?: AbortSignal): Promise<LoopbackResult<InstallStatus>>;
}

export interface LoopbackClientOptions {
  /** `http://127.0.0.1:<port>`: the IP literal, never `localhost` (vetting 0006 section 2.1). */
  apiOrigin: string;
  fetch: LoopbackFetch;
}

/** The browser's own `fetch`, bound to the window, called from the top-level document. */
export const browserLoopbackFetch: LoopbackFetch = (url, init) => fetch(url, init);

function baseInit(signal: AbortSignal | undefined): LoopbackRequestInit {
  return {
    mode: 'cors',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    targetAddressSpace: 'loopback',
    signal,
  };
}

async function readJson(response: Response): Promise<{ ok: true; body: unknown } | { ok: false }> {
  try {
    const body: unknown = await response.json();
    return { ok: true, body };
  } catch {
    // An unreadable body is the same failure as a body of the wrong shape: an unknown contract.
    return { ok: false };
  }
}

async function interpret<T>(response: Response, schema: z.ZodType<T>): Promise<LoopbackResult<T>> {
  if (response.status === 401) return { kind: 'unauthorized' };
  if (response.status === 503) return { kind: 'unavailable' };
  if (response.status !== 200) return { kind: 'http-error', status: response.status };
  const json = await readJson(response);
  if (!json.ok) return { kind: 'contract-mismatch' };
  const parsed = schema.safeParse(json.body);
  return parsed.success ? { kind: 'ok', value: parsed.data } : { kind: 'contract-mismatch' };
}

async function send<T>(
  request: { url: string; init: LoopbackRequestInit; fetch: LoopbackFetch },
  schema: z.ZodType<T>,
): Promise<LoopbackResult<T>> {
  let response: Response;
  try {
    response = await request.fetch(request.url, request.init);
  } catch {
    // fetch rejects with a TypeError for every network-level failure and an AbortError on abort;
    // the caller tells them apart with the permission state and its own timer.
    return { kind: 'network-error' };
  }
  return interpret(response, schema);
}

/**
 * The only module that talks to the local api. Requests carry no cookie and no referrer; the
 * token travels in `Authorization: Bearer` only, the pairing code in the JSON body only.
 */
export function createLoopbackClient(options: LoopbackClientOptions): LoopbackClient {
  const url = (path: string): string => `${options.apiOrigin}${path}`;
  return {
    presence: (signal) =>
      send({ url: url(apiPaths.installPresence()), init: { ...baseInit(signal), method: 'GET' }, fetch: options.fetch }, InstallPresenceSchema),
    pair: (code, signal) =>
      send(
        {
          url: url(apiPaths.installPair()),
          init: {
            ...baseInit(signal),
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ code }),
          },
          fetch: options.fetch,
        },
        InstallPairingSchema,
      ),
    status: (token, signal) =>
      send(
        {
          url: url(apiPaths.installStatus()),
          init: { ...baseInit(signal), method: 'GET', headers: { authorization: `Bearer ${token}` } },
          fetch: options.fetch,
        },
        InstallStatusSchema,
      ),
  };
}
