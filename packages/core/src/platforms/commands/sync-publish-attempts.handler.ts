import { Inject, Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { type PublicationAttempt } from '@prisma/client';
import {
  PlatformSchema,
  PublishStateSchema,
  canTransitionPublishState,
  publishBounds,
  type PublishState,
  type PublishStateFile,
} from '@studio/shared/platforms';
import { RunFileError, runDirectory } from '@studio/shared/run-files';
import { DataHome } from '../../paths/data-home';
import { PrismaService } from '../../prisma/prisma.service';
import { PlatformFileCorruptError } from '../platforms.errors';
import { PLATFORM_CLOCK, type PlatformClock } from '../platform-runtime';
import { PlatformWriteQueue } from '../platform-write.queue';
import { hasUploadStartedLine, isFileSystemError } from '../publish/attempt-upload-log';
import { PublicationAttemptRepository, isUniqueConstraintError } from '../publish/publication-attempt.repository';
import { PublicationLinker, type PublicationUrlPlan } from '../publish/publication-linker';
import { PublishFileReader } from '../stores/publish-file.reader';
import { SyncPublishAttemptsCommand, type PublishSyncSummary } from './platform.commands';

/** What one row's pass did. */
type RowOutcome = 'unchanged' | 'updated' | 'expired' | 'linked';

/**
 * How long after a row turned `cancelled` or `expired` the sync still checks whether the upload
 * happened anyway (finding C4): the longest an attempt stays followed after its upload.
 */
const WITHDRAWN_RECHECK_MS = publishBounds.inboxFollowMs;

/**
 * A `state.json` state that shows the watcher went past the claim: `uploading` or any later state.
 * Never `queued`, `cancelled` or `expired`, which the watcher writes when nothing was sent. `failed`
 * needs evidence of a byte as well (finding R3, `sentAnyByte`).
 */
function showsUpload(state: PublishState): boolean {
  return state !== 'cancelled' && state !== 'expired' && canTransitionPublishState('queued', state);
}

/**
 * `PublishAttemptSync` (SPEC 0007 section 5.4 "Result"). For each open attempt: copies a newer
 * `state.json` state into the row (only moves `canTransitionPublishState` allows, only while the
 * row still holds the state it was read with); on `published` it inserts the `run_publications`
 * row in the same transaction; a `queued` row with no `state.json` past `expiresAt` becomes
 * `expired`. `published` attempts whose link failed earlier are retried. A corrupt `state.json`
 * is logged and left for the next pass. Logs carry ids, states and reason ids only.
 *
 * Finding C4: a cancel or an expiry can race the watcher's claim, leaving a `cancelled` or
 * `expired` row for an upload that happened. When `claim` exists and `state.json` shows `uploading`
 * or later, the row follows the file, so a publication is linked and `RequestPublish` step 7 sees
 * it. `canTransitionPublishState` refuses every move out of a terminal state, so such a row is
 * checked as the `queued` row it was when the watcher claimed it: a terminal state reachable from
 * `queued` is taken; an open one too, unless another attempt is now open for the pair (the
 * one-open-attempt index refuses it), in which case the row waits for the file's terminal state.
 */
@CommandHandler(SyncPublishAttemptsCommand)
export class SyncPublishAttemptsHandler implements ICommandHandler<SyncPublishAttemptsCommand, PublishSyncSummary> {
  private readonly logger = new Logger(SyncPublishAttemptsHandler.name);

  constructor(
    @Inject(PLATFORM_CLOCK) private readonly clock: PlatformClock,
    private readonly prisma: PrismaService,
    private readonly attempts: PublicationAttemptRepository,
    private readonly publishFiles: PublishFileReader,
    private readonly linker: PublicationLinker,
    private readonly queue: PlatformWriteQueue,
    private readonly dataHome: DataHome,
  ) {}

  async execute(command: SyncPublishAttemptsCommand): Promise<PublishSyncSummary> {
    return this.queue.exclusive(async () => {
      const summary: PublishSyncSummary = { open: 0, updated: 0, expired: 0, linked: 0 };
      const open = await this.attempts.listOpen(command.runId);
      summary.open = open.length;
      for (const row of open) this.count(summary, await this.syncOpen(row));
      for (const row of await this.attempts.listPublishedUnlinked(command.runId)) this.count(summary, await this.retryLink(row));
      const since = new Date(this.clock.now().getTime() - WITHDRAWN_RECHECK_MS);
      for (const row of await this.attempts.listRecentlyWithdrawn(command.runId, since)) this.count(summary, await this.reconcileWithdrawn(row));
      return summary;
    });
  }

  private count(summary: PublishSyncSummary, outcome: RowOutcome): void {
    if (outcome === 'updated') summary.updated += 1;
    if (outcome === 'expired') summary.expired += 1;
    if (outcome === 'linked') {
      summary.updated += 1;
      summary.linked += 1;
    }
  }

  private async syncOpen(row: PublicationAttempt): Promise<RowOutcome> {
    const state = await this.readState(row);
    const now = this.clock.now();
    if (state === 'corrupt') return 'unchanged';
    if (state === null) {
      if (row.state !== 'queued' || now.getTime() <= row.expiresAt.getTime()) return 'unchanged';
      // Finding C4: a claimed attempt is the watcher's now, even before its first `state.json`.
      if (await this.publishFiles.hasClaim(row.id)) return 'unchanged';
      const moved = await this.attempts.moveState({ attemptId: row.id, from: 'queued', change: { state: 'expired', reasonId: null } });
      if (moved) this.logger.log({ event: 'publish.expired', runId: row.runId, attemptId: row.id, platform: row.platform });
      return moved ? 'expired' : 'unchanged';
    }
    const from = PublishStateSchema.safeParse(row.state);
    if (!from.success || state.state === row.state || !canTransitionPublishState(from.data, state.state)) return 'unchanged';
    const outcome = await this.applyFileState(row, state, now);
    if (outcome !== 'unchanged') {
      const { runId, id: attemptId, platform } = row;
      this.logger.log({ event: 'publish.state-synced', runId, attemptId, platform, state: state.state, reasonId: state.reasonId });
    }
    return outcome;
  }

  /** Finding C4: a withdrawn row whose upload happened anyway follows `state.json`. */
  private async reconcileWithdrawn(row: PublicationAttempt): Promise<RowOutcome> {
    const state = await this.readState(row);
    if (state === null || state === 'corrupt' || !showsUpload(state.state)) return 'unchanged';
    if (!(await this.publishFiles.hasClaim(row.id))) return 'unchanged';
    if (state.state === 'failed' && !(await this.sentAnyByte(row, state))) return 'unchanged';
    const { runId, id: attemptId, platform } = row;
    let outcome: RowOutcome;
    try {
      outcome = await this.applyFileState(row, state, this.clock.now());
    } catch (error) {
      if (!isUniqueConstraintError(error)) throw error;
      this.logger.warn({ event: 'publish.reconcile-deferred', runId, attemptId, platform, from: row.state, state: state.state });
      return 'unchanged';
    }
    if (outcome !== 'unchanged') {
      const { reasonId } = state;
      this.logger.warn({ event: 'publish.state-reconciled', runId, attemptId, platform, from: row.state, state: state.state, reasonId });
    }
    return outcome;
  }

  /** Moves the row to the file's state, only while it still holds the state it was read with; links on `published`. */
  private async applyFileState(row: PublicationAttempt, state: PublishStateFile, now: Date): Promise<RowOutcome> {
    const plan = state.state === 'published' ? await this.planFor(row, state) : null;
    return this.prisma.$transaction(async (tx): Promise<RowOutcome> => {
      const change = { state: state.state, reasonId: state.reasonId };
      const moved = await this.attempts.moveState({ attemptId: row.id, from: row.state, change }, tx);
      if (!moved) return 'unchanged';
      if (plan === null) return 'updated';
      const link = await this.linker.link({ attempt: row, state, plan, now }, tx);
      if (link.status === 'skipped') this.logLinkSkipped(row, link.reason);
      return link.status === 'linked' ? 'linked' : 'updated';
    });
  }

  /**
   * Finding R3: a `failed` state.json alone does not show an upload, since the watcher also fails an
   * attempt before its first byte (a revoked token, say). Positive evidence only: bytes counted in
   * the file, or the attempt's `upload-started` line in the run's `publications.jsonl`. An
   * unreadable log proves nothing; it is logged and the row stays withdrawn.
   */
  private async sentAnyByte(row: PublicationAttempt, state: PublishStateFile): Promise<boolean> {
    if (state.bytesSent > 0) return true;
    try {
      return await hasUploadStartedLine(runDirectory(this.dataHome.runs, row.runId), row.id);
    } catch (error) {
      if (!(error instanceof RunFileError) && !isFileSystemError(error)) throw error;
      this.logger.warn({ event: 'publish.upload-log-unreadable', runId: row.runId, attemptId: row.id, platform: row.platform });
      return false;
    }
  }

  private async retryLink(row: PublicationAttempt): Promise<RowOutcome> {
    const state = await this.readState(row);
    if (state === null || state === 'corrupt' || state.state !== 'published') return 'unchanged';
    const plan = await this.planFor(row, state);
    if (plan === null || plan.status === 'skipped') return 'unchanged';
    const now = this.clock.now();
    const link = await this.prisma.$transaction((tx) => this.linker.link({ attempt: row, state, plan, now }, tx));
    if (link.status === 'skipped') return 'unchanged';
    const { runId, id: attemptId, platform } = row;
    this.logger.log({ event: 'publish.linked', runId, attemptId, platform, publicationId: link.publicationId });
    return 'linked';
  }

  private async planFor(row: PublicationAttempt, state: PublishStateFile): Promise<PublicationUrlPlan | null> {
    const platform = PlatformSchema.safeParse(row.platform);
    if (!platform.success || state.platformVideoId === null) return null;
    return this.linker.planUrl(platform.data, state.platformVideoId, state.publicationUrl ?? null);
  }

  private async readState(row: PublicationAttempt): Promise<PublishStateFile | null | 'corrupt'> {
    try {
      return await this.publishFiles.readState(row.id);
    } catch (error) {
      if (!(error instanceof PlatformFileCorruptError)) throw error;
      this.logger.warn({ event: 'publish.state-corrupt', runId: row.runId, attemptId: row.id, platform: row.platform });
      return 'corrupt';
    }
  }

  private logLinkSkipped(row: PublicationAttempt, reason: string): void {
    this.logger.warn({ event: 'publish.link-skipped', runId: row.runId, attemptId: row.id, platform: row.platform, reason });
  }
}
