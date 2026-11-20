import { Query } from '@nestjs/cqrs';
import { z } from 'zod';
import { RunIdSchema, RunStatusSchema } from '@studio/shared/run-format';
import { DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT } from '../../catalog';
import { type RunIndexEntry } from '../run-index.mapper';

/** rules/backend.md pagination (default 20, max 100); newest first, keyed by the time-ordered run id. */
export const ListRunsCriteriaSchema = z
  .object({
    statuses: z.array(RunStatusSchema).min(1).max(RunStatusSchema.options.length).optional(),
    limit: z.number().int().min(1).max(MAX_PAGE_LIMIT).default(DEFAULT_PAGE_LIMIT),
    /** The `nextCursor` of the previous page. */
    cursor: RunIdSchema.optional(),
  })
  .strict();
export type ListRunsCriteria = z.input<typeof ListRunsCriteriaSchema>;

export interface RunIndexPage {
  items: RunIndexEntry[];
  /** Matching runs in total, independent of the cursor. */
  total: number;
  nextCursor: string | null;
}

/** Reads the run index only; a run's live state is its run.json (files win). */
export class ListRunsQuery extends Query<RunIndexPage> {
  /** Validated by the handler. */
  constructor(readonly criteria: ListRunsCriteria) {
    super();
  }
}
