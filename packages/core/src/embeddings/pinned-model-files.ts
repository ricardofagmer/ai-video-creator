import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { type EmbeddingModelManifest } from '@studio/shared/catalog';
import { sha256Hex } from '../asset-store';
import { EmbeddingModelLoadError } from './embeddings.errors';

type ManifestFile = EmbeddingModelManifest['files'][number];

/**
 * The three manifest entries the ONNX adapter reads (option L, docs/vetting/0001). They are found
 * in the manifest, never by a fixed path, so a different model is a manifest change only: exactly
 * one `*.onnx` graph, one `tokenizer.json` and one `tokenizer_config.json`.
 */
export interface PinnedModelFiles {
  readonly graph: ManifestFile;
  readonly tokenizer: ManifestFile;
  readonly tokenizerConfig: ManifestFile;
}

function exactlyOne(files: readonly ManifestFile[], matches: (file: ManifestFile) => boolean): ManifestFile {
  const found = files.filter(matches);
  const [only] = found;
  if (found.length !== 1 || only === undefined) throw new EmbeddingModelLoadError('model-files');
  return only;
}

export function selectPinnedModelFiles(manifest: EmbeddingModelManifest): PinnedModelFiles {
  return {
    graph: exactlyOne(manifest.files, (file) => file.path.endsWith('.onnx')),
    tokenizer: exactlyOne(manifest.files, (file) => basename(file.path) === 'tokenizer.json'),
    tokenizerConfig: exactlyOne(manifest.files, (file) => basename(file.path) === 'tokenizer_config.json'),
  };
}

/** A plain file of the pinned size, opened without following a symlink. */
async function readPlainFile(file: string, entry: ManifestFile): Promise<Buffer> {
  try {
    const handle = await open(file, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size !== entry.sizeBytes) throw new EmbeddingModelLoadError('file-mismatch', entry.path);
      return await handle.readFile();
    } finally {
      await handle.close();
    }
  } catch (error) {
    if (error instanceof EmbeddingModelLoadError) throw error;
    throw new EmbeddingModelLoadError('file-mismatch', entry.path, { cause: error });
  }
}

/**
 * Reads one manifest file from the verified model folder and returns its bytes only when they
 * hash to the pinned sha-256 and size. The runtime already re-hashed the folder; hashing the very
 * bytes handed to the native runtime closes the gap between that check and this read, so nothing
 * but pinned bytes is ever parsed. A symlink is refused at open (`O_NOFOLLOW`).
 */
export async function readPinnedModelFile(modelDirectory: string, entry: ManifestFile): Promise<Buffer> {
  const bytes = await readPlainFile(join(modelDirectory, entry.path), entry);
  if (bytes.byteLength !== entry.sizeBytes || sha256Hex(bytes) !== entry.sha256) {
    throw new EmbeddingModelLoadError('file-mismatch', entry.path);
  }
  return bytes;
}
