import { Inject, Injectable, Logger } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { SyncRunIndexCommand } from '@studio/core/runs';
import { SlotTailReader } from './slot-tail.reader';

/** The one command this sync dispatches (the command bus satisfies it). */
export interface RunIndexCommandPort {
  execute(command: SyncRunIndexCommand): Promise<unknown>;
}

/**
 * Fired lines decided this long before the api process started are already in the index: the
 * start rebuild (`RunIndexSync`) scans every run folder after start, and the watcher writes
 * `run.json` before the `fired` line. The margin covers clock skew and a slow start.
 */
const START_REBUILD_MARGIN_MS = 10 * 60 * 1000;

/** Runs whose sync failed are retried on the next look; the oldest are forgotten past this. */
const MAX_RETRIED_RUNS = 100;

/**
 * Puts runs the watcher created from a schedule slot into the run index (SPEC 0006 section 5.7,
 * L5, R3-AC-22). A watcher-created run is in no index until something syncs it, so `GET /runs` and
 * `GET /schedules` call `syncFiredRuns()` first: it reads the `fired` lines appended since the last
 * look and dispatches `SyncRunIndexCommand` for each run before the request reads the index. The
 * command is idempotent; a failed sync is logged by run id and retried next time, and nothing here
 * ever fails the request. Looks are serialized so two requests never interleave offsets.
 */
@Injectable()
export class FiredRunIndexSync {
  private readonly logger = new Logger(FiredRunIndexSync.name);
  private readonly syncFloorMs: number;
  private readonly retry = new Set<string>();
  private tail: Promise<void> = Promise.resolve();

  constructor(
    private readonly slotTail: SlotTailReader,
    @Inject(CommandBus) private readonly commands: RunIndexCommandPort,
  ) {
    this.syncFloorMs = Date.now() - START_REBUILD_MARGIN_MS;
  }

  /** Resolves once every fired run seen so far had its sync attempted; never rejects. */
  syncFiredRuns(): Promise<void> {
    const look = this.tail.then(() => this.look());
    this.tail = look;
    return look;
  }

  private async look(): Promise<void> {
    const runIds = new Set(this.retry);
    try {
      const tail = await this.slotTail.readNew();
      for (const unreadable of tail.unreadable) {
        this.logger.warn({ event: 'schedule.slot-log-unreadable', scheduleId: unreadable.scheduleId, error: errorName(unreadable.error) });
      }
      for (const fired of tail.fired) {
        if (Date.parse(fired.decidedAt) >= this.syncFloorMs) runIds.add(fired.runId);
      }
    } catch (error) {
      this.logger.warn({ event: 'schedule.slot-logs-unreadable', error: errorName(error) });
    }
    for (const runId of runIds) await this.syncRun(runId);
  }

  private async syncRun(runId: string): Promise<void> {
    try {
      await this.commands.execute(new SyncRunIndexCommand(runId));
      this.retry.delete(runId);
    } catch (error) {
      this.logger.warn({ event: 'schedule.fired-run-sync-failed', runId, error: errorName(error) });
      this.rememberForRetry(runId);
    }
  }

  private rememberForRetry(runId: string): void {
    this.retry.delete(runId);
    this.retry.add(runId);
    if (this.retry.size <= MAX_RETRIED_RUNS) return;
    const [oldest] = this.retry;
    if (oldest !== undefined) this.retry.delete(oldest);
  }
}

/** Error names only: these logs never need a message, which could name a path. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
