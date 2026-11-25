import { type AssetMetadataInput, type AssetVersionView } from '@studio/shared/api';
import { TagSchema } from '@studio/shared/catalog';

/** The catalog keeps at most 32 tags per version. */
export const ASSET_TAGS_MAX = 32;

export type AssetTagsProblem = { type: 'invalid'; tag: string } | { type: 'too-many'; max: number };

/** TagInput keeps its tags as comma-separated text; empty pieces and repeats are dropped. */
export function tagsOfText(text: string): string[] {
  return [...new Set(text.split(',').map((tag) => tag.trim()).filter((tag) => tag !== ''))];
}

/** The first problem of a tag list, or null; the api validates everything again. */
export function assetTagsProblemOf(tags: readonly string[]): AssetTagsProblem | null {
  const invalid = tags.find((tag) => !TagSchema.safeParse(tag).success);
  if (invalid !== undefined) return { type: 'invalid', tag: invalid };
  return tags.length > ASSET_TAGS_MAX ? { type: 'too-many', max: ASSET_TAGS_MAX } : null;
}

/** Metadata of version N+1 where only the tags change; every other field is carried over from `base`. */
export function metadataWithTagsOf(base: AssetVersionView, tags: readonly string[]): AssetMetadataInput {
  return {
    name: base.name,
    summary: base.summary,
    owner: base.owner,
    tags: [...tags],
    provenance: base.provenance ?? undefined,
    license: base.license ?? undefined,
    sensitivity: base.sensitivity,
    notes: base.notes,
    details: base.details,
  };
}
