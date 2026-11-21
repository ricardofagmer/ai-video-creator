import { publishBounds } from '@studio/shared/platforms';
import { PlatformClientError } from '../platform-client.errors';
import { type UploadOutcome, type UploadRequest } from '../platform-client.port';
import { dataErrorReason } from './youtube-error-map';
import {
  bearerHeaders,
  discardBody,
  isAllowedYoutubeUrl,
  parseYoutubeBody,
  readJsonBody,
  retryAfterSeconds,
  sendYoutubeRequest,
  youtubeError,
} from './youtube-http';
import { UploadFileReader } from './youtube-upload-file';
import { VIDEO_STATE_FIELDS, uploadStatusOf } from './youtube-videos';
import { VideoStateSchema, type VideoState } from './youtube.schemas';
import {
  YOUTUBE_UPLOAD_CHUNK_BYTES,
  YOUTUBE_UPLOAD_CONTENT_TYPE,
  YOUTUBE_UPLOAD_SESSION_HOST,
  YOUTUBE_UPLOAD_SESSION_PATH,
  youtubeEndpoints,
  youtubeTimeoutsMs,
} from './youtube.constants';

/*
 * The one upload of an attempt (SPEC 0007 sections 5.4, 5.5, K5, B9): a resumable session on
 * `/upload/youtube/v3/videos` with `snippet` (title, description, tags) and `status`
 * (`privacyStatus`, `containsSyntheticMedia`, `selfDeclaredMadeForKids: false`) and
 * `paidProductPlacementDetails.hasPaidProductPlacement: false`, then the file in
 * 8 MiB chunks. A lost connection or a 500/502/503/504 resumes the same session at most
 * `publishBounds.transportResumes` times, after the B9 waits, by asking how many bytes arrived;
 * no completed byte is sent twice and no second session is ever opened. A 429 or quota answer
 * fails the attempt at once (section 5.7).
 */

export interface YoutubeUploadDependencies {
  fetch: typeof fetch;
  sleep(milliseconds: number): Promise<void>;
}

/** Statuses after which the resumable protocol says to ask for the received range and go on. */
const resumableStatuses: readonly number[] = [500, 502, 503, 504];

type ChunkAnswer = { kind: 'received'; nextOffset: number } | { kind: 'finished'; response: Response };

/** Thrown inside the loop for an answer that may be resumed; never leaves this module. */
class ResumableFailure extends Error {
  constructor() {
    super('resumable upload failure');
    this.name = 'ResumableFailure';
  }
}

/** The `video` resource of the session start: exactly the ticket's fields, from the owner's input. */
function videoResource(request: UploadRequest): string {
  const { metadata } = request;
  return JSON.stringify({
    snippet: { title: metadata.title, description: metadata.caption, tags: metadata.tags },
    status: {
      privacyStatus: metadata.visibility,
      containsSyntheticMedia: metadata.aiDisclosure,
      selfDeclaredMadeForKids: false,
    },
    // Since the 2026-11-16 API revision the field has no default on upload; the owner decided to
    // send false and change it on YouTube for a sponsored video (SPEC 0007 section 5.5).
    paidProductPlacementDetails: { hasPaidProductPlacement: false },
  });
}

/** The session URI must be an `https` URI on the upload path of the allowlisted host (K6). */
function sessionUrlOf(location: string | null): URL {
  if (location === null || !URL.canParse(location)) throw youtubeError('upload', 'invalid-response');
  const url = new URL(location);
  const valid = isAllowedYoutubeUrl(url) && url.hostname === YOUTUBE_UPLOAD_SESSION_HOST && url.pathname === YOUTUBE_UPLOAD_SESSION_PATH;
  if (!valid) throw youtubeError('upload', 'invalid-response');
  return url;
}

