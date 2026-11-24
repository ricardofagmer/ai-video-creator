import { join, resolve } from 'node:path';
import { locateResourceRoot, type StudioRuntime } from '../runtime';
import { type EmbeddingModelPortProvider } from './embeddings.module';
import { OnnxEmbeddingModel } from './onnx-embedding-model';

/**
 * The committed manifest `scripts/models/embedding-model.manifest.json` (SPEC 0003 section 5.2),
 * relative to the resource root: the repository checkout in development, `payload/resources/` when
 * packaged (plan C3 rev 3, 9.1), which keeps the same relative path.
 */
const MANIFEST_SEGMENTS: readonly string[] = ['scripts', 'models', 'embedding-model.manifest.json'];

/**
 * Development only: both `src/embeddings/` and the built `dist/embeddings/` sit four folders below
 * the repository root (`<root>/packages/core/{src,dist}/embeddings`). Packaged, this folder is inside
 * `payload/node_modules/`, so it is never used there (DI-AC-03); the locator supplies the root.
 */
const CHECKOUT_ROOT = resolve(__dirname, '..', '..', '..', '..');
const DEFAULT_MANIFEST_FILE = join(CHECKOUT_ROOT, ...MANIFEST_SEGMENTS);

/**
 * The manifest file for a runtime: the checkout's committed file in development (unchanged), the
 * staged copy under the runtime's resources when packaged. Never the working directory or an
 * environment variable of its own: the manifest stays the only way to change the model.
 */
export function runtimeEmbeddingManifestFile(runtime: StudioRuntime): string {
  return join(locateResourceRoot(runtime, CHECKOUT_ROOT), ...MANIFEST_SEGMENTS);
}

export interface OnnxEmbeddingModelOptions {
  /**
   * Absolute path of the manifest; defaults to the committed one in the checkout. A function is
   * called when the module initializes, never at import, so a composition root can resolve the
   * runtime there and an invalid runtime folder fails the boot with its typed error.
   */
  manifestPath?: string | (() => string);
}

function manifestFileOf(options: OnnxEmbeddingModelOptions | undefined): string {
  const manifestPath = options?.manifestPath;
  if (manifestPath === undefined) return DEFAULT_MANIFEST_FILE;
  return typeof manifestPath === 'string' ? manifestPath : manifestPath();
}

/**
 * The provider the api and CLI composition roots pass to `EmbeddingsModule.forRoot({ modelPort })`.
 * The factory reads the manifest once at module init; an unusable manifest does not fail the
 * bootstrap (the model state is then `absent`), and the model itself loads lazily on first use.
 */
export function onnxEmbeddingModelPortProvider(options?: OnnxEmbeddingModelOptions): EmbeddingModelPortProvider {
  return { useFactory: () => OnnxEmbeddingModel.fromManifestFile(manifestFileOf(options)) };
}
