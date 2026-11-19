import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';
import { parseAssetRef } from '@studio/shared/catalog';
import { PrismaService, type PrismaTransaction } from '../prisma';
import { type RunIndexData } from '../runs/run-index.mapper';
import { OutcomeAssetNotFoundError } from './outcomes.errors';
import { type UsedAssetVersion } from './run-evidence';

export interface RunOutcomeWrite {
  /** The run index row mirrored from the decided run.json, so SQLite carries the same status. */
  index: RunIndexData;
  row: Prisma.RunOutcomeUncheckedCreateInput;
  assets: readonly UsedAssetVersion[];
}

export interface RecordedOutcome {
  /** `existing`: a previous call already wrote this run's outcome row; it is kept as it was. */
  outcome: 'created' | 'existing';
  /** Asset versions whose `usageCount` this call incremented; 0 on every repeat for the run. */
  assetVersionsCounted: number;
}

/** Data access for `run_outcomes` and `run_outcome_assets` plus the `usageCount` increment (R1-17). */
@Injectable()
export class RunOutcomeRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * One transaction: index row, outcome row, usage links and increments commit together or not at
   * all. The `(run_id, asset_version_id)` key makes the increment idempotent per run: a version is
   * counted only in the call that inserts its link row.
   */
  async record(write: RunOutcomeWrite): Promise<RecordedOutcome> {
    return this.prisma.$transaction(async (transaction): Promise<RecordedOutcome> => {
      await transaction.runIndexEntry.upsert({ where: { id: write.index.id }, create: write.index, update: write.index });
      const existing = await transaction.runOutcome.findUnique({ where: { runId: write.row.runId }, select: { runId: true } });
      if (existing === null) await transaction.runOutcome.create({ data: write.row });
      let counted = 0;
      for (const asset of write.assets) {
        if (await this.linkOnce(transaction, write.row.runId, asset)) counted += 1;
      }
      return { outcome: existing === null ? 'created' : 'existing', assetVersionsCounted: counted };
    });
  }

  private async linkOnce(transaction: PrismaTransaction, runId: string, asset: UsedAssetVersion): Promise<boolean> {
    const { assetId, version } = parseAssetRef(asset.ref);
    const assetVersion = await transaction.assetVersion.findUnique({
      where: { assetId_version: { assetId, version } },
      select: { id: true },
    });
    if (assetVersion === null) throw new OutcomeAssetNotFoundError(runId, asset.ref);
    const key = { runId, assetVersionId: assetVersion.id };
    const link = await transaction.runOutcomeAsset.findUnique({ where: { runId_assetVersionId: key }, select: { runId: true } });
    if (link !== null) return false;
    await transaction.runOutcomeAsset.create({ data: { ...key, contentHash: asset.contentHash } });
    await transaction.assetVersion.update({ where: { id: assetVersion.id }, data: { usageCount: { increment: 1 } } });
    return true;
  }
}
