import { Command } from '@nestjs/cqrs';

/** C-P4 `POST purposes/backfill` answer: jobs written, and versions whose request failed. */
export interface PurposeBackfillOutcome {
  requested: number;
  failed: number;
}

/**
 * ADR 0012 decision 9 (AP-12, AP-13): the owner confirmed the backfill count on the catalog page,
 * so one `asset-purpose` job is requested for each version `CountMissingPurposesQuery` returns, at
 * most `PURPOSE_BACKFILL_MAX` per call. A failed request is counted, never thrown.
 */
export class RequestPurposeBackfillCommand extends Command<PurposeBackfillOutcome> {}
