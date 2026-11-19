import { ReviewVerdictSchema } from '@studio/shared/agents';
import { type AssetRef } from '@studio/shared/catalog';
import {
  RunFileError,
  readCostFile,
  readJsonFile,
  readQaSummary,
  readRunManifest,
  resolveInsideRun,
  type RunFileErrorCode,
} from '@studio/shared/run-files';
import {
  type QaMetrics,
  type QaReview,
  type QaSummary,
  type ReviewSubject,
  type RunFile,
  type Sha256,
} from '@studio/shared/run-format';
import { OutcomeEvidenceMissingError } from './outcomes.errors';

/** One catalog asset version the run used, with the hash its manifest pinned. */
export interface UsedAssetVersion {
  ref: AssetRef;
  contentHash: Sha256;
}

/** Per-criterion Reviewer scores; `evidence` text stays in the run folder, out of SQLite. */
export type CriterionScores =
  | { status: 'read'; scores: { criterionId: string; score: number }[] }
  | { status: 'unreadable'; problem: RunFileErrorCode };

export type ReviewerScore =
  | { status: 'recorded'; overall: number; criteria: CriterionScores }
  | { status: 'unavailable'; reason: string };

export type ReviewerScores = Partial<Record<ReviewSubject, ReviewerScore>>;

export type QaMetricsRecord =
  | { status: 'recorded'; outcome: QaSummary['outcome']; metrics: QaMetrics; checks: number; warnings: number }
  | { status: 'absent' };

export interface RunEvidence {
  assets: UsedAssetVersion[];
  reviewerScores: ReviewerScores;
  qaMetrics: QaMetricsRecord;
  costUsd: number;
}

/**
 * Asset versions the run used: every recipe binding and every brief reference pinned in
 * manifest.json (criterion 8), each counted once even when it fills two slots.
 */
async function readUsedAssets(runDir: string, run: RunFile): Promise<UsedAssetVersion[]> {
  const manifest = await readRunManifest(runDir);
  if (manifest.status === 'absent' || manifest.value.runId !== run.runId) {
    throw new OutcomeEvidenceMissingError(run.runId, 'manifest.json');
  }
  const used = new Map<AssetRef, UsedAssetVersion>();
  for (const pinned of [...manifest.value.assets, ...manifest.value.references]) {
    if (!used.has(pinned.ref)) used.set(pinned.ref, { ref: pinned.ref, contentHash: pinned.contentHash });
  }
  return [...used.values()];
}

/** C3 cost.json is the per-run source of truth (PRD 7.4); run.json totals cover a run that billed nothing. */
async function readCostUsd(runDir: string, run: RunFile): Promise<number> {
  const cost = await readCostFile(runDir);
  return cost.status === 'present' && cost.value.runId === run.runId ? cost.value.totalUsd : run.totals.costUsd;
}

async function readCriterionScores(runDir: string, verdictPath: string): Promise<CriterionScores> {
  try {
    const verdict = await readJsonFile(resolveInsideRun(runDir, verdictPath), ReviewVerdictSchema);
    return { status: 'read', scores: verdict.scores.map(({ criterionId, score }) => ({ criterionId, score })) };
  } catch (error) {
    // The summary's overall score is still recorded; a lost verdict file must not block the human decision.
    if (error instanceof RunFileError) return { status: 'unreadable', problem: error.code };
    throw error;
  }
}

async function readReviewerScore(runDir: string, review: QaReview): Promise<ReviewerScore> {
  if (review.status === 'unavailable') return { status: 'unavailable', reason: review.reason };
  return { status: 'recorded', overall: review.overall, criteria: await readCriterionScores(runDir, review.verdictPath) };
}

export async function readRunEvidence(runDir: string, run: RunFile): Promise<RunEvidence> {
  const [assets, costUsd, summary] = await Promise.all([
    readUsedAssets(runDir, run),
    readCostUsd(runDir, run),
    readQaSummary(runDir),
  ]);
  const reviewerScores: ReviewerScores = {};
  let qaMetrics: QaMetricsRecord = { status: 'absent' };
  if (summary.status === 'present' && summary.value.runId === run.runId) {
    const qa = summary.value;
    qaMetrics = { status: 'recorded', outcome: qa.outcome, metrics: qa.metrics, checks: qa.checks.length, warnings: qa.warnings.length };
    for (const review of qa.reviews) reviewerScores[review.subject] = await readReviewerScore(runDir, review);
  }
  return { assets, reviewerScores, qaMetrics, costUsd };
}
