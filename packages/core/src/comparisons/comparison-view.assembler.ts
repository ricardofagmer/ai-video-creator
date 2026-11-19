import { Injectable } from '@nestjs/common';
import { QueryBus } from '@nestjs/cqrs';
import { type ComparisonSubject } from '@studio/shared/run-format';
import { AssetVersionNotFoundError, GetAssetVersionQuery } from '../catalog';
import { ComparisonEstimateService } from './comparison-estimate.service';
import { type ComparisonRecord } from './comparison-record.mapper';
import { ComparisonRunsReader, type LoadedArm } from './comparison-runs.reader';
import { verifyComparison } from './comparison-verification';
import {
  comparedRefOf,
  comparisonStatusOf,
  toArmDetail,
  toComparedVersionScore,
  type ComparedVersionScore,
  type ComparisonArmDetail,
  type ComparisonDetail,
} from './comparison-view.mapper';

/**
 * Builds the side-by-side data of one comparison (section 5.3, R2-AC-15) from both run folders at
 * request time; the `comparisons` row only names the two runs. Read-only.
 */
@Injectable()
export class ComparisonViewAssembler {
  constructor(
    private readonly queryBus: QueryBus,
    private readonly reader: ComparisonRunsReader,
    private readonly estimates: ComparisonEstimateService,
  ) {}

  async detailOf(record: ComparisonRecord, monthToDateUsd: number | null): Promise<ComparisonDetail> {
    const pair = await this.reader.loadPair(record);
    // Files win: arm A's link carries the subject; a different subject on arm B shows in `verified`.
    const subject = pair.a.link.subject;
    const estimate = await this.estimates.estimate({ a: pair.a.run, b: pair.b.run }, monthToDateUsd);
    const armA = await this.armDetail(subject, pair.a);
    const armB = await this.armDetail(subject, pair.b);
    return {
      comparisonId: record.comparisonId,
      title: record.title,
      createdAt: record.createdAt,
      createdBy: record.createdBy,
      subject,
      status: comparisonStatusOf(pair.a, pair.b),
      estimate,
      verified: verifyComparison(subject, pair.a, pair.b),
      arms: { a: armA, b: armB },
      // R2-AC-15: the sum of the two cost.json totals.
      pairCostUsd: pair.a.costUsd + pair.b.costUsd,
    };
  }

  private async armDetail(subject: ComparisonSubject, arm: LoadedArm): Promise<ComparisonArmDetail> {
    const comparedRef = comparedRefOf(subject, arm);
    const score = subject.kind === 'asset-binding' ? await this.versionScore(comparedRef) : null;
    return toArmDetail(arm, comparedRef, score);
  }

  /** The compared asset version's current score; null when the version is no longer in the catalog. */
  private async versionScore(ref: string): Promise<ComparedVersionScore> {
    try {
      const version = await this.queryBus.execute(new GetAssetVersionQuery(ref));
      return toComparedVersionScore(version);
    } catch (error) {
      if (error instanceof AssetVersionNotFoundError) return null;
      throw error;
    }
  }
}
