import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { AssetRefSchema, AssetStatusSchema, parseAssetRef } from '@studio/shared/catalog';
import { removeDeprecatedVoiceSamples } from '../../asset-jobs/voice-sample-clips';
import { DataHome } from '../../paths/data-home';
import { PrismaService } from '../../prisma/prisma.service';
import { parseInput } from '../asset-version.factory';
import { toAssetVersion } from '../asset-version.mapper';
import { AssetVersionRepository } from '../asset-version.repository';
import { assertStatusTransition } from '../catalog-policy';
import { AssetVersionNotFoundError } from '../catalog.errors';
import { SetAssetStatusCommand, type SetAssetStatusResult } from './set-asset-status.command';
import { PromotionApprovalRequiredError } from './set-asset-status.errors';

interface StatusChange {
  result: SetAssetStatusResult;
  changed: boolean;
}

@CommandHandler(SetAssetStatusCommand)
export class SetAssetStatusHandler implements ICommandHandler<SetAssetStatusCommand, SetAssetStatusResult> {
  private readonly logger = new Logger(SetAssetStatusHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: AssetVersionRepository,
    private readonly dataHome: DataHome,
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

    const { result, changed } = await this.prisma.$transaction(async (transaction): Promise<StatusChange> => {
      const row = await this.versions.findVersion(assetId, version, transaction);
      if (row === null) throw new AssetVersionNotFoundError(ref);
      const current = toAssetVersion(row);
      if (current.status === status) return { result: { version: current, replaced: null }, changed: false };
      assertStatusTransition(ref, current.status, status);
      const updated = await this.versions.updateStatus(row.id, status, transaction);
      return { result: { version: toAssetVersion(updated), replaced: null }, changed: true };
    });

    this.logger.log({ event: 'catalog.status-changed', ref, status: result.version.status, replacedRef: null });
    // Guided-creation design section 2: a deprecated voice keeps no sample clip. After the commit,
    // best effort: it never throws, so the status change is reported exactly as before.
    if (changed && result.version.kind === 'ai-model' && result.version.status === 'deprecated') {
      await removeDeprecatedVoiceSamples(this.dataHome, ref);
    }
    return result;
  }
}
