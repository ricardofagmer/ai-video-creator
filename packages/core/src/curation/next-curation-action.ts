import {
  CurationCheckIdSchema,
  curationBounds,
  fixableCurationChecks,
  type CurationCheckId,
  type CurationFailedReason,
} from '@studio/shared/curation';

/** What one Curator call and, for a proposal, its ground check produced. */
export type CurationCallSummary =
  | { result: 'schema-invalid' }
  | { result: 'failed'; reason: 'call-timeout' | 'provider-error' | 'rate-limited' }
  | { result: 'no-change' }
  | { result: 'proposal-passed' }
  | { result: 'proposal-failed'; failedChecks: readonly CurationCheckId[] };

export interface NextCurationActionInput {
  /** The attempt that just ended: 1 or 2. */
  attempt: number;
  summary: CurationCallSummary;
  /**
   * Whether a second call's worst case fits $1.00 minus the spend (SPEC 0005 section 5.2). When it
   * does not, the curation ends with the outcome it would have had on attempt 2.
   */
  secondCallFits: boolean;
}

export type NextCurationAction =
  | { action: 'correct'; attempt: 2; kind: 'schema' }
  | { action: 'correct'; attempt: 2; kind: 'ground-check'; failedChecks: CurationCheckId[] }
  | { action: 'end'; status: 'proposed' }
  | { action: 'end'; status: 'no-change' }
  | { action: 'end'; status: 'no-proposal'; reasonId: CurationCheckId; failedChecks: CurationCheckId[] }
  | { action: 'end'; status: 'failed'; reasonId: CurationFailedReason };

/** Every failed id once, in the enum's order, so `reasonId` is stable for one set of failures. */
function orderedChecks(failedChecks: readonly CurationCheckId[]): CurationCheckId[] {
  const failed = new Set(failedChecks);
  return CurationCheckIdSchema.options.filter((checkId) => failed.has(checkId));
}

function noProposal(failedChecks: readonly CurationCheckId[]): NextCurationAction {
  const ordered = orderedChecks(failedChecks);
  const [first] = ordered;
  // A failed check result always names at least one id; an empty list is a caller fault.
  if (first === undefined) throw new RangeError('a failed ground check names at least one check id');
  return { action: 'end', status: 'no-proposal', reasonId: first, failedChecks: ordered };
}

/**
 * The routing table of SPEC 0005 section 5.2, the single owner of the 2-call cap (C5-AC-04,
 * topology 0004 sections 7 and 9). A second call is returned only after attempt 1, only when its
 * worst case fits, and only for a schema failure or a ground check whose every failed id is
 * fixable; from attempt 2 (or any higher number) the answer is always `end`, so a third call is
 * unreachable here and `attempt.max(2)` in the packet schema rejects one anyway.
 */
export function nextCurationAction(input: NextCurationActionInput): NextCurationAction {
  const { summary } = input;
  const mayCorrect = input.attempt < curationBounds.maxCalls && input.secondCallFits;
  switch (summary.result) {
    case 'failed':
      return { action: 'end', status: 'failed', reasonId: summary.reason };
    case 'no-change':
      return { action: 'end', status: 'no-change' };
    case 'proposal-passed':
      return { action: 'end', status: 'proposed' };
    case 'schema-invalid':
      return mayCorrect ? { action: 'correct', attempt: 2, kind: 'schema' } : { action: 'end', status: 'failed', reasonId: 'output-invalid' };
    case 'proposal-failed': {
      const failedChecks = orderedChecks(summary.failedChecks);
      const allFixable = failedChecks.length > 0 && failedChecks.every((checkId) => fixableCurationChecks.includes(checkId));
      return mayCorrect && allFixable ? { action: 'correct', attempt: 2, kind: 'ground-check', failedChecks } : noProposal(failedChecks);
    }
  }
}
