import { Logger } from '@nestjs/common';
import { CommandBus, CommandHandler, QueryBus, type ICommandHandler } from '@nestjs/cqrs';
import { z } from 'zod';
import { PRESET_VIDEO_TAG, RUN_FINAL_VIDEO_PATH } from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { RunIdSchema } from '@studio/shared/run-format';
import { AssetAlreadyExistsError, CreateAssetCommand, ListAssetVersionsQuery, MAX_STORED_BYTES_BY_KIND } from '../../catalog';
import { parseReviewInput } from '../review-input';
import { type LoadedRun } from '../review-run-access';
import { RunArtifactSaver } from '../run-artifact-saver';
import { SaveRunVideoCommand, type SaveRunVideoResult } from './save-run-video.command';

const SaveRunVideoInputSchema = z
  .object({
    runId: RunIdSchema,
    decidedBy: z.string().trim().min(1).max(100),
  })
  .strict();

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
    private readonly saver: RunArtifactSaver,
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  async execute(command: SaveRunVideoCommand): Promise<SaveRunVideoResult> {
    const input = parseReviewInput(SaveRunVideoInputSchema, command.input, '');
    const loaded = await this.saver.loadSavableRun(input.runId);

    const assetId = videoAssetIdOf(input.runId);
    const recipeRef = loaded.run.recipe.ref;
    const checked = await this.saver.checkedArtifact(loaded, RUN_FINAL_VIDEO_PATH, MAX_STORED_BYTES_BY_KIND.reference);

    const provenance = this.saver.provenanceOf(loaded, checked, input.decidedBy);
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
          content: { source: 'import-file', absolutePath: checked.artifact.absolutePath, mimeType: checked.mimeType },
        }),
      );
      const savedRef = formatAssetRef({ assetId, version: saved.version });
      this.saver.assertStoredUnchanged(loaded, checked, { contentHash: saved.contentHash, savedRef });
      this.logger.log({ event: 'review.run-video-saved', runId: input.runId, ref: savedRef, recipeRef });
      return { assetId, version: saved.version, recipeRef };
    } catch (error) {
      if (!(error instanceof AssetAlreadyExistsError)) throw error;
      const page = await this.queryBus.execute(new ListAssetVersionsQuery(assetId, { limit: 1 }));
      return { assetId, version: page.total, recipeRef };
    }
  }
}
