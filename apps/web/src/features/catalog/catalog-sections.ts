import { type AssetVersionView } from '@studio/shared/api';
import { type AssetKind } from '@studio/shared/catalog';
import { isSiteReference } from './site-link-draft';

/**
 * The sections of `/catalogo` (docs/specs/2026-11-23-catalog-sections-and-link-embed-design.md). They group
 * the nine kinds by what the owner does with them, so the page never shows nine tabs in a row. Images and
 * Prompts have their own sections since docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md.
 * Sites (docs/specs/2026-11-23-site-analysis-design.md) are references with `subKind: 'website'`, so two
 * sections share the `reference` kind and `versionInSection` tells them apart.
 */
export type CatalogSection = 'references' | 'sites' | 'templates' | 'images' | 'prompts' | 'ai-writing' | 'media-brand';

/** References first: keeping video references is the catalog's main job. */
export const catalogSections: readonly CatalogSection[] = ['references', 'sites', 'templates', 'images', 'prompts', 'ai-writing', 'media-brand'];

export const DEFAULT_CATALOG_SECTION: CatalogSection = 'references';

const sectionKinds: Record<CatalogSection, readonly AssetKind[]> = {
  references: ['reference'],
  sites: ['reference'],
  templates: ['template'],
  images: ['image'],
  prompts: ['prompt'],
  'ai-writing': ['ai-model', 'skill'],
  'media-brand': ['music', 'sfx', 'brand-kit'],
};

/** `?secao=` values: Portuguese, like the other catalog URL parameters. */
const sectionSlugs: Record<CatalogSection, string> = {
  references: 'referencias',
  sites: 'sites',
  templates: 'modelos',
  images: 'imagens',
  prompts: 'prompts',
  'ai-writing': 'ia-e-escrita',
  'media-brand': 'midia-e-marca',
};

export function kindsOfSection(section: CatalogSection): readonly AssetKind[] {
  return sectionKinds[section];
}

/** The single kind of a one-kind section (References, Sites, Video templates, Images, Prompts); null for the others. */
export function onlyKindOfSection(section: CatalogSection): AssetKind | null {
  const kinds = sectionKinds[section];
  return kinds.length === 1 ? (kinds[0] ?? null) : null;
}

/** A kind's first section: `reference` opens References, never Sites. */
export function sectionOfKind(kind: AssetKind): CatalogSection {
  return catalogSections.find((section) => sectionKinds[section].includes(kind)) ?? DEFAULT_CATALOG_SECTION;
}

/**
 * The search cannot filter by subtype, so the sections that share `reference` split it here: Sites keeps
 * the website references, References keeps every other one.
 */
export function versionInSection(section: CatalogSection, version: AssetVersionView): boolean {
  if (!sectionKinds[section].includes(version.kind)) return false;
  if (section === 'sites') return isSiteReference(version);
  if (section === 'references') return !isSiteReference(version);
  return true;
}

export function catalogSectionSlug(section: CatalogSection): string {
  return sectionSlugs[section];
}

/** `?secao=` is untrusted input: only a known slug picks a section. */
export function catalogSectionFrom(slug: string): CatalogSection | null {
  return catalogSections.find((section) => sectionSlugs[section] === slug) ?? null;
}

export const CATALOG_KIND_PANEL_ID = 'catalogo-tipo-painel';

export function catalogSectionTabId(section: CatalogSection): string {
  return `catalogo-secao-${sectionSlugs[section]}`;
}

/**
 * Sections whose items are sorted into content categories (hook, title, …) by tag: Video templates,
 * and References since docs/specs/2026-11-23-reference-link-save-and-categories-design.md.
 */
export function sectionHasCategories(section: CatalogSection): boolean {
  return section === 'templates' || section === 'references';
}
