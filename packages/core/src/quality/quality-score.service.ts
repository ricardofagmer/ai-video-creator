import { Injectable, Logger } from '@nestjs/common';
import { QUALITY_SCORE_FORMULA_VERSION } from '@studio/shared/catalog';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { SerialMutex } from '../runtime/keyed-mutex';
import { scoreCatalog, type VersionScore } from './catalog-scores';
import { runPlatformSignals } from './platform-signals';
import { toQualityScoreRun } from './quality-outcome.mapper';
import { QualityScoreRepository, type StoredVersionScore } from './quality-score.repository';

/**
 * What started a recomputation; logged as `trigger` (SPEC 0003 section 7). `metrics` (SPEC 0006
 * section 5.4): a publication, a form snapshot or a CSV import committed.
 */
export type QualityRecomputeTrigger = 'review' | 'cli' | 'formula-version' | 'metrics';

export interface QualityRecomputeSummary {
  /** Versions holding a score (n >= 1) after the pass. */
  versionsScored: number;
  /** Versions whose stored score this pass set back to null (n = 0). */
  versionsCleared: number;
  /** Versions whose score or sample size this pass wrote; 0 on a repeat with no new outcome. */
  versionsChanged: number;
  outcomesRead: number;
  formulaVersion: number;
  durationMs: number;
}

export interface ReviewRecomputeContext {
  runId: string;
  correlationId: string | null;
}

/** What committed before a `metrics` recomputation; ids only, for the failure log line. */
export interface MetricsRecomputeContext {
  change: 'publication-recorded' | 'snapshot-saved' | 'metrics-imported' | 'metrics-batch-ingested';
  correlationId: string | null;
}

/** A whole-catalog pass reads every outcome; SQLite holds the write lock for this long at most. */
const RECOMPUTE_TRANSACTION_TIMEOUT_MS = 30_000;
const RECOMPUTE_TRANSACTION_MAX_WAIT_MS = 10_000;

function isChanged(stored: StoredVersionScore, next: VersionScore): boolean {
  return (
    stored.qualityScore !== next.qualityScore ||
    stored.qualitySampleSize !== next.qualitySampleSize ||
    stored.qualityPlatformSampleSize !== next.qualityPlatformSampleSize
  );
}

function errorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

/**
 * The single writer of `quality_score`, `quality_sample_size`, `quality_platform_sample_size` and
 * `quality_scored_at` (SPEC 0003 section 5.1, SPEC 0006 section 5.4, ADR 0003). Provided only to the api and the CLI, through the review module and the
 * `@studio/core/quality` entry; the watcher never imports it (R2-AC-03). Each pass rescores the
 * whole catalog in one transaction (B4) with the shared formula, and writes only the versions whose
 * value changed, so a repeated pass changes nothing and `qualityScoredAt` is when the stored value
 * was computed. Passes in one process run one at a time.
 */
@Injectable()
export class QualityScoreService {
  private readonly logger = new Logger(QualityScoreService.name);
  private readonly passes = new SerialMutex();

  constructor(
    private readonly prisma: PrismaService,
    private readonly repository: QualityScoreRepository,
  ) {}

  /** `studio catalog rescore` (R2-08 wires the command): repair, or after a formula change. */
  async rescore(): Promise<QualityRecomputeSummary> {
    return this.recomputeAll('cli');
  }

  async recomputeAll(trigger: QualityRecomputeTrigger): Promise<QualityRecomputeSummary> {
    return this.serialized(() => this.recompute(trigger));
  }

  /**
   * Called by the review handler after the outcome transaction committed. A failure is logged with
   * refs only and never fails the review: the decision is already on disk and the next trigger
   * repairs the scores.
   */
  async recomputeAfterReview(context: ReviewRecomputeContext): Promise<void> {
    try {
      await this.recomputeAll('review');
    } catch (error) {
      this.logger.error({
        event: 'quality.recompute-failed',
        trigger: 'review',
        errorName: errorName(error),
        runId: context.runId,
        correlationId: context.correlationId,
      });
    }
  }

