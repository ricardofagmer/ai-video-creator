import { Injectable } from '@nestjs/common';
import { type ParsedAssetRef } from '@studio/shared/catalog';
import { PrismaService } from '../prisma';

/** Statuses a run has once it reached `review` (C3 `RunStatus`). */
const REVIEWED_STATUSES = ['review', 'approved', 'rejected'];

/** Ids per `IN (...)` or `OR` query; well under SQLite's bound-parameter limit. */
const KEYS_PER_QUERY = 200;

export interface ReviewedRunRow {
  runId: string;
  recipeId: string;
  createdAt: Date;
  costUsd: number;
}

export interface OutcomeRow {
  runId: string;
  decision: string;
  rating: number;
  decidedAt: Date;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let start = 0; start < items.length; start += size) chunks.push(items.slice(start, start + size));
  return chunks;
}

export function assetVersionKey(version: ParsedAssetRef): string {
  return `${version.assetId}@${version.version}`;
}

/**
 * The SQLite reads behind `GetStudioInsightsQuery`: the run index, outcomes, asset version
 * creation times and publications. Read-only; every query is parameterized by Prisma.
 */
@Injectable()
export class InsightsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** Runs that reached review, newest first; asks for `limit` rows. */
  async reviewedRuns(limit: number): Promise<ReviewedRunRow[]> {
    const rows = await this.prisma.runIndexEntry.findMany({
      where: { status: { in: REVIEWED_STATUSES } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      select: { id: true, recipeId: true, createdAt: true, costUsd: true },
    });
    return rows.map((row) => ({ runId: row.id, recipeId: row.recipeId, createdAt: row.createdAt, costUsd: row.costUsd }));
  }

  async outcomes(runIds: readonly string[]): Promise<OutcomeRow[]> {
    const rows: OutcomeRow[] = [];
    for (const ids of chunk(runIds, KEYS_PER_QUERY)) {
      rows.push(
        ...(await this.prisma.runOutcome.findMany({
          where: { runId: { in: ids } },
          select: { runId: true, decision: true, rating: true, decidedAt: true },
        })),
      );
    }
    return rows;
  }

  /** Creation time of each asset version that exists, keyed by `assetId@version`. */
  async versionCreatedAt(versions: readonly ParsedAssetRef[]): Promise<Map<string, Date>> {
    const createdAt = new Map<string, Date>();
    for (const keys of chunk(versions, KEYS_PER_QUERY)) {
      const rows = await this.prisma.assetVersion.findMany({
        where: { OR: keys.map((key) => ({ assetId: key.assetId, version: key.version })) },
        select: { assetId: true, version: true, createdAt: true },
      });
      for (const row of rows) createdAt.set(assetVersionKey(row), row.createdAt);
    }
    return createdAt;
  }

  /** Publications whose run has no `approved` outcome; the handler rule keeps this at 0. */
  async unapprovedPublicationCount(): Promise<number> {
    return this.prisma.runPublication.count({ where: { outcome: { decision: { not: 'approved' } } } });
  }
}
