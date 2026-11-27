import { ReviewVerdictSchema } from '@studio/shared/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { readOptionalJsonFile, readRunFile, resolveInsideRunReal } from '@studio/shared/run-files';
import {
  CheckResultSchema,
  checkResultPath,
  reviewVerdictPath,
  type CheckResult,
  type DeclaredOutput,
  type QaMetrics,
  type QaReview,
  type QaSummary,
  type ReviewSubject,
} from '@studio/shared/run-format';
import { clip } from '../../engine/text';
import { ReviewOutcomeSchema, type ReviewOutcome } from '../shared/stage-artifacts';
import { readOptionalStageInput, type StageOutputSink } from '../shared/stage-io';
import { stageTexts } from '../shared/stage-texts';

const SUBJECTS: readonly ReviewSubject[] = ['script', 'scenes', 'render'];

/** Output name of a verdict copy; the `output-schema` check parses it as a C7 ReviewVerdict. */
function reviewVerdictOutputName(subject: ReviewSubject): string {
  return `review-${subject}`;
}

/**
 * The verdict copies `qa/review-<subject>.json` as optional declared outputs (SPEC 0002 rev 4,
 * section 13.6, A30): a degraded review writes no verdict, so the copy may be absent; when written
 * it must be a non-empty file, and the `record` step hashes it.
 */
export function reviewVerdictOutputs(): DeclaredOutput[] {
  return SUBJECTS.map((subject) => ({
    name: reviewVerdictOutputName(subject),
    path: reviewVerdictPath(subject),
    mimeType: 'application/json',
    optional: true,
  }));
}
const MAX_WARNINGS = 50;
const WARNING_MAX_CHARS = 500;

export interface RecordedReviews {
  reviews: QaReview[];
  outcomes: Map<ReviewSubject, ReviewOutcome>;
}

/**
 * Copies each recorded Reviewer verdict to `qa/review-<subject>.json`, the path C3
 * `QaReview.verdictPath` names and core outcomes reads as a C7 ReviewVerdict. The copies are the
 * stage's optional declared outputs (`reviewVerdictOutputs`) and are written through the output
 * sink, so the brief lists them and the engine checks and hashes the ones that exist.
 */
export async function copyReviewVerdicts(context: StageExecutionContext, outputs: StageOutputSink): Promise<RecordedReviews> {
  const reviews: QaReview[] = [];
  const outcomes = new Map<ReviewSubject, ReviewOutcome>();
  for (const subject of SUBJECTS) {
    const outcome = await readOptionalStageInput(context, `review-${subject}-outcome`, ReviewOutcomeSchema);
    if (outcome === null) continue;
    outcomes.set(subject, outcome);
    if (outcome.status === 'unavailable') {
      reviews.push({ status: 'unavailable', subject, reason: outcome.reason });
      continue;
    }
    const name = reviewVerdictOutputName(subject);
    await outputs.writeJson(name, ReviewVerdictSchema, outcome.verdict);
    reviews.push({ status: 'recorded', subject, overall: outcome.verdict.overall, verdictPath: outputs.pathOf(name) });
  }
  return { reviews, outcomes };
}

/** The `qa` stage's check results at its last `verify` attempt, as the engine recorded them. */
export async function qaCheckResults(context: StageExecutionContext): Promise<CheckResult[]> {
  const run = await readRunFile(context.runDir);
  const stage = run.stages.find((candidate) => candidate.stageId === 'qa');
  const attempt = stage?.steps.find((step) => step.step === 'verify')?.attempts ?? 0;
  const checkIds = context.recipe.graph.stages.find((candidate) => candidate.stageId === 'qa')?.checks ?? [];
  if (stage === undefined || attempt < 1) return [];
  const results: CheckResult[] = [];
  for (const checkId of checkIds) {
    const location = { stageNumber: stage.number, stageId: stage.stageId, checkId, attempt };
    const read = await readOptionalJsonFile(await resolveInsideRunReal(context.runDir, checkResultPath(location)), CheckResultSchema);
    if (read.status === 'present') results.push(read.value);
  }
  return results;
}

export function qaSummaryOf(request: {
  context: StageExecutionContext;
  createdAt: Date;
  metrics: QaMetrics;
  checks: CheckResult[];
  reviews: QaReview[];
  planWarning: string | null;
}): QaSummary {
  const warnings: string[] = [];
  if (request.planWarning !== null) warnings.push(request.planWarning);
  for (const review of request.reviews) {
    if (review.status === 'unavailable') warnings.push(`${review.subject}: ${stageTexts.reviewerUnavailableWarning}`);
  }
  for (const check of request.checks) {
    if (check.outcome === 'skipped') warnings.push(`${check.checkId}: ${check.detail || check.measured}`);
    if (check.outcome === 'failed' || check.outcome === 'error') warnings.push(stageTexts.checkNotPassedWarning(check.checkId, check.expected, check.measured));
  }
  const clipped = warnings.slice(0, MAX_WARNINGS).map((warning) => clip(warning, WARNING_MAX_CHARS));
  return {
    runId: request.context.runId,
    createdAt: request.createdAt.toISOString(),
    outcome: clipped.length === 0 ? 'passed' : 'passed-with-warnings',
    metrics: request.metrics,
    checks: request.checks,
    reviews: request.reviews,
    warnings: clipped,
  };
}
