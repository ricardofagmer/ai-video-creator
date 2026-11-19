import { join } from 'node:path';
import { InvalidModelManifestError, isPinnedManifest, readEmbeddingModelManifest } from '@studio/core/embeddings';
import { type EmbeddingModelManifest } from '@studio/shared/catalog';
import { type CliSettings } from '../settings/cli-settings.js';

/**
 * The committed manifest, the same file core's production adapter reads by default
 * (`<repository>/scripts/models/embedding-model.manifest.json`, SPEC 0003 section 5.2): the CLI
 * runs from the same checkout, so `studioRoot` and core resolve to one file.
 */
export function embeddingManifestFile(settings: CliSettings): string {
  return join(settings.studioRoot, 'scripts', 'models', 'embedding-model.manifest.json');
}

/** The installer's one implementation of the model download (install.sh step 7). */
export function embeddingFetchScriptFile(settings: CliSettings): string {
  return join(settings.studioRoot, 'scripts', 'models', 'fetch-embedding-model.sh');
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

const invalidReasonTexts: Readonly<Record<InvalidModelManifestError['reason'], string>> = {
  unreadable: 'não pôde ser lido',
  'too-large': 'é grande demais',
  'invalid-json': 'não é um JSON válido',
  'schema-mismatch': 'não segue o formato esperado',
  unpinned: 'ainda tem valores provisórios',
};

/** One pt-BR line about the manifest; no path, no checksum value. */
export function manifestText(state: ManifestState): string {
  switch (state.status) {
    case 'pinned':
      return `fixado (${state.manifest.modelRef}, ${state.manifest.files.length} arquivo(s), ${state.manifest.dimensions} dimensões)`;
    case 'unpinned':
      return `provisório (${state.manifest.modelRef}): os valores de sha-256 e tamanho ainda não foram fixados em scripts/models; nada é baixado`;
    case 'invalid':
      return `inválido: o manifesto ${invalidReasonTexts[state.reason]}`;
  }
}
