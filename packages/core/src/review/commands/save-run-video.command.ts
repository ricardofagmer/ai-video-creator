import { Command } from '@nestjs/cqrs';
import { type RunId } from '@studio/shared/run-format';

export interface SaveRunVideoInput {
  runId: RunId;
  /** The owner saving it, from the caller's session; becomes the asset owner and provenance author. */
  decidedBy: string;
}

export interface SaveRunVideoResult {
  assetId: string;
  version: number;
  /** The preset version the run used, `recipeId@version`. */
  recipeRef: string;
}

/**
 * Saves a run's finished `final.mp4` as a new `reference` asset (subKind `video`) tagged
 * `preset-video`, with the run as provenance, so the preset page can list the videos it produced.
 */
export class SaveRunVideoCommand extends Command<SaveRunVideoResult> {
  constructor(readonly input: SaveRunVideoInput) {
    super();
  }
}
