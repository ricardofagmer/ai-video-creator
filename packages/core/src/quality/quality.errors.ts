/** Error taxonomy category (rules/observability.md). */
export type QualityErrorCategory = 'internal';

/**
 * Base of every quality-score domain error (SPEC 0003 section 5.1). Messages carry run ids and
 * column names only, never ratings, review notes or reviewer names.
 */
export abstract class QualityError extends Error {
  abstract readonly category: QualityErrorCategory;
}

/**
 * A `run_outcomes` evidence column that the outcome recorder did not write in its C3 shape. The
 * recomputation stops instead of scoring the catalog from a guessed value; the decision itself is
 * on disk and the next trigger retries.
 */
export class QualityOutcomeCorruptError extends QualityError {
  override readonly category = 'internal';

  constructor(
    readonly runId: string,
    readonly column: 'reviewer_scores_json' | 'qa_metrics_json',
  ) {
    super(`Outcome of run ${runId} has an unreadable ${column}; the quality scores were not recomputed`);
    this.name = 'QualityOutcomeCorruptError';
  }
}

/**
 * A `platform_metric_snapshots` row outside the shared `PlatformMetrics` contract (SPEC 0006
 * section 5.4). The recomputation stops instead of scoring from a guessed number; the message names
 * the publication id only, never a metric value.
 */
export class QualitySnapshotCorruptError extends QualityError {
  override readonly category = 'internal';

  constructor(readonly publicationId: string) {
    super(`A metric snapshot of publication ${publicationId} is unreadable; the quality scores were not recomputed`);
    this.name = 'QualitySnapshotCorruptError';
  }
}
