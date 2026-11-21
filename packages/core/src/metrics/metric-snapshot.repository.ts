import { Injectable } from '@nestjs/common';
import { metricsBounds, type MetricImportOrigin, type MetricSnapshot, type Platform, type PlatformMetrics } from '@studio/shared/metrics';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { type PlatformSnapshotFact } from '../quality';
import { platformSnapshotFactSelect, toMetricColumns, toPlatformSnapshotFact } from './metric-columns.mapper';
import { MetricsRowCorruptError } from './metrics.errors';
import { snapshotSelect, toMetricImportOrigin, toMetricSnapshot } from './metrics.mapper';

/** Publication ids per `IN (...)` query; well under SQLite's bound-parameter limit. */
const PUBLICATION_IDS_PER_QUERY = 500;

/** One snapshot write; `importId` is set exactly for `csv` (the table's CHECK). */
export type SnapshotWrite = {
  publicationId: string;
  asOfDate: string;
  metrics: PlatformMetrics;
  recordedAt: Date;
} & ({ source: 'form'; importId: null } | { source: 'csv'; importId: string });

function chunks<Item>(items: readonly Item[], size: number): Item[][] {
  const result: Item[][] = [];
  for (let start = 0; start < items.length; start += size) result.push(items.slice(start, start + size));
  return result;
}

/**
 * Data access for `platform_metric_snapshots` (SPEC 0006 sections 4.5, 5.2, 5.3). The key is
 * `(publication, asOfDate, source)`, so a write is an upsert of its own row: a repeated import or
 * form save replaces, never duplicates. There is no delete. Only the metrics command handlers write.
 */
@Injectable()
export class MetricSnapshotRepository {
  constructor(private readonly prisma: PrismaService) {}

  async countByPublication(publicationId: string, db: PrismaTransaction = this.prisma): Promise<number> {
    return db.platformMetricSnapshot.count({ where: { publicationId } });
  }

  async exists(key: { publicationId: string; asOfDate: string; source: 'form' | 'csv' }, db: PrismaTransaction = this.prisma): Promise<boolean> {
    const row = await db.platformMetricSnapshot.findUnique({
      where: { publicationId_asOfDate_source: key },
      select: { publicationId: true },
    });
    return row !== null;
  }

  async upsert(write: SnapshotWrite, db: PrismaTransaction): Promise<MetricSnapshot> {
    const columns = { ...toMetricColumns(write.metrics), importId: write.importId, recordedAt: write.recordedAt };
    const row = await db.platformMetricSnapshot.upsert({
      where: { publicationId_asOfDate_source: { publicationId: write.publicationId, asOfDate: write.asOfDate, source: write.source } },
      create: { publicationId: write.publicationId, asOfDate: write.asOfDate, source: write.source, ...columns },
      update: columns,
      select: snapshotSelect,
    });
    return toMetricSnapshot(row);
  }

  /** Every snapshot of the given publications, newest `asOfDate` first (a run page holds at most 5). */
  async listByPublications(publicationIds: readonly string[], db: PrismaTransaction = this.prisma): Promise<MetricSnapshot[]> {
    if (publicationIds.length === 0) return [];
    const rows = await db.platformMetricSnapshot.findMany({
      where: { publicationId: { in: [...publicationIds] } },
      orderBy: [{ asOfDate: 'desc' }, { source: 'desc' }, { publicationId: 'asc' }],
      take: publicationIds.length * metricsBounds.maxSnapshotsPerPublication,
      select: snapshotSelect,
    });
    return rows.map(toMetricSnapshot);
  }

  /** The stored origin of each import that wrote one of `snapshots`, by import id (SPEC 0007 section 5.6). */
  async importOrigins(snapshots: readonly MetricSnapshot[], db: PrismaTransaction = this.prisma): Promise<Map<string, MetricImportOrigin>> {
    const importIds = [...new Set(snapshots.flatMap((snapshot) => (snapshot.importId === null ? [] : [snapshot.importId])))];
    const origins = new Map<string, MetricImportOrigin>();
    for (const part of chunks(importIds, PUBLICATION_IDS_PER_QUERY)) {
      const rows = await db.metricImport.findMany({ where: { id: { in: part } }, select: { id: true, origin: true } });
      for (const row of rows) origins.set(row.id, toMetricImportOrigin(row));
    }
    return origins;
  }

  /** The `csv` snapshots of these publications on `asOfDate`: what an import would replace. */
  async findCsvOn(publicationIds: readonly string[], asOfDate: string, db: PrismaTransaction = this.prisma): Promise<MetricSnapshot[]> {
    const snapshots: MetricSnapshot[] = [];
    for (const part of chunks(publicationIds, PUBLICATION_IDS_PER_QUERY)) {
      const rows = await db.platformMetricSnapshot.findMany({
        where: { publicationId: { in: part }, asOfDate, source: 'csv' },
        orderBy: { publicationId: 'asc' },
        select: snapshotSelect,
      });
      snapshots.push(...rows.map(toMetricSnapshot));
    }
    return snapshots;
  }

  /**
   * Every snapshot of the publications on these platforms, as platform-term facts, for the
   * "baseline ready" flag of the run page. Unpaginated for the reason the quality pass is: the
   * baseline is a median over all of the owner's videos on a platform.
   */
  async readPlatformFacts(platforms: readonly Platform[], db: PrismaTransaction = this.prisma): Promise<PlatformSnapshotFact[]> {
    if (platforms.length === 0) return [];
    const rows = await db.platformMetricSnapshot.findMany({
      // SPEC 0007 B6: simulated publications never count towards a baseline, as in the quality pass.
      where: { publication: { platform: { in: [...platforms] }, origin: { not: 'mock' } } },
      orderBy: [{ publicationId: 'asc' }, { asOfDate: 'asc' }, { source: 'asc' }],
      select: platformSnapshotFactSelect,
    });
    return rows.map((row) =>
      toPlatformSnapshotFact(row, () => new MetricsRowCorruptError('platform_metric_snapshots', `${row.publicationId}/${row.asOfDate}/${row.source}`)),
    );
  }
}
