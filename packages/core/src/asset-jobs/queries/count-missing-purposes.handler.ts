import { Logger } from '@nestjs/common';
import { QueryHandler, type IQueryHandler } from '@nestjs/cqrs';
import { formatAssetRef, type AssetRef } from '@studio/shared/catalog';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetJobStore } from '../asset-job-store';
import { AssetJobFileCorruptError } from '../asset-jobs.errors';
import { isOpenAssetPurposeJob } from '../asset-purpose-request';
import { CountMissingPurposesQuery, type MissingPurposes } from './count-missing-purposes.query';

interface CandidateRow {
  assetId: string;
  version: number;
  status: string;
}

/**
 * Each asset's latest version and its active version, read from SQLite with three columns only
 * (never the vector or any text). A row is either one or both, so every candidate appears once.
 */
function latestOrActive(rows: readonly CandidateRow[], latestByAsset: ReadonlyMap<string, number>): CandidateRow[] {
  return rows.filter((row) => row.status === 'active' || latestByAsset.get(row.assetId) === row.version);
}

/**
 * AP-12: candidates come from the catalog rows (`purposeSource: none`), then each one's job file
 * decides: no job, or a `failed` / `refused` one, counts. An open job does not, and neither does a
 * `done` one: its text is copied into the row on the next read, so a second model call would be
 * wasted (owner, 2026-11-25). A corrupt job file is left out and logged by ref, since a request for
 * it would fail the same way.
 */
@QueryHandler(CountMissingPurposesQuery)
export class CountMissingPurposesHandler implements IQueryHandler<CountMissingPurposesQuery, MissingPurposes> {
  private readonly logger = new Logger(CountMissingPurposesHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly store: AssetJobStore,
  ) {}

  async execute(): Promise<MissingPurposes> {
    const [latest, rows] = await Promise.all([
      this.prisma.assetVersion.groupBy({ by: ['assetId'], _max: { version: true } }),
      this.prisma.assetVersion.findMany({
        where: { purposeSource: 'none' },
        select: { assetId: true, version: true, status: true },
        orderBy: [{ assetId: 'asc' }, { version: 'asc' }],
      }),
    ]);
    const latestByAsset = new Map<string, number>();
    for (const group of latest) {
      if (group._max.version !== null) latestByAsset.set(group.assetId, group._max.version);
    }
    const refs: AssetRef[] = [];
    for (const row of latestOrActive(rows, latestByAsset)) {
      const ref = formatAssetRef({ assetId: row.assetId, version: row.version });
      if (await this.waitsForPurpose(ref)) refs.push(ref);
    }
    return { refs };
  }

  private async waitsForPurpose(ref: AssetRef): Promise<boolean> {
    try {
      const lookup = await this.store.read('asset-purpose', ref);
      if (lookup.status === 'none') return true;
      return lookup.job.status !== 'done' && !isOpenAssetPurposeJob(lookup.job);
    } catch (error) {
      if (!(error instanceof AssetJobFileCorruptError)) throw error;
      this.logger.warn({ event: 'asset-purpose.backfill-skipped', ref, errorName: error.name });
      return false;
    }
  }
}
