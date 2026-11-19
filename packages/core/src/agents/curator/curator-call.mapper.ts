import { type CurationCallOutcome, type CurationUsage, type CuratorCorrection, type CuratorOutput } from '@studio/shared/curation';
import { type z } from 'zod';
import { type ModelCallUsage } from '../usage/model-usage.mapper';
import { type CuratorCallFailure } from './curator-call.error';

/** A C6 `CuratorCallResult` before its session id and spend are attached. */
export type CuratorCallAnswer =
  | { status: 'ok'; output: CuratorOutput }
  | { status: 'schema-invalid'; issues: string[] }
  | { status: 'failed'; reason: 'call-timeout' | 'provider-error' | 'rate-limited' };

/** How one exchange ended: an answer for the port's result union, or a failure to throw. */
export type CuratorSettlement = { kind: 'answer'; answer: CuratorCallAnswer } | { kind: 'failure'; failure: CuratorCallFailure };

const MAX_SCHEMA_ISSUES = 10;
const MAX_ISSUE_CHARS = 300;

/**
 * Schema-feedback lines for the watcher's `CuratorCorrection`: the zod path and issue code only.
 * Messages are left out because they can quote the model's own values (SPEC 0005 section 4.3:
 * "zod paths for schema", never model text).
 */
export function schemaIssuePaths(error: z.ZodError): string[] {
  return error.issues.slice(0, MAX_SCHEMA_ISSUES).map((issue) => {
    const path = issue.path.length === 0 ? '(root)' : issue.path.join('.');
    return `${path}: ${issue.code}`.slice(0, MAX_ISSUE_CHARS);
  });
}

/** Topology 0004 section 10 outcome of one Curator call, for the end line and `cost.json`. */
export function curatorCallOutcome(settlement: CuratorSettlement, correction: CuratorCorrection | null): CurationCallOutcome {
  if (settlement.kind !== 'answer' || settlement.answer.status !== 'ok') return 'failed';
  if (settlement.answer.output.decision === 'no-change') return 'no-change';
  if (correction === null) return 'ok';
  return correction.kind === 'schema' ? 'schema-retry' : 'corrective';
}

/** The session line's usage; an unreported cache count is recorded as zero, as it is priced. */
export function toCurationUsage(usage: ModelCallUsage): CurationUsage {
  return {
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: usage.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.cacheWriteTokens ?? 0,
  };
}
