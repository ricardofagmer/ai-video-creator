import { CuratorCorrectionSchema, type CurationCheckId, type CuratorCorrection } from '@studio/shared/curation';

const MAX_ISSUES = 10;
const MAX_ISSUE_CHARS = 300;

/**
 * Fixed sentences per check id (SPEC 0005 section 4.3): a ground-check correction never carries
 * model text, only these. Only the four fixable ids can reach a corrective call; the other four
 * are listed so the table stays total.
 */
const CHECK_SENTENCES: Readonly<Record<CurationCheckId, string>> = {
  'evidence-in-packet': 'Every evidenceRunIds entry must be a runId listed in inputs.outcomes.runs.',
  'evidence-used-subject': 'Every evidence run must have used the subject version.',
  'evidence-owner-reviewed': 'Every evidence run must have an owner decision, approved or rejected.',
  'body-changed': 'newBody must differ from the current subject body; answer no-change if no change is justified.',
  'body-within-cap': 'newBody must be at most 16000 characters long.',
  'recipe-json-valid':
    'newBody must be the recipe definition as JSON, valid against the recipe schema, with the same id and without version, status or provenance.',
  'bindings-resolvable': 'Every recipe binding must name an existing, non-biometric, non-deprecated version with its contentHash.',
  'redactor-clean': 'The answer must not contain secrets, keys or file paths of biometric material.',
};

/** The second call after a fixable ground-check failure (topology 0004 section 4, B11). */
export function groundCheckCorrection(failedChecks: readonly CurationCheckId[]): CuratorCorrection {
  return CuratorCorrectionSchema.parse({
    kind: 'ground-check',
    failedChecks: [...failedChecks],
    issues: failedChecks.slice(0, MAX_ISSUES).map((checkId) => CHECK_SENTENCES[checkId]),
  });
}

/**
 * The second call after a schema failure (D10). `issues` are the `path: code` lines of the agent's
 * `schemaIssuePaths`; zod messages are left out there because they can quote the model's own values,
 * so never pass `issue.message` here (SPEC 0005 section 4.3). Each line is cut to 300 characters.
 */
export function schemaCorrection(issues: readonly string[]): CuratorCorrection {
  return CuratorCorrectionSchema.parse({
    kind: 'schema',
    failedChecks: [],
    issues: issues.slice(0, MAX_ISSUES).map((issue) => issue.slice(0, MAX_ISSUE_CHARS)),
  });
}
