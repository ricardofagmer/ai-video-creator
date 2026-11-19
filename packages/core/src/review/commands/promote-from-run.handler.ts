import { Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';
import { AssetIdSchema, formatAssetRef, type AssetVersion, type Provenance } from '@studio/shared/catalog';
import { RelativePathSchema, RunIdSchema, type RunStatus } from '@studio/shared/run-format';
import { hashFile } from '../../asset-store';
import {
  GetAssetVersionQuery,
  ListAssetVersionsQuery,
  MAX_STORED_BYTES_BY_KIND,
  SaveAssetVersionCommand,
  type AssetVersionMetadataInput,
} from '../../catalog';
import { BiometricRunGuard } from '../biometric-guard';
import { parseReviewInput } from '../review-input';
import { ReviewRunAccess } from '../review-run-access';
import { ArtifactChangedError, PromoteBiometricRefusedError, ReviewNotAllowedError } from '../review.errors';
import { mimeTypeOfArtifact, resolveRecordedArtifact, type RecordedArtifact } from '../run-artifact';
import { PromoteFromRunCommand, type PromoteFromRunResult } from './promote-from-run.command';

const PromoteFromRunInputSchema = z
  .object({
    runId: RunIdSchema,
    artifactPath: RelativePathSchema,
    assetId: AssetIdSchema,
    decidedBy: z.string().trim().min(1).max(100),
  })
  .strict();

/** Outputs are final once the run reached the review gate; earlier statuses may still rewrite them. */
const promotableStatuses: readonly RunStatus[] = ['review', 'approved', 'rejected'];

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
    private readonly runs: ReviewRunAccess,
    private readonly biometricGuard: BiometricRunGuard,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: PromoteFromRunCommand): Promise<PromoteFromRunResult> {
    const input = parseReviewInput(PromoteFromRunInputSchema, command.input, '');
    const loaded = await this.runs.load(input.runId);
    await this.runs.assertNoLiveWatcher(loaded);
    if (!promotableStatuses.includes(loaded.run.state.status)) {
      throw new ReviewNotAllowedError(input.runId, loaded.run.state.status, 'status');
    }
    // Before any output is resolved or hashed: a run that used biometric material promotes nothing.
    await this.biometricGuard.assertNoBiometricInputs(loaded);

    const latest = await this.latestVersion(input.assetId);
    if (latest.sensitivity === 'biometric') {
      throw new PromoteBiometricRefusedError({ kind: 'target-asset', assetId: input.assetId });
    }
    const mimeType = mimeTypeOfArtifact(input.artifactPath);
    const artifact = await resolveRecordedArtifact(loaded, input.artifactPath);
    await this.assertUnchanged(input.runId, input.artifactPath, artifact, MAX_STORED_BYTES_BY_KIND[latest.kind]);

    const provenance: Provenance = {
      source: { type: 'run', runId: input.runId },
      author: input.decidedBy,
      capturedAt: artifact.recordedAt,
    };
    const saved = await this.commandBus.execute(
      new SaveAssetVersionCommand({
        assetId: input.assetId,
        metadata: promotedMetadata(latest, provenance),
        content: { source: 'import-file', absolutePath: artifact.absolutePath, mimeType },
      }),
    );
    const savedRef = formatAssetRef({ assetId: input.assetId, version: saved.version });
    // The store hashed the bytes it copied; a mismatch means the file changed after the check above.
    if (saved.contentHash !== artifact.contentHash) throw new ArtifactChangedError(input.runId, input.artifactPath, savedRef);
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

  private async assertUnchanged(runId: string, artifactPath: string, artifact: RecordedArtifact, maxBytes: number): Promise<void> {
    const hashed = await hashFile(artifact.absolutePath, { maxBytes });
    if (hashed.contentHash !== artifact.contentHash) throw new ArtifactChangedError(runId, artifactPath, null);
  }
}