/** `Range: bytes=0-N` as the next offset (N + 1); no header means nothing was received. */
function nextOffsetOf(response: Response): number {
  const range = response.headers.get('range');
  if (range === null) return 0;
  const match = /^bytes=0-([0-9]{1,15})$/.exec(range.trim());
  const last = match?.[1];
  if (last === undefined) throw youtubeError('upload', 'invalid-response');
  return Number.parseInt(last, 10) + 1;
}

class YoutubeResumableUpload {
  private readonly accessToken: string;
  private readonly reader: UploadFileReader;
  private resumesUsed = 0;
  /** Set once the request carrying the last byte has left: from then on the video may exist. */
  private lastByteSent = false;

  constructor(
    private readonly deps: YoutubeUploadDependencies,
    private readonly request: UploadRequest,
  ) {
    this.accessToken = request.tokens.accessToken.revealForPlatformCall();
    this.reader = new UploadFileReader(request.file, request.sizeBytes, YOUTUBE_UPLOAD_CHUNK_BYTES);
  }

  async run(): Promise<UploadOutcome> {
    try {
      return await this.upload();
    } catch (error) {
      // Before the request carrying the last byte leaves, no video can exist: an unreadable answer
      // fails the attempt cleanly instead of reading as `invalid-response`, which the watcher treats
      // as a possible upload (outcome-unknown). The TikTok client maps its init answers the same way.
      if (!this.lastByteSent && error instanceof PlatformClientError && error.reason === 'invalid-response') {
        throw youtubeError('upload', 'platform-unavailable');
      }
      throw error;
    }
  }

  private async upload(): Promise<UploadOutcome> {
    const session = await this.startSession();
    let offset = 0;
    for (;;) {
      const answer = await this.sendChunkResuming(session, offset);
      if (answer.kind === 'finished') return this.outcomeOf(answer.response);
      // A 308 that claims every byte without finishing contradicts the protocol: the video may exist.
      if (answer.nextOffset >= this.request.sizeBytes) throw youtubeError('upload', 'outcome-unknown');
      offset = answer.nextOffset;
      this.request.onProgress(offset);
    }
  }

  private async startSession(): Promise<URL> {
    const url = new URL(youtubeEndpoints.upload);
    url.searchParams.set('uploadType', 'resumable');
    url.searchParams.set('part', 'snippet,status,paidProductPlacementDetails');
    url.searchParams.set('fields', VIDEO_STATE_FIELDS);
    const response = await sendYoutubeRequest(this.deps.fetch, {
      operation: 'upload',
      url,
      method: 'POST',
      headers: {
        ...bearerHeaders(this.accessToken),
        'content-type': 'application/json; charset=UTF-8',
        'x-upload-content-length': String(this.request.sizeBytes),
        'x-upload-content-type': YOUTUBE_UPLOAD_CONTENT_TYPE,
      },
      body: videoResource(this.request),
      timeoutMs: youtubeTimeoutsMs.data,
    });
    if (!response.ok) throw await this.failureOf(response);
    await discardBody(response);
    return sessionUrlOf(response.headers.get('location'));
  }

  /** Sends the chunk at `offset`; a resumable failure asks for the received range, within B9. */
  private async sendChunkResuming(session: URL, offset: number): Promise<ChunkAnswer> {
    try {
      return await this.sendChunk(session, offset);
    } catch (error) {
      if (!(error instanceof ResumableFailure)) throw error;
      return this.resume(session);
    }
  }

  private async sendChunk(session: URL, offset: number): Promise<ChunkAnswer> {
    const length = Math.min(YOUTUBE_UPLOAD_CHUNK_BYTES, this.request.sizeBytes - offset);
    const last = offset + length - 1;
    const chunk = await this.reader.read(offset, length);
    const isFinal = last === this.request.sizeBytes - 1;
    if (isFinal && !this.reader.matches(this.request.sha256)) throw youtubeError('upload', 'media-rejected');
    if (isFinal) this.lastByteSent = true;
    return this.put(session, chunk, `bytes ${offset}-${last}/${this.request.sizeBytes}`);
  }

