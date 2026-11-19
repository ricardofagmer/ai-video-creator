import { type Prisma } from '@prisma/client';
import { z } from 'zod';
import { InvalidAssetInputError } from './catalog.errors';

/**
 * Catalog list order (SPEC 0003 section 4.3). `recent` is the rev 2 order (row id ascending, numeric
 * cursor), so every R1 caller keeps its pages. `quality` orders by `qualityScore` descending, ties
 * by row id descending, null scores last.
 */
const VersionSortSchema = z.enum(['recent', 'quality']);
export type VersionSort = z.infer<typeof VersionSortSchema>;

/** Opaque to callers: only a value returned as `nextCursor` is accepted back. */
export const PageCursorSchema = z.string().regex(/^[A-Za-z0-9._-]{1,64}$/, 'cursor comes from nextCursor only');

/** Optional rev 3 fields shared by the search and list criteria; absent means the rev 2 behaviour. */
export const versionOrderShape = {
  sort: VersionSortSchema.default('recent'),
  /** Excludes null scores (R2-AC-04). */
  minQuality: z.number().finite().min(1).max(5).optional(),
  minSampleSize: z.number().int().min(1).max(1_000_000).optional(),
};

export interface QualityFilter {
  minQuality: number | null;
  minSampleSize: number | null;
}

/** Where the next page starts, per order; `null` position fields mean the first page. */
export type VersionKeyset =
  | { sort: 'recent'; afterRowId: number | null }
  | { sort: 'quality'; after: { score: number | null; rowId: number } | null };

const RECENT_CURSOR = /^[1-9][0-9]{0,14}$/;
const QUALITY_CURSOR = /^q(n|[0-9]{1,2}(?:\.[0-9]{1,20})?)_([1-9][0-9]{0,14})$/;

function invalidCursor(): InvalidAssetInputError {
  return new InvalidAssetInputError([{ path: 'cursor', message: 'cursor comes from nextCursor only' }]);
}

function parseRowId(text: string): number {
  const rowId = Number.parseInt(text, 10);
  if (!Number.isSafeInteger(rowId)) throw invalidCursor();
  return rowId;
}

/** A cursor from another order, or one not produced by `encodeVersionCursor`, is a validation error. */
export function decodeVersionCursor(sort: VersionSort, cursor: string | undefined): VersionKeyset {
  if (sort === 'recent') {
    if (cursor === undefined) return { sort, afterRowId: null };
    if (!RECENT_CURSOR.test(cursor)) throw invalidCursor();
    return { sort, afterRowId: parseRowId(cursor) };
  }
  if (cursor === undefined) return { sort, after: null };
  const match = QUALITY_CURSOR.exec(cursor);
  if (match === null || match[1] === undefined || match[2] === undefined) throw invalidCursor();
  const rowId = parseRowId(match[2]);
  if (match[1] === 'n') return { sort, after: { score: null, rowId } };
  const score = Number.parseFloat(match[1]);
  if (!Number.isFinite(score) || score < 1 || score > 5) throw invalidCursor();
  return { sort, after: { score, rowId } };
}

/**
 * The cursor of the row a page ended on. A quality cursor carries the score as `String(score)`,
 * which parses back to the same double, so equal scores stay ordered by row id across pages.
 */
export function encodeVersionCursor(sort: VersionSort, row: { id: number; qualityScore: number | null }): string {
  if (sort === 'recent') return String(row.id);
  return `q${row.qualityScore === null ? 'n' : String(row.qualityScore)}_${row.id}`;
}

export function versionOrderBy(sort: VersionSort): Prisma.AssetVersionOrderByWithRelationInput[] {
  if (sort === 'recent') return [{ id: 'asc' }];
  return [{ qualityScore: { sort: 'desc', nulls: 'last' } }, { id: 'desc' }];
}

/** Rows strictly after the keyset position in its order; `null` when the page is the first. */
export function versionKeysetWhere(position: VersionKeyset): Prisma.AssetVersionWhereInput | null {
  if (position.sort === 'recent') return position.afterRowId === null ? null : { id: { gt: position.afterRowId } };
  if (position.after === null) return null;
  const { score, rowId } = position.after;
  if (score === null) return { qualityScore: null, id: { lt: rowId } };
  return { OR: [{ qualityScore: { lt: score } }, { qualityScore: score, id: { lt: rowId } }, { qualityScore: null }] };
}

/** `minQuality` keeps scored rows only; `minSampleSize` counts reviewed runs. */
export function qualityFilterWhere(filter: QualityFilter): Prisma.AssetVersionWhereInput[] {
  const conditions: Prisma.AssetVersionWhereInput[] = [];
  if (filter.minQuality !== null) conditions.push({ qualityScore: { not: null, gte: filter.minQuality } });
  if (filter.minSampleSize !== null) conditions.push({ qualitySampleSize: { gte: filter.minSampleSize } });
  return conditions;
}
