import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type PublicationAttempt } from '@prisma/client';
import { type ApiRev7ErrorReason } from '@studio/shared/api';
import {
  allowedVisibilities,
  isOpenPublishState,
  platformPublishSupport,
  publishBounds,
  type AccountFile,
  type CapabilityStatus,
  type PublishStateFile,
} from '@studio/shared/platforms';
import { createPublishRequest, publishMetadataSha256 } from '@studio/shared/platforms/files';
import { newUlid } from '@studio/shared/run-files';
import { PlatformError, PlatformFileCorruptError, PlatformRefusedError, PublishRequestWriteFailedError } from '../platforms.errors';
import { RequestPublishInputSchema, parsePlatformInput, type RequestPublishFields } from '../platforms.input';
import { PLATFORM_CLOCK, PLATFORM_FILE_ROOT, type PlatformClock } from '../platform-runtime';
import { PlatformStatusReader } from '../platform-status.reader';
import { isFileSystemError } from '../publish/attempt-upload-log';
import { toPublishAttemptView } from '../publish/publication-attempt.mapper';
import { PublicationAttemptRepository } from '../publish/publication-attempt.repository';
import { compareStoredRequest, type StoredMetadata } from '../publish/publish-request-match';
import { RunBiometricAssets } from '../publish/run-biometric-assets';
import { RunPublishFacts } from '../publish/run-publish-facts';
import { PublishFileReader } from '../stores/publish-file.reader';
import { RequestPublishCommand, type RequestPublishResult } from './platform.commands';

type StatusRefusal = Extract<
  ApiRev7ErrorReason,
  'platform-publish-unsupported' | 'platform-awaiting-review' | 'platform-not-configured' | 'platform-not-connected' | 'platform-needs-reconnect'
>;

/** The refusal of a `publish` status other than `connected` (section 5.3 order). */
const statusRefusals: Readonly<Record<Exclude<CapabilityStatus, 'connected'>, StatusRefusal>> = Object.freeze({
  unsupported: 'platform-publish-unsupported',
  'awaiting-review': 'platform-awaiting-review',
  'not-configured': 'platform-not-configured',
  disconnected: 'platform-not-connected',
  'needs-reconnect': 'platform-needs-reconnect',
});

/**
 * Finding R2: how far back step 7 looks for a withdrawn attempt whose claimed upload may still run;
 * the same window `PublishAttemptSync` reconciles such rows in.
 */
const WITHDRAWN_RECHECK_MS = publishBounds.inboxFollowMs;

/** What steps 3 to 6 established; nothing has been written yet. */
interface CheckedRequest {
  account: AccountFile;
  approvalDecidedAt: Date;
  artifact: { sha256: string; sizeBytes: number };
  biometricRefs: string[];
}

/**
 * `RequestPublish` (SPEC 0007 section 5.4, K4): the nine steps in order, the first failure refusing
 * with nothing written. The api makes no platform call here; the watcher uploads between runs.
 * The title, caption and tags go only to `request.json` (mode 0600), never to SQLite or a log.
 */
@CommandHandler(RequestPublishCommand)
export class RequestPublishHandler implements ICommandHandler<RequestPublishCommand, RequestPublishResult> {
  private readonly logger = new Logger(RequestPublishHandler.name);

  constructor(
    @Inject(PLATFORM_FILE_ROOT) private readonly platformRoot: string,
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
    private readonly statusReader: PlatformStatusReader,
    private readonly facts: RunPublishFacts,
    private readonly biometric: RunBiometricAssets,
    private readonly attempts: PublicationAttemptRepository,
    private readonly publishFiles: PublishFileReader,
  ) {}

  async execute(command: RequestPublishCommand): Promise<RequestPublishResult> {
    // Step 1 (the session and `Origin` are the api's guards): zod body, then support and visibility.
    const fields = parsePlatformInput(RequestPublishInputSchema, command.input);
    const { runId, platform, correlationId } = fields;
    try {
      if (!platformPublishSupport[platform]) throw new PlatformRefusedError('platform-publish-unsupported', platform, runId);
      if (!allowedVisibilities[platform].includes(fields.request.metadata.visibility)) {
        throw new PlatformRefusedError('publish-visibility-not-allowed', platform, runId);
      }
      // Step 2, before step 5 hashes the final video: a repeated key with the same body returns the
      // stored attempt (200); a changed or unprovable body is 409.
      const existing = await this.existingAttempt(fields);
      if (existing !== null) return existing;
      const checked = await this.check(fields);
      // Step 7.
      if (await this.attempts.hasStudioPublication(runId, platform)) {
        throw new PlatformRefusedError('publish-already-published', platform, runId);
      }
      const withdrawnUpload = await this.withdrawnUploadRefusal(fields);
      if (withdrawnUpload !== null) throw withdrawnUpload;
      return await this.create(fields, checked);
    } catch (error) {
      if (error instanceof PlatformError) {
        this.logger.log({ event: 'publish.refused', runId, platform, reason: error.reason, correlationId });
      }
      throw error;
    }
  }

