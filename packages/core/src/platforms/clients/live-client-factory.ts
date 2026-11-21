import { type PlatformClient } from './platform-client.port';

/**
 * What a live client receives when the registry builds it: the HTTP function (Node's global
 * `fetch` in production, K9) so tests replace the network. Live clients live only in
 * `clients/youtube/`, `clients/instagram/` and `clients/tiktok/` (R4-07 to R4-09), the one place
 * outbound requests are allowed (K6). A live client receives tokens already registered with the
 * redactor (`RedactingPlatformClients`, finding S4) and sends them only in a header or a POST
 * body, never in a URL, which proxies and platform logs keep.
 */
export interface LivePlatformClientContext {
  fetch: typeof fetch;
}

/** One platform folder's binding: a factory, or null while its live client is not delivered. */
export type LivePlatformClientFactory = (context: LivePlatformClientContext) => PlatformClient;

/** The production context: Node's global `fetch`, referenced here only and called by live clients only. */
export function productionLiveClientContext(): LivePlatformClientContext {
  return { fetch: globalThis.fetch };
}
