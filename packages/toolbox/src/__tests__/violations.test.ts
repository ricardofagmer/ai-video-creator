import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { z, type ZodIssue } from 'zod';
import { BlockedError } from '@studio/shared/ace';
import { InputError } from '../errors';
import { issueToViolation, raiseViolations, type Violation } from '../validation/violations';

/*
 * CR12 (ticket 10): violations are reported all at once; a policy violation blocks the run
 * (BlockedError with the first blocking code), authoring mistakes alone reject the file
 * (InputError, run.json untouched).
 */

function thrownBy(action: () => void): unknown {
  try {
    action();
  } catch (error) {
    return error;
  }
  return assert.fail('nothing was thrown');
}

function firstIssueOf(schema: z.ZodType, value: unknown): ZodIssue {
  const parsed = schema.safeParse(value);
  const issue = parsed.success ? undefined : parsed.error.issues[0];
  if (issue === undefined) return assert.fail('the value was accepted');
  return issue;
}

describe('toolbox violations (CR12)', () => {
  it('names the file and the dotted issue path', () => {
    const issue = firstIssueOf(z.object({ scenes: z.array(z.object({ id: z.string() })) }), { scenes: [{ id: 7 }] });

    const violation = issueToViolation('script.json', issue);

    assert.equal(violation.code, 'INVALID_INPUT');
    assert.match(violation.message, /^script\.json scenes\.0\.id: /);
  });

  it('names the root when the issue has no path', () => {
    const violation = issueToViolation('research.json', firstIssueOf(z.string(), 3), 'INSUFFICIENT_SOURCES');

    assert.equal(violation.code, 'INSUFFICIENT_SOURCES');
    assert.match(violation.message, /^research\.json \(root\): /);
  });

  it('does nothing when there are no violations', () => {
    assert.doesNotThrow(() => raiseViolations('script.json', []));
  });

  it('rejects authoring mistakes with an InputError that lists every violation and the next step', () => {
    const violations: Violation[] = [
      { code: 'INVALID_INPUT', message: 'first problem' },
      { code: 'INVALID_INPUT', message: 'second problem' },
    ];

    const error = thrownBy(() => raiseViolations('script.json', violations));

    assert.ok(error instanceof InputError);
    assert.match(error.message, /script\.json failed 2 rule\(s\)/);
    assert.match(error.message, /1\. \[INVALID_INPUT\] first problem/);
    assert.match(error.message, /2\. \[INVALID_INPUT\] second problem/);
    assert.match(error.next ?? '', /ace validate/);
  });

  it('blocks the run with the first blocking code when any policy violation is present', () => {
    const violations: Violation[] = [
      { code: 'INVALID_INPUT', message: 'authoring' },
      { code: 'UNSUPPORTED_CLAIM', message: 'claim c1' },
      { code: 'INSUFFICIENT_SOURCES', message: 'sources' },
    ];

    const error = thrownBy(() => raiseViolations('claims.json', violations));

    assert.ok(error instanceof BlockedError);
    assert.equal(error.code, 'UNSUPPORTED_CLAIM');
    assert.match(error.message, /claims\.json failed 3 rule\(s\)/);
    assert.match(error.message, /\[INVALID_INPUT\] authoring/);
  });
});
