import { z } from 'zod';

/** Kinds of version the Curator may propose for: text bodies only (topology 0004 section 5). */
export const CuratableKindSchema = z.enum(['prompt', 'skill', 'recipe']);
export type CuratableKind = z.infer<typeof CuratableKindSchema>;

/**
 * Lifecycle of `curation.json`. The api writes only `requested`; the watcher claims it
 * (`collecting`) and is its single writer from then on (topology 0004 section 4).
 */
export const CurationStatusSchema = z.enum(['requested', 'collecting', 'proposed', 'no-change', 'no-proposal', 'failed', 'refused']);
export type CurationStatus = z.infer<typeof CurationStatusSchema>;

/** The last five statuses: a curation in one of them never changes again. */
export const terminalCurationStatuses: readonly CurationStatus[] = ['proposed', 'no-change', 'no-proposal', 'failed', 'refused'];

export function isTerminalCurationStatus(status: CurationStatus): boolean {
  return terminalCurationStatuses.includes(status);
}

/** The eight ground-check ids (SPEC 0005 section 5.4); all eight run on every proposal. */
export const CurationCheckIdSchema = z.enum([
  'evidence-in-packet',
  'evidence-used-subject',
  'evidence-owner-reviewed',
  'body-changed',
  'body-within-cap',
  'recipe-json-valid',
  'bindings-resolvable',
  'redactor-clean',
]);
export type CurationCheckId = z.infer<typeof CurationCheckIdSchema>;

/** Failed checks a corrective call may fix (topology 0004 section 7); any other failure ends `no-proposal`. */
export const fixableCurationChecks: readonly CurationCheckId[] = [
  'evidence-in-packet',
  'body-changed',
  'body-within-cap',
  'recipe-json-valid',
];

/** Span outcome of one Curator call (topology 0004 section 10). */
export const CurationCallOutcomeSchema = z.enum(['ok', 'schema-retry', 'corrective', 'failed', 'refused', 'no-change']);
export type CurationCallOutcome = z.infer<typeof CurationCallOutcomeSchema>;

/** Why a curation ended `refused`: before any model call, with $0 spent. */
export const CurationRefusedReasonSchema = z.enum([
  'month-spend-unavailable',
  'over-month-ceiling',
  'over-curation-ceiling',
  'packet-secret-found',
  'redactor-unavailable',
  'subject-refused',
  'evidence-unavailable',
]);
export type CurationRefusedReason = z.infer<typeof CurationRefusedReasonSchema>;

/** Why a curation ended `failed`. */
export const CurationFailedReasonSchema = z.enum([
  'call-timeout',
  'curation-timeout',
  'provider-error',
  'rate-limited',
  'output-invalid',
  'watcher-stopped',
  'watcher-restarted',
  'internal-error',
]);
export type CurationFailedReason = z.infer<typeof CurationFailedReasonSchema>;

/** `reasonId` of `curation.json`: a refused or failed reason, or a check id for `no-proposal`. */
export const CurationReasonIdSchema = z.union([CurationRefusedReasonSchema, CurationFailedReasonSchema, CurationCheckIdSchema]);
export type CurationReasonId = z.infer<typeof CurationReasonIdSchema>;
