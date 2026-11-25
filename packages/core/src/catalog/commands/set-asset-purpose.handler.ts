import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { SetAssetPurposeRequestSchema } from '@studio/shared/api';
import { AssetIdSchema, formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { z } from 'zod';
import { parseInput } from '../asset-version.factory';
import { toAssetVersion } from '../asset-version.mapper';
import { AssetVersionRepository } from '../asset-version.repository';
import { AssetVersionNotFoundError } from '../catalog.errors';
import { SetAssetPurposeCommand } from './set-asset-purpose.command';

/** The command input as core trusts it: the api's C-P4 body rule plus the version key. */
const SetAssetPurposeInputSchema = z
  .object({
    assetId: AssetIdSchema,
    version: z.number().int().min(1),
    purpose: SetAssetPurposeRequestSchema.shape.purpose,
  })
  .strict();

/**
 * ADR 0012 decision 7 (C-P4, AP-03, AP-10): the owner's purpose text replaces the current one with
 * `purposeSource: owner`. The input is validated again here, since the CLI reaches the bus without
 * the api's pipe. An unknown version is the catalog's 404. Logs carry the ref and the outcome,
 * never the text.
 */
@CommandHandler(SetAssetPurposeCommand)
export class SetAssetPurposeHandler implements ICommandHandler<SetAssetPurposeCommand, AssetVersion> {
  private readonly logger = new Logger(SetAssetPurposeHandler.name);

  constructor(private readonly versions: AssetVersionRepository) {}

  async execute(command: SetAssetPurposeCommand): Promise<AssetVersion> {
    const input = parseInput(SetAssetPurposeInputSchema, command.input, '');
    const ref = formatAssetRef({ assetId: input.assetId, version: input.version });
    const row = await this.versions.setOwnerPurpose({ assetId: input.assetId, version: input.version, purpose: input.purpose });
    if (row === null) throw new AssetVersionNotFoundError(ref);
    this.logger.log({ event: 'asset-purpose.owner-set', ref, outcome: 'owner-written' });
    return toAssetVersion(row);
  }
}
