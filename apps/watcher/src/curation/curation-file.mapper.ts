import { type OutputScanResult } from '@studio/core/agents';
import {
  CURATOR_INSTRUCTION_VERSION,
  CurationCheckIdSchema,
  type CurationCallOutcome,
  type CurationCheckId,
  type CurationFailedReason,
  type CurationFile,
  type CurationReasonId,
  type CurationRefusedReason,
  type CuratorCorrection,
  type CuratorOutput,
} from '@studio/shared/curation';
import { type SessionId } from '@studio/shared/run-format';

/**
 * How a claimed curation ends (SPEC 0005 section 5.2). `refused` happens before any model call;
 * `no-change` carries the Curator's reason, already redacted, for `curation.json` only (never a
 * log line or an event, K7).
 */
export type CurationEnding =
  | { status: 'proposed' }
  | { status: 'no-change'; noChangeReason: string }
  | { status: 'no-proposal'; reasonId: CurationCheckId; failedChecks: CurationCheckId[] }
  | { status: 'failed'; reasonId: CurationFailedReason }
  | { status: 'refused'; reasonId: CurationRefusedReason };

export function refused(reasonId: CurationRefusedReason): CurationEnding {
  return { status: 'refused', reasonId };
}

export function failed(reasonId: CurationFailedReason): CurationEnding {
  return { status: 'failed', reasonId };
}

/** `curation.ended` `reasonId`: null for `proposed` and `no-change`. */
export function endingReasonId(ending: CurationEnding): CurationReasonId | null {
  return ending.status === 'proposed' || ending.status === 'no-change' ? null : ending.reasonId;
}

/** One finished Curator call, as `curation.json` counts it. */
export interface RecordedCall {
  sessionId: SessionId | null;
  usd: number;
  modelId: string;
}

/**
 * The fields every watcher write of `curation.json` carries over: the api's request, the claim and
 * the progress. Outcome fields (`reasonId`, `failedChecks`, `noChangeReason`, `endedAt`) are dropped
 * and set only by `endedFileOf`.
 */
function requestFields(file: CurationFile): CurationFile {
  return {
    format: file.format,
    curationId: file.curationId,
    status: file.status,
    subject: file.subject,
    ...(file.ownerFocus === undefined ? {} : { ownerFocus: file.ownerFocus }),
    correlationId: file.correlationId,
    requestedAt: file.requestedAt,
    ...(file.claim === undefined ? {} : { claim: file.claim }),
    attempts: file.attempts,
    spentUsd: file.spentUsd,
    ...(file.modelId === undefined ? {} : { modelId: file.modelId }),
    ...(file.instructionVersion === undefined ? {} : { instructionVersion: file.instructionVersion }),
    sessionIds: file.sessionIds,
    updatedAt: file.updatedAt,
  };
}

/** `requested` -> `collecting` with the claim (SPEC 0005 section 5.2, step claim). */
export function claimedFileOf(file: CurationFile, claim: { pid: number; at: string }): CurationFile {
  return { ...requestFields(file), status: 'collecting', claim: { pid: claim.pid, claimedAt: claim.at }, updatedAt: claim.at };
}

/**
 * Progress after one Curator call: the attempt is counted only when a session started (a call
 * refused before its session is not a model call), and the spend always, so the $1.00 bound sees it.
 */
export function afterCallFileOf(file: CurationFile, call: RecordedCall, at: string): CurationFile {
  const counted = call.sessionId !== null;
  return {
    ...requestFields(file),
    attempts: counted ? file.attempts + 1 : file.attempts,
    spentUsd: file.spentUsd + call.usd,
    modelId: call.modelId,
    instructionVersion: CURATOR_INSTRUCTION_VERSION,
    sessionIds: call.sessionId === null ? file.sessionIds : [...file.sessionIds, call.sessionId],
    updatedAt: at,
  };
}

/** A spend the cost file proves but the progress write missed (a crash between the two). */
export function withSpentAtLeast(file: CurationFile, ledgerTotalUsd: number): CurationFile {
  return ledgerTotalUsd > file.spentUsd ? { ...requestFields(file), spentUsd: ledgerTotalUsd } : file;
}

/** The final `curation.json`; the watcher writes nothing to it afterwards. */
export function endedFileOf(file: CurationFile, ending: CurationEnding, at: string): CurationFile {
  const base: CurationFile = { ...requestFields(file), status: ending.status, updatedAt: at, endedAt: at };
  switch (ending.status) {
    case 'proposed':
      return base;
    case 'no-change':
      return { ...base, noChangeReason: ending.noChangeReason };
    case 'no-proposal':
      return { ...base, reasonId: ending.reasonId, failedChecks: ending.failedChecks };
    case 'failed':
    case 'refused':
      return { ...base, reasonId: ending.reasonId };
  }
}

/**
 * The ids of the checks that ran and passed, given the failed and the skipped ones (`curation.check`
 * event, SPEC 0005 section 7): a check that never ran is neither passed nor failed.
 */
export function passedChecksOf(result: {
  failedChecks: readonly CurationCheckId[];
  skippedChecks: readonly CurationCheckId[];
}): CurationCheckId[] {
  const notPassed = new Set([...result.failedChecks, ...result.skippedChecks]);
  return CurationCheckIdSchema.options.filter((checkId) => !notPassed.has(checkId));
}

/**
 * The agents `OutputScanner` result as the ground check's `redactor-clean` scan reads it
 * (SPEC 0005 section 5.4, C5-AC-13): a delimiter tag, a secret, a secret pattern or a biometric
 * path is `found`; a redactor failure is `failed`. Both fail the check.
 */
export function curatorScanOf(result: OutputScanResult): 'clean' | 'found' | 'failed' {
  if (result.status === 'clean') return 'clean';
  return result.reason === 'scan-failed' ? 'failed' : 'found';
}

/** Span outcome of one call, the same mapping the agent writes on its session `end` line. */
export function callOutcomeOf(output: CuratorOutput | null, correction: CuratorCorrection | null): CurationCallOutcome {
  if (output === null) return 'failed';
  if (output.decision === 'no-change') return 'no-change';
  if (correction === null) return 'ok';
  return correction.kind === 'schema' ? 'schema-retry' : 'corrective';
}
