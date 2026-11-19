import { type RunArtifactAccess } from '@studio/shared/api';
import { type RunFile, type RunManifest } from '@studio/shared/run-format';

/** A JSON run artifact as the review screen read it. */
export type ArtifactRead<Value> = { status: 'present'; value: Value } | { status: 'absent' } | { status: 'unreadable' };

/** A ref the screen shows instead of media: the ref and its hash only, never the bytes. */
export interface WithheldItem {
  ref: string;
  contentHash: string | null;
}

export const FINAL_VIDEO_PATH = 'final.mp4';

/**
 * What the "Vídeo" card shows. The api decides through `RunStateResponse.artifactAccess` (SPEC 0002
 * rev 4, section 13.5, A26) and enforces it on the artifact route; the web only follows it.
 */
export type VideoAccess =
  | { kind: 'playable' }
  | { kind: 'playable-biometric' }
  | { kind: 'withheld'; items: readonly WithheldItem[] }
  | { kind: 'missing' };

/**
 * Every ref the run used, with the hash it was pinned at when one is known: recipe bindings and
 * run references from run.json, plus the manifest's assets and references. Shown, never fetched.
 */
function consideredRefs(run: RunFile, manifest: ArtifactRead<RunManifest>): WithheldItem[] {
  const hashes = new Map<string, string | null>();
  const add = (ref: string, contentHash: string | null): void => {
    if (contentHash !== null || !hashes.has(ref)) hashes.set(ref, contentHash);
  };
  for (const binding of run.recipe.definition.bindings) add(binding.ref, binding.contentHash);
  if (manifest.status === 'present') {
    for (const asset of manifest.value.assets) add(asset.ref, asset.contentHash);
    for (const reference of manifest.value.references) add(reference.ref, reference.contentHash);
  }
  for (const ref of run.references) add(ref, null);
  return [...hashes].map(([ref, contentHash]) => ({ ref, contentHash }));
}

/**
 * The card state from the api's marker. `withheld` renders no player at all; a present manifest
 * without `final.mp4` among its outputs is "missing". The web makes no sensitivity lookup of its own.
 */
export function videoAccessOf(access: RunArtifactAccess, run: RunFile, manifest: ArtifactRead<RunManifest>): VideoAccess {
  if (access === 'withheld') return { kind: 'withheld', items: consideredRefs(run, manifest) };
  if (manifest.status === 'present' && !manifest.value.outputs.some((output) => output.path === FINAL_VIDEO_PATH)) {
    return { kind: 'missing' };
  }
  return access === 'playable-biometric' ? { kind: 'playable-biometric' } : { kind: 'playable' };
}

/**
 * Links to the artifact route (evidence files) and the promote action are offered only on a
 * `playable` run. On a `playable-biometric` run the screen has no anchor, button or `download`
 * attribute that targets the artifact route (R4-13); a `withheld` run gets none either.
 */
export function allowsArtifactLinks(access: RunArtifactAccess): boolean {
  return access === 'playable';
}
