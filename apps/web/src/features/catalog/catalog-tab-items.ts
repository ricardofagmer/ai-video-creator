import { formatNumber, type Locale } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { type StudioGlyphName } from '@/features/common/studio-artwork';
import { type WebMessages } from '@/messages';
import { catalogTabId, type CatalogKindCounts } from './catalog-groups';
import { catalogSectionTabHref, catalogTabHref, templateCategoryTabHref, type CatalogFilters } from './catalog-query';
import { catalogSectionTabId, catalogSections, kindsOfSection, onlyKindOfSection, type CatalogSection } from './catalog-sections';
import { type CatalogKindTab } from './components/CatalogKindTabs';
import { countImageCategories, imageCategoryFrom, imageCategoryLabelOf } from './image-categories';
import { categoryLabelOf, countTemplateCategories, templateCategoryTabId, type CatalogCategory } from './template-categories';

/** What every tab builder needs to write its labels and counts. */
export interface CatalogTabTexts {
  t: WebMessages['catalog'];
  locale: Locale;
}

function sectionCount(counts: CatalogKindCounts, section: CatalogSection): number {
  if (section === 'sites') return counts.websites;
  const total = kindsOfSection(section).reduce((sum, kind) => sum + counts.byKind[kind], 0);
  return section === 'references' ? total - counts.websites : total;
}

/** One media glyph per section, so the top menu reads like a video editor's toolbar. */
const sectionGlyphs: Record<CatalogSection, StudioGlyphName> = {
  references: 'film',
  sites: 'magnifier',
  templates: 'clapperboard',
  images: 'camera',
  prompts: 'script',
  'ai-writing': 'sparkles',
  'media-brand': 'palette',
};

/** The section tabs: always all of them, in the same places; counts only in search by words. */
export function sectionTabsOf(filters: CatalogFilters, counts: CatalogKindCounts | null, { t, locale }: CatalogTabTexts): CatalogKindTab[] {
  return catalogSections.map((section) => ({
    id: catalogSectionTabId(section),
    label: t.sections.names[section],
    count: counts === null ? null : formatNumber(sectionCount(counts, section), locale),
    href: catalogSectionTabHref(filters, section),
    selected: filters.section === section,
    glyph: sectionGlyphs[section],
  }));
}

/**
 * The kind tabs of a section with several kinds: "All" then each kind that has assets (all of them when
 * the counts are unknown), plus the picked one so a hand-typed URL still shows where it is. Null for a
 * one-kind section, or when the section is empty.
 */
export function kindTabsOf(filters: CatalogFilters, counts: CatalogKindCounts | null, { t, locale }: CatalogTabTexts): CatalogKindTab[] | null {
  if (onlyKindOfSection(filters.section) !== null) return null;
  const kinds = kindsOfSection(filters.section).filter((kind) => counts === null || counts.byKind[kind] > 0 || filters.kind === kind);
  if (kinds.length === 0) return null;
  return [null, ...kinds].map((kind) => {
    const count = counts === null ? null : kind === null ? sectionCount(counts, filters.section) : counts.byKind[kind];
    return {
      id: catalogTabId(kind),
      label: kind === null ? t.tabs.all : t.tabs.kinds[kind],
      count: count === null ? null : formatNumber(count, locale),
      href: catalogTabHref(filters, kind),
      selected: filters.kind === kind,
    };
  });
}

/**
 * The category tabs of Video templates, References or Images: "All" then each category some item on this page
 * has, plus the selected one so a hand-typed URL still shows where it is. Counts are of this page, so
 * they are left out when there is a next page.
 */
export function templateCategoryTabsOf({
  filters,
  items,
  exact,
  customLabels,
  t,
  locale,
}: {
  filters: CatalogFilters;
  items: readonly AssetVersionView[];
  /** False when there is a next page, so a count of this page would be wrong. */
  exact: boolean;
  /** Names of the user-created categories this browser keeps (custom-categories.ts). */
  customLabels: ReadonlyMap<string, string>;
} & CatalogTabTexts): CatalogKindTab[] {
  const images = filters.section === 'images';
  const counts: ReadonlyMap<CatalogCategory, number> = images ? countImageCategories(items) : countTemplateCategories(items);
  const labelOf = (category: CatalogCategory): string => {
    const imageCategory = images ? imageCategoryFrom(category) : null;
    return imageCategory === null
      ? categoryLabelOf(category, t.categories.templateTypes, customLabels)
      : imageCategoryLabelOf(imageCategory, t.categories.imageCategories, customLabels);
  };
  const categories: (CatalogCategory | null)[] = [null, ...counts.keys()];
  if (filters.templateCategory !== null && !counts.has(filters.templateCategory)) categories.push(filters.templateCategory);
  return categories.map((category) => {
    const count = category === null ? items.length : (counts.get(category) ?? 0);
    return {
      id: templateCategoryTabId(category),
      label: category === null ? t.tabs.all : labelOf(category),
      count: exact ? formatNumber(count, locale) : null,
      href: templateCategoryTabHref(filters, category),
      selected: filters.templateCategory === category,
    };
  });
}
