import { realpath } from 'node:fs/promises';
import { extname } from 'node:path';
import { readRunManifest, resolveInsideRun } from '@studio/shared/run-files';
import { type IsoDateTime, type Sha256 } from '@studio/shared/run-format';
import { isInsideOrEqual } from '../asset-store';
import {
  ArtifactChangedError,
  ArtifactNotRecordedError,
  ArtifactTypeNotSupportedError,
  UnsafeArtifactPathError,
} from './review.errors';
import { type LoadedRun } from './review-run-access';

export interface RecordedArtifact {
  /** Real path of the file, inside the run folder after links are followed. */
  absolutePath: string;
  contentHash: Sha256;
  /** When the `record` step hashed it; null for an output known only from manifest.json. */
  recordedAt: IsoDateTime | null;
}

/**
 * File types a run produces that some catalog kind accepts; the catalog's per-kind allowlist
 * still decides whether the target asset takes it (PRD 5.3).
 */
const MIME_TYPE_BY_EXTENSION: Readonly<Record<string, string>> = {
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.json': 'application/json',
  '.md': 'text/markdown',
  '.txt': 'text/plain',
  '.pdf': 'application/pdf',
};

export function mimeTypeOfArtifact(artifactPath: string): string {
  const mimeType = MIME_TYPE_BY_EXTENSION[extname(artifactPath).toLowerCase()];
  if (mimeType === undefined) throw new ArtifactTypeNotSupportedError(artifactPath);
  return mimeType;
}

async function recordedHashOf(loaded: LoadedRun, artifactPath: string): Promise<Omit<RecordedArtifact, 'absolutePath'>> {
  const output = loaded.run.stages.flatMap((stage) => stage.outputs).find((candidate) => candidate.path === artifactPath);
  if (output !== undefined) return { contentHash: output.contentHash, recordedAt: output.recordedAt };
  const manifest = await readRunManifest(loaded.runDir);
  const packaged =
    manifest.status === 'present' && manifest.value.runId === loaded.runId
      ? manifest.value.outputs.find((candidate) => candidate.path === artifactPath)
      : undefined;
  if (packaged === undefined) throw new ArtifactNotRecordedError(loaded.runId, artifactPath);
  return { contentHash: packaged.contentHash, recordedAt: null };
}

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** A recorded output that is gone no longer matches its recorded hash. */
async function realArtifactPath(loaded: LoadedRun, artifactPath: string, lexical: string): Promise<string> {
  try {
    return await realpath(lexical);
  } catch (error) {
    if (isMissingFile(error)) throw new ArtifactChangedError(loaded.runId, artifactPath, null);
    throw error;
  }
}

/**
 * Resolves a run-relative output path: C5 refuses `..` and absolute paths lexically, and the real
 * path must stay inside the real run folder, so a link inside the run cannot lead elsewhere.
 */
export async function resolveRecordedArtifact(loaded: LoadedRun, artifactPath: string): Promise<RecordedArtifact> {
  const lexical = resolveInsideRun(loaded.runDir, artifactPath);
  const recorded = await recordedHashOf(loaded, artifactPath);
  const [realRunDir, realArtifact] = await Promise.all([realpath(loaded.runDir), realArtifactPath(loaded, artifactPath, lexical)]);
  if (realArtifact === realRunDir || !isInsideOrEqual(realRunDir, realArtifact)) {
    throw new UnsafeArtifactPathError(loaded.runId, artifactPath);
  }
  return { absolutePath: realArtifact, ...recorded };
}
