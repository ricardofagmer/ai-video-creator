import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { ComparisonIdSchema } from '@studio/shared/run-format';
import { parseComparisonInput } from '../comparison.input';
import { ComparisonEstimateService } from '../comparison-estimate.service';
import { ComparisonRepository } from '../comparison.repository';
import { ComparisonViewAssembler } from '../comparison-view.assembler';
import { type ComparisonDetail } from '../comparison-view.mapper';
import { ComparisonNotFoundError } from '../comparisons.errors';
import { GetComparisonQuery } from './get-comparison.query';

@QueryHandler(GetComparisonQuery)
export class GetComparisonHandler implements IQueryHandler<GetComparisonQuery, ComparisonDetail> {
  constructor(
    private readonly comparisons: ComparisonRepository,
    private readonly estimates: ComparisonEstimateService,
    private readonly assembler: ComparisonViewAssembler,
  ) {}

  async execute(query: GetComparisonQuery): Promise<ComparisonDetail> {
    const comparisonId = parseComparisonInput(ComparisonIdSchema, query.comparisonId, 'comparisonId');
    const record = await this.comparisons.findRecord(comparisonId);
    if (record === null) throw new ComparisonNotFoundError(comparisonId);
    return this.assembler.detailOf(record, await this.estimates.monthToDateUsd(new Date()));
  }
}
