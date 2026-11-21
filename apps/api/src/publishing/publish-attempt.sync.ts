import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { SyncPublishAttemptsCommand, type PublishSyncSummary } from '@studio/core/platforms';
import { type RunId } from '@studio/shared/run-format';

/** The one command this sync dispatches (the command bus satisfies it). */
export interface PublishSyncCommandPort {
  execute(command: SyncPublishAttemptsCommand): Promise<PublishSyncSummary>;
}

/**
 * `PublishAttemptSync` (SPEC 0007 section 5.4 "Result"): copies the watcher's `state.json` of each
 * open attempt into its `publication_attempts` row, links a `published` one to the run and expires
 * unclaimed requests, all through core `SyncPublishAttemptsCommand`. It runs every open attempt
 * when the api starts (in the background, as `RunIndexSync` does) and one run's attempts before
 * `GET /runs/:runId/publish` and `GET /runs/:runId/publications` answer. The core handler
 * serializes passes. A failed pass is logged by run id and error name and never fails the request;
 * the next read retries it. Nothing here makes an outbound request or writes a file (AC 52, AC 57).
 */
@Injectable()
export class PublishAttemptSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(PublishAttemptSync.name);

  constructor(@Inject(CommandBus) private readonly commands: PublishSyncCommandPort) {}

  /** Runs in the background so many open attempts never delay the listener. */
  onApplicationBootstrap(): void {
    void this.sync(null);
  }

  /** Resolves once the run's pass ended; never rejects. */
  syncBeforeRead(runId: RunId): Promise<void> {
    return this.sync(runId);
  }

  private async sync(runId: RunId | null): Promise<void> {
    try {
      const summary = await this.commands.execute(new SyncPublishAttemptsCommand(runId));
      if (summary.updated + summary.expired + summary.linked === 0) return;
      this.logger.log({
        event: 'publish.attempts-synced',
        runId,
        open: summary.open,
        updated: summary.updated,
        expired: summary.expired,
        linked: summary.linked,
      });
    } catch (error) {
      this.logger.warn({ event: 'publish.attempts-sync-failed', runId, error: errorName(error) });
    }
  }
}

/** Error names only: a message could name a platform file path. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
