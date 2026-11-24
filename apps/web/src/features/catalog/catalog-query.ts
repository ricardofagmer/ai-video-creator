import { type AssetVersionView } from '@studio/shared/api';
import { AssetKindSchema, AssetStatusSchema, type AssetKind, type AssetStatus } from '@studio/shared/catalog';
import {
  DEFAULT_CATALOG_SECTION,
  catalogSectionFrom,
  catalogSectionSlug,
  onlyKindOfSection,
  sectionHasCategories,
  sectionOfKind,
  type CatalogSection,
} from './catalog-sections';
import { templateCategoryFrom, type CatalogCategory } from './template-categories';

/** Rev 3 (SPEC 0003 section 4.3): `?ordem=nota` sorts by `qualityScore`, absent keeps the recent order. */
export type CatalogSort = 'recent' | 'quality';

/** `?modo=significado` switches to search by meaning; its query text never goes in the URL. */
export type CatalogMode = 'words' | 'meaning';

/**
 * URL filters of `/catalogo` (design/telas/02): `?q=`, `?tipo=`, `?status=`, plus the page cursor.
 * Rev 3 adds `?ordem=`, `?nota-min=` (1..5) and `?execucoes-min=` (>= 1) for the lexical list, and
 * `?modo=` for the search mode. `?secao=` picks one of the four sections; `?tipo=` picks a kind inside
 * a section with several kinds (null = all of the section's kinds). `?categoria=` picks a content
 * category tab and lives only in the sections that have them (Video templates and References).
 */
export interface CatalogFilters {
  mode: CatalogMode;
  text: string;
  section: CatalogSection;
  kind: AssetKind | null;
  templateCategory: CatalogCategory | null;
  status: AssetStatus | null;
  sort: CatalogSort;
  minQuality: number | null;
  minSampleSize: number | null;
  cursor: string | null;
}

type SearchParams = Readonly<Record<string, string | string[] | undefined>>;

/** The choices the filter bar offers; any other URL value is dropped. */
export const minQualityChoices: readonly number[] = [2, 3, 3.5, 4, 4.5];
export const minSampleSizeChoices: readonly number[] = [1, 3, 5, 10];

function single(value: string | string[] | undefined): string {
  return typeof value === 'string' ? value : '';
}

function choiceFrom(value: string, choices: readonly number[]): number | null {
  if (!/^[0-9]{1,2}(\.[0-9])?$/.test(value)) return null;
  const number = Number.parseFloat(value);
  return choices.includes(number) ? number : null;
}

/**
 * `?secao=` wins and a kind outside it is dropped; without it the kind picks its section, so links from
 * before the sections keep working. A one-kind section needs no kind: it is implied.
 */
function sectionAndKindFrom(searchParams: SearchParams): { section: CatalogSection; kind: AssetKind | null } {
  const parsedKind = AssetKindSchema.safeParse(single(searchParams.tipo));
  const kind = parsedKind.success ? parsedKind.data : null;
  const section = catalogSectionFrom(single(searchParams.secao)) ?? (kind === null ? DEFAULT_CATALOG_SECTION : sectionOfKind(kind));
  const keepsKind = kind !== null && sectionOfKind(kind) === section && onlyKindOfSection(section) === null;
  return { section, kind: keepsKind ? kind : null };
}

/** URL values are untrusted input: each is narrowed with its C1/C10 shape or dropped. */
export function catalogFiltersFrom(searchParams: SearchParams): CatalogFilters {
  const { section, kind } = sectionAndKindFrom(searchParams);
  const status = AssetStatusSchema.safeParse(single(searchParams.status));
  const cursor = single(searchParams.cursor);
  return {
    mode: single(searchParams.modo) === 'significado' ? 'meaning' : 'words',
    text: single(searchParams.q).trim().slice(0, 200),
    section,
    kind,
    templateCategory: sectionHasCategories(section) ? templateCategoryFrom(single(searchParams.categoria)) : null,
    status: status.success ? status.data : null,
    sort: single(searchParams.ordem) === 'nota' ? 'quality' : 'recent',
    minQuality: choiceFrom(single(searchParams['nota-min']), minQualityChoices),
    minSampleSize: choiceFrom(single(searchParams['execucoes-min']), minSampleSizeChoices),
    // C10 rev 3: an opaque token from `nextCursor`.
    cursor: /^[A-Za-z0-9._-]{1,64}$/.test(cursor) ? cursor : null,
  };
}

