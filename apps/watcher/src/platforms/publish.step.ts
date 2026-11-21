import { Inject, Injectable } from '@nestjs/common';
import { platformPublishSupport, type PublishAttemptId, type PublishFailureReason, type PublishRequestFile } from '@studio/shared/platforms';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { errorName } from '../platform/error-name';
import { publishReasonOfBlockedToken, uploadFailureVerdict } from './platform-call-failure';
import { PlatformEventRecorder } from './platform-event.recorder';
import { PlatformTokenSession, type TokenAcquisition } from './platform-token.session';
import { PublishAttemptFiles, type PublishStateChange } from './publish-attempt.files';
import { PublishCloser } from './publish-closer';
import { PublishFollowUp } from './publish-follow-up';
import { PublishRecheck, type VerifiedVideo } from './publish-recheck';
import { PublishUploader } from './publish-uploader';

type Consideration = 'claimed' | 'passed-over';

/**
 * The watcher's publish step (SPEC 0007 section 5.5, OD5). The daemon loop calls `sweep` once at
 * start and `claimNext` between runs only, first among the idle steps, under `busy.track`, so a run,
 * an upload and a curation never overlap.
 *
 * `claimNext` takes the oldest `queued` request (ULID order):
 * - `cancel` present or `expiresAt` past: `cancelled` / `expired`, no upload (AC 51);
 * - `claim` with O_EXCL; an existing claim is passed over. The claim is never removed, so no code path
 *   claims, and therefore uploads, one attempt twice (K5, AC 48);
 * - right after the claim, `cancel` and `expiresAt` are checked again (the api's cancel checks for a
 *   claim first, so when the two race the cancel wins and no byte is sent);
 * - the re-check of the attempt row, gate, account, mode, approval and artifact hash (`PublishRecheck`,
 *   AC 50, findings S2 and S3), then
 *   the token, then `cancel` and `expiresAt` once more just before the first byte; any failure writes
 *   `failed` with its reason and sends nothing;
 * - the one upload (`PublishUploader`).
 * When no request was claimed, one due status check of an earlier upload runs (`PublishFollowUp`).
 *
 * Instagram is metrics-only (OD8): an Instagram request is closed `failed` / `gate-closed` and no
 * Instagram client is ever asked to upload. The watcher writes `claim` and `state.json` here and
 * never `request.json` or `cancel` (AC 57). Never throws.
 */
@Injectable()
export class PublishStep {
  private readonly unreadable = new Set<PublishAttemptId>();
  private readonly heldByOthers = new Set<PublishAttemptId>();
  private listFailing = false;

