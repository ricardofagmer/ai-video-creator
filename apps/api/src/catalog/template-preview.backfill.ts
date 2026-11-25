import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { TemplatePreviewEnqueuer, type TemplatePreviewEnqueueOutcome } from '@studio/core/asset-jobs';
import { SearchAssetsQuery } from '@studio/core/catalog';

/** Between passes; a pass stopped by a full queue resumes on the next one. */
const PASS_INTERVAL_MS = 120_000;
/** A catalog page; also the most versions one pass visits per page request. */
const PAGE_LIMIT = 100;
/** Upper bound on pages per pass, so a pass always ends. */
const MAX_PAGES = 50;

type PassCounts = Record<TemplatePreviewEnqueueOutcome, number>;

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

/**
 * Template preview backfill (2026-11-25): every template version without a preview gets one,
 * including those registered before previews existed. One pass at api start, then one every two
 * minutes. Enqueue is idempotent (an open or done preview is kept), so a pass only writes jobs for
 * versions that lack one. A full queue ends the pass; the next pass continues. Runs in the
 * background and never throws; the log carries counts only.
 */
@Injectable()
export class TemplatePreviewBackfill implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(TemplatePreviewBackfill.name);
  private timer: NodeJS.Timeout | null = null;
  private running = false;

  constructor(
    private readonly queryBus: QueryBus,
    private readonly enqueuer: TemplatePreviewEnqueuer,
  ) {}

  onApplicationBootstrap(): void {
    void this.pass();
    this.timer = setInterval(() => void this.pass(), PASS_INTERVAL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer !== null) clearInterval(this.timer);
    this.timer = null;
  }

  private async pass(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const counts = await this.enqueueMissing();
      if (counts.requested > 0 || counts['queue-full'] > 0 || counts.failed > 0) {
        this.logger.log({ event: 'asset-job.preview-backfill', ...counts });
      }
    } catch (error) {
      this.logger.warn({ event: 'asset-job.preview-backfill-failed', errorName: errorName(error) });
    } finally {
      this.running = false;
    }
  }

  private async enqueueMissing(): Promise<PassCounts> {
    const counts: PassCounts = { requested: 0, kept: 0, 'not-eligible': 0, 'queue-full': 0, failed: 0 };
    let cursor: string | undefined;
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.queryBus.execute(
        new SearchAssetsQuery({ kinds: ['template'], statuses: ['draft', 'active'], sensitivity: 'any', limit: PAGE_LIMIT, cursor }),
      );
      for (const version of result.items) {
        const outcome = await this.enqueuer.enqueueIfEligible(version);
        counts[outcome] += 1;
        if (outcome === 'queue-full') return counts;
      }
      if (result.nextCursor === null) return counts;
      cursor = result.nextCursor;
    }
    return counts;
  }
}
