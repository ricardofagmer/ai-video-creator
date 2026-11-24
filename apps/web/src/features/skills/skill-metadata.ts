import { type AssetMetadataInput, type AssetVersionView } from '@studio/shared/api';
import { AssetIdSchema } from '@studio/shared/catalog';
import { tagsWithSkillCategory, type SkillCategory } from './skill-categories';

/** One or two sentences: the Skills forms cap the briefing well below the schema's 1000. */
export const SKILL_BRIEFING_MAX = 280;
export const SKILL_NAME_MAX = 200;
export const SKILL_OWNER_MAX = 100;
export const SKILL_ENTRY_FILE = 'SKILL.md';

/** What every Skills form collects. */
export interface SkillFormInput {
  name: string;
  briefing: string;
  category: SkillCategory;
}

export type SkillInputProblem = 'name-required' | 'briefing-too-long' | 'owner-required' | 'id-invalid';

/** The first problems of a form, or an empty list; the api validates everything again. */
export function skillInputProblems(input: SkillFormInput & { owner?: string; assetId?: string }): SkillInputProblem[] {
  const problems: SkillInputProblem[] = [];
  if (input.name.trim() === '') problems.push('name-required');
  if (input.briefing.trim().length > SKILL_BRIEFING_MAX) problems.push('briefing-too-long');
  if (input.owner !== undefined && input.owner.trim() === '') problems.push('owner-required');
  if (input.assetId !== undefined && !AssetIdSchema.safeParse(input.assetId).success) problems.push('id-invalid');
  return problems;
}

/** The list shows at most the briefing length; older, longer descriptions end in an ellipsis. */
export function briefingPreview(description: string): string {
  const text = description.replace(/\s+/g, ' ').trim();
  return text.length <= SKILL_BRIEFING_MAX ? text : `${text.slice(0, SKILL_BRIEFING_MAX - 1).trimEnd()}…`;
}

/** A folder or typed name as a catalog id: lowercase kebab case, at most 64 characters. */
export function skillAssetIdOf(source: string): string {
  return source
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)
    .replace(/-+$/, '');
}

/** Metadata of version 1 of an imported or created skill. */
export function newSkillMetadataOf(input: SkillFormInput & { owner: string; entryFile: string }): AssetMetadataInput {
  return {
    name: input.name.trim().slice(0, SKILL_NAME_MAX),
    owner: input.owner.trim().slice(0, SKILL_OWNER_MAX),
    tags: tagsWithSkillCategory([], input.category),
    sensitivity: 'normal',
    details: { entryFile: input.entryFile, description: input.briefing.trim() },
  };
}

/**
 * Metadata of version N+1 after an edit: name, briefing and the single category tag change; every
 * other field and tag is carried over from the version the edit started from.
 */
export function editedSkillMetadataOf(base: AssetVersionView, input: SkillFormInput, entryFile: string): AssetMetadataInput {
  return {
    name: input.name.trim().slice(0, SKILL_NAME_MAX),
    summary: base.summary,
    owner: base.owner,
    tags: tagsWithSkillCategory(base.tags, input.category),
    provenance: base.provenance ?? undefined,
    license: base.license ?? undefined,
    sensitivity: base.sensitivity,
    notes: base.notes,
    details: { entryFile, description: input.briefing.trim() },
  };
}

/** The entry file of a stored skill version, `SKILL.md` when the details are not a skill's. */
export function skillEntryFileOf(version: AssetVersionView): string {
  return version.kind === 'skill' ? version.details.entryFile : SKILL_ENTRY_FILE;
}

/** The briefing of a stored skill version (its `details.description`). */
export function skillDescriptionOf(version: AssetVersionView): string {
  return version.kind === 'skill' ? version.details.description : '';
}
