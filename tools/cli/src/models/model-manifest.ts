import { join } from 'node:path';
import { InvalidModelManifestError, isPinnedManifest, readEmbeddingModelManifest } from '@studio/core/embeddings';
import { locateResourceRoot } from '@studio/core/runtime';
import { type EmbeddingModelManifest } from '@studio/shared/catalog';
import { cliText } from '../i18n/messages.js';
import { type CliSettings } from '../settings/cli-settings.js';

/**
 * The committed manifest, the same file core's production adapter reads by default
 * (`<repository>/scripts/models/embedding-model.manifest.json`, SPEC 0003 section 5.2): the CLI
 * runs from the same checkout, so `studioRoot` and core resolve to one file.
 */
export function embeddingManifestFile(settings: CliSettings): string {
  return join(modelResourceRoot(settings), 'scripts', 'models', 'embedding-model.manifest.json');
}

/** The installer's one implementation of the model download (install.sh step 7). */
export function embeddingFetchScriptFile(settings: CliSettings): string {
  return join(modelResourceRoot(settings), 'scripts', 'models', 'fetch-embedding-model.sh');
}

/** The checkout in development; `payload/resources/` when packaged, with the same relative paths. */
export function modelResourceRoot(settings: CliSettings): string {
  return locateResourceRoot(settings.runtime, settings.studioRoot);
}

/**
 * What the CLI can tell about the manifest without the runtime: `unpinned` means provisional
 * values, so nothing is downloaded and the model stays absent (B7); `invalid` carries the reason id.
 */
export type ManifestState =
  | { readonly status: 'pinned'; readonly manifest: EmbeddingModelManifest }
  | { readonly status: 'unpinned'; readonly manifest: EmbeddingModelManifest }
  | { readonly status: 'invalid'; readonly reason: InvalidModelManifestError['reason'] };

export async function readManifestState(settings: CliSettings): Promise<ManifestState> {
  try {
    const manifest = await readEmbeddingModelManifest(embeddingManifestFile(settings));
    return isPinnedManifest(manifest) ? { status: 'pinned', manifest } : { status: 'unpinned', manifest };
  } catch (error) {
    if (error instanceof InvalidModelManifestError) return { status: 'invalid', reason: error.reason };
    throw error;
  }
}

/** One line about the manifest in the active language; no path, no checksum value. */
export function manifestText(state: ManifestState): string {
  const text = cliText().doctor.models;
  switch (state.status) {
    case 'pinned':
      return text.pinned(state.manifest.modelRef, state.manifest.files.length, state.manifest.dimensions);
    case 'unpinned':
      return text.unpinned(state.manifest.modelRef);
    case 'invalid':
      return text.invalid(text.invalidReasons[state.reason]);
  }
}
