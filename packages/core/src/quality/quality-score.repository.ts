import { Injectable } from '@nestjs/common';
import { platformSnapshotFactSelect, toPlatformSnapshotFact } from '../metrics/metric-columns.mapper';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { type PlatformSnapshotFact } from './platform-signals';
import { QualitySnapshotCorruptError } from './quality.errors';
import { type OutcomeEvidenceRow } from './quality-outcome.mapper';

/**
 * The settings row (C8 `settings`) holding the `QUALITY_SCORE_FORMULA_VERSION` the stored scores
 * were computed with (SPEC 0003 section 5.1).
 */
export const QUALITY_FORMULA_VERSION_SETTING_KEY = 'quality.formula-version';

/** One reviewed run with the recipe id it ran and the asset version rows it used. */
export interface QualityOutcomeRow extends OutcomeEvidenceRow {
  recipeId: string;
  assetVersionIds: number[];
}

/** One version's stored score; the vector columns are never selected here. */
export interface StoredVersionScore {
  id: number;
  kind: string;
  qualityScore: number | null;
  qualitySampleSize: number;
  qualityPlatformSampleSize: number;
}

export interface VersionScoreWrite {
  id: number;
  qualityScore: number | null;
  qualitySampleSize: number;
  qualityPlatformSampleSize: number;
  qualityScoredAt: Date;
}

/**
 * Data access for the quality score: reads `run_outcomes`, `run_outcome_assets`, the run index's
 * recipe id, the platform snapshots (SPEC 0006 section 5.4) and the versions' scores; writes the
 * four score columns and the formula-version setting. The service owns the transaction and passes
 * it in.
 */
@Injectable()
export class QualityScoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every reviewed run, by run id. The whole catalog is rescored in one pass (B4), so this read is
   * deliberately unpaginated: one new run moves the recipe, kind and global pool means.
   */
  async readOutcomes(db: PrismaTransaction = this.prisma): Promise<QualityOutcomeRow[]> {
    const rows = await db.runOutcome.findMany({
      orderBy: { runId: 'asc' },
      select: {
        runId: true,
        rating: true,
        reviewerScoresJson: true,
        qaMetricsJson: true,
        recoveries: true,
        run: { select: { recipeId: true } },
        assets: { select: { assetVersionId: true }, orderBy: { assetVersionId: 'asc' } },
      },
    });
    return rows.map((row) => ({
      runId: row.runId,
      rating: row.rating,
      reviewerScoresJson: row.reviewerScoresJson,
      qaMetricsJson: row.qaMetricsJson,
      recoveries: row.recoveries,
      recipeId: row.run.recipeId,
      assetVersionIds: row.assets.map((asset) => asset.assetVersionId),
    }));
  }

  /**
   * Every platform metric snapshot with its publication's run and platform, in a stable order. Like
   * `readOutcomes`, deliberately unpaginated: every snapshot in force moves its platform's baseline.
   * Only ids, dates, sources and numbers are selected; the URL is never read here.
   */
  async readPlatformSnapshots(db: PrismaTransaction = this.prisma): Promise<PlatformSnapshotFact[]> {
    const rows = await db.platformMetricSnapshot.findMany({
      // SPEC 0007 B6, AC 59: simulated publications never reach a baseline or `p_i`, so a mock
      // number cannot move a real score and every score equals its value without them.
      where: { publication: { origin: { not: 'mock' } } },
      orderBy: [{ publicationId: 'asc' }, { asOfDate: 'asc' }, { source: 'asc' }],
      select: platformSnapshotFactSelect,
    });
    return rows.map((row) => toPlatformSnapshotFact(row, () => new QualitySnapshotCorruptError(row.publicationId)));
  }

  /** Every version's current score, by row id. */
  async readVersionScores(db: PrismaTransaction = this.prisma): Promise<StoredVersionScore[]> {
    const rows = await db.assetVersion.findMany({
      orderBy: { id: 'asc' },
      select: {
        id: true,
        qualityScore: true,
        qualitySampleSize: true,
        qualityPlatformSampleSize: true,
        asset: { select: { kind: true } },
      },
    });
    return rows.map((row) => ({
      id: row.id,
      kind: row.asset.kind,
      qualityScore: row.qualityScore,
      qualitySampleSize: row.qualitySampleSize,
      qualityPlatformSampleSize: row.qualityPlatformSampleSize,
    }));
  }

  /** Writes the four score columns together, so the null/sample-size trigger always holds. */
  async writeScore(write: VersionScoreWrite, db: PrismaTransaction): Promise<void> {
    await db.assetVersion.update({
      where: { id: write.id },
      data: {
        qualityScore: write.qualityScore,
        qualitySampleSize: write.qualitySampleSize,
        qualityPlatformSampleSize: write.qualityPlatformSampleSize,
        qualityScoredAt: write.qualityScoredAt,
      },
      select: { id: true },
    });
  }

  async readFormulaVersion(db: PrismaTransaction = this.prisma): Promise<string | null> {
    const row = await db.setting.findUnique({ where: { key: QUALITY_FORMULA_VERSION_SETTING_KEY }, select: { value: true } });
    return row === null ? null : row.value;
  }

  async writeFormulaVersion(value: string, db: PrismaTransaction): Promise<void> {
    await db.setting.upsert({
      where: { key: QUALITY_FORMULA_VERSION_SETTING_KEY },
      create: { key: QUALITY_FORMULA_VERSION_SETTING_KEY, value },
      update: { value },
    });
  }
}
