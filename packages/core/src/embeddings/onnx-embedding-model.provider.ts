import { resolve } from 'node:path';
import { type EmbeddingModelPortProvider } from './embeddings.module';
import { OnnxEmbeddingModel } from './onnx-embedding-model';

/**
 * The committed manifest `scripts/models/embedding-model.manifest.json` (SPEC 0003 section 5.2).
 * Core runs from the repository checkout (the installer builds it in place and links the CLI
 * there), and both `src/embeddings/` and the built `dist/embeddings/` sit four folders below the
 * repository root (`<root>/packages/core/{src,dist}/embeddings`). So the default is resolved from
 * this file's folder, never from the working directory or an environment variable: the manifest
 * stays the only way to change the model.
 */
const DEFAULT_MANIFEST_FILE = resolve(__dirname, '..', '..', '..', '..', 'scripts', 'models', 'embedding-model.manifest.json');

export interface OnnxEmbeddingModelOptions {
  /** Absolute path of the manifest; defaults to the committed one. For composition roots and tests. */
  manifestPath?: string;
}

/**
 * The provider the api and CLI composition roots pass to `EmbeddingsModule.forRoot({ modelPort })`.
 * The factory reads the manifest once at module init; an unusable manifest does not fail the
 * bootstrap (the model state is then `absent`), and the model itself loads lazily on first use.
 */
export function onnxEmbeddingModelPortProvider(options?: OnnxEmbeddingModelOptions): EmbeddingModelPortProvider {
  const manifestFile = options?.manifestPath ?? DEFAULT_MANIFEST_FILE;
  return { useFactory: () => OnnxEmbeddingModel.fromManifestFile(manifestFile) };
}
