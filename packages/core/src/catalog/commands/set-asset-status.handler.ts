import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AssetRefSchema, AssetStatusSchema, parseAssetRef } from '@studio/shared/catalog';
import { PrismaService } from '../../prisma/prisma.service';
import { parseInput } from '../asset-version.factory';
import { toAssetVersion } from '../asset-version.mapper';
import { AssetVersionRepository } from '../asset-version.repository';
import { assertStatusTransition } from '../catalog-policy';
import { AssetVersionNotFoundError } from '../catalog.errors';
import { SetAssetStatusCommand, type SetAssetStatusResult } from './set-asset-status.command';
import { PromotionApprovalRequiredError } from './set-asset-status.errors';

@CommandHandler(SetAssetStatusCommand)
export class SetAssetStatusHandler implements ICommandHandler<SetAssetStatusCommand, SetAssetStatusResult> {
  private readonly logger = new Logger(SetAssetStatusHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: AssetVersionRepository,
  ) {}

  async execute(command: SetAssetStatusCommand): Promise<SetAssetStatusResult> {
    const ref = parseInput(AssetRefSchema, command.input.ref, 'ref');
    const status = parseInput(AssetStatusSchema, command.input.status, 'status');
    // Criterion 35 (R2-AC-18): refused before any read, so nothing is written and the row keeps its
    // status. Activation is the promotion module's alone; the database trigger refuses it as well.
    if (status === 'active') {
      this.logger.warn({ event: 'promotion.refused', ref, reason: 'promotion-approval-required' });
      throw new PromotionApprovalRequiredError(ref);
    }
    const { assetId, version } = parseAssetRef(ref);

    const result = await this.prisma.$transaction(async (transaction): Promise<SetAssetStatusResult> => {
      const row = await this.versions.findVersion(assetId, version, transaction);
      if (row === null) throw new AssetVersionNotFoundError(ref);
      const current = toAssetVersion(row);
      if (current.status === status) return { version: current, replaced: null };
      assertStatusTransition(ref, current.status, status);
      const updated = await this.versions.updateStatus(row.id, status, transaction);
      return { version: toAssetVersion(updated), replaced: null };
    });

    this.logger.log({ event: 'catalog.status-changed', ref, status: result.version.status, replacedRef: null });
    return result;
  }
}
