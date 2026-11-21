import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { IngestMetricBatchCommand, type MetricBatchIngestSummary } from '@studio/core/metrics';
import { type CorrelationId } from '@studio/shared/run-format';
import { RequestContext } from '../platform/request-context';

/** The one command this sync dispatches (the command bus satisfies it). */
export interface MetricBatchCommandPort {
  execute(command: IngestMetricBatchCommand): Promise<MetricBatchIngestSummary>;
}

/**
 * `MetricInboxSync` (SPEC 0007 section 5.6): drains the watcher's `metrics-inbox/` into SQLite
 * through core `IngestMetricBatch`, when the api starts (in the background, as `RunIndexSync` does)
 * and before `GET /runs/:runId/publications`, `GET /platforms` and `GET /insights` answer. The api
 * reads and deletes inbox files only through that handler (K2); it never writes one.
 *
 * Concurrent callers share passes: while one pass runs, every new caller waits for a single
 * follow-up pass, so a file the watcher renamed in meanwhile is still seen before the read, and the
 * 2 s dialog poll never piles up passes. A failed pass is logged by error name and never fails the
 * request that asked for it; the handler leaves an unreadable file in place for the next pass.
 */
@Injectable()
export class MetricInboxSync implements OnApplicationBootstrap {
  private readonly logger = new Logger(MetricInboxSync.name);
  private current: Promise<void> | null = null;
  private next: Promise<void> | null = null;

  constructor(
    @Inject(CommandBus) private readonly commands: MetricBatchCommandPort,
    private readonly context: RequestContext,
  ) {}

  /** Runs in the background so a full inbox never delays the listener. */
  onApplicationBootstrap(): void {
    void this.syncBeforeRead();
  }

  /** Resolves once a pass that started after this call ended; never rejects. */
  syncBeforeRead(): Promise<void> {
    if (this.next !== null) return this.next;
    const running = this.current;
    if (running === null) return this.start();
    const next = running.then(() => {
      this.next = null;
      return this.start();
    });
    this.next = next;
    return next;
  }

  private start(): Promise<void> {
    const pass = this.drain(this.context.correlationId()).finally(() => {
      if (this.current === pass) this.current = null;
    });
    this.current = pass;
    return pass;
  }

  private async drain(correlationId: CorrelationId | null): Promise<void> {
    try {
      const summary = await this.commands.execute(new IngestMetricBatchCommand({ batchId: null, correlationId }));
      if (summary.ingested + summary.duplicates + summary.refused === 0) return;
      this.logger.log({
        event: 'metrics.inbox-synced',
        ingested: summary.ingested,
        duplicates: summary.duplicates,
        refused: summary.refused,
        scoreRecomputed: summary.scoreRecomputed,
        correlationId,
      });
    } catch (error) {
      this.logger.warn({ event: 'metrics.inbox-sync-failed', error: errorName(error), correlationId });
    }
  }
}

/** Error names only: a message could name an inbox path. */
function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}
