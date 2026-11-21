import { Inject } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { INSIGHTS_MAX_RUNS, InsightsViewSchema, type InsightsView } from '@studio/shared/api';
import { type ParsedAssetRef } from '@studio/shared/catalog';
import { RunIdSchema, defaultLimits } from '@studio/shared/run-format';
import { MonthToDateUnavailableError } from '../../costs/costs.errors';
import { MonthToDateSpend } from '../../costs/month-to-date.service';
import { calculateInsights, type RunCatalogFacts, type RunInsightFacts } from '../insights.calculator';
import { InsightsRepository, assetVersionKey, type OutcomeRow, type ReviewedRunRow } from '../insights.repository';
import { RunHistoryReader, type RunAssetVersions, type RunHistory } from '../run-history.reader';
import { GetStudioInsightsQuery } from './get-studio-insights.query';

/** Run folders read at once; bounds open file handles on a large data home. */
const RUNS_READ_AT_ONCE = 8;

interface RunFiles {
  history: RunHistory;
  assets: RunAssetVersions;
}

function catalogFacts(run: ReviewedRunRow, assets: RunAssetVersions, createdAt: ReadonlyMap<string, Date>): RunCatalogFacts {
  if (assets.status !== 'read') return { status: 'unreadable' };
  const fromCatalog = assets.versions.filter((version) => {
    const versionCreatedAt = createdAt.get(assetVersionKey(version));
    return versionCreatedAt !== undefined && versionCreatedAt < run.createdAt;
  }).length;
  return { status: 'read', assetVersions: assets.versions.length, fromCatalog };
}

/**
 * Reads only: the run index, outcomes, asset versions and publications from SQLite, each reviewed
 * run's `events.jsonl` and `manifest.json`, and the month-to-date spend; the section 14 rules live
 * in `calculateInsights`. The newest `INSIGHTS_MAX_RUNS` reviewed runs are read, and the view says
 * when older ones were left out. A month-to-date figure that cannot be computed is shown as unknown
 * rather than failing the page.
 */
@QueryHandler(GetStudioInsightsQuery)
export class GetStudioInsightsHandler implements IQueryHandler<GetStudioInsightsQuery, InsightsView> {
  constructor(
    @Inject(InsightsRepository) private readonly repository: InsightsRepository,
    @Inject(RunHistoryReader) private readonly runFiles: RunHistoryReader,
    @Inject(MonthToDateSpend) private readonly monthToDate: Pick<MonthToDateSpend, 'computeUsd'>,
  ) {}

  async execute(query: GetStudioInsightsQuery): Promise<InsightsView> {
    const rows = await this.repository.reviewedRuns(INSIGHTS_MAX_RUNS + 1);
    const runs = rows.slice(0, INSIGHTS_MAX_RUNS);
    const outcomes = new Map((await this.repository.outcomes(runs.map((run) => run.runId))).map((outcome) => [outcome.runId, outcome]));
    const files = await this.readRunFiles(runs);
    const versions = [...files.values()].flatMap((entry) => (entry.assets.status === 'read' ? entry.assets.versions : []));
    const createdAt = await this.repository.versionCreatedAt(uniqueVersions(versions));

    const facts: RunInsightFacts[] = runs.map((run) => {
      const entry = files.get(run.runId) ?? { history: { status: 'unreadable' }, assets: { status: 'unreadable' } };
      return {
        runId: run.runId,
        recipeId: run.recipeId,
        createdAt: run.createdAt,
        costUsd: run.costUsd,
        history: entry.history,
        catalog: catalogFacts(run, entry.assets, createdAt),
        outcome: toOutcome(outcomes.get(run.runId)),
      };
    });

    return InsightsViewSchema.parse(
      calculateInsights({
        computedAt: query.at,
        runs: facts,
        truncated: rows.length > INSIGHTS_MAX_RUNS,
        monthToDateUsd: await this.monthToDateUsd(query.at),
        limits: { runUsd: defaultLimits.costPerRunUsd, monthUsd: defaultLimits.costPerMonthUsd },
        unapprovedPublications: await this.repository.unapprovedPublicationCount(),
      }),
    );
  }

  private async readRunFiles(runs: readonly ReviewedRunRow[]): Promise<Map<string, RunFiles>> {
    const files = new Map<string, RunFiles>();
    for (let start = 0; start < runs.length; start += RUNS_READ_AT_ONCE) {
      const batch = runs.slice(start, start + RUNS_READ_AT_ONCE);
      const read = await Promise.all(
        batch.map(async (run): Promise<[string, RunFiles]> => {
          // A run index row whose id is not a run id has no folder to read.
          if (!RunIdSchema.safeParse(run.runId).success) return [run.runId, { history: { status: 'unreadable' }, assets: { status: 'unreadable' } }];
          const [history, assets] = await Promise.all([this.runFiles.history(run.runId), this.runFiles.assetVersions(run.runId)]);
          return [run.runId, { history, assets }];
        }),
      );
      for (const [runId, entry] of read) files.set(runId, entry);
    }
    return files;
  }

  private async monthToDateUsd(at: Date): Promise<number | null> {
    try {
      return await this.monthToDate.computeUsd(at);
    } catch (error) {
      if (error instanceof MonthToDateUnavailableError) return null;
      throw error;
    }
  }
}

function uniqueVersions(versions: readonly ParsedAssetRef[]): ParsedAssetRef[] {
  return [...new Map(versions.map((version) => [assetVersionKey(version), version])).values()];
}

function toOutcome(row: OutcomeRow | undefined): RunInsightFacts['outcome'] {
  return row === undefined ? null : { decision: row.decision, rating: row.rating, decidedAt: row.decidedAt };
}