  /** At most `transportResumes` status queries, each after its B9 wait, until one gives an answer. */
  private async resume(session: URL): Promise<ChunkAnswer> {
    while (this.resumesUsed < publishBounds.transportResumes) {
      const waitMs = publishBounds.resumeWaitsMs[this.resumesUsed] ?? 0;
      this.resumesUsed += 1;
      await this.deps.sleep(waitMs);
      try {
        return await this.put(session, new Uint8Array(0), `bytes */${this.request.sizeBytes}`);
      } catch (error) {
        if (!(error instanceof ResumableFailure)) throw error;
      }
    }
    throw this.lastByteSent ? youtubeError('upload', 'outcome-unknown') : youtubeError('upload', 'network', { transport: true });
  }

  /** One PUT to the session; maps its answer, throwing `ResumableFailure` for what may resume. */
  private async put(session: URL, body: Uint8Array, contentRange: string): Promise<ChunkAnswer> {
    let response: Response;
    try {
      response = await sendYoutubeRequest(this.deps.fetch, {
        operation: 'upload',
        url: session,
        method: 'PUT',
        headers: { ...bearerHeaders(this.accessToken), 'content-type': YOUTUBE_UPLOAD_CONTENT_TYPE, 'content-range': contentRange },
        body,
        timeoutMs: youtubeTimeoutsMs.uploadChunk,
        acceptResumeIncomplete: true,
      });
    } catch (error) {
      if (error instanceof PlatformClientError && error.details.transport) throw new ResumableFailure();
      throw error;
    }
    if (response.status === 308) {
      await discardBody(response);
      return { kind: 'received', nextOffset: nextOffsetOf(response) };
    }
    if (response.status === 200 || response.status === 201) return { kind: 'finished', response };
    if (resumableStatuses.includes(response.status)) {
      await discardBody(response);
      throw new ResumableFailure();
    }
    // 404: the session expired. Opening a new one would re-send the file, which K5 forbids.
    if (response.status === 404) {
      await discardBody(response);
      throw youtubeError('upload', this.lastByteSent ? 'outcome-unknown' : 'platform-unavailable');
    }
    throw await this.failureOf(response);
  }

  private async failureOf(response: Response): Promise<PlatformClientError> {
    const body = await readJsonBody(response, 'upload');
    return youtubeError('upload', dataErrorReason(response.status, body, 'upload'), {
      retryAfterSeconds: retryAfterSeconds(response, this.request.now),
    });
  }

  /** The created video: `processed` is published, `uploaded` is still processing (status checks follow). */
  private async outcomeOf(response: Response): Promise<UploadOutcome> {
    let state: VideoState;
    try {
      state = await parseYoutubeBody(response, VideoStateSchema, 'upload');
    } catch {
      // Every byte arrived and YouTube answered, but the answer is unreadable: the video may exist.
      throw youtubeError('upload', 'outcome-unknown');
    }
    this.request.onProgress(this.request.sizeBytes);
    const status = uploadStatusOf(state, this.request.now);
    switch (status.state) {
      case 'processing':
        return { state: 'processing', uploadRef: state.id };
      case 'published':
        return status;
      case 'failed':
        throw youtubeError('upload', status.reasonId === 'media-rejected' ? 'media-rejected' : 'policy-rejected');
      case 'sent-to-inbox':
        // YouTube has no inbox; an answer that maps here would be a contract break.
        throw youtubeError('upload', 'outcome-unknown');
    }
  }
}

/** Uploads `final.mp4` once (K5). The file is read only through the caller's handle (finding S2). */
export async function uploadYoutubeVideo(deps: YoutubeUploadDependencies, request: UploadRequest): Promise<UploadOutcome> {
  if (!Number.isSafeInteger(request.sizeBytes) || request.sizeBytes <= 0 || request.sizeBytes > publishBounds.maxArtifactBytes) {
    throw youtubeError('upload', 'media-rejected');
  }
  return new YoutubeResumableUpload(deps, request).run();
}
