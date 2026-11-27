import { formatNumber, type Locale } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { type WebMessages } from '@/messages';
import { type CatalogKindTab } from '@/features/catalog/components/CatalogKindTabs';
import {
  countSkillCategories,
  ownSkillTags,
  skillCategories,
  skillCategoryOf,
  skillCategoryTabId,
  type SkillCategory,
} from './skill-categories';
import { skillDescriptionOf } from './skill-metadata';

const SKILLS_SECTION_SLUG = 'ia-e-escrita';
/** The Skills search box: `?busca=` on the catalog's Skills tab. */
export const SKILL_SEARCH_PARAM = 'busca';
const SKILL_SEARCH_MAX = 200;

/** `?busca=` is untrusted input: one trimmed value of bounded length, or no search. */
export function skillSearchFrom(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value.trim().slice(0, SKILL_SEARCH_MAX) : '';
}

/** Skills whose id, name, briefing or tags hold the search text; every skill for an empty search. */
export function skillsMatching(skills: readonly AssetVersionView[], search: string): AssetVersionView[] {
  const term = search.toLowerCase();
  if (term === '') return [...skills];
  return skills.filter((skill) => `${skill.id} ${skill.name} ${skillDescriptionOf(skill)} ${skill.tags.join(' ')}`.toLowerCase().includes(term));
}

/**
 * One card per skill: its newest version, so an edit (a new draft) shows at once instead of waiting
 * for activation. Ordered by name.
 */
export function newestSkillVersions(versions: readonly AssetVersionView[]): AssetVersionView[] {
  const newest = new Map<string, AssetVersionView>();
  for (const version of versions) {
    const current = newest.get(version.id);
    if (current === undefined || version.version > current.version) newest.set(version.id, version);
  }
  return [...newest.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/** The catalog address parts every Skills link and the search form carry. */
export const skillsBaseQuery = { secao: SKILLS_SECTION_SLUG, tipo: 'skill' } as const;

/** Skills live in the catalog: AI & writing, Skills tab, with the category tab in `?categoria=` and the search in `?busca=`. */
export function skillsHref(category: SkillCategory | null, savedAssetId?: string, search = ''): string {
  const query = new URLSearchParams(skillsBaseQuery);
  if (category !== null) query.set('categoria', category);
  if (savedAssetId !== undefined) query.set('salvo', savedAssetId);
  if (search !== '') query.set(SKILL_SEARCH_PARAM, search);
  return `/catalogo?${query.toString()}`;
}

interface SkillTabsInput {
  skills: readonly AssetVersionView[];
  selected: SkillCategory | null;
  /** The current search; category tabs keep it. */
  search?: string;
  t: WebMessages['skills'];
  locale: Locale;
}

/** "All" then each category that has skills, plus the selected one so a typed URL still shows where it is. */
export function skillCategoryTabsOf({ skills, selected, search = '', t, locale }: SkillTabsInput): CatalogKindTab[] {
  const counts = countSkillCategories(skills);
  const all: CatalogKindTab = {
    id: skillCategoryTabId(null),
    label: t.list.all,
    count: formatNumber(skills.length, locale),
    href: skillsHref(null, undefined, search),
    selected: selected === null,
  };
  const categories = skillCategories
    .filter((category) => counts.has(category) || category === selected)
    .map(
      (category): CatalogKindTab => ({
        id: skillCategoryTabId(category),
        label: t.categories[category],
        count: formatNumber(counts.get(category) ?? 0, locale),
        href: skillsHref(category, undefined, search),
        selected: selected === category,
      }),
    );
  return [all, ...categories];
}

/** Skills that share the same set of own tags; `tags` is empty for the untagged group. */
export interface SkillTagGroup {
  key: string;
  tags: string[];
  skills: AssetVersionView[];
}

/**
 * Sections inside a category tab: one per distinct set of own tags, so every skill appears exactly
 * once. Groups are ordered by their tags; the untagged group comes last.
 */
export function groupSkillsByTags(skills: readonly AssetVersionView[]): SkillTagGroup[] {
  const groups = new Map<string, SkillTagGroup>();
  for (const skill of skills) {
    const tags = [...new Set(ownSkillTags(skill.tags))].sort((left, right) => left.localeCompare(right));
    const key = tags.join(' ');
    const group = groups.get(key);
    if (group === undefined) groups.set(key, { key, tags, skills: [skill] });
    else group.skills.push(skill);
  }
  return [...groups.values()].sort((left, right) => {
    if (left.tags.length === 0) return 1;
    if (right.tags.length === 0) return -1;
    return left.key.localeCompare(right.key);
  });
}

export function skillsOfCategory(skills: readonly AssetVersionView[], category: SkillCategory | null): AssetVersionView[] {
  return category === null ? [...skills] : skills.filter((skill) => skillCategoryOf(skill) === category);
}
