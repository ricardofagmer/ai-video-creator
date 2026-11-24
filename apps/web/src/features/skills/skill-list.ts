import { formatNumber, type Locale } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { type WebMessages } from '@/messages';
import { type CatalogKindTab } from '@/features/catalog/components/CatalogKindTabs';
import { countSkillCategories, skillCategories, skillCategoryOf, skillCategoryTabId, type SkillCategory } from './skill-categories';

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

export function skillsHref(category: SkillCategory | null, savedAssetId?: string): string {
  const query = new URLSearchParams();
  if (category !== null) query.set('categoria', category);
  if (savedAssetId !== undefined) query.set('salvo', savedAssetId);
  const text = query.toString();
  return text === '' ? '/skills' : `/skills?${text}`;
}

interface SkillTabsInput {
  skills: readonly AssetVersionView[];
  selected: SkillCategory | null;
  t: WebMessages['skills'];
  locale: Locale;
}

/** "All" then each category that has skills, plus the selected one so a typed URL still shows where it is. */
export function skillCategoryTabsOf({ skills, selected, t, locale }: SkillTabsInput): CatalogKindTab[] {
  const counts = countSkillCategories(skills);
  const all: CatalogKindTab = {
    id: skillCategoryTabId(null),
    label: t.list.all,
    count: formatNumber(skills.length, locale),
    href: skillsHref(null),
    selected: selected === null,
  };
  const categories = skillCategories
    .filter((category) => counts.has(category) || category === selected)
    .map(
      (category): CatalogKindTab => ({
        id: skillCategoryTabId(category),
        label: t.categories[category],
        count: formatNumber(counts.get(category) ?? 0, locale),
        href: skillsHref(category),
        selected: selected === category,
      }),
    );
  return [all, ...categories];
}

export function skillsOfCategory(skills: readonly AssetVersionView[], category: SkillCategory | null): AssetVersionView[] {
  return category === null ? [...skills] : skills.filter((skill) => skillCategoryOf(skill) === category);
}
