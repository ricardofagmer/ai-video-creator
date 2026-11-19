import { readApprovalFile, writeApprovalFile } from '@studio/shared/run-files';
import { type ApprovalFile, type GateDecision } from '@studio/shared/run-format';
import { ApprovalFileFullError, ReviewRunMismatchError } from './review.errors';
import { type LoadedRun } from './review-run-access';

/** C3 `ApprovalFileSchema` holds at most this many decisions. */
export const MAX_APPROVAL_DECISIONS = 100;

/** approval.json as it is now; absent reads as an empty decision list for the run. */
export async function readApproval(loaded: LoadedRun): Promise<ApprovalFile> {
  const approval = await readApprovalFile(loaded.runDir);
  if (approval.status === 'absent') return { runId: loaded.runId, decisions: [] };
  if (approval.value.runId !== loaded.runId) throw new ReviewRunMismatchError(loaded.runId, approval.value.runId, 'approval.json');
  return approval.value;
}

/**
 * Appends one gate decision through C5 (validated, tmp + rename). Earlier decisions stay: the one
 * with the latest `decidedAt` for a gate is in force (C3 `latestDecision`), so history survives.
 */
export async function appendDecision(loaded: LoadedRun, decision: GateDecision): Promise<ApprovalFile> {
  const current = await readApproval(loaded);
  if (current.decisions.length >= MAX_APPROVAL_DECISIONS) throw new ApprovalFileFullError(loaded.runId, MAX_APPROVAL_DECISIONS);
  const next: ApprovalFile = { runId: loaded.runId, decisions: [...current.decisions, decision] };
  await writeApprovalFile(loaded.runDir, next);
  return next;
}
