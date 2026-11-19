import type { ZodIssue } from 'zod';
import { BlockedError } from '@studio/shared/ace';
import { InputError } from '../errors';

export type BlockedCode = BlockedError['code'];
/** INVALID_INPUT is a fixable authoring mistake: report it, change nothing, let the author re-run. */
export type ViolationCode = BlockedCode | 'INVALID_INPUT';

export interface Violation {
  code: ViolationCode;
  message: string;
}

function isBlockingCode(code: ViolationCode): code is BlockedCode {
  return code !== 'INVALID_INPUT';
}

export function issueToViolation(fileName: string, issue: ZodIssue, code: ViolationCode = 'INVALID_INPUT'): Violation {
  return { code, message: `${fileName} ${issue.path.join('.') || '(root)'}: ${issue.message}` };
}

/**
 * Reports every violation at once. Policy/evidence violations block the run (spec §3);
 * if there are none, authoring mistakes reject the file without touching run.json.
 */
export function raiseViolations(fileName: string, violations: readonly Violation[]): void {
  if (violations.length === 0) return;
  const listing = violations.map((violation, index) => `  ${index + 1}. [${violation.code}] ${violation.message}`).join('\n');
  const blocking = violations.find((violation) => isBlockingCode(violation.code));
  if (blocking && isBlockingCode(blocking.code)) {
    throw new BlockedError(`${fileName} failed ${violations.length} rule(s):\n${listing}`, blocking.code);
  }
  throw new InputError(`${fileName} failed ${violations.length} rule(s):\n${listing}`, `fix ${fileName} and re-run the same ace validate command`);
}
