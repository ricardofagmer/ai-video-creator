import { z } from 'zod';
import { type QualityScoreRun } from '@studio/shared/catalog';
import { QualityOutcomeCorruptError } from './quality.errors';

/**
 * The parts of the outcome recorder's evidence JSON (`outcomes/run-evidence.ts`) the score reads.
 * Other fields pass through unread, so a richer record written later still parses.
 */
const ReviewerScoreColumnSchema = z.discriminatedUnion('status', [
  z.object({ status: z.literal('recorded'), overall: z.number().finite().min(1).max(5) }).passthrough(),
  z.object({ status: z.literal('unavailable') }).passthrough(),
]);
const ReviewerScoresColumnSchema = z.record(z.string(), ReviewerScoreColumnSchema);

function isEmptyObject(value: unknown): boolean {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.keys(value).length === 0;
}

const QaMetricsColumnSchema = z.preprocess(
  // `{}` is the column default, for a row written without QA evidence.
  (value) => (isEmptyObject(value) ? { status: 'absent' } : value),
  z.discriminatedUnion('status', [
    z.object({ status: z.literal('recorded'), outcome: z.enum(['passed', 'passed-with-warnings']) }).passthrough(),
    z.object({ status: z.literal('absent') }).passthrough(),
  ]),
);

/** One `run_outcomes` row as the quality repository reads it. */
export interface OutcomeEvidenceRow {
  runId: string;
  rating: number;
  reviewerScoresJson: string;
  qaMetricsJson: string;
  recoveries: number;
}

function parseColumn<Schema extends z.ZodTypeAny>(
  schema: Schema,
  text: string,
  failure: () => QualityOutcomeCorruptError,
): z.output<Schema> {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    // The syntax error adds nothing the run id and column do not already say.
    throw failure();
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) throw failure();
  return parsed.data;
}

/** `rev_i` of section 5.1: the mean `overall` over the subjects with status `recorded`; null when none. */
function reviewerOverall(row: OutcomeEvidenceRow): number | null {
  const scores = parseColumn(ReviewerScoresColumnSchema, row.reviewerScoresJson, () => new QualityOutcomeCorruptError(row.runId, 'reviewer_scores_json'));
  const recorded: number[] = [];
  for (const score of Object.values(scores)) {
    if (score.status === 'recorded') recorded.push(score.overall);
  }
  if (recorded.length === 0) return null;
  return recorded.reduce((sum, overall) => sum + overall, 0) / recorded.length;
}

/** `q_i` of section 5.1: the QA summary outcome, or `absent`. */
function qaOutcome(row: OutcomeEvidenceRow): QualityScoreRun['qaOutcome'] {
  const qa = parseColumn(QaMetricsColumnSchema, row.qaMetricsJson, () => new QualityOutcomeCorruptError(row.runId, 'qa_metrics_json'));
  return qa.status === 'recorded' ? qa.outcome : 'absent';
}

/**
 * One reviewed run as the shared formula's input (`QualityScoreRun`). `platformSignal` is the run's
 * `p_i` from `runPlatformSignals`, or null when it has none (SPEC 0006 section 5.4).
 */
export function toQualityScoreRun(row: OutcomeEvidenceRow, platformSignal: number | null): QualityScoreRun {
  return {
    rating: row.rating,
    reviewerOverall: reviewerOverall(row),
    qaOutcome: qaOutcome(row),
    recoveries: row.recoveries,
    platformSignal,
  };
}