  /**
   * Reads only; a reused key whose body differs refuses with nothing written (finding C9). Finding
   * R4 (round 3): a stored body that cannot be compared (no row hash and `request.json` missing or
   * corrupt) is refused the same way, whatever the row's state, since the key cannot be proven to
   * carry the same body; it is never answered as the stored attempt nor taken as a new request.
   */
  private async existingAttempt(fields: RequestPublishFields): Promise<RequestPublishResult | null> {
    const row = await this.attempts.findByIdempotencyKey(fields.request.idempotencyKey);
    if (row === null) return null;
    const reused = new PlatformRefusedError('publish-idempotency-key-reused', fields.platform, fields.runId);
    // A key from another run or platform is refused before its attempt's files are read.
    if (row.runId !== fields.runId || row.platform !== fields.platform) throw reused;
    const comparison = compareStoredRequest(fields, { row, metadata: await this.storedMetadataOf(row) });
    if (comparison === 'changed') throw reused;
    if (comparison === 'not-comparable') {
      this.logger.warn({ event: 'publish.replay-not-comparable', runId: row.runId, attemptId: row.id, platform: row.platform });
      throw reused;
    }
    return { outcome: 'existing', attempt: await this.viewOf(row) };
  }

  /** The stored metadata to compare: the row's hash (F-3), else `request.json`; never throws for a bad file (R4). */
  private async storedMetadataOf(row: PublicationAttempt): Promise<StoredMetadata> {
    if (row.metadataSha256 !== null) return { source: 'row-hash', sha256: row.metadataSha256 };
    try {
      const stored = await this.publishFiles.readRequest(row.id);
      return stored === null ? { source: 'unavailable' } : { source: 'request-file', metadata: stored.metadata };
    } catch (error) {
      if (!(error instanceof PlatformFileCorruptError) && !isFileSystemError(error)) throw error;
      return { source: 'unavailable' };
    }
  }

  /**
   * Finding R2 (C4 deferred case): a cancelled or expired attempt of the pair whose claim exists and
   * whose `state.json` shows an upload still running or published means the bytes may be leaving
   * now, before the sync reconciled the row; a new attempt would upload a duplicate. A failed or
   * otherwise finished upload does not block: a new click is a new attempt (section 5.4). A corrupt
   * `state.json` behind a claim blocks, since what it hides is unknown.
   */
  private async withdrawnUploadRefusal(fields: RequestPublishFields): Promise<PlatformRefusedError | null> {
    const { runId, platform } = fields;
    const since = new Date(this.clock.now().getTime() - WITHDRAWN_RECHECK_MS);
    for (const row of await this.attempts.listRecentlyWithdrawnForPair({ runId, platform, since })) {
      if (!(await this.publishFiles.hasClaim(row.id))) continue;
      const upload = await this.claimedUploadOf(row);
      if (upload === 'published') return new PlatformRefusedError('publish-already-published', platform, runId);
      if (upload === 'in-flight') return new PlatformRefusedError('publish-already-in-progress', platform, runId);
    }
    return null;
  }

  private async claimedUploadOf(row: PublicationAttempt): Promise<'published' | 'in-flight' | 'none'> {
    let state: PublishStateFile | null;
    try {
      state = await this.publishFiles.readState(row.id);
    } catch (error) {
      if (!(error instanceof PlatformFileCorruptError)) throw error;
      this.logger.warn({ event: 'publish.state-corrupt', runId: row.runId, attemptId: row.id, platform: row.platform });
      return 'in-flight';
    }
    if (state === null) return 'none';
    if (state.state === 'published') return 'published';
    return isOpenPublishState(state.state) && state.state !== 'queued' ? 'in-flight' : 'none';
  }

