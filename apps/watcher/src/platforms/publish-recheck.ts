import { type FileHandle } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import { PlatformFileCorruptError, PlatformStatusReader, type PlatformSnapshot } from '@studio/core/platforms';
import {
  isOpenPublishState,
  platformPublishSupport,
  publishBounds,
  type CapabilityStatus,
  type PublishAttemptId,
  type PublishFailureReason,
  type PublishRequestFile,
  type PublishStateFile,
} from '@studio/shared/platforms';
import { RunFileError } from '@studio/shared/run-files';
import { type Clock } from '../engine/clock';
import { CLOCK } from '../engine/engine.tokens';
import { openVerifiedVideo } from './final-video.handle';
import { PlatformEventRecorder } from './platform-event.recorder';
import { PlatformHealthWriter } from './platform-health.writer';
import { PublicationAttemptReader, attemptRowMismatch } from './publication-attempt.reader';
import { PublishAttemptFiles } from './publish-attempt.files';
import { RunApprovalReader } from './run-approval.reader';

/** The open, hashed `final.mp4` the one upload sends; the caller closes `file` whatever happens. */
export interface VerifiedVideo {
  file: FileHandle;
  sizeBytes: number;
  sha256: string;
}

/** `passed`: the bytes behind `video.file` may be sent. `refused`: nothing is sent and no handle stays open. */
export type PublishRecheckResult = { status: 'passed'; video: VerifiedVideo } | { status: 'refused'; reasonId: PublishFailureReason };

/** The failure reason of each publish status that is not `connected` (section 5.3). */
const refusalOfStatus: Readonly<Record<Exclude<CapabilityStatus, 'connected'>, PublishFailureReason>> = {
  unsupported: 'gate-closed',
  'awaiting-review': 'gate-closed',
  'not-configured': 'account-not-connected',
  disconnected: 'account-not-connected',
  'needs-reconnect': 'token-revoked',
};

function refused(reasonId: PublishFailureReason): PublishRecheckResult {
  return { status: 'refused', reasonId };
}

/**
 * Finding R2: how far back the re-check looks for a withdrawn attempt whose claimed upload may still
 * run; the window core `RequestPublish` step 7 and `PublishAttemptSync` use.
 */
const WITHDRAWN_RECHECK_MS = publishBounds.inboxFollowMs;

/** Why a withdrawn, claimed attempt blocks this upload; the same verdicts as core step 7. */
export type WithdrawnUpload = 'in-progress' | 'published' | 'state-corrupt';

/**
 * The watcher's re-check after the claim and before any byte (SPEC 0007 section 5.5, AC 50), in the
 * spec's order, first failure wins:
 *
 * 0. `request.json` is the request the api recorded: its `publication_attempts` row is `queued` and
 *    agrees on run, platform, connection, mode, artifact, metadata, biometric set, approval and
 *    expiry (finding S3). A mismatch refuses with `request-mismatch` and logs the field name only;
 *    then, as core `RequestPublish` step 7 rules (finding R2, the C4 deferred case), no `cancelled`
 *    or `expired` attempt of the same run and platform changed within `publishBounds.inboxFollowMs`
 *    has a claim and a `state.json` in `uploading`, `processing`, `sent-to-inbox` or `published`, or
 *    a corrupt one. `failed`, `outcome-unknown` and `inbox-unconfirmed` do not block (a new click
 *    after a failed upload stays possible). No failure reason names a duplicate, so it fails
 *    `internal-error` (owner decision 2026-11-21), logging both attempt ids and the verdict;
 * 1. publishing is supported on the platform (Instagram is never published, OD8) and the `publish`
 *    status is `connected`: gate `enabled`, credentials configured, account connected, no
 *    `needs-reconnect` for its connection;
 * 2. the account is the request's `connectionId`, and both the account and this process run in the
 *    request's mode;
 * 3. `run_outcomes`, `run.json` and the final decision in force all say `approved`, and that decision
 *    is the one the request recorded (a re-decided run needs a new click);
 * 4. `final.mp4` is the manifest's output, its size is the request's, and the sha-256 of the bytes
 *    behind one O_NOFOLLOW handle equals both the manifest's `contentHash` and the request's hash
 *    (finding S2). That handle is what the upload reads; the path is never opened again.
 *
 * Read-only, with one exception: a platform file that no longer parses refuses with `internal-error`,
 * and when that file is `health.json` the health writer moves it aside first (R7, round 4 item B).
 */