  constructor(
    @Inject(PublishAttemptFiles) private readonly files: PublishAttemptFiles,
    @Inject(PublishRecheck) private readonly recheck: PublishRecheck,
    @Inject(PlatformTokenSession) private readonly tokens: PlatformTokenSession,
    @Inject(PublishUploader) private readonly uploader: PublishUploader,
    @Inject(PublishFollowUp) private readonly followUp: PublishFollowUp,
    @Inject(PublishCloser) private readonly closer: PublishCloser,
    @Inject(PlatformEventRecorder) private readonly events: PlatformEventRecorder,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  /**
   * Crash safety (section 5.5): an attempt claimed by a process that is gone is closed when it was
   * `queued` or `uploading` (`failed` / `watcher-interrupted`, never resumed; the closing line is
   * appended when its `upload-started` line exists), and resumes its status checks only when it was
   * `processing` or `sent-to-inbox`. A claim of a live process is left alone.
   */
  async sweep(): Promise<void> {
    for (const attemptId of await this.listAttempts()) {
      try {
        await this.sweepAttempt(attemptId);
      } catch (error) {
        this.events.record({ type: 'publish.step-failed', attemptId, error: errorName(error) });
      }
    }
  }

  /** True when a request was claimed (whatever its outcome), so the loop scans `runs/` again at once. */
  async claimNext(): Promise<boolean> {
    for (const attemptId of await this.listAttempts()) {
      let consideration: Consideration;
      try {
        consideration = await this.consider(attemptId);
      } catch (error) {
        this.recordUnreadable(attemptId, error);
        continue;
      }
      if (consideration === 'claimed') return true;
    }
    try {
      await this.followUp.checkDue();
    } catch (error) {
      this.events.record({ type: 'publish.step-failed', attemptId: null, error: errorName(error) });
    }
    return false;
  }

  private async listAttempts(): Promise<PublishAttemptId[]> {
    try {
      const attemptIds = await this.files.listAttemptIds();
      this.listFailing = false;
      return attemptIds;
    } catch (error) {
      // publish/ unreadable: runs, schedules and curations are unaffected; logged once per outage.
      if (!this.listFailing) this.events.record({ type: 'publish.step-failed', attemptId: null, error: errorName(error) });
      this.listFailing = true;
      return [];
    }
  }

  private async sweepAttempt(attemptId: PublishAttemptId): Promise<void> {
    const state = await this.files.readState(attemptId);
    if (state !== null && state.state !== 'uploading' && state.state !== 'processing' && state.state !== 'sent-to-inbox') return;
    const claimant = await this.files.claimant(attemptId);
    if (claimant.status === 'absent') return;
    if (claimant.status === 'live') {
      this.events.record({ type: 'publish.claim-held', attemptId, ownerPid: claimant.pid });
      return;
    }
    if (state !== null && (state.state === 'processing' || state.state === 'sent-to-inbox')) {
      this.followUp.adopt(state);
      this.events.record({ type: 'publish.swept', attemptId, from: state.state, to: 'status-checks-resumed' });
      return;
    }
    const request = await this.files.readRequest(attemptId);
    const from = state === null ? 'queued' : state.state;
    const appendLine = request !== null && (from === 'uploading' || (await this.files.hasUploadStarted(request)));
    const change: PublishStateChange = { state: 'failed', reasonId: 'watcher-interrupted' };
    if (request === null) await this.files.moveState(attemptId, state, change, this.clock.now());
    else await this.closer.close({ request, previous: state, change, appendLine, startedAtMs: null });
    this.events.record({ type: 'publish.swept', attemptId, from, to: 'failed' });
  }

  private async consider(attemptId: PublishAttemptId): Promise<Consideration> {
    if ((await this.files.readState(attemptId)) !== null) return 'passed-over';
    const claimant = await this.files.claimant(attemptId);
    if (claimant.status !== 'absent') {
      if (claimant.status === 'live' && !this.heldByOthers.has(attemptId)) {
        this.events.record({ type: 'publish.claim-held', attemptId, ownerPid: claimant.pid });
        this.heldByOthers.add(attemptId);
      }
      return 'passed-over';
    }
    const request = await this.files.readRequest(attemptId);
    if (request === null) return 'passed-over';
    if (this.unreadable.delete(attemptId)) this.events.record({ type: 'publish.attempt-recovered', attemptId });
    if (await this.closeIfWithdrawn(request, false)) return 'passed-over';
    if ((await this.files.claim(attemptId)) === 'taken') return 'passed-over';
    try {
      await this.publishClaimed(request, this.clock.now().getTime());
    } catch (error) {
      await this.failAfterError(request, error);
    }
    return 'claimed';
  }

  private async publishClaimed(request: PublishRequestFile, startedAtMs: number): Promise<void> {
    // The owner flagged it: a cancel or an expiry that landed while the claim was being made wins.
    if (await this.closeIfWithdrawn(request, true)) return;
    if (!platformPublishSupport[request.platform]) return this.fail(request, 'gate-closed', startedAtMs);
    const recheck = await this.recheck.check(request);
    if (recheck.status === 'refused') return this.fail(request, recheck.reasonId, startedAtMs);
    // The handle the hash was taken from is the one the upload reads (finding S2); it is closed whatever happens.
    try {
      await this.uploadVerified(request, recheck.video, startedAtMs);
    } finally {
      await recheck.video.file.close();
    }
  }

  private async uploadVerified(request: PublishRequestFile, video: VerifiedVideo, startedAtMs: number): Promise<void> {
    let acquisition: TokenAcquisition;
    try {
      acquisition = await this.tokens.acquire(request.platform, request.connectionId);
    } catch (error) {
      const verdict = uploadFailureVerdict(error);
      return this.fail(request, verdict.state === 'failed' ? verdict.reasonId : 'internal-error', startedAtMs);
    }
    if (acquisition.status === 'blocked') return this.fail(request, publishReasonOfBlockedToken(acquisition.reasonId), startedAtMs);
    // Hashing a large file takes time: the expiry and the cancel marker are read once more before the first byte.
    if (await this.closeIfWithdrawn(request, true)) return;
    await this.uploader.upload({ request, video, tokens: acquisition.bundle, startedAtMs });
  }

  /** `cancel` present or `expiresAt` past: `cancelled` / `expired`, no upload (section 5.5, AC 51). */
  private async closeIfWithdrawn(request: PublishRequestFile, claimed: boolean): Promise<boolean> {
    const now = this.clock.now();
    const cancelled = await this.files.hasCancel(request.attemptId);
    if (!cancelled && Date.parse(request.expiresAt) > now.getTime()) return false;
    await this.files.moveState(request.attemptId, null, { state: cancelled ? 'cancelled' : 'expired' }, now);
    const { attemptId, runId, platform, mode } = request;
    this.events.record({ type: cancelled ? 'publish.cancelled' : 'publish.expired', attemptId, runId, platform, mode, claimed });
    return true;
  }

  private async fail(request: PublishRequestFile, reasonId: PublishFailureReason, startedAtMs: number): Promise<void> {
    // Nothing left the machine, so no `publications.jsonl` line is written.
    await this.closer.close({ request, previous: null, change: { state: 'failed', reasonId }, appendLine: false, startedAtMs });
  }

  /**
   * An unexpected error after the claim. The claim stays, so the attempt is never picked again; a
   * still-`queued` attempt is closed `failed` / `internal-error`. An attempt the uploader already
   * moved keeps its state: the next start-up sweep closes an `uploading` one as interrupted.
   */
  private async failAfterError(request: PublishRequestFile, error: unknown): Promise<void> {
    this.events.record({ type: 'publish.step-failed', attemptId: request.attemptId, error: errorName(error) });
    try {
      if ((await this.files.readState(request.attemptId)) === null) await this.fail(request, 'internal-error', this.clock.now().getTime());
    } catch (closeError) {
      this.events.record({ type: 'publish.step-failed', attemptId: request.attemptId, error: errorName(closeError) });
    }
  }

  private recordUnreadable(attemptId: PublishAttemptId, error: unknown): void {
    if (this.unreadable.has(attemptId)) return;
    this.unreadable.add(attemptId);
    this.events.record({ type: 'publish.attempt-unreadable', attemptId, error: errorName(error) });
  }
}
