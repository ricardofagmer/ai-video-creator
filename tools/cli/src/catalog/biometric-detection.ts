import { realpath } from 'node:fs/promises';
import { sep } from 'node:path';
import { isInsideOrEqual } from '@studio/core/asset-store';
import { type AssetVersion } from '@studio/shared/catalog';

/**
 * The owner's biometric folder named by PRD 12 (`ai-video-creator/ricardo-clone/`). Any path with
 * this segment is treated as biometric, registered or not; the CLI never opens it to decide.
 */
const KNOWN_BIOMETRIC_FOLDER_NAMES: readonly string[] = ['ricardo-clone'];

/** C1 `ai-model` types that are a person's voice or likeness by nature. */
const BIOMETRIC_MODEL_TYPES: readonly string[] = ['voice-clone', 'avatar'];

export type BiometricSignal = 'registered-reference' | 'known-folder' | 'model-type';

/** Registered by-reference biometric paths, from a full catalog scan (paths stay in memory only). */
export function registeredBiometricPaths(versions: readonly AssetVersion[]): string[] {
  const paths: string[] = [];
  for (const version of versions) {
    if (version.sensitivity === 'biometric' && version.storage.mode === 'reference') paths.push(version.storage.absolutePath);
  }
  return paths;
}

function declaresBiometricModel(metadata: unknown): boolean {
  if (typeof metadata !== 'object' || metadata === null || !('details' in metadata)) return false;
  const { details } = metadata;
  if (typeof details !== 'object' || details === null || !('modelType' in details)) return false;
  const { modelType } = details;
  return typeof modelType === 'string' && BIOMETRIC_MODEL_TYPES.includes(modelType);
}

function hasKnownBiometricSegment(path: string): boolean {
  return path.split(sep).some((segment) => KNOWN_BIOMETRIC_FOLDER_NAMES.includes(segment));
}

/** Both directions: a registered path inside the source, or the source inside a registered path. */
function overlapsRegistered(candidates: readonly string[], registered: readonly string[]): boolean {
  return candidates.some((candidate) =>
    registered.some((path) => isInsideOrEqual(path, candidate) || isInsideOrEqual(candidate, path)),
  );
}

/**
 * Why a source must be treated as biometric (PRD 12, criterion 22), or null. Fail-closed signals
 * only: a registered biometric reference overlaps the path (lexically or after resolving links),
 * the path crosses the owner's known biometric folder, or the metadata declares a voice clone or
 * an avatar. `realpath` resolves links without reading any file content.
 */
export async function detectBiometricSource(
  absolutePath: string,
  metadata: unknown,
  registeredPaths: readonly string[],
): Promise<BiometricSignal | null> {
  const resolved = await realpath(absolutePath);
  const candidates = resolved === absolutePath ? [absolutePath] : [absolutePath, resolved];
  if (overlapsRegistered(candidates, registeredPaths)) return 'registered-reference';
  if (candidates.some(hasKnownBiometricSegment)) return 'known-folder';
  if (declaresBiometricModel(metadata)) return 'model-type';
  return null;
}