@Injectable()
export class PublishRecheck {
  constructor(
    @Inject(PlatformStatusReader) private readonly status: PlatformStatusReader,
    @Inject(RunApprovalReader) private readonly runs: RunApprovalReader,
    @Inject(PublicationAttemptReader) private readonly attempts: PublicationAttemptReader,
    @Inject(PublishAttemptFiles) private readonly files: PublishAttemptFiles,
    @Inject(PlatformEventRecorder) private readonly events: PlatformEventRecorder,
    @Inject(PlatformHealthWriter) private readonly health: PlatformHealthWriter,
    @Inject(CLOCK) private readonly clock: Clock,
  ) {}

  async check(request: PublishRequestFile): Promise<PublishRecheckResult> {
    const mismatch = attemptRowMismatch(await this.attempts.rowOf(request.attemptId), request);
    if (mismatch !== null) {
      this.events.record({ type: 'publish.request-mismatch', attemptId: request.attemptId, field: mismatch });
      return refused('request-mismatch');
    }
    const withdrawn = await this.withdrawnUploadOf(request);
    if (withdrawn !== null) {
      this.events.record({ type: 'publish.withdrawn-upload-found', attemptId: request.attemptId, withdrawnAttemptId: withdrawn.attemptId, verdict: withdrawn.verdict });
      return refused('internal-error');
    }
    if (!platformPublishSupport[request.platform]) return refused('gate-closed');
    const account = await this.checkAccount(request);
    if (account !== null) return refused(account);

    const approval = await this.runs.approval(request.runId);
    if (approval.status !== 'approved' || approval.decidedAt.getTime() !== Date.parse(request.approvalDecidedAt)) {
      return refused('run-not-approved');
    }

    const video = await this.runs.finalVideo(request.runId);
    if (video.status === 'missing') return refused('artifact-missing');
    if (video.sizeBytes !== request.artifact.sizeBytes || video.manifestSha256 !== request.artifact.sha256) return refused('artifact-changed');
    const opened = await openVerifiedVideo(video.absolutePath, request.artifact);
    if (opened.status === 'missing') return refused('artifact-missing');
    if (opened.status === 'changed') return refused('artifact-changed');
    return { status: 'passed', video: { file: opened.file, sizeBytes: request.artifact.sizeBytes, sha256: opened.sha256 } };
  }

  /**
   * Step 0, second half (finding R2): the first recent `cancelled` or `expired` attempt of the run and
   * platform that has a claim (live or dead: the claim proves the watcher went past the withdrawal
   * checks) and a `state.json` showing an upload in flight or published; null when none does.
   */
  private async withdrawnUploadOf(request: PublishRequestFile): Promise<{ attemptId: PublishAttemptId; verdict: WithdrawnUpload } | null> {
    const since = new Date(this.clock.now().getTime() - WITHDRAWN_RECHECK_MS);
    for (const row of await this.attempts.recentlyWithdrawnOf(request, since)) {
      if ((await this.files.claimant(row.id)).status === 'absent') continue;
      const verdict = await this.claimedUploadOf(row.id);
      if (verdict !== null) return { attemptId: row.id, verdict };
    }
    return null;
  }

  /** Core step 7's reading of a claimed attempt's `state.json`; a corrupt file blocks, since what it hides is unknown. */
  private async claimedUploadOf(attemptId: PublishAttemptId): Promise<WithdrawnUpload | null> {
    let state: PublishStateFile | null;
    try {
      state = await this.files.readState(attemptId);
    } catch (error) {
      if (error instanceof RunFileError) return 'state-corrupt';
      throw error;
    }
    if (state === null) return null;
    if (state.state === 'published') return 'published';
    return isOpenPublishState(state.state) && state.state !== 'queued' ? 'in-progress' : null;
  }

  /** Steps 1 and 2; null when both pass. */
  private async checkAccount(request: PublishRequestFile): Promise<PublishFailureReason | null> {
    let snapshot: PlatformSnapshot;
    try {
      snapshot = await this.status.snapshot(request.platform);
    } catch (error) {
      if (!(error instanceof PlatformFileCorruptError)) throw error;
      // Round 4 item B: an unreadable `health.json` is moved aside in this tick, as the token and
      // metrics paths do (R7). This attempt still fails, since what the file held is unknown; the
      // next attempt reads no health file and proceeds.
      if (error.file === 'health.json') await this.health.recoverUnreadable(request.platform, error);
      return 'internal-error';
    }
    const publishStatus = snapshot.status.publish;
    if (publishStatus !== 'connected') return refusalOfStatus[publishStatus];
    const account = snapshot.account;
    if (account === null || account.state !== 'connected' || account.connectionId !== request.connectionId) return 'account-not-connected';
    if (snapshot.mode !== request.mode || account.mode !== request.mode) return 'mode-mismatch';
    return null;
  }
}
