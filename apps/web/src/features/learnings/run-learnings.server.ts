import 'server-only';
import { type AssetVersionView, type LearningNoteView } from '@studio/shared/api';
import { assetRefPattern, parseAssetRef } from '@studio/shared/catalog';
import { type RunManifest } from '@studio/shared/run-format';
import { getI18n } from '@/lib/i18n/server';
import { type ArtifactRead } from '@/features/review/media-safety';
import { ApiResponseContractError, isNotFound } from '@/lib/api';
import { serverStudioClient } from '@/lib/api/server';
import { type LearningTarget } from './learning-target';

export type RunLearningsData =
  | { kind: 'no-manifest' }
  | {
      kind: 'ready';
      /** Versions the run used that may take a note: in its manifest and not biometric. */
      targets: LearningTarget[];
      /** Biometric versions the run used; notes on them are refused (B17), so they are left out. */
      biometricCount: number;
      /** Refs whose version could not be read; they are left out rather than guessed. */
      unreadableCount: number;
      /** Notes saved from this run, on any of those versions, newest first. */
      notes: LearningNoteView[];
    };

/** The manifest's assets and references: the list the api checks a learning's ref against (5.5 step 2). */
function usedRefs(manifest: RunManifest): string[] {
  const refs = [...manifest.assets.map((asset) => asset.ref), ...manifest.references.map((reference) => reference.ref)];
  return [...new Set(refs)].filter((ref) => assetRefPattern.test(ref));
}

async function readVersion(ref: string): Promise<AssetVersionView | null> {
  const { assetId, version } = parseAssetRef(ref);
  try {
    return await serverStudioClient().getAssetVersion(assetId, version);
  } catch (error) {
    if (isNotFound(error) || error instanceof ApiResponseContractError) return null;
    throw error;
  }
}

/**
 * Data of the review screen's "Aprendizados" card. Reads each used version through the C10 api
 * (no file read); a biometric version contributes its count only, never a picker entry.
 */
export async function loadRunLearnings(runId: string, manifest: ArtifactRead<RunManifest>): Promise<RunLearningsData> {
  if (manifest.status !== 'present') return { kind: 'no-manifest' };
  const refs = usedRefs(manifest.value);
  const versions = await Promise.all(refs.map(async (ref) => ({ ref, version: await readVersion(ref) })));
  const targets: LearningTarget[] = [];
  const { t } = await getI18n();
  const notes: LearningNoteView[] = [];
  let biometricCount = 0;
  let unreadableCount = 0;
  for (const { ref, version } of versions) {
    if (version === null) {
      unreadableCount += 1;
      continue;
    }
    if (version.sensitivity === 'biometric') {
      biometricCount += 1;
      continue;
    }
    targets.push({ ref, label: `${version.name} · ${t.runs.learnings.assetKinds[version.kind]} · ${ref}` });
    notes.push(...version.learnings.filter((note) => note.sourceRunId === runId));
  }
  notes.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  return { kind: 'ready', targets, biometricCount, unreadableCount, notes };
}
