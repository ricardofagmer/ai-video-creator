import { Inject, Injectable } from '@nestjs/common';
import { PLATFORM_CLIENTS, type PlatformClient, type PlatformClients, type TokenBundle, type UploadOutcome } from '@studio/core/platforms';
import { publishBounds, type PublishRequestFile, type PublishStateFile } from '@studio/shared/platforms';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { errorName } from '../platform/error-name';
import { isTokenRejection, uploadFailureVerdict } from './platform-call-failure';
import { PlatformEventRecorder } from './platform-event.recorder';
import { PlatformTokenSession } from './platform-token.session';
import { PublishAttemptFiles, type PublishStateChange } from './publish-attempt.files';
import { PublishCloser, publishedChange, storableUploadRef } from './publish-closer';
import { PublishFollowUp } from './publish-follow-up';
import { type VerifiedVideo } from './publish-recheck';
import { UploadProgressWriter } from './upload-progress.writer';

/** A claimed, re-checked attempt ready for its one upload. */
export interface ClaimedUpload {
  request: PublishRequestFile;
  /** `final.mp4` opened once and hashed from that handle by the re-check; the step closes it. */
  video: VerifiedVideo;
  tokens: TokenBundle;
  /** When this process claimed the attempt. */
  startedAtMs: number;
}

/**
 * The one upload of a claimed attempt (SPEC 0007 section 5.5 "record", "upload", "finish"):
 *
 * 1. append `upload-started` to `publications.jsonl`, then write `uploading`, both before the first
 *    byte, so a crash always leaves a record and the sweep closes the attempt (AC 48);
 * 2. call the platform client's `upload` exactly once. The client reads the bytes through the
 *    re-check's handle, the same bytes that were hashed (finding S2), and reports progress, written to `state.json` at most once a second. Any transport resume (B9, at
 *    most 3) happens inside that one call, in the same upload session; this class never calls
 *    `upload` again for the attempt, whatever the outcome (K5);
 * 3. close: `published`, `processing` or `sent-to-inbox` (status checks follow in `PublishFollowUp`),
 *    or `failed` with its reason, or `outcome-unknown` when the bytes may have arrived.
 *
 * A 429 or quota answer fails the attempt and is never retried (section 5.7).
 */
@Injectable()
export class PublishUploader {
  constructor(
    @Inject(PublishAttemptFiles) private readonly files: PublishAttemptFiles,
    @Inject(PublishCloser) private readonly closer: PublishCloser,
    @Inject(PublishFollowUp) private readonly followUp: PublishFollowUp,
    @Inject(PLATFORM_CLIENTS) private readonly clients: PlatformClients,
    @Inject(PlatformTokenSession) private readonly tokens: PlatformTokenSession,
    @Inject(PlatformEventRecorder) private readonly events: PlatformEventRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async upload(claimed: ClaimedUpload): Promise<void> {
    const { request, video } = claimed;
    const client = this.clients.clientFor(request.platform);
    const startedAt = this.clock.now();
    await this.files.appendLine(request, { event: 'upload-started', platformVideoId: null, reasonId: null }, startedAt);
    let state = await this.files.moveState(request.attemptId, null, { state: 'uploading', bytesSent: 0, bytesTotal: video.sizeBytes }, startedAt);
    this.events.record({
      type: 'publish.started',
      attemptId: request.attemptId,
      runId: request.runId,
      platform: request.platform,
      state: state.state,
      bytesTotal: video.sizeBytes,
    });

    const progress = new UploadProgressWriter({
      bytesTotal: video.sizeBytes,
      nowMs: () => this.clock.now().getTime(),
      write: async (bytesSent) => {
        state = await this.files.moveState(request.attemptId, state, { state: 'uploading', bytesSent }, this.clock.now());
      },
      onWriteFailed: (error) => {
        this.events.record({ type: 'publish.progress-write-failed', attemptId: request.attemptId, error: errorName(error) });
      },
    });

    let outcome: UploadOutcome;
    try {
      outcome = await this.send(client, claimed, progress);
    } catch (error) {
      const bytesSent = await progress.settle();
      await this.closeAfterFailure(claimed, state, bytesSent, error);
      return;
    }
    await progress.settle();
    await this.closeAfterOutcome(claimed, state, outcome);
  }

  private async send(client: PlatformClient, claimed: ClaimedUpload, progress: UploadProgressWriter): Promise<UploadOutcome> {
    const { request, video } = claimed;
    return client.upload({
      attemptId: request.attemptId,
      file: video.file,
      sizeBytes: video.sizeBytes,
      sha256: video.sha256,
      metadata: request.metadata,
      tokens: claimed.tokens,
      now: this.clock.now(),
      onProgress: (bytesSent) => progress.report(bytesSent),
    });
  }

  private async closeAfterFailure(claimed: ClaimedUpload, state: PublishStateFile, bytesSent: number, error: unknown): Promise<void> {
    const { request } = claimed;
    const verdict = uploadFailureVerdict(error);
    const change: PublishStateChange =
      verdict.state === 'failed' ? { state: 'failed', reasonId: verdict.reasonId, bytesSent } : { state: 'outcome-unknown', bytesSent };
    await this.closer.close({ request, previous: state, change, appendLine: true, startedAtMs: claimed.startedAtMs });
    // Section 5.2: a 401 triggers one refresh, so health shows `needs-reconnect` when it fails. The
    // upload itself is never sent again: a new click is a new attempt.
    if (isTokenRejection(error)) await this.refreshAfterRejection(request);
  }

  private async refreshAfterRejection(request: PublishRequestFile): Promise<void> {
    try {
      await this.tokens.refreshAfterRejection(request.platform, request.connectionId);
    } catch (error) {
      this.events.record({ type: 'publish.step-failed', attemptId: request.attemptId, error: errorName(error) });
    }
  }

  private async closeAfterOutcome(claimed: ClaimedUpload, state: PublishStateFile, outcome: UploadOutcome): Promise<void> {
    const { request, video, startedAtMs } = claimed;
    const bytesSent = video.sizeBytes;
    switch (outcome.state) {
      case 'published': {
        const change: PublishStateChange = publishedChange(request.platform, outcome, bytesSent) ?? { state: 'outcome-unknown', bytesSent };
        await this.closer.close({ request, previous: state, change, appendLine: true, startedAtMs });
        return;
      }
      case 'processing': {
        const change: PublishStateChange = { state: 'processing', bytesSent, platformMediaId: storableUploadRef(outcome.uploadRef) };
        const next = await this.closer.close({ request, previous: state, change, appendLine: false, startedAtMs });
        this.followUp.track(next, outcome.uploadRef, startedAtMs);
        return;
      }
      case 'sent-to-inbox': {
        const followUntil = new Date(this.clock.now().getTime() + publishBounds.inboxFollowMs).toISOString();
        const change: PublishStateChange = { state: 'sent-to-inbox', bytesSent, followUntil, platformMediaId: storableUploadRef(outcome.uploadRef) };
        const next = await this.closer.close({ request, previous: state, change, appendLine: true, startedAtMs });
        this.followUp.track(next, outcome.uploadRef, startedAtMs);
        return;
      }
    }
  }
}
