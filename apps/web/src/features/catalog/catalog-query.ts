import { type AssetVersionView } from '@studio/shared/api';
import { AssetKindSchema, AssetStatusSchema, type AssetKind, type AssetStatus } from '@studio/shared/catalog';

/** Rev 3 (SPEC 0003 section 4.3): `?ordem=nota` sorts by `qualityScore`, absent keeps the recent order. */
export type CatalogSort = 'recent' | 'quality';

/** `?modo=significado` switches to search by meaning; its query text never goes in the URL. */
export type CatalogMode = 'words' | 'meaning';

/**
 * URL filters of `/catalogo` (design/telas/02): `?q=`, `?tipo=`, `?status=`, plus the page cursor.
 * Rev 3 adds `?ordem=`, `?nota-min=` (1..5) and `?execucoes-min=` (>= 1) for the lexical list, and
 * `?modo=` for the search mode.
 */
export interface CatalogFilters {
  mode: CatalogMode;
  text: string;
  kind: AssetKind | null;
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

/** URL values are untrusted input: each is narrowed with its C1/C10 shape or dropped. */
export function catalogFiltersFrom(searchParams: SearchParams): CatalogFilters {
  const kind = AssetKindSchema.safeParse(single(searchParams.tipo));
  const status = AssetStatusSchema.safeParse(single(searchParams.status));
  const cursor = single(searchParams.cursor);
  return {
    mode: single(searchParams.modo) === 'significado' ? 'meaning' : 'words',
    text: single(searchParams.q).trim().slice(0, 200),
    kind: kind.success ? kind.data : null,
    status: status.success ? status.data : null,
    sort: single(searchParams.ordem) === 'nota' ? 'quality' : 'recent',
    minQuality: choiceFrom(single(searchParams['nota-min']), minQualityChoices),
    minSampleSize: choiceFrom(single(searchParams['execucoes-min']), minSampleSizeChoices),
    // C10 rev 3: an opaque token from `nextCursor`.
    cursor: /^[A-Za-z0-9._-]{1,64}$/.test(cursor) ? cursor : null,
  };
}

export function hasActiveFilters(filters: CatalogFilters): boolean {
  return filters.text !== '' || filters.kind !== null || filters.status !== null || filters.minQuality !== null || filters.minSampleSize !== null;
}

/** `/catalogo?…` for a set of filters (empty and default values are left out). */
export function catalogHref(filters: Partial<CatalogFilters>): string {
  const parameters = new URLSearchParams();
  if (filters.mode === 'meaning') parameters.set('modo', 'significado');
  if (filters.text) parameters.set('q', filters.text);
  if (filters.kind) parameters.set('tipo', filters.kind);
  if (filters.status) parameters.set('status', filters.status);
  if (filters.sort === 'quality') parameters.set('ordem', 'nota');
  if (filters.minQuality) parameters.set('nota-min', String(filters.minQuality));
  if (filters.minSampleSize) parameters.set('execucoes-min', String(filters.minSampleSize));
  if (filters.cursor) parameters.set('cursor', filters.cursor);
  const query = parameters.toString();
  return query === '' ? '/catalogo' : `/catalogo?${query}`;
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
