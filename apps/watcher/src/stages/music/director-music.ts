import { type DirectorPacketSource } from '@studio/core/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { type CatalogLookup } from '../shared/catalog-lookup';
import { autoMusicCategoriesOfRecipe, listMusicOptions } from './music-candidates';

/**
 * The director packet's `music` block (implementation amendments of
 * docs/specs/2026-11-25-ai-music-choice-design.md): present only when the recipe's enabled `music`
 * stage is in auto mode and two or more catalog tracks fit, since one track needs no choice and
 * none means the music stage generates. Metadata only; the director never hears the audio.
 */
export async function directorMusicField(context: StageExecutionContext, catalog: CatalogLookup): Promise<Pick<DirectorPacketSource, 'music'>> {
  const categories = autoMusicCategoriesOfRecipe(context);
  if (categories === null) return {};
  const options = await listMusicOptions(context, catalog, categories);
  if (options.length < 2) return {};
  return { music: { categories, candidates: options.map((option) => option.candidate) } };
}
