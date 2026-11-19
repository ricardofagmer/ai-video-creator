import { Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import { IndexRunCostCommand } from '@studio/core/costs';
import { DataHome } from '@studio/core/paths';
import { ListRunsQuery, MAX_INDEXED_RUN_FOLDERS, RebuildRunIndexCommand, SyncRunIndexCommand } from '@studio/core/runs';
import { runDirectory } from '@studio/shared/run-files';
import { type RunId, type RunStatus } from '@studio/shared/run-format';

/** No live watcher writes cost.json or run.json in these, so their index rows and costs are settled. */
const settledStatuses: readonly RunStatus[] = ['failed', 'interrupted', 'review', 'approved', 'rejected'];

const RESYNC_PAGE_SIZE = 100;
/** One sync per run and status; older entries are forgotten first so memory stays bounded. */
const MAX_REMEMBERED_RUNS = 10_000;

/**
 * Keeps the SQLite mirrors of the run folders current (ADR 0003 decision 3, SPEC 0002 rev 2):
 * the run index is rebuilt and every run's cost.json indexed when the api starts, and a run seen
 * in a settled status is synced once. Both commands are idempotent, so a repeat is harmless.
 * Failures are logged and never fail the request that observed the run.
 */
@Injectable()
export class RunIndexSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(RunIndexSync.name);
  private readonly syncedStatus = new Map<RunId, RunStatus>();

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly dataHome: DataHome,
  ) {}

  /** Runs in the background so a large data home never delays the listener. */
  onApplicationBootstrap(): void {
    void this.resyncAll();
  }

  /** Called with the status a reader displayed; dispatches at most once per run and status. */
  observe(runId: RunId, status: RunStatus): void {
    if (!settledStatuses.includes(status) || this.syncedStatus.get(runId) === status) return;
    this.remember(runId, status);
    void this.syncRun(runId);
  }

  private remember(runId: RunId, status: RunStatus): void {
    this.syncedStatus.delete(runId);
    this.syncedStatus.set(runId, status);
    if (this.syncedStatus.size <= MAX_REMEMBERED_RUNS) return;
    const [oldest] = this.syncedStatus.keys();
    if (oldest !== undefined) this.syncedStatus.delete(oldest);
  }

  private async resyncAll(): Promise<void> {
    try {
      const report = await this.commandBus.execute(new RebuildRunIndexCommand());
      this.logger.log({
        event: 'runs.index-rebuilt',
        indexed: report.indexed,
        unreadable: report.unreadable.length,
        orphaned: report.orphaned.length,
      });
      await this.indexEveryRunCost();
    } catch (error) {
      this.logger.error({ event: 'runs.index-rebuild-failed', error: errorName(error) });
    }
  }

  private async indexEveryRunCost(): Promise<void> {
    const maxPages = Math.ceil(MAX_INDEXED_RUN_FOLDERS / RESYNC_PAGE_SIZE) + 1;
    let cursor: string | undefined;
    for (let page = 0; page < maxPages; page += 1) {
      const result = await this.queryBus.execute(new ListRunsQuery({ limit: RESYNC_PAGE_SIZE, cursor }));
      for (const entry of result.items) await this.indexCost(entry.runId);
      if (result.nextCursor === null) return;
      cursor = result.nextCursor;
    }
  }

  private async syncRun(runId: RunId): Promise<void> {
    try {
      await this.commandBus.execute(new SyncRunIndexCommand(runId));
    } catch (error) {
      this.logger.warn({ event: 'runs.index-sync-failed', runId, error: errorName(error) });
    }
    await this.indexCost(runId);
  }

  private async indexCost(runId: RunId): Promise<void> {
    try {
      await this.commandBus.execute(new IndexRunCostCommand({ runId, runDir: runDirectory(this.dataHome.runs, runId) }));
    } catch (error) {
      this.logger.warn({ event: 'costs.index-failed', runId, error: errorName(error) });
    }
  }
}

/** Error names only: core messages are safe, but these logs never need more than the kind. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
