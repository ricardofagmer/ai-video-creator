import { Injectable } from '@nestjs/common';
import { type MetricImportOrigin, type Platform } from '@studio/shared/metrics';
import { PrismaService, type PrismaTransaction } from '../prisma';

/** One applied import: hash, size and counts only; no file name, cell or video id (B12). */
export interface NewMetricImport {
  importId: string;
  platform: Platform;
  asOfDate: string;
  fileSha256: string;
  fileBytes: number;
  counts: { rows: number; matched: number; created: number; updated: number; unchanged: number; unmatched: number; issues: number };
  importedBy: string;
  correlationId: string | null;
  importedAt: Date;
  /** `upload` for a CSV upload, `api` for a pulled batch (SPEC 0007 section 4.5, Q3). */
  origin: MetricImportOrigin;
}

/**
 * Data access for `metric_imports` (SPEC 0006 sections 4.5, 5.3). One insert per applied import;
 * no update and no delete. Only the import command handler writes.
 */
@Injectable()
export class MetricImportRepository {
  constructor(private readonly prisma: PrismaService) {}

  /** `duplicateFile`: an earlier import of the same bytes for the same platform and day. */
  async hasSameFile(file: { fileSha256: string; platform: Platform; asOfDate: string }, db: PrismaTransaction = this.prisma): Promise<boolean> {
    const row = await db.metricImport.findFirst({
      where: { fileSha256: file.fileSha256, platform: file.platform, asOfDate: file.asOfDate },
      select: { id: true },
    });
    return row !== null;
  }

  async insert(record: NewMetricImport, db: PrismaTransaction): Promise<void> {
    await db.metricImport.create({
      data: {
        id: record.importId,
        platform: record.platform,
        asOfDate: record.asOfDate,
        fileSha256: record.fileSha256,
        fileBytes: record.fileBytes,
        ...record.counts,
        importedBy: record.importedBy,
        correlationId: record.correlationId,
        importedAt: record.importedAt,
        origin: record.origin,
      },
      select: { id: true },
    });
  }

  /** Section 5.6 step 2: a pulled batch whose bytes were already ingested, whatever its day. */
  async hasFileHash(fileSha256: string, db: PrismaTransaction = this.prisma): Promise<boolean> {
    const row = await db.metricImport.findFirst({ where: { fileSha256 }, select: { id: true } });
    return row !== null;
  }
}
