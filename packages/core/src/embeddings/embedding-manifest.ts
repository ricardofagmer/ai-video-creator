import { readFile } from 'node:fs/promises';
import { EmbeddingModelManifestSchema, type EmbeddingModelManifest } from '@studio/shared/catalog';
import { InvalidModelManifestError } from './embeddings.errors';

/** The manifest pins at most 64 files; anything larger than this is not a manifest. */
const MAX_MANIFEST_BYTES = 64 * 1024;

/**
 * The placeholder sha-256 a manifest carries until its values are read from the model host. No
 * file hashes to it, so even a manifest loaded past `isPinnedManifest` can never verify.
 */
const PLACEHOLDER_SHA256 = '0'.repeat(64);

/**
 * False while any file still carries a placeholder pin (the all-zero sha-256 or a zero size).
 * The installer and the production adapter both refuse such a manifest.
 */
export function isPinnedManifest(manifest: EmbeddingModelManifest): boolean {
  return manifest.files.every((file) => file.sha256 !== PLACEHOLDER_SHA256 && file.sizeBytes > 0);
}

/** Validates manifest JSON text with the frozen C1 schema (strict: unknown keys are refused). */
export function parseEmbeddingModelManifest(text: string): EmbeddingModelManifest {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch (error) {
    throw new InvalidModelManifestError('invalid-json', { cause: error });
  }
  const parsed = EmbeddingModelManifestSchema.safeParse(candidate);
  if (!parsed.success) throw new InvalidModelManifestError('schema-mismatch');
  return parsed.data;
}

/**
 * Reads the committed manifest. The adapter calls it once at construction with the path the
 * composition root passes; the manifest is the only way to change the model (R2-03 checks).
 */
export async function readEmbeddingModelManifest(manifestFile: string): Promise<EmbeddingModelManifest> {
  let bytes: Buffer;
  try {
    bytes = await readFile(manifestFile);
  } catch (error) {
    throw new InvalidModelManifestError('unreadable', { cause: error });
  }
  if (bytes.byteLength > MAX_MANIFEST_BYTES) throw new InvalidModelManifestError('too-large');
  return parseEmbeddingModelManifest(bytes.toString('utf8'));
}
