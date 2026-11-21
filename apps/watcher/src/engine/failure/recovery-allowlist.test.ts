import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type JsonObject } from '@studio/shared/run-format';
import { PATCHED_NUMBER_MAX_FACTOR, checkParamsPatch } from './recovery-allowlist';

/*
 * Bounded `retry-with-params` patches (baseline review): a patch is model output, so a patched number
 * must be finite, at least 0 and at most PATCHED_NUMBER_MAX_FACTOR times the recipe's value, and keep
 * the recipe value's type. Strings and keys the recipe does not set stay untunable.
 */

const recipeParams: JsonObject = { sceneCount: 6, durationSec: 30, dryRun: false, voice: 'pt-BR-default' };

function patchVerdict(patch: JsonObject) {
  return checkParamsPatch({ current: recipeParams, recipeParams, patch });
}

describe('checkParamsPatch', () => {
  it('accepts numbers up to the factor of the recipe value, and booleans', () => {
    assert.equal(PATCHED_NUMBER_MAX_FACTOR, 2);
    assert.deepEqual(patchVerdict({ sceneCount: 12, durationSec: 0, dryRun: true }), {
      status: 'accepted',
      params: { ...recipeParams, sceneCount: 12, durationSec: 0, dryRun: true },
    });
  });

  it('refuses a number above the factor', () => {
    assert.deepEqual(patchVerdict({ sceneCount: 13 }), { status: 'refused', keys: ['sceneCount'] });
  });

  it('refuses negative, NaN and infinite numbers', () => {
    assert.deepEqual(patchVerdict({ sceneCount: -1, durationSec: Number.NaN }), { status: 'refused', keys: ['sceneCount', 'durationSec'] });
    assert.deepEqual(patchVerdict({ durationSec: Number.POSITIVE_INFINITY }), { status: 'refused', keys: ['durationSec'] });
  });

  it('refuses a value of another type than the recipe value', () => {
    assert.deepEqual(patchVerdict({ sceneCount: '12', dryRun: 1 }), { status: 'refused', keys: ['sceneCount', 'dryRun'] });
  });

  it('refuses untunable keys: strings and keys the recipe does not set', () => {
    assert.deepEqual(patchVerdict({ voice: 'other', retries: 1 }), { status: 'refused', keys: ['voice', 'retries'] });
  });

  it('admits no number patch when the recipe value is negative', () => {
    const negative: JsonObject = { offsetSec: -5 };
    assert.deepEqual(checkParamsPatch({ current: negative, recipeParams: negative, patch: { offsetSec: -5 } }), { status: 'refused', keys: ['offsetSec'] });
  });
});