  /**
   * Called by the metrics handlers after their transaction committed (SPEC 0006 section 5.4). Like
   * the review path, a failure is logged with refs only and never fails the request: the snapshot or
   * publication is already stored and the next trigger repairs the scores. Answers whether the pass
   * completed, for the import report's `scoreRecomputed`.
   */
  async recomputeAfterMetrics(context: MetricsRecomputeContext): Promise<boolean> {
    try {
      await this.recomputeAll('metrics');
      return true;
    } catch (error) {
      this.logger.error({
        event: 'quality.recompute-failed',
        trigger: 'metrics',
        change: context.change,
        errorName: errorName(error),
        correlationId: context.correlationId,
      });
      return false;
    }
  }

  /**
   * The formula-version settings check (section 5.1): when the stored
   * `quality.formula-version` differs from `QUALITY_SCORE_FORMULA_VERSION`, or is absent, the whole
   * catalog is rescored and the setting updated in the same transaction. The api calls it at start.
   */
  async reconcileFormulaVersion(): Promise<'current' | 'rescored'> {
    return this.serialized(async () => {
      if ((await this.repository.readFormulaVersion()) === String(QUALITY_SCORE_FORMULA_VERSION)) return 'current';
      await this.recompute('formula-version');
      return 'rescored';
    });
  }

  private async recompute(trigger: QualityRecomputeTrigger): Promise<QualityRecomputeSummary> {
    const startedAt = Date.now();
    const counts = await this.prisma.$transaction((transaction) => this.rescoreCatalog(transaction), {
      maxWait: RECOMPUTE_TRANSACTION_MAX_WAIT_MS,
      timeout: RECOMPUTE_TRANSACTION_TIMEOUT_MS,
    });
    const summary: QualityRecomputeSummary = {
      ...counts,
      formulaVersion: QUALITY_SCORE_FORMULA_VERSION,
      durationMs: Date.now() - startedAt,
    };
    // Counts and ids only: no rating, review note or reviewer name (section 7).
    this.logger.log({ event: 'quality.recomputed', trigger, ...summary });
    return summary;
  }

  private async rescoreCatalog(
    transaction: PrismaTransaction,
  ): Promise<Pick<QualityRecomputeSummary, 'versionsScored' | 'versionsCleared' | 'versionsChanged' | 'outcomesRead'>> {
    const outcomes = await this.repository.readOutcomes(transaction);
    const stored = await this.repository.readVersionScores(transaction);
    // Formula version 2: with no snapshot every signal is absent and each run scores as in version 1.
    const signals = runPlatformSignals(await this.repository.readPlatformSnapshots(transaction));
    const scores = scoreCatalog(
      outcomes.map((outcome) => ({
        runId: outcome.runId,
        recipeId: outcome.recipeId,
        run: toQualityScoreRun(outcome, signals.get(outcome.runId) ?? null),
        assetVersionIds: outcome.assetVersionIds,
      })),
      stored,
    );

    const storedById = new Map(stored.map((version) => [version.id, version]));
    const scoredAt = new Date();
    let versionsChanged = 0;
    let versionsCleared = 0;
    for (const score of scores) {
      const current = storedById.get(score.id);
      if (current === undefined || !isChanged(current, score)) continue;
      await this.repository.writeScore({ ...score, qualityScoredAt: scoredAt }, transaction);
      versionsChanged += 1;
      if (score.qualityScore === null) versionsCleared += 1;
    }

    const formulaVersion = String(QUALITY_SCORE_FORMULA_VERSION);
    if ((await this.repository.readFormulaVersion(transaction)) !== formulaVersion) {
      await this.repository.writeFormulaVersion(formulaVersion, transaction);
    }
    return {
      versionsScored: scores.filter((score) => score.qualityScore !== null).length,
      versionsCleared,
      versionsChanged,
      outcomesRead: outcomes.length,
    };
  }

  /** Orders passes in this process; a failed pass reaches its own caller and frees the next one. */
  private serialized<T>(work: () => Promise<T>): Promise<T> {
    return this.passes.run(work);
  }
}
