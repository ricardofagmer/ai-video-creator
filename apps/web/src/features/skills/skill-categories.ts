import { type AssetVersionView } from '@studio/shared/api';

/**
 * Category of a catalog skill (docs/specs/2026-11-23-skills-page-design.md). C1 has no category
 * field, so it lives in the tags: the first tag that names a skill category wins, a skill with none
 * is `other`. The order here is the order of the tabs on `/skills`.
 */
export const skillCategories = ['editing', 'motion', 'audio', 'writing', 'analysis', 'publishing', 'other'] as const;
export type SkillCategory = (typeof skillCategories)[number];

const categorySet: ReadonlySet<string> = new Set(skillCategories);

function isSkillCategory(value: string): value is SkillCategory {
  return categorySet.has(value);
}

/** URL and form values are untrusted input: anything outside the closed list is dropped. */
export function skillCategoryFrom(value: string | null | undefined): SkillCategory | null {
  return typeof value === 'string' && isSkillCategory(value) ? value : null;
}

export function skillCategoryOfTags(tags: readonly string[]): SkillCategory {
  return tags.find(isSkillCategory) ?? 'other';
}

export function skillCategoryOf(version: Pick<AssetVersionView, 'tags'>): SkillCategory {
  return skillCategoryOfTags(version.tags);
}

/** The skill's tags with exactly one category tag: every other category tag is dropped, the rest kept. */
export function tagsWithSkillCategory(tags: readonly string[], category: SkillCategory): string[] {
  return [category, ...tags.filter((tag) => !isSkillCategory(tag))];
}

/** Skills per category, in tab order, leaving out the categories no skill has. */
export function countSkillCategories(versions: readonly Pick<AssetVersionView, 'tags'>[]): Map<SkillCategory, number> {
  const counts = new Map<SkillCategory, number>();
  for (const version of versions) {
    const category = skillCategoryOf(version);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  return new Map(
    skillCategories.flatMap((category) => {
      const count = counts.get(category);
      return count === undefined ? [] : [[category, count] as const];
    }),
  );
}

export function skillCategoryTabId(category: SkillCategory | null): string {
  return category === null ? 'skills-categoria-todas' : `skills-categoria-${category}`;
}

export const SKILL_CATEGORY_PANEL_ID = 'skills-categoria-painel';