  /** Steps 3 to 6; reads only. */
  private async check(fields: RequestPublishFields): Promise<CheckedRequest> {
    const { runId, platform, request } = fields;
    // Step 3.
    const snapshot = await this.statusReader.snapshot(platform);
    const status = snapshot.status.publish;
    if (status !== 'connected') throw new PlatformRefusedError(statusRefusals[status], platform, runId);
    const account = snapshot.account;
    if (account === null || account.state !== 'connected') throw new PlatformRefusedError('platform-not-connected', platform, runId);
    if (account.mode !== snapshot.mode) throw new PlatformRefusedError('platform-mode-mismatch', platform, runId);
    // Step 4.
    const approval = await this.facts.approval(runId);
    if (approval.status !== 'approved') throw new PlatformRefusedError('publish-run-not-approved', platform, runId);
    // Step 5.
    const video = await this.facts.finalVideo(runId);
    if (video.status === 'missing') throw new PlatformRefusedError('publish-artifact-missing', platform, runId);
    const sha256 = await this.facts.sha256Of(video.video.absolutePath);
    if (sha256 !== video.video.manifestSha256 || sha256 !== request.artifactSha256) {
      throw new PlatformRefusedError('publish-artifact-changed', platform, runId);
    }
    // Step 6: the set in the body equals the set the server derives now.
    const derived = await this.biometric.derive({ runId, runDir: this.facts.runDirOf(runId) });
    const derivedRefs = new Set<string>(derived.map((asset) => asset.ref));
    const sentRefs = new Set<string>(request.biometricRefs);
    if (derivedRefs.size !== sentRefs.size || [...derivedRefs].some((ref) => !sentRefs.has(ref))) {
      throw new PlatformRefusedError('publish-biometric-mismatch', platform, runId);
    }
    return {
      account,
      approvalDecidedAt: approval.decidedAt,
      artifact: { sha256, sizeBytes: video.video.sizeBytes },
      biometricRefs: [...derivedRefs].sort(),
    };
  }

  /** Steps 8 and 9. */
  private async create(fields: RequestPublishFields, checked: CheckedRequest): Promise<RequestPublishResult> {
    const { runId, platform, request } = fields;
    const now = this.clock.now();
    const attemptId = newUlid(now.getTime());
    const expiresAt = new Date(now.getTime() + publishBounds.queueTtlMs);
    const inserted = await this.attempts.insertQueued({
      attemptId,
      runId,
      platform,
      connectionId: checked.account.connectionId,
      mode: checked.account.mode,
      idempotencyKey: request.idempotencyKey,
      artifactSha256: checked.artifact.sha256,
      artifactBytes: checked.artifact.sizeBytes,
      visibility: request.metadata.visibility,
      aiDisclosure: request.metadata.aiDisclosure,
      metadataSha256: publishMetadataSha256(request.metadata),
      biometricRefs: checked.biometricRefs,
      biometricConfirmedAt: now,
      approvalDecidedAt: checked.approvalDecidedAt,
      requestedBy: fields.requestedBy,
      createdBy: fields.createdBy,
      correlationId: fields.correlationId,
      requestedAt: now,
      expiresAt,
    });
    if (inserted.status === 'conflict') {
      // The same key won a race since step 2 (a replay, answered or refused as in step 2), or
      // another attempt is open for this pair.
      const replay = await this.existingAttempt(fields);
      if (replay !== null) return replay;
      throw new PlatformRefusedError('publish-already-in-progress', platform, runId);
    }
    try {
      await createPublishRequest(this.platformRoot, {
        format: 1,
        attemptId,
        runId,
        platform,
        connectionId: checked.account.connectionId,
        mode: checked.account.mode,
        requestedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        requestedBy: fields.requestedBy,
        createdBy: fields.createdBy,
        correlationId: fields.correlationId,
        artifact: checked.artifact,
        approvalDecidedAt: checked.approvalDecidedAt.toISOString(),
        metadata: request.metadata,
        biometric: { refs: checked.biometricRefs, confirmedAt: now.toISOString() },
      });
    } catch (error) {
      await this.attempts.markRequestWriteFailed(attemptId);
      this.logger.error({ event: 'publish.request-write-failed', runId, attemptId, platform, errorName: errorNameOf(error) });
      throw new PublishRequestWriteFailedError(runId, attemptId);
    }
    const { mode } = checked.account;
    this.logger.log({ event: 'publish.requested', runId, attemptId, platform, mode, correlationId: fields.correlationId });
    return { outcome: 'created', attempt: toPublishAttemptView(inserted.row, null) };
  }

  private async viewOf(row: PublicationAttempt): Promise<RequestPublishResult['attempt']> {
    return toPublishAttemptView(row, await this.publishFiles.readState(row.id));
  }
}

/** The error's class name only: its message may hold a path. */
function errorNameOf(error: unknown): string {
  return error instanceof Error ? error.name : 'unknown';
}