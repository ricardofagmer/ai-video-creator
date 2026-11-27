import { Query } from '@nestjs/cqrs';
import { type AssetRef } from '@studio/shared/catalog';

/** The versions that still wait for a purpose; `refs.length` is the backfill count (C-P4 `missing`). */
export interface MissingPurposes {
  refs: readonly AssetRef[];
}

/**
 * ADR 0012 decision 9 (AP-12): each asset's latest version and its active version, once each,
 * whose `purposeSource` is `none` and whose `asset-purpose` job is not open. The backfill command
 * enqueues exactly this set, so the count the owner confirms and the jobs written cannot drift.
 * Read-only: nothing is copied or requested here.
 */
export class CountMissingPurposesQuery extends Query<MissingPurposes> {}