/** Filters other than the kind, which the tabs own (design/telas/02); the sort filters nothing out. */
export function hasNonKindFilters(filters: CatalogFilters): boolean {
  return filters.text !== '' || filters.status !== null || filters.minQuality !== null || filters.minSampleSize !== null;
}

/**
 * `/catalogo?…` for a set of filters (empty and default values are left out). A kind implies its
 * section, so `?secao=` is written only without a kind; a one-kind section writes its section only.
 */
export function catalogHref(filters: Partial<CatalogFilters>): string {
  const parameters = new URLSearchParams();
  const kind = filters.kind ?? null;
  const section = kind === null ? (filters.section ?? DEFAULT_CATALOG_SECTION) : sectionOfKind(kind);
  const writesKind = kind !== null && onlyKindOfSection(section) === null;
  if (filters.mode === 'meaning') parameters.set('modo', 'significado');
  if (filters.text) parameters.set('q', filters.text);
  if (writesKind) parameters.set('tipo', kind);
  else if (section !== DEFAULT_CATALOG_SECTION) parameters.set('secao', catalogSectionSlug(section));
  if (sectionHasCategories(section) && filters.templateCategory) parameters.set('categoria', filters.templateCategory);
  if (filters.status) parameters.set('status', filters.status);
  if (filters.sort === 'quality') parameters.set('ordem', 'nota');
  if (filters.minQuality) parameters.set('nota-min', String(filters.minQuality));
  if (filters.minSampleSize) parameters.set('execucoes-min', String(filters.minSampleSize));
  if (filters.cursor) parameters.set('cursor', filters.cursor);
  const query = parameters.toString();
  return query === '' ? '/catalogo' : `/catalogo?${query}`;
}

/**
 * The link of a kind tab (`null` = all of the current section's kinds): a kind moves to its section,
 * the other filters stay, the page cursor resets. Search by meaning keeps only what
 * `CatalogModeSwitch` carries (its query text never goes in the URL).
 */
export function catalogTabHref(filters: CatalogFilters, kind: AssetKind | null): string {
  const section = kind === null ? filters.section : sectionOfKind(kind);
  if (filters.mode === 'meaning') return catalogHref({ mode: 'meaning', section, kind, status: filters.status });
  return catalogHref({ ...filters, section, kind, templateCategory: null, cursor: null });
}

/** The link of a section tab: the section's kinds all show, the other filters stay, the cursor resets. */
export function catalogSectionTabHref(filters: CatalogFilters, section: CatalogSection): string {
  if (filters.mode === 'meaning') return catalogHref({ mode: 'meaning', section, status: filters.status });
  return catalogHref({ ...filters, section, kind: null, templateCategory: null, cursor: null });
}

/** The link of a category tab (`null` = all of the section): the other filters stay, the cursor resets. */
export function templateCategoryTabHref(filters: CatalogFilters, templateCategory: CatalogCategory | null): string {
  return catalogHref({ ...filters, kind: null, templateCategory, cursor: null });
}

/**
 * design/telas/02: each card shows the asset's active version, or its newest one when none is
 * active. The search answers versions, so they are folded per asset id, keeping the api's order.
 * Sorted by score, versions are not folded: the score belongs to one version, and folding could
 * put a lower-scored active version where its higher-scored sibling ranked.
 */
export function representativeVersions(versions: readonly AssetVersionView[]): AssetVersionView[] {
  const chosen = new Map<string, AssetVersionView>();
  for (const version of versions) {
    const current = chosen.get(version.id);
    if (current === undefined) {
      chosen.set(version.id, version);
      continue;
    }
    const currentWins = current.status === 'active' || (version.status !== 'active' && current.version > version.version);
    if (!currentWins) chosen.set(version.id, version);
  }
  return [...chosen.values()];
}
