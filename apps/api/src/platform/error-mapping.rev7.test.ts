import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  InvalidPlatformInputError,
  PlatformError,
  PlatformFileCorruptError,
  PlatformRefusedError,
  PublishAttemptNotFoundError,
  TokenVaultUnavailableError,
  type PlatformErrorCategory,
} from '@studio/core/platforms';
import { apiRev7ErrorReasons, type ApiRev7ErrorReason } from '@studio/shared/api';
import { mapError } from './error-mapping';

/**
 * SPEC 0007 section 4.4 `apiRev7ErrorReasons`, typed out from the frozen spec (rev 2) so the test
 * never derives its expectation from the table it checks. The `Record` type keeps it exhaustive.
 */
const specStatus: Readonly<Record<ApiRev7ErrorReason, number>> = {
  'platform-awaiting-review': 409,
  'platform-publish-unsupported': 409,
  'platform-not-configured': 409,
  'platform-not-connected': 409,
  'platform-needs-reconnect': 409,
  'platform-mode-mismatch': 409,
  'oauth-state-invalid': 400,
  'oauth-denied': 409,
  'oauth-exchange-failed': 502,
  'oauth-scope-missing': 409,
  'keychain-unavailable': 503,
  'publish-run-not-approved': 409,
  'publish-artifact-missing': 409,
  'publish-artifact-changed': 409,
  'publish-biometric-mismatch': 409,
  'publish-sensitivity-unknown': 409,
  'publish-already-in-progress': 409,
  'publish-already-published': 409,
  'publish-visibility-not-allowed': 422,
  'publish-attempt-not-cancellable': 409,
  'publish-idempotency-key-reused': 409,
  'publish-attempt-not-found': 404,
};

/** The error taxonomy code of each status the rev 7 table uses (rules/observability.md). */
const codeOfStatus: Readonly<Record<number, string>> = { 400: 'validation', 404: 'not_found', 409: 'conflict', 422: 'validation', 502: 'dependency', 503: 'dependency' };

function isRev7Reason(value: string): value is ApiRev7ErrorReason {
  return Object.hasOwn(specStatus, value);
}

const rev7Reasons: ApiRev7ErrorReason[] = Object.keys(specStatus).filter(isRev7Reason);

/** A platform error whose category deliberately disagrees with the table, so only the table can give the status. */
class AnyPlatformError extends PlatformError {
  override readonly category: PlatformErrorCategory = 'conflict';

  constructor(override readonly reason: ApiRev7ErrorReason) {
    super('platform refusal');
    this.name = 'AnyPlatformError';
  }
}

describe('C10 rev 7 reason-to-status mapping (SPEC 0007 section 4.4)', () => {
  it('ships exactly the 22 reasons and statuses of the frozen table', () => {
    assert.equal(rev7Reasons.length, 22);
    assert.deepEqual({ ...apiRev7ErrorReasons }, specStatus);
  });

  for (const reason of rev7Reasons) {
    it(`maps ${reason} to ${specStatus[reason]}`, () => {
      const mapped = mapError(new AnyPlatformError(reason));
      assert.equal(mapped.statusCode, specStatus[reason]);
      assert.equal(mapped.reason, reason);
      assert.equal(mapped.code, codeOfStatus[specStatus[reason]]);
      assert.equal(mapped.expected, true);
    });
  }

  it('answers Instagram publish 409 platform-publish-unsupported (OD8)', () => {
    const mapped = mapError(new PlatformRefusedError('platform-publish-unsupported', 'instagram'));
    assert.equal(mapped.statusCode, 409);
    assert.equal(mapped.code, 'conflict');
    assert.equal(mapped.reason, 'platform-publish-unsupported');
  });

  it('answers a failed code exchange 502 oauth-exchange-failed with the dependency code', () => {
    const mapped = mapError(new PlatformRefusedError('oauth-exchange-failed', 'youtube'));
    assert.equal(mapped.statusCode, 502);
    assert.equal(mapped.code, 'dependency');
    assert.equal(mapped.reason, 'oauth-exchange-failed');
  });

  it('answers an unavailable token vault 503 keychain-unavailable with the dependency code', () => {
    const mapped = mapError(new TokenVaultUnavailableError('youtube', 'write', 'timeout'));
    assert.equal(mapped.statusCode, 503);
    assert.equal(mapped.code, 'dependency');
    assert.equal(mapped.reason, 'keychain-unavailable');
  });

  it('maps the remaining real core refusals with their frozen statuses', () => {
    const cases: [Error, string, number][] = [
      [new PlatformRefusedError('oauth-state-invalid', 'tiktok'), 'oauth-state-invalid', 400],
      [new PlatformRefusedError('publish-visibility-not-allowed', 'tiktok'), 'publish-visibility-not-allowed', 422],
      [new PlatformRefusedError('platform-awaiting-review', 'instagram'), 'platform-awaiting-review', 409],
      [new PlatformRefusedError('publish-idempotency-key-reused', 'youtube', '01JD2Q7F3M8V5K9X4T6R2N0B1C'), 'publish-idempotency-key-reused', 409],
      [new PublishAttemptNotFoundError('01JD2Q7F3M8V5K9X4T6R2N0B1C', '01JDA700000000000000000AT1'), 'publish-attempt-not-found', 404],
    ];
    for (const [error, reason, statusCode] of cases) {
      const mapped = mapError(error);
      assert.equal(mapped.reason, reason, error.name);
      assert.equal(mapped.statusCode, statusCode, error.name);
    }
  });

  it('answers malformed platform input 422 invalid-platform-input with the issue paths', () => {
    const mapped = mapError(new InvalidPlatformInputError([{ path: 'request.metadata.title', message: 'Too big' }]));
    assert.equal(mapped.statusCode, 422);
    assert.equal(mapped.reason, 'invalid-platform-input');
    assert.deepEqual(mapped.issues, [{ path: 'request.metadata.title', message: 'Too big' }]);
  });

  it('never sends the message of a corrupt platform file, which names the file', () => {
    const mapped = mapError(new PlatformFileCorruptError('account.json', 'youtube'));
    assert.equal(mapped.statusCode, 500);
    assert.equal(mapped.code, 'internal');
    assert.equal(mapped.message, 'Internal error');
    assert.equal(mapped.expected, false);
  });
});
