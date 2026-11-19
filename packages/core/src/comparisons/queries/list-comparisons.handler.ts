import { Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { RunFileError } from '@studio/shared/run-files';
import { ListComparisonsCriteriaSchema, parseComparisonInput } from '../comparison.input';
import { ComparisonEstimateService } from '../comparison-estimate.service';
import { toComparisonRecord } from '../comparison-record.mapper';
import { ComparisonRepository } from '../comparison.repository';
import { ComparisonViewAssembler } from '../comparison-view.assembler';
import { type ComparisonDetail } from '../comparison-view.mapper';
import { ComparisonLinkBrokenError, ComparisonRowCorruptError } from '../comparisons.errors';
import { ListComparisonsQuery, type ComparisonDetailPage } from './list-comparisons.query';

/**
 * Newest first. Each item is read from its two run folders; the month-to-date spend is read once
 * per page. A comparison whose folders or row are damaged is left out of the page and logged by
 * id, so one bad folder does not hide the others; `GET /comparisons/:comparisonId` still reports it.
 */
@QueryHandler(ListComparisonsQuery)
export class ListComparisonsHandler implements IQueryHandler<ListComparisonsQuery, ComparisonDetailPage> {
  private readonly logger = new Logger(ListComparisonsHandler.name);

  constructor(
    private readonly comparisons: ComparisonRepository,
    private readonly estimates: ComparisonEstimateService,
    private readonly assembler: ComparisonViewAssembler,
  ) {}

  async execute(query: ListComparisonsQuery): Promise<ComparisonDetailPage> {
    const criteria = parseComparisonInput(ListComparisonsCriteriaSchema, query.criteria, 'criteria');
    const page = await this.comparisons.page({ beforeId: criteria.cursor ?? null, limit: criteria.limit });
    const monthToDateUsd = await this.estimates.monthToDateUsd(new Date());
    const items: ComparisonDetail[] = [];
    // One comparison at a time: each reads two run folders, and a page holds at most 100.
    for (const row of page.rows) {
      try {
        items.push(await this.assembler.detailOf(toComparisonRecord(row), monthToDateUsd));
      } catch (error) {
        if (!(error instanceof ComparisonLinkBrokenError || error instanceof ComparisonRowCorruptError || error instanceof RunFileError)) {
          throw error;
        }
        this.logger.warn({ event: 'comparisons.list-skipped', comparisonId: row.id, errorName: error.name });
      }
    }
    const last = page.rows.at(-1);
    return { items, total: page.total, nextCursor: page.hasMore && last !== undefined ? last.id : null };
  }
}
