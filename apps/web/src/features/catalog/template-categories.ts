import { type AssetVersionView } from '@studio/shared/api';
import { customCategoryFallbackLabel, customCategoryIdFrom, type CustomCategoryId } from './custom-categories';

/**
 * Content category of a template or a reference, shown as sub-tabs inside Video templates and
 * References. C1 has no category field, so it comes from the item's tags: the first tag that names a
 * known category wins, any other item is `other`. The order here is the order of the tabs.
 */
export const templateCategories = ['hook', 'title', 'tool-demo', 'ai-battle', 'automation', 'product-tour', 'other'] as const;
export type TemplateCategory = (typeof templateCategories)[number];

/** A built-in category or one the user created (custom-categories.ts). */
export type CatalogCategory = TemplateCategory | CustomCategoryId;

const taggedCategories: ReadonlySet<string> = new Set(templateCategories.filter((category) => category !== 'other'));

const templateCategoryNames: readonly string[] = templateCategories;

function isTemplateCategory(value: string): value is TemplateCategory {
  return templateCategoryNames.includes(value);
}

/** URL values are untrusted input: anything outside the closed list or the `cat.<slug>` shape is dropped. */
export function templateCategoryFrom(value: string): CatalogCategory | null {
  return isTemplateCategory(value) ? value : customCategoryIdFrom(value);
}

/** The first tag naming a built-in or a user-created category wins; any other item is `other`. */
export function templateCategoryOf(version: AssetVersionView): CatalogCategory {
  for (const tag of version.tags) {
    if (taggedCategories.has(tag) && isTemplateCategory(tag)) return tag;
    const custom = customCategoryIdFrom(tag);
    if (custom !== null) return custom;
  }
  return 'other';
}

/** The category's name: the built-in label, the name this browser keeps, or the slug as a fallback. */
export function categoryLabelOf(
  category: CatalogCategory,
  builtInLabels: Readonly<Record<TemplateCategory, string>>,
  customLabels: ReadonlyMap<string, string>,
): string {
  return isTemplateCategory(category) ? builtInLabels[category] : (customLabels.get(category) ?? customCategoryFallbackLabel(category));
}

/**
 * Items per category in tab order, leaving out the categories no item has: the built-in ones, then the
 * user-created ones by id, then Other last.
 */
export function countTemplateCategories(versions: readonly AssetVersionView[]): Map<CatalogCategory, number> {
  const counts = new Map<CatalogCategory, number>();
  for (const version of versions) {
    const category = templateCategoryOf(version);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const customs = [...counts.keys()].filter((category) => !isTemplateCategory(category)).sort();
  const builtIns = templateCategories.filter((category) => category !== 'other');
  const order: CatalogCategory[] = [...builtIns, ...customs, 'other'];
  return new Map(order.flatMap((category) => {
    const count = counts.get(category);
    return count === undefined ? [] : [[category, count] as const];
  }));
}

export function templateCategoryTabId(category: CatalogCategory | null): string {
  return category === null ? 'catalogo-categoria-todos' : `catalogo-categoria-${category}`;
}

export const TEMPLATE_CATEGORY_PANEL_ID = 'catalogo-categoria-painel';
