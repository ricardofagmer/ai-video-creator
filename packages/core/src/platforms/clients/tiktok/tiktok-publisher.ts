import { createHash } from 'node:crypto';
import { publishBounds } from '@studio/shared/platforms';
import { type TokenBundle } from '../../token-bundle';
import { PlatformClientError, type PlatformClientErrorReason } from '../platform-client.errors';
import { type UploadOutcome, type UploadRequest, type UploadStatus, type UploadStatusRequest } from '../platform-client.port';
import { chunkRanges, planChunks, readChunk, type ChunkPlan, type ChunkRange } from './tiktok-chunks';
import { parseAllowedUploadUrl, TIKTOK_INBOX_INIT_URL, TIKTOK_STATUS_URL } from './tiktok-endpoints';
import { postFailReason, readApiSuccess } from './tiktok-failures';
import { CHUNK_CALL_TIMEOUT_MS, JSON_CALL_TIMEOUT_MS, type TiktokAnswer, type TiktokHttp } from './tiktok-http';
import { InboxInitResponseSchema, PostStatusResponseSchema, quotePostIds, type PostStatusData } from './tiktok-schemas';

/*
 * The inbox draft upload (Q2 option a, OD6) [T4] and its status [T8]. The studio sends the video
 * only: no title, caption or tag goes to TikTok, the owner finishes the post in the app (section
 * 5.4). `video.publish` (direct post) is not implemented. One `upload` call is one init, then the
 * chunks in order; the only repeat is the B9 transport resume of the same chunk in the same upload
 * session, at most `publishBounds.transportResumes` times per upload (K5).
 */

/** Waits between transport resumes; injected so the 5, 15 and 45 s waits need no real clock in tests. */
export type ResumeWait = (milliseconds: number) => Promise<void>;

interface UploadSession {
  publishId: string;
  uploadUrl: URL;
  plan: ChunkPlan;
  tokens: TokenBundle;
  now: Date;
  resumesUsed: number;
}

/** The `publish_id` shape the init schema accepts; anything else is not ours to send back. */
const publishIdPattern = /^[\x21-\x7e]{1,64}$/;

function bearer(tokens: TokenBundle): Record<string, string> {
  return {
    Authorization: `Bearer ${tokens.accessToken.revealForPlatformCall()}`,
    'Content-Type': 'application/json; charset=UTF-8',
  };
}

function isTransportFailure(error: unknown): error is PlatformClientError {
  return error instanceof PlatformClientError && error.details.transport;
}

function chunkFailureReason(status: number, resent: boolean): PlatformClientErrorReason {
  if (status === 429) return 'rate-limited';
  if (status === 400) return 'media-rejected';
  // A range mismatch right after a resume means the resume could not continue the session.
  if (status === 416) return resent ? 'network' : 'media-rejected';
  // 403 is an expired `upload_url`, 404 an unknown upload task, 5xx TikTok's side; a 3xx is a
  // redirect, which is never followed.
  return 'platform-unavailable';
}

/** The first public post id TikTok reports, under either spelling of [T8]'s field. */
function publicPostId(data: PostStatusData): string | null {
  return data.publicaly_available_post_id?.[0] ?? data.publicly_available_post_id?.[0] ?? null;
}

/**
 * Section 5.5: `SEND_TO_USER_INBOX` is `sent-to-inbox`; `PUBLISH_COMPLETE` with a public post id
 * is `published`. `PUBLISH_COMPLETE` without one (a private post, or moderation not passed yet)
 * stays `sent-to-inbox`, so the hourly follow-up keeps asking until `followUntil`. TikTok gives
 * no publish time, so `publishedAt` is when the studio saw it.
 */
export function mapPostStatus(data: PostStatusData, now: Date): UploadStatus {
  switch (data.status) {
    case 'PROCESSING_UPLOAD':
    case 'PROCESSING_DOWNLOAD':
      return { state: 'processing' };
    case 'SEND_TO_USER_INBOX':
      return { state: 'sent-to-inbox' };
    case 'PUBLISH_COMPLETE': {
      const postId = publicPostId(data);
      if (postId === null) return { state: 'sent-to-inbox' };
      return { state: 'published', platformVideoId: postId, platformMediaId: null, publishedAt: now.toISOString() };
    }
    case 'FAILED':
      return { state: 'failed', reasonId: postFailReason(data.fail_reason) };
  }
}

export class TiktokPublisher {
  constructor(
    private readonly http: TiktokHttp,
    private readonly wait: ResumeWait,
  ) {}

  async upload(request: UploadRequest): Promise<UploadOutcome> {
    const plan = planChunks(request.sizeBytes);
    const session = await this.init(request.tokens, plan, request.now);
    // Every byte is hashed as it is read; before the last chunk leaves the hash must equal the
    // caller's SHA-256, so a file changed after the re-check never completes an upload (AC 50).
    const hash = createHash('sha256');
    for (const range of chunkRanges(plan)) {
      const bytes = await readChunk(request.file, range);
      hash.update(bytes);
      if (range.isFinal && hash.digest('hex') !== request.sha256.toLowerCase()) {
        throw new PlatformClientError('tiktok', 'upload', 'media-rejected');
      }
      const reconciled = await this.sendChunk(session, range, bytes);
      if (reconciled !== null) return reconciled;
      request.onProgress(range.last + 1);
    }
    // 201 on the last chunk: TikTok has every byte and prepares the draft; the status checks follow.
    return { state: 'processing', uploadRef: session.publishId };
  }

  async uploadStatus(request: UploadStatusRequest): Promise<UploadStatus> {
    if (!publishIdPattern.test(request.uploadRef)) throw new PlatformClientError('tiktok', 'upload-status', 'outcome-unknown');
    return mapPostStatus(await this.fetchStatus(request.uploadRef, request.tokens), request.now);
  }

