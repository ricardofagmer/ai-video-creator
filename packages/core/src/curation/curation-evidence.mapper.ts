import { type CuratorPacketInputs } from './curator-packet';

/** One reviewed run of the subject, as the packet carries it (SPEC 0005 section 5.3, L10). */
export type PacketRun = CuratorPacketInputs['outcomes']['runs'][number];

/** The `run_outcomes` columns the packet reads; never `notes`, which reach it only as evidence. */
export interface ReviewedRunRow {
  runId: string;
  decision: string;
  rating: number;
  reviewerScoresJson: string;
  qaMetricsJson: string;
  recoveries: number;
  costUsd: number;
}

function parsedJsonOrNull(text: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch {
    // An unreadable score column is evidence the run has no usable score, not a failure of the packet.
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The mean `overall` of the recorded Reviewer subjects; null when none was recorded. */
export function reviewerScoreOf(reviewerScoresJson: string): number | null {
  const scores = parsedJsonOrNull(reviewerScoresJson);
  if (!isRecord(scores)) return null;
  const overall: number[] = [];
  for (const score of Object.values(scores)) {
    if (isRecord(score) && score['status'] === 'recorded' && typeof score['overall'] === 'number' && Number.isFinite(score['overall'])) {
      overall.push(score['overall']);
    }
  }
  return overall.length === 0 ? null : overall.reduce((sum, value) => sum + value, 0) / overall.length;
}

/** L10: recorded `passed` or `passed-with-warnings` is a pass, any other recorded outcome a fail. */
export function qaOutcomeOf(qaMetricsJson: string): PacketRun['qaOutcome'] {
  const metrics = parsedJsonOrNull(qaMetricsJson);
  if (!isRecord(metrics) || metrics['status'] !== 'recorded') return 'not-run';
  return metrics['outcome'] === 'passed' || metrics['outcome'] === 'passed-with-warnings' ? 'pass' : 'fail';
}

function decisionOf(decision: string): PacketRun['decision'] {
  return decision === 'approved' || decision === 'rejected' ? decision : 'pending';
}

function ratingOf(rating: number): number | null {
  return Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : null;
}

export function toPacketRun(row: ReviewedRunRow): PacketRun {
  return {
    runId: row.runId,
    ownerRating: ratingOf(row.rating),
    reviewerScore: reviewerScoreOf(row.reviewerScoresJson),
    qaOutcome: qaOutcomeOf(row.qaMetricsJson),
    recoveries: Number.isInteger(row.recoveries) && row.recoveries >= 0 ? row.recoveries : 0,
    costUsd: Number.isFinite(row.costUsd) && row.costUsd >= 0 ? row.costUsd : 0,
    decision: decisionOf(row.decision),
  };
}
