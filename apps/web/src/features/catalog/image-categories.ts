import { type AssetVersionView } from '@studio/shared/api';
import { customCategoryFallbackLabel, customCategoryIdFrom, type CustomCategoryId } from './custom-categories';

/**
 * Category of an image in the Images section (docs/specs/2026-11-24-catalog-image-categories.md).
 * Every category is a `cat.<slug>` tag, the starter set included, so an old free tag such as `logos`
 * never puts an image in a category nobody picked. An image without one is `other` ("No category").
 */
export const imageCategoryNames = ['people', 'products', 'scenes', 'icons', 'logos'] as const;
export type ImageCategoryName = (typeof imageCategoryNames)[number];

export type ImageCategory = CustomCategoryId | 'other';

/** The names this browser gave its own image categories; References keep a separate list. */
export const IMAGE_CATEGORIES_COOKIE = 'studio_image_categories';

/** The starter set as tags, in tab order. */
export const imageBuiltInCategories: readonly CustomCategoryId[] = imageCategoryNames.map((name): CustomCategoryId => `cat.${name}`);

const builtInByTag: ReadonlyMap<string, ImageCategoryName> = new Map(imageCategoryNames.map((name) => [`cat.${name}`, name]));

/** The starter-set name behind a category, or null for a user-created one and for `other`. */
export function imageCategoryNameOf(category: ImageCategory): ImageCategoryName | null {
  return builtInByTag.get(category) ?? null;
}

/** URL and form values are untrusted input: only `other` and the `cat.<slug>` shape pass. */
export function imageCategoryFrom(value: string): ImageCategory | null {
  return value === 'other' ? 'other' : customCategoryIdFrom(value);
}

/** The first `cat.<slug>` tag wins; an image without one has no category. */
export function imageCategoryOfTags(tags: readonly string[]): ImageCategory {
  for (const tag of tags) {
    const category = customCategoryIdFrom(tag);
    if (category !== null) return category;
  }
  return 'other';
}

export function imageCategoryOf(version: AssetVersionView): ImageCategory {
  return imageCategoryOfTags(version.tags);
}

/** The tags with the category swapped in: any other `cat.*` tag is dropped, `other` leaves none. */
export function tagsWithImageCategory(tags: readonly string[], category: ImageCategory): string[] {
  const rest = tags.filter((tag) => customCategoryIdFrom(tag) === null);
  return category === 'other' ? rest : [...rest, category];
}

/** The category's name: the translated starter name, the name this browser keeps, or the slug. */
export function imageCategoryLabelOf(
  category: ImageCategory,
  builtInLabels: Readonly<Record<ImageCategoryName | 'other', string>>,
  customLabels: ReadonlyMap<string, string>,
): string {
  if (category === 'other') return builtInLabels.other;
  const name = imageCategoryNameOf(category);
  return name === null ? (customLabels.get(category) ?? customCategoryFallbackLabel(category)) : builtInLabels[name];
}

/**
 * Images per category in tab order, leaving out the categories no image has: the starter set, then the
 * user-created ones by id, then No category last.
 */
export function countImageCategories(versions: readonly AssetVersionView[]): Map<ImageCategory, number> {
  const counts = new Map<ImageCategory, number>();
  for (const version of versions) {
    const category = imageCategoryOf(version);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }
  const customs = [...counts.keys()].filter((category) => category !== 'other' && imageCategoryNameOf(category) === null).sort();
  const order: ImageCategory[] = [...imageBuiltInCategories, ...customs, 'other'];
  return new Map(
    order.flatMap((category) => {
      const count = counts.get(category);
      return count === undefined ? [] : [[category, count] as const];
    }),
  );
}

export interface ImageCategoryGroup {
  category: ImageCategory;
  versions: AssetVersionView[];
}

/** The library under one heading per category, in tab order; the api's order is kept inside each one. */
export function groupImagesByCategory(versions: readonly AssetVersionView[]): ImageCategoryGroup[] {
  return [...countImageCategories(versions).keys()].map((category) => ({
    category,
    versions: versions.filter((version) => imageCategoryOf(version) === category),
  }));
}
