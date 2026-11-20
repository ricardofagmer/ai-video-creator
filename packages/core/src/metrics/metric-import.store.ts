import { Injectable } from '@nestjs/common';
import { type MetricSnapshot, type Platform, type PlatformMetrics, type Publication } from '@studio/shared/metrics';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { MetricImportRepository, type NewMetricImport } from './metric-import.repository';
import { MetricSnapshotRepository } from './metric-snapshot.repository';
import { RunPublicationRepository } from './run-publication.repository';

/** One import of up to 5,000 rows holds the SQLite write lock for this long at most. */
const IMPORT_TRANSACTION_TIMEOUT_MS = 30_000;
const IMPORT_TRANSACTION_MAX_WAIT_MS = 10_000;

/** The `duplicateFile` key of SPEC 0006 section 5.3: same bytes, platform and day. */
export interface ImportedFileKey {
  fileSha256: string;
  platform: Platform;
  asOfDate: string;
}

/** One `csv` snapshot upsert, keyed `(publicationId, asOfDate, 'csv')`. */
export interface CsvSnapshotWrite {
  publicationId: string;
  asOfDate: string;
  importId: string;
  metrics: PlatformMetrics;
  recordedAt: Date;
}

/** What planning an import reads, all on one database handle. */
export interface MetricImportReads {
  findPublications(platform: Platform, platformVideoIds: readonly string[]): Promise<Publication[]>;
  findCsvSnapshots(publicationIds: readonly string[], asOfDate: string): Promise<MetricSnapshot[]>;
  hasSameFile(file: ImportedFileKey): Promise<boolean>;
}

/** The reads plus the two writes of an applied import, inside one transaction. */
export interface MetricImportWrites extends MetricImportReads {
  insertImport(record: NewMetricImport): Promise<void>;
  upsertCsvSnapshot(write: CsvSnapshotWrite): Promise<void>;
}

/**
 * The database side of `ImportMetricsHandler` (SPEC 0006 section 5.3). `read` hands out the reads
 * only, so a dry run has no method that writes (R3-AC-08); `transaction` runs the plan and the
 * writes of a real import atomically.
 */
export interface MetricImportStore {
  read<Result>(work: (reads: MetricImportReads) => Promise<Result>): Promise<Result>;
  transaction<Result>(work: (writes: MetricImportWrites) => Promise<Result>): Promise<Result>;
}

/** `MetricImportStore` over Prisma and the three metrics repositories. */
@Injectable()
export class PrismaMetricImportStore implements MetricImportStore {
  constructor(
    private readonly prisma: PrismaService,
    private readonly publications: RunPublicationRepository,
    private readonly snapshots: MetricSnapshotRepository,
    private readonly imports: MetricImportRepository,
  ) {}

  read<Result>(work: (reads: MetricImportReads) => Promise<Result>): Promise<Result> {
    return work(this.readsOn(this.prisma));
  }

  transaction<Result>(work: (writes: MetricImportWrites) => Promise<Result>): Promise<Result> {
    return this.prisma.$transaction((transaction) => work(this.writesOn(transaction)), {
      maxWait: IMPORT_TRANSACTION_MAX_WAIT_MS,
      timeout: IMPORT_TRANSACTION_TIMEOUT_MS,
    });
  }

  private readsOn(db: PrismaTransaction): MetricImportReads {
    return {
      findPublications: (platform, platformVideoIds) => this.publications.findByVideoIds(platform, platformVideoIds, db),
      findCsvSnapshots: (publicationIds, asOfDate) => this.snapshots.findCsvOn(publicationIds, asOfDate, db),
      hasSameFile: (file) => this.imports.hasSameFile(file, db),
    };
  }

  private writesOn(db: PrismaTransaction): MetricImportWrites {
    return {
      ...this.readsOn(db),
      insertImport: (record) => this.imports.insert(record, db),
      upsertCsvSnapshot: async (write) => {
        await this.snapshots.upsert({ ...write, source: 'csv' }, db);
      },
    };
  }
}
