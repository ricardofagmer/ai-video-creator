import { MUSIC_CANDIDATES_MAX, type MusicCandidate } from '@studio/shared/agents';
import { formatAssetRef, type MusicCategory } from '@studio/shared/catalog';
import type { StagePlanningContext } from '@studio/shared/ports';
import { musicChoiceOf } from '@studio/shared/recipes';
import { type Sha256 } from '@studio/shared/run-format';
import { type CatalogLookup, type MusicVersion } from '../shared/catalog-lookup';

/** A catalog track the music stage may mix: the director-facing candidate plus the hash it pins. */
export interface MusicTrackOption {
  candidate: MusicCandidate;
  contentHash: Sha256;
  /** How many of the asked categories the track carries; ranks the options. */
  matched: number;
}

/**
 * The asked categories when the recipe's enabled `music` stage is in `auto` mode, else null. The
 * `scenes` stage reads it from the recipe graph; the `music` stage passes its own `params`.
 */
export function autoMusicCategoriesOfRecipe(context: StagePlanningContext): MusicCategory[] | null {
  const musicStage = context.recipe.graph.stages.find((stage) => stage.stageId === 'music' && stage.enabled);
  return musicStage === undefined ? null : autoMusicCategories(musicStage.params);
}

export function autoMusicCategories(params: StagePlanningContext['params']): MusicCategory[] | null {
  const choice = musicChoiceOf(params);
  return choice.mode === 'auto' ? choice.categories : null;
}

/**
 * The catalog tracks auto mode may pick from (docs/specs/2026-11-25-ai-music-choice-design.md
 * section 3): active, single-file, stored in the content store, never biometric. Tracks carrying
 * every asked category win; when none does, any of them; no category asked means every track.
 * Ordered by categories matched, then duration closest to the video's target, then ref, so the
 * fallback pick is the same on every call; capped at `MUSIC_CANDIDATES_MAX`.
 */
export async function listMusicOptions(
  context: StagePlanningContext,
  catalog: CatalogLookup,
  categories: readonly MusicCategory[],
): Promise<MusicTrackOption[]> {
  const usable = latestPerAsset((await catalog.activeMusicVersions()).filter(isMixable));
  const options = usable.map((version) => toOption(version, categories));
  const kept = filterByCategories(options, categories.length);
  const targetMs = context.brief.targetDurationSec * 1000;
  return kept.sort((left, right) => compareOptions(left, right, targetMs)).slice(0, MUSIC_CANDIDATES_MAX);
}

function isMixable(version: MusicVersion): boolean {
  return version.layout === 'file' && version.storage.mode === 'store' && version.sensitivity !== 'biometric';
}

/** Two active versions of one song are one choice: the newest version stands for the asset. */
function latestPerAsset(versions: readonly MusicVersion[]): MusicVersion[] {
  const byAsset = new Map<string, MusicVersion>();
  for (const version of versions) {
    const known = byAsset.get(version.id);
    if (known === undefined || version.version > known.version) byAsset.set(version.id, version);
  }
  return [...byAsset.values()];
}

function toOption(version: MusicVersion, categories: readonly MusicCategory[]): MusicTrackOption {
  const { durationMs, bpm } = version.details;
  const trackCategories = version.details.categories;
  return {
    candidate: {
      ref: formatAssetRef({ assetId: version.id, version: version.version }),
      name: version.name,
      categories: [...trackCategories],
      bpm,
      durationMs,
    },
    contentHash: version.contentHash,
    matched: categories.filter((category) => trackCategories.includes(category)).length,
  };
}

function filterByCategories(options: readonly MusicTrackOption[], asked: number): MusicTrackOption[] {
  if (asked === 0) return [...options];
  const carryingAll = options.filter((option) => option.matched === asked);
  return carryingAll.length > 0 ? carryingAll : options.filter((option) => option.matched > 0);
}

function compareOptions(left: MusicTrackOption, right: MusicTrackOption, targetMs: number): number {
  if (left.matched !== right.matched) return right.matched - left.matched;
  const leftGap = Math.abs(left.candidate.durationMs - targetMs);
  const rightGap = Math.abs(right.candidate.durationMs - targetMs);
  if (leftGap !== rightGap) return leftGap - rightGap;
  if (left.candidate.ref === right.candidate.ref) return 0;
  return left.candidate.ref < right.candidate.ref ? -1 : 1;
}