  /** Init [T4]: the `upload_url` is checked against the B12 host rule before any byte is sent. */
  private async init(tokens: TokenBundle, plan: ChunkPlan, now: Date): Promise<UploadSession> {
    const answer = await this.http.send({
      operation: 'upload',
      url: new URL(TIKTOK_INBOX_INIT_URL),
      method: 'POST',
      headers: bearer(tokens),
      body: JSON.stringify({
        source_info: { source: 'FILE_UPLOAD', video_size: plan.videoSize, chunk_size: plan.chunkSize, total_chunk_count: plan.totalChunkCount },
      }),
      timeoutMs: JSON_CALL_TIMEOUT_MS,
    });
    const data = readApiSuccess('upload', answer, InboxInitResponseSchema).data;
    const uploadUrl = parseAllowedUploadUrl(data.upload_url);
    // No byte has left: an upload host outside the allowlist fails the attempt, nothing is sent.
    if (uploadUrl === null) throw new PlatformClientError('tiktok', 'upload', 'platform-unavailable');
    return { publishId: data.publish_id, uploadUrl, plan, tokens, now, resumesUsed: 0 };
  }

  /**
   * One chunk PUT. Null when TikTok accepted it (206, or 201 for the last); a transport failure
   * resumes the same chunk after the next B9 wait while resumes remain. When they run out on the
   * last chunk the bytes may have arrived, so one status query decides (section 5.4).
   */
  private async sendChunk(session: UploadSession, range: ChunkRange, bytes: Uint8Array): Promise<UploadOutcome | null> {
    let resent = false;
    for (;;) {
      let answer: TiktokAnswer;
      try {
        answer = await this.putChunk(session, range, bytes);
      } catch (error) {
        if (!isTransportFailure(error)) throw error;
        const waitMs = publishBounds.resumeWaitsMs[session.resumesUsed];
        if (session.resumesUsed < publishBounds.transportResumes && waitMs !== undefined) {
          session.resumesUsed += 1;
          resent = true;
          await this.wait(waitMs);
          continue;
        }
        if (range.isFinal) return this.reconcileAfterDrop(session);
        throw error;
      }
      // A 5xx on the last chunk may come after TikTok stored it: one status query decides, as for
      // a dropped connection, instead of failing an attempt whose draft may already exist.
      if (range.isFinal && !resent && answer.status >= 500) return this.reconcileAfterDrop(session);
      return this.chunkVerdict(range, answer, resent);
    }
  }

  private putChunk(session: UploadSession, range: ChunkRange, bytes: Uint8Array): Promise<TiktokAnswer> {
    return this.http.send(
      {
        operation: 'upload',
        url: session.uploadUrl,
        method: 'PUT',
        // `fetch` sets `Content-Length` from the byte body itself, matching the guide's header.
        headers: { 'Content-Type': 'video/mp4', 'Content-Range': `bytes ${range.first}-${range.last}/${session.plan.videoSize}` },
        body: bytes,
        timeoutMs: CHUNK_CALL_TIMEOUT_MS,
      },
      true,
    );
  }

  private chunkVerdict(range: ChunkRange, answer: TiktokAnswer, resent: boolean): null {
    const expected = range.isFinal ? 201 : 206;
    if (answer.status === expected) return null;
    // Another success code, or a refusal of a resent last chunk: the earlier send may have
    // completed the upload, so the video may exist.
    if ((answer.status >= 200 && answer.status < 300) || (resent && range.isFinal)) {
      throw new PlatformClientError('tiktok', 'upload', 'outcome-unknown');
    }
    const reason = chunkFailureReason(answer.status, resent);
    throw new PlatformClientError('tiktok', 'upload', reason, {
      transport: reason === 'network',
      retryAfterSeconds: reason === 'rate-limited' ? answer.retryAfterSeconds : null,
    });
  }

  private async reconcileAfterDrop(session: UploadSession): Promise<UploadOutcome> {
    let data: PostStatusData;
    try {
      data = await this.fetchStatus(session.publishId, session.tokens);
    } catch {
      // The one status query did not answer: whether TikTok has the video is unknown (section 5.4).
      throw new PlatformClientError('tiktok', 'upload', 'outcome-unknown', { transport: true, retryAfterSeconds: null });
    }
    // Still waiting for bytes says nothing about the dropped last chunk.
    if (data.status === 'PROCESSING_UPLOAD' || data.status === 'PROCESSING_DOWNLOAD') {
      throw new PlatformClientError('tiktok', 'upload', 'outcome-unknown', { transport: true, retryAfterSeconds: null });
    }
    if (data.status === 'FAILED') throw new PlatformClientError('tiktok', 'upload', postFailReason(data.fail_reason));
    const status = mapPostStatus(data, session.now);
    switch (status.state) {
      case 'failed':
        // Unreachable after the check above; kept so the switch stays exhaustive.
        throw new PlatformClientError('tiktok', 'upload', 'outcome-unknown');
      case 'sent-to-inbox':
        return { state: 'sent-to-inbox', uploadRef: session.publishId };
      case 'published':
        return status;
      case 'processing':
        return { state: 'processing', uploadRef: session.publishId };
    }
  }

  private async fetchStatus(publishId: string, tokens: TokenBundle): Promise<PostStatusData> {
    const answer = await this.http.send({
      operation: 'upload-status',
      url: new URL(TIKTOK_STATUS_URL),
      method: 'POST',
      headers: bearer(tokens),
      body: JSON.stringify({ publish_id: publishId }),
      timeoutMs: JSON_CALL_TIMEOUT_MS,
    });
    return readApiSuccess('upload-status', answer, PostStatusResponseSchema, quotePostIds).data;
  }
}
