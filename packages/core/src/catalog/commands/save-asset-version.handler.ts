import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';
import { formatAssetRef, type AssetKind, type AssetVersion } from '@studio/shared/catalog';
import { PrismaService } from '../../prisma/prisma.service';
import { AssetContentService, assertBiometricStorage, type AssetContentInput, type PreparedContent } from '../asset-content';
import { buildDraftVersion, parseAssetId, parseInput, parseMetadata, type AssetVersionMetadata } from '../asset-version.factory';
import { toAssetKind, toAssetVersion, toCreateData } from '../asset-version.mapper';
import { AssetVersionRepository, isUniqueConstraintError } from '../asset-version.repository';
import {
  AssetNotFoundError,
  AssetVersionConflictError,
  AssetVersionNotFoundError,
  BiometricDowngradeError,
} from '../catalog.errors';
import { HyperframesTemplateCheck } from '../hyperframes-template.check';
import { SaveAssetVersionCommand } from './save-asset-version.command';

const VersionNumberSchema = z.number().int().min(1);

@CommandHandler(SaveAssetVersionCommand)
export class SaveAssetVersionHandler implements ICommandHandler<SaveAssetVersionCommand, AssetVersion> {
  private readonly logger = new Logger(SaveAssetVersionHandler.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly versions: AssetVersionRepository,
    private readonly content: AssetContentService,
    private readonly hyperframes: HyperframesTemplateCheck,
  ) {}

  async execute(command: SaveAssetVersionCommand): Promise<AssetVersion> {
    const { input } = command;
    const assetId = parseAssetId(input.assetId);
    const asset = await this.versions.findAsset(assetId);
    if (asset === null) throw new AssetNotFoundError(assetId);
    const kind = toAssetKind(asset);
    const metadata = parseMetadata(input.metadata, kind);
    if (metadata.sensitivity !== 'biometric' && (await this.versions.hasBiometricVersion(assetId))) {
      throw new BiometricDowngradeError(assetId);
    }

    const prepared = await this.prepareContent(assetId, kind, metadata, input.content, input.signal);

    // N+1 is allocated inside the transaction; the (asset_id, version) unique key turns a race
    // into a conflict instead of a second row with the same number. Version N is only read.
    const saved = await this.prisma
      .$transaction(async (transaction) => {
        const latest = await this.versions.findLatestVersion(assetId, transaction);
        const next = (latest?.version ?? 0) + 1;
        const draft = buildDraftVersion({ assetId, kind, version: next, metadata, content: prepared, now: new Date() });
        return this.versions.insertVersion(toCreateData(draft), transaction);
      })
      .catch((error: unknown) => {
        if (isUniqueConstraintError(error)) throw new AssetVersionConflictError(assetId);
        throw error;
      });

    const version = toAssetVersion(saved);
    this.logger.log({
      event: 'catalog.version-saved',
      ref: formatAssetRef({ assetId, version: version.version }),
      contentSource: input.content.source,
      storageMode: version.storage.mode,
      sensitivity: version.sensitivity,
    });
    return version;
  }

  private async prepareContent(
    assetId: string,
    kind: AssetKind,
    metadata: AssetVersionMetadata,
    content: AssetContentInput,
    signal: AbortSignal | undefined,
  ): Promise<PreparedContent> {
    if (content.source !== 'previous-version') {
      await this.hyperframes.assertNewContent(kind, metadata.details, content);
      return this.content.prepare({ kind, sensitivity: metadata.sensitivity, content, signal });
    }
    const version = parseInput(VersionNumberSchema, content.version, 'content.version');
    const row = await this.versions.findVersion(assetId, version);
    if (row === null) throw new AssetVersionNotFoundError(formatAssetRef({ assetId, version }));
    const previous = toAssetVersion(row);
    assertBiometricStorage(metadata.sensitivity, previous.storage.mode);
    await this.hyperframes.assertReusedContent(kind, metadata.details, previous);
    return {
      contentHash: previous.contentHash,
      sizeBytes: previous.sizeBytes,
      mimeType: previous.mimeType,
      layout: previous.layout,
      storage: previous.storage,
    };
  }
}
