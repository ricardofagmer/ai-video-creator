import { type MusicPick } from '@studio/shared/agents';
import type { AssetResolverPort, StageExecutionContext, StageFailure } from '@studio/shared/ports';
import { type Sha256 } from '@studio/shared/run-format';
import { needsPerson } from '../shared/stage-results';
import { stageTexts } from '../shared/stage-texts';
import { type MusicTrackOption } from './music-candidates';

export interface ChosenOption {
  option: MusicTrackOption;
  reason: string;
}

export type ResolvedTrack = { status: 'resolved'; absolutePath: string } | { status: 'refused'; failure: StageFailure };

/**
 * One option is used as is. Among several, the Scene director's pick wins when it names one of
 * them (it may be stale or invented, so it is re-checked here); otherwise the first option by the
 * deterministic order of `listMusicOptions`. `options` is never empty.
 */
export function chooseOption(options: readonly [MusicTrackOption, ...MusicTrackOption[]], directorPick: MusicPick | undefined): ChosenOption {
  const [first] = options;
  if (options.length === 1) return { option: first, reason: stageTexts.musicReasonOnlyMatch };
  const picked = directorPick === undefined ? undefined : options.find((option) => option.candidate.ref === directorPick.ref);
  if (picked !== undefined && directorPick !== undefined) return { option: picked, reason: directorPick.reason };
  return { option: first, reason: stageTexts.musicReasonRule };
}

/**
 * Re-hashes a catalog track against the hash the pick pinned, as `preflight` does for bound
 * assets (ADR 0003 decision 1). A changed or missing file, or a row that is no longer a single
 * non-biometric music file, stops for a person: nothing is mixed from bytes nobody checked.
 */
export async function resolveCatalogTrack(
  context: StageExecutionContext,
  resolver: AssetResolverPort,
  pin: { ref: string; contentHash: Sha256 },
): Promise<ResolvedTrack> {
  const resolution = await resolver.resolve({ ref: pin.ref, expectedContentHash: pin.contentHash, signal: context.signal });
  const refused = (status: string): ResolvedTrack => ({
    status: 'refused',
    failure: needsPerson({ kind: 'needs-person', stepKey: context.stepKey }, stageTexts.musicTrackUnresolved(pin.ref, status), stageTexts.musicTrackUnresolvedWhatToDo),
  });
  if (resolution.status !== 'resolved') return refused(resolution.status);
  const { asset } = resolution;
  if (asset.kind !== 'music' || asset.layout !== 'file' || asset.sensitivity === 'biometric') return refused('not-a-music-file');
  return { status: 'resolved', absolutePath: asset.absolutePath };
}
