import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { formatAssetRef, type AssetVersion } from '@studio/shared/catalog';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetContentService } from '../asset-content';
import { buildDraftVersion, parseAssetId, parseAssetKind, parseMetadata } from '../asset-version.factory';
import { toAssetVersion, toCreateData } from '../asset-version.mapper';
import { AssetVersionRepository, isUniqueConstraintError } from '../asset-version.repository';
import { AssetAlreadyExistsError } from '../catalog.errors';
import { CreateAssetCommand } from './create-asset.command';

@CommandHandler(CreateAssetCommand)
export class CreateAssetHandler implements ICommandHandler<CreateAssetCommand, AssetVersion> {
  private readonly logger = new Logger(CreateAssetHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: AssetVersionRepository,
    private readonly content: AssetContentService,
  ) {}

  async execute(command: CreateAssetCommand): Promise<AssetVersion> {
    const { input } = command;
    const assetId = parseAssetId(input.assetId);
    const kind = parseAssetKind(input.kind);
    const metadata = parseMetadata(input.metadata, kind);
    // Checked before bytes are written, so a duplicate id leaves no orphan blob in the common case.
    if ((await this.versions.findAsset(assetId)) !== null) throw new AssetAlreadyExistsError(assetId);

    const prepared = await this.content.prepare({
      kind,
      sensitivity: metadata.sensitivity,
      content: input.content,
      signal: input.signal,
    });
    const draft = buildDraftVersion({ assetId, kind, version: 1, metadata, content: prepared, now: new Date() });

    const saved = await this.prisma
      .$transaction(async (transaction) => {
        await this.versions.createAsset({ id: assetId, kind }, transaction);
        return this.versions.insertVersion(toCreateData(draft), transaction);
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) throw new AssetAlreadyExistsError(assetId);
        throw error;
      });

    const version = toAssetVersion(saved);
    this.logger.log({
      event: 'catalog.asset-created',
      ref: formatAssetRef({ assetId, version: version.version }),
      kind,
      storageMode: version.storage.mode,
      sensitivity: version.sensitivity,
    });
    return version;
  }
}
