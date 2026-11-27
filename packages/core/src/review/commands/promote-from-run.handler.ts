import { Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';
import { AssetIdSchema, formatAssetRef, type AssetVersion, type Provenance } from '@studio/shared/catalog';
import { RelativePathSchema, RunIdSchema } from '@studio/shared/run-format';
import {
  GetAssetVersionQuery,
  ListAssetVersionsQuery,
  MAX_STORED_BYTES_BY_KIND,
  SaveAssetVersionCommand,
  type AssetVersionMetadataInput,
} from '../../catalog';
import { parseReviewInput } from '../review-input';
import { PromoteBiometricRefusedError } from '../review.errors';
import { RunArtifactSaver } from '../run-artifact-saver';
import { PromoteFromRunCommand, type PromoteFromRunResult } from './promote-from-run.command';

const PromoteFromRunInputSchema = z
  .object({
    runId: RunIdSchema,
    artifactPath: RelativePathSchema,
    assetId: AssetIdSchema,
    decidedBy: z.string().trim().min(1).max(100),
  })
  .strict();

/** The new version keeps the asset's current metadata; only the bytes and the provenance change. */
function promotedMetadata(latest: AssetVersion, provenance: Provenance): AssetVersionMetadataInput {
  return {
    name: latest.name,
    summary: latest.summary,
    tags: latest.tags,
    owner: latest.owner,
    provenance,
    license: latest.license,
    sensitivity: latest.sensitivity,
    notes: latest.notes,
    details: latest.details,
  };
}

@CommandHandler(PromoteFromRunCommand)
export class PromoteFromRunHandler implements ICommandHandler<PromoteFromRunCommand, PromoteFromRunResult> {
  private readonly logger = new Logger(PromoteFromRunHandler.name);

  constructor(
    private readonly saver: RunArtifactSaver,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: PromoteFromRunCommand): Promise<PromoteFromRunResult> {
    const input = parseReviewInput(PromoteFromRunInputSchema, command.input, '');
    const loaded = await this.saver.loadSavableRun(input.runId);

    const latest = await this.latestVersion(input.assetId);
    if (latest.sensitivity === 'biometric') {
      throw new PromoteBiometricRefusedError({ kind: 'target-asset', assetId: input.assetId });
    }
    const checked = await this.saver.checkedArtifact(loaded, input.artifactPath, MAX_STORED_BYTES_BY_KIND[latest.kind]);

    const provenance = this.saver.provenanceOf(loaded, checked, input.decidedBy);
    const saved = await this.commandBus.execute(
      new SaveAssetVersionCommand({
        assetId: input.assetId,
        metadata: promotedMetadata(latest, provenance),
        content: { source: 'import-file', absolutePath: checked.artifact.absolutePath, mimeType: checked.mimeType },
      }),
    );
    const savedRef = formatAssetRef({ assetId: input.assetId, version: saved.version });
    this.saver.assertStoredUnchanged(loaded, checked, { contentHash: saved.contentHash, savedRef });
    this.logger.log({ event: 'review.promoted-from-run', runId: input.runId, ref: savedRef, kind: latest.kind });
    return { assetId: input.assetId, version: saved.version };
  }

  /**
   * Versions are numbered 1..N without gaps (N+1 allocated in a transaction, rows never deleted),
   * so the page total is the latest version number.
   */
  private async latestVersion(assetId: string): Promise<AssetVersion> {
    const page = await this.queryBus.execute(new ListAssetVersionsQuery(assetId, { limit: 1 }));
    return this.queryBus.execute(new GetAssetVersionQuery(formatAssetRef({ assetId, version: page.total })));
  }
}
