import { type AssetVersionView } from '@studio/shared/api';
import { type CatalogSection } from './catalog-sections';
import { imageCategoryFrom, imageCategoryOf } from './image-categories';
import { templateCategoryFrom, templateCategoryOf, type CatalogCategory } from './template-categories';

/**
 * Images have their own category list (image-categories.ts); Video templates and References share the
 * template one. Both fit `CatalogCategory`: an image category is `other` or a `cat.<slug>` id.
 */
export function sectionCategoryFrom(section: CatalogSection, value: string): CatalogCategory | null {
  return section === 'images' ? imageCategoryFrom(value) : templateCategoryFrom(value);
}

export function sectionCategoryOf(section: CatalogSection, version: AssetVersionView): CatalogCategory {
  return section === 'images' ? imageCategoryOf(version) : templateCategoryOf(version);
}
