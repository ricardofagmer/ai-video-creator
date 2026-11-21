import { Inject, Injectable } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { PLATFORM_FILE_ROOT, PLATFORM_PROCESS_ID } from '@studio/core/platforms';
import {
  PLATFORM_FORMAT_VERSION,
  canTransitionPublishState,
  type PublishAttemptId,
  type PublishRequestFile,
  type PublishStateFile,
  type RunPublicationLine,
} from '@studio/shared/platforms';
import {
  claimPublishAttempt,
  hasCancelMarker,
  isPublishClaimantAlive,
  listPublishAttemptIds,
  readPublishClaim,
  readPublishRequest,
  readPublishState,
  writePublishState,
  type PublishClaimResult,
} from '@studio/shared/platforms/files';
import { appendRunPublicationLine, readRunPublicationLines, runDirectory } from '@studio/shared/run-files';
import { PublishStateMoveRefusedError } from './platform-step.errors';

/** The fields of a `state.json` a move sets; the rest are carried over from the previous file. */
export type PublishStateChange = Pick<PublishStateFile, 'state'> &
  Partial<Omit<PublishStateFile, 'format' | 'attemptId' | 'state' | 'since'>>;

/** The closing or opening line of `publications.jsonl`; size, hash, visibility and refs come from the request. */
export type PublicationLineEvent = Pick<RunPublicationLine, 'event' | 'platformVideoId' | 'reasonId'>;

/** Page size when looking for an attempt's `upload-started` line; the file holds two lines per attempt. */
const PUBLICATION_PAGE_BYTES = 262_144;

/**
 * The watcher's access to `publish/<attemptId>/` and to `runs/<runId>/publications.jsonl` (SPEC 0007
 * sections 4.6 and 5.5), through the shared helpers only. The watcher writes `claim` and
 * `state.json` here and appends publication lines; it reads `request.json` and `cancel`, which only
 * the api or the CLI write, and writes neither (AC 57). No method removes a claim, so a claimed
 * attempt can never be claimed, and therefore uploaded, a second time (K5).
 */
@Injectable()
export class PublishAttemptFiles {
  constructor(
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    @Inject(PLATFORM_PROCESS_ID) private readonly pid: number,
    @Inject(DataHome) private readonly dataHome: DataHome,
  ) {}

  async listAttemptIds(): Promise<PublishAttemptId[]> {
    return listPublishAttemptIds(this.platformRoot);
  }

  /** `request.json`, or null while the api is still creating the attempt. Throws `RunFileError` when corrupt. */
  async readRequest(attemptId: PublishAttemptId): Promise<PublishRequestFile | null> {
    const read = await readPublishRequest(this.platformRoot, attemptId);
    return read.status === 'present' ? read.value : null;
  }

  /** `state.json`, or null while the attempt is still `queued`. Throws `RunFileError` when corrupt. */
  async readState(attemptId: PublishAttemptId): Promise<PublishStateFile | null> {
    const read = await readPublishState(this.platformRoot, attemptId);
    return read.status === 'present' ? read.value : null;
  }

  async hasCancel(attemptId: PublishAttemptId): Promise<boolean> {
    return hasCancelMarker(this.platformRoot, attemptId);
  }

  async claim(attemptId: PublishAttemptId): Promise<PublishClaimResult> {
    return claimPublishAttempt(this.platformRoot, attemptId, this.pid);
  }

  /**
   * `absent`; `live` (another process of this user, under this boot, holds it); `dead` (unreadable,
   * an earlier boot, another user's pid, or this process's own pid: finding C1).
   */
  async claimant(attemptId: PublishAttemptId): Promise<{ status: 'absent' } | { status: 'live'; pid: number } | { status: 'dead' }> {
    const claim = await readPublishClaim(this.platformRoot, attemptId);
    if (claim.status === 'absent') return { status: 'absent' };
    if (claim.stamp === null || !isPublishClaimantAlive(claim.stamp, this.pid)) return { status: 'dead' };
    return { status: 'live', pid: claim.stamp.pid };
  }

  /**
   * Writes the next `state.json` after checking the move is forward (`canTransitionPublishState`);
   * rewriting the same state is the progress update and is allowed. `previous` null means `queued`.
   */
  async moveState(attemptId: PublishAttemptId, previous: PublishStateFile | null, change: PublishStateChange, at: Date): Promise<PublishStateFile> {
    const from = previous === null ? 'queued' : previous.state;
    if (from !== change.state && !canTransitionPublishState(from, change.state)) {
      throw new PublishStateMoveRefusedError(attemptId, from, change.state);
    }
    const next: PublishStateFile = {
      format: PLATFORM_FORMAT_VERSION,
      attemptId,
      state: change.state,
      since: from === change.state && previous !== null ? previous.since : at.toISOString(),
      bytesSent: change.bytesSent ?? previous?.bytesSent ?? 0,
      bytesTotal: change.bytesTotal ?? previous?.bytesTotal ?? 0,
      reasonId: change.reasonId ?? null,
      platformVideoId: change.platformVideoId ?? previous?.platformVideoId ?? null,
      platformMediaId: change.platformMediaId === undefined ? (previous?.platformMediaId ?? null) : change.platformMediaId,
      publishedAt: change.publishedAt ?? previous?.publishedAt ?? null,
      followUntil: change.followUntil === undefined ? (previous?.followUntil ?? null) : change.followUntil,
    };
    // Written only when known, so a state without a reported link keeps the pre-wave-4 shape.
    const publicationUrl = change.publicationUrl ?? previous?.publicationUrl ?? null;
    if (publicationUrl !== null) next.publicationUrl = publicationUrl;
    await writePublishState(this.platformRoot, next);
    return next;
  }

  /**
   * Appends one line to the run's `publications.jsonl` (section 5.4 "What left the machine"). The
   * caller has re-checked that the run is `approved`. Sizes, the hash, the visibility and the
   * confirmed biometric refs only: never a title, a caption, a tag, a path or a URL.
   */
  async appendLine(request: PublishRequestFile, line: PublicationLineEvent, at: Date): Promise<void> {
    await appendRunPublicationLine(this.runDirOf(request), {
      at: at.toISOString(),
      attemptId: request.attemptId,
      platform: request.platform,
      mode: request.mode,
      event: line.event,
      sizeBytes: request.artifact.sizeBytes,
      artifactSha256: request.artifact.sha256,
      visibility: request.metadata.visibility,
      biometricRefs: request.biometric.refs,
      platformVideoId: line.platformVideoId,
      reasonId: line.reasonId,
    });
  }

  /** Whether `upload-started` was appended for the attempt (a crash between that line and `uploading`). */
  async hasUploadStarted(request: PublishRequestFile): Promise<boolean> {
    let fromByte = 0;
    for (;;) {
      const page = await readRunPublicationLines(this.runDirOf(request), fromByte, PUBLICATION_PAGE_BYTES);
      if (page.entries.some((line) => line.attemptId === request.attemptId && line.event === 'upload-started')) return true;
      if (page.nextByte === fromByte) return false;
      fromByte = page.nextByte;
    }
  }

  private runDirOf(request: PublishRequestFile): string {
    return runDirectory(this.dataHome.runs, request.runId);
  }
}
