import { Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';
import { PRESET_VIDEO_TAG, RUN_FINAL_VIDEO_PATH } from '@studio/shared/api';
import { formatAssetRef, type Provenance } from '@studio/shared/catalog';
import { RunIdSchema, type RunStatus } from '@studio/shared/run-format';
import { hashFile } from '../../asset-store';
import { AssetAlreadyExistsError, CreateAssetCommand, ListAssetVersionsQuery, MAX_STORED_BYTES_BY_KIND } from '../../catalog';
import { BiometricRunGuard } from '../biometric-guard';
import { parseReviewInput } from '../review-input';
import { ReviewRunAccess, type LoadedRun } from '../review-run-access';
import { ArtifactChangedError, ReviewNotAllowedError } from '../review.errors';
import { mimeTypeOfArtifact, resolveRecordedArtifact } from '../run-artifact';
import { SaveRunVideoCommand, type SaveRunVideoResult } from './save-run-video.command';

const SaveRunVideoInputSchema = z
  .object({
    runId: RunIdSchema,
    decidedBy: z.string().trim().min(1).max(100),
  })
  .strict();

/** The video is final once the run reached the review gate; earlier statuses may still rewrite it. */
const savableStatuses: readonly RunStatus[] = ['review', 'approved', 'rejected'];

const NAME_MAX = 200;

/** One asset per run, so saving twice returns the asset already saved instead of a duplicate. */
function videoAssetIdOf(runId: string): string {
  return `video-${runId.toLowerCase()}`;
}

function videoNameOf(loaded: LoadedRun): string {
  return `${loaded.run.recipe.definition.name} · ${loaded.run.createdAt.slice(0, 10)}`.slice(0, NAME_MAX);
}

@CommandHandler(SaveRunVideoCommand)
export class SaveRunVideoHandler implements ICommandHandler<SaveRunVideoCommand, SaveRunVideoResult> {
  private readonly logger = new Logger(SaveRunVideoHandler.name);

  constructor(
    private readonly runs: ReviewRunAccess,
    private readonly biometricGuard: BiometricRunGuard,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: SaveRunVideoCommand): Promise<SaveRunVideoResult> {
    const input = parseReviewInput(SaveRunVideoInputSchema, command.input, '');
    const loaded = await this.runs.load(input.runId);
    await this.runs.assertNoLiveWatcher(loaded);
    if (!savableStatuses.includes(loaded.run.state.status)) {
      throw new ReviewNotAllowedError(input.runId, loaded.run.state.status, 'status');
    }
    // Before the video is resolved or hashed: a run that used biometric material saves nothing.
    await this.biometricGuard.assertNoBiometricInputs(loaded);

    const assetId = videoAssetIdOf(input.runId);
    const recipeRef = loaded.run.recipe.ref;
    const mimeType = mimeTypeOfArtifact(RUN_FINAL_VIDEO_PATH);
    const artifact = await resolveRecordedArtifact(loaded, RUN_FINAL_VIDEO_PATH);
    const hashed = await hashFile(artifact.absolutePath, { maxBytes: MAX_STORED_BYTES_BY_KIND.reference });
    if (hashed.contentHash !== artifact.contentHash) throw new ArtifactChangedError(input.runId, RUN_FINAL_VIDEO_PATH, null);

    const provenance: Provenance = {
      source: { type: 'run', runId: input.runId },
      author: input.decidedBy,
      capturedAt: artifact.recordedAt,
    };
    try {
      const saved = await this.commandBus.execute(
        new CreateAssetCommand({
          assetId,
          kind: 'reference',
          metadata: {
            name: videoNameOf(loaded),
            summary: `Video made by preset ${recipeRef}`.slice(0, NAME_MAX),
            tags: [PRESET_VIDEO_TAG],
            owner: input.decidedBy,
            provenance,
            sensitivity: 'normal',
            details: { subKind: 'video', referenceNotes: `Final video of run ${input.runId}, made with preset ${recipeRef}.` },
          },
          content: { source: 'import-file', absolutePath: artifact.absolutePath, mimeType },
        }),
      );
      const savedRef = formatAssetRef({ assetId, version: saved.version });
      // The store hashed the bytes it copied; a mismatch means the file changed after the check above.
      if (saved.contentHash !== artifact.contentHash) throw new ArtifactChangedError(input.runId, RUN_FINAL_VIDEO_PATH, savedRef);
      this.logger.log({ event: 'review.run-video-saved', runId: input.runId, ref: savedRef, recipeRef });
      return { assetId, version: saved.version, recipeRef };
    } catch (error) {
      if (!(error instanceof AssetAlreadyExistsError)) throw error;
      const page = await this.queryBus.execute(new ListAssetVersionsQuery(assetId, { limit: 1 }));
      return { assetId, version: page.total, recipeRef };
    }
  }
}
