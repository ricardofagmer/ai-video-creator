import { type PublishFailureReason } from '@studio/shared/platforms';
import { type TokenBundle } from '../../token-bundle';
import { type PlatformClientOperation } from '../platform-client.errors';
import { type PlatformIdentity, type UploadStatus, type UploadStatusRequest } from '../platform-client.port';
import { dataErrorReason } from './youtube-error-map';
import { bearerHeaders, parseYoutubeBody, readJsonBody, retryAfterSeconds, sendYoutubeRequest, youtubeError } from './youtube-http';
import { ChannelsResponseSchema, VideoStateListSchema, type VideoState } from './youtube.schemas';
import { youtubeEndpoints, youtubeTimeoutsMs } from './youtube.constants';

/*
 * Data API reads of one resource each: the connected channel (identity, 1 unit [G3]) and the
 * processing state of an uploaded video (`videos.list`, 1 unit). Both send a `fields` mask so the
 * answer holds only what the strict schemas allow, and no title or tag ever comes back.
 */

/** The mask shared by the upload's final answer and the status check. */
export const VIDEO_STATE_FIELDS = 'id,snippet(publishedAt),status(uploadStatus,failureReason,rejectionReason)';

/** A video id as the status check may put it in a query string: a public id, never a secret. */
const videoIdPattern = /^[A-Za-z0-9_-]{11}$/;

/** One authorized GET on the Data API, its error mapped to a reason id. */
export async function getYoutubeData(
  fetchFn: typeof fetch,
  request: { operation: PlatformClientOperation; url: URL; tokens: TokenBundle; now: Date; signal?: AbortSignal },
): Promise<Response> {
  const response = await sendYoutubeRequest(fetchFn, {
    operation: request.operation,
    url: request.url,
    method: 'GET',
    headers: bearerHeaders(request.tokens.accessToken.revealForPlatformCall()),
    timeoutMs: youtubeTimeoutsMs.data,
    signal: request.signal,
  });
  if (response.ok) return response;
  const body = await readJsonBody(response, request.operation);
  throw youtubeError(request.operation, dataErrorReason(response.status, body, request.operation), {
    retryAfterSeconds: retryAfterSeconds(response, request.now),
  });
}

/** The connected channel: its title is shown on `/contas`, its id stored; neither is logged (K7). */
export async function fetchYoutubeIdentity(fetchFn: typeof fetch, tokens: TokenBundle): Promise<PlatformIdentity> {
  const url = new URL(youtubeEndpoints.channels);
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('mine', 'true');
  url.searchParams.set('fields', 'items(id,snippet(title))');
  const response = await getYoutubeData(fetchFn, { operation: 'identity', url, tokens, now: new Date() });
  const answer = await parseYoutubeBody(response, ChannelsResponseSchema, 'identity');
  const channel = answer.items?.[0];
  // A Google account with no YouTube channel cannot upload or report metrics.
  if (channel === undefined) throw youtubeError('identity', 'account-not-eligible');
  return { accountLabel: channel.snippet.title, platformAccountId: channel.id };
}

/** Why YouTube refused a video it received ([G2] `status.failureReason` / `rejectionReason`). */
function refusalOf(state: VideoState): PublishFailureReason {
  const { uploadStatus, rejectionReason } = state.status;
  if (uploadStatus === 'failed') return 'media-rejected';
  if (uploadStatus === 'rejected' && rejectionReason === 'length') return 'media-rejected';
  return 'policy-rejected';
}

/** A video's processing state as the port's status; `uploaded` means YouTube is still processing. */
export function uploadStatusOf(state: VideoState, now: Date): UploadStatus {
  switch (state.status.uploadStatus) {
    case 'uploaded':
      return { state: 'processing' };
    case 'processed':
      return { state: 'published', platformVideoId: state.id, platformMediaId: null, publishedAt: state.snippet?.publishedAt ?? now.toISOString() };
    case 'failed':
    case 'rejected':
    case 'deleted':
      return { state: 'failed', reasonId: refusalOf(state) };
  }
}

/** Section 5.5 "finish": one status check of an uploaded video. */
export async function fetchYoutubeUploadStatus(fetchFn: typeof fetch, request: UploadStatusRequest): Promise<UploadStatus> {
  if (!videoIdPattern.test(request.uploadRef)) throw youtubeError('upload-status', 'invalid-response');
  const url = new URL(youtubeEndpoints.videos);
  url.searchParams.set('part', 'snippet,status');
  url.searchParams.set('id', request.uploadRef);
  url.searchParams.set('fields', `items(${VIDEO_STATE_FIELDS})`);
  const response = await getYoutubeData(fetchFn, { operation: 'upload-status', url, tokens: request.tokens, now: request.now });
  const answer = await parseYoutubeBody(response, VideoStateListSchema, 'upload-status');
  const state = answer.items?.[0];
  // The video the upload created is not listed: whether it exists is unknown, never guessed.
  if (state === undefined || state.id !== request.uploadRef) throw youtubeError('upload-status', 'outcome-unknown');
  return uploadStatusOf(state, request.now);
}
