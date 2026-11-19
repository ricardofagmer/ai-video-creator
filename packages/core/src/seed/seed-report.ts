import { type Sha256 } from '@studio/shared/catalog';

/** What a seed entry writes: a catalog asset version or a recipe version. */
export type SeedTarget = 'asset' | 'recipe';

/** A failure reduced to safe fields: error name, taxonomy category and a path-free message. */
export interface SeedFailure {
  code: string;
  category: 'validation' | 'not_found' | 'conflict' | 'internal';
  message: string;
}

/**
 * One line of the seed report (SPEC 0002 R1-07). `created`: a new version was saved (version 1
 * on a first seed). `unchanged`: a version with the same content hash already exists, so nothing
 * was written. `failed`: this entry only; the other entries still ran.
 */
export type SeedEntryResult =
  | { outcome: 'created'; entryId: string; target: SeedTarget; ref: string; contentHash: Sha256 }
  | { outcome: 'unchanged'; entryId: string; target: SeedTarget; ref: string; contentHash: Sha256 }
  | { outcome: 'failed'; entryId: string; target: SeedTarget; failure: SeedFailure };

export type OptionalSeedFolderState = 'absent' | 'empty' | 'loaded';

export interface SeedReport {
  entries: SeedEntryResult[];
  /** The R1-15 folders; absent or empty is a normal state, not a failure. */
  optionalFolders: { recipes: OptionalSeedFolderState; prompts: OptionalSeedFolderState };
  counts: { created: number; unchanged: number; failed: number };
}

export function countOutcomes(entries: readonly SeedEntryResult[]): SeedReport['counts'] {
  const counts = { created: 0, unchanged: 0, failed: 0 };
  for (const entry of entries) counts[entry.outcome] += 1;
  return counts;
}
