import { type PlatformCapability } from '@studio/shared/platforms';

/*
 * TikTok endpoints, scopes and host rules (SPEC 0007 sections 5.1 and 5.2, K6). Every URL the
 * client calls is built from these constants, except the `upload_url` TikTok returns at upload
 * init, which is accepted only through `isAllowedUploadUrl` (Assumption B12).
 */

/** Login Kit for Desktop [T1]: the authorize page is served by `www.tiktok.com` over https only. */
export const TIKTOK_AUTHORIZE_URL = 'https://www.tiktok.com/v2/auth/authorize/';

/** Base of every Open API endpoint below; the scheme, host and version live in one place. */
const TIKTOK_OPEN_API = 'https://open.tiktokapis.com/v2';

/** Token exchange and refresh [T2]: one endpoint, `grant_type` tells them apart. */
export const TIKTOK_TOKEN_URL = `${TIKTOK_OPEN_API}/oauth/token/`;

/** Token revoke [T2]. */
export const TIKTOK_REVOKE_URL = `${TIKTOK_OPEN_API}/oauth/revoke/`;

/** Display API user info; `user.info.basic` covers `open_id` and `display_name` only. */
export const TIKTOK_USER_INFO_URL = `${TIKTOK_OPEN_API}/user/info/`;

/** Content Posting API inbox upload init [T4] (Q2 option a, OD6). Direct post is not implemented. */
export const TIKTOK_INBOX_INIT_URL = `${TIKTOK_OPEN_API}/post/publish/inbox/video/init/`;

/** Post status [T8]. */
export const TIKTOK_STATUS_URL = `${TIKTOK_OPEN_API}/post/publish/status/fetch/`;

/** Display API video query [T6]. */
export const TIKTOK_VIDEO_QUERY_URL = `${TIKTOK_OPEN_API}/video/query/`;

/** The only fields the user info call asks for: the account id and the label shown on `/contas`. */
export const TIKTOK_USER_INFO_FIELDS = 'open_id,display_name';

/** The only fields the video query asks for: the id and the four counts of the section 5.5 table. */
export const TIKTOK_VIDEO_QUERY_FIELDS = 'id,view_count,like_count,comment_count,share_count';

/** The fields of the one query that reads a published post's link (`video.list` already covers it). */
export const TIKTOK_SHARE_URL_FIELDS = 'id,share_url';

/** [T6]: at most 20 video ids per query, so a pass costs `ceil(N/20)` calls (section 5.7). */
export const TIKTOK_VIDEO_QUERY_BATCH = 20;

/** The two fixed hosts of K6; the upload host is checked separately by suffix. */
const fixedHosts: readonly string[] = ['www.tiktok.com', 'open.tiktokapis.com'];

/** Assumption B12: the returned upload host must sit under one of these suffixes. */
const uploadHostSuffixes: readonly string[] = ['.tiktokapis.com', '.tiktok.com'];

/** Section 5.2 minimal scopes, exactly as TikTok spells them. `video.publish` is never requested. */
export const tiktokIdentityScopes: readonly string[] = ['user.info.basic'];
export const tiktokCapabilityScopes: Readonly<Record<PlatformCapability, readonly string[]>> = Object.freeze({
  metrics: ['video.list'],
  publish: ['video.upload'],
});

function isPlainHttps(url: URL): boolean {
  return url.protocol === 'https:' && url.username === '' && url.password === '' && (url.port === '' || url.port === '443');
}

/** True for a URL on one of the two fixed TikTok hosts, over https, with no credentials or port. */
export function isAllowedApiUrl(url: URL): boolean {
  return isPlainHttps(url) && fixedHosts.includes(url.hostname);
}

/**
 * The `upload_url` rule (SPEC 0007 section 6 "Outbound", B12): https, no credentials, the default
 * port, and a host that ends in `.tiktokapis.com` or `.tiktok.com`. The examples in TikTok's media
 * transfer guide (`open-upload.tiktokapis.com`, `upload.us.tiktokapis.com`) all match. Returns the
 * parsed URL, or null when the text is not a URL or breaks the rule.
 */
export function parseAllowedUploadUrl(text: string): URL | null {
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    // The text is TikTok's and may carry an upload token: the parser's message is not kept.
    return null;
  }
  if (!isPlainHttps(url)) return null;
  return uploadHostSuffixes.some((suffix) => url.hostname.endsWith(suffix)) ? url : null;
}
