import { type ComparisonArmView, type ComparisonView } from '@studio/shared/api';
import { displayedRunStatus, type ComparisonSubject, type ReviewSubject, type RunStatus } from '@studio/shared/run-format';
import { type LoadedArm } from './comparison-runs.reader';
import { boundRefOf } from './comparison-verification';

/**
 * One arm as core gives it. `artifactAccess` is added by the api, which owns the rev 4 artifact
 * rule of `GET /runs/:runId` (R2-06); everything else is the C10 `ComparisonArmView`.
 */
export type ComparisonArmDetail = Omit<ComparisonArmView, 'artifactAccess'>;

/** `ComparisonView` without the api-owned `artifactAccess` of each arm. */
export interface ComparisonDetail extends Omit<ComparisonView, 'arms'> {
  arms: { a: ComparisonArmDetail; b: ComparisonArmDetail };
}

export type ComparisonStatus = ComparisonView['status'];
export type ComparedVersionScore = ComparisonArmView['comparedVersionScore'];

const REVIEWED_STATUSES: ReadonlySet<RunStatus> = new Set<RunStatus>(['review', 'approved', 'rejected']);

function armStatus(arm: LoadedArm): RunStatus {
  return displayedRunStatus(arm.run.state, arm.watcherAlive);
}

function isIncomplete(arm: LoadedArm): boolean {
  const status = armStatus(arm);
  return status === 'failed' || (status === 'rejected' && !arm.hasManifest);
}

function isReady(arm: LoadedArm): boolean {
  return REVIEWED_STATUSES.has(armStatus(arm)) && arm.hasManifest;
}

/**
 * Section 5.3 "Side-by-side view": `draft` while both runs are `draft`; `incomplete` when either is
 * `failed`, or `rejected` without a manifest; `ready` when both are `review`, `approved` or
 * `rejected` with a `manifest.json`; `running` otherwise.
 */
export function comparisonStatusOf(armA: LoadedArm, armB: LoadedArm): ComparisonStatus {
  if (armStatus(armA) === 'draft' && armStatus(armB) === 'draft') return 'draft';
  if (isIncomplete(armA) || isIncomplete(armB)) return 'incomplete';
  if (isReady(armA) && isReady(armB)) return 'ready';
  return 'running';
}

/**
 * The compared version this arm actually ran, read from its frozen recipe so a wrong variant shows
 * as what it is. A missing slot falls back to the link's subject; `verified` then reports it.
 */
export function comparedRefOf(subject: ComparisonSubject, arm: LoadedArm): string {
  if (subject.kind === 'recipe-version') return arm.run.recipe.ref;
  return boundRefOf(arm.run.recipe.definition, subject.slot) ?? (arm.arm === 'a' ? subject.a : subject.b);
}

/** Reviewer `overall` per subject from `qa/summary.json`; the last recorded verdict of a subject wins. */
function reviewerScoresOf(arm: LoadedArm): ComparisonArmDetail['reviewerScores'] {
  const bySubject = new Map<ReviewSubject, number>();
  for (const review of arm.qa?.reviews ?? []) {
    if (review.status === 'recorded') bySubject.set(review.subject, review.overall);
  }
  return [...bySubject].map(([subject, overall]) => ({ subject, overall }));
}

export function toArmDetail(arm: LoadedArm, comparedRef: string, comparedVersionScore: ComparedVersionScore): ComparisonArmDetail {
  return {
    arm: arm.arm,
    runId: arm.runId,
    status: armStatus(arm),
    recipe: { ref: arm.run.recipe.ref, contentHash: arm.run.recipe.contentHash },
    comparedRef,
    costUsd: arm.costUsd,
    durationMs: arm.run.totals.durationMs,
    recoveries: arm.run.totals.recoveries,
    qa: arm.qa === null ? null : { outcome: arm.qa.outcome, warnings: arm.qa.warnings.length },
    reviewerScores: reviewerScoresOf(arm),
    decision: arm.finalDecision,
    comparedVersionScore,
  };
}
