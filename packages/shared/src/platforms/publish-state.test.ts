import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PublishStateSchema, type PublishState } from './enums';
import {
  assertPublishTransition,
  canTransitionPublishState,
  isOpenPublishState,
  openPublishStates,
  PublishTransitionRefusedError,
} from './publish-state';

/*
 * Publish attempt states (SPEC 0007 section 5.4, K4/K5): open states move forward by rank only,
 * `cancelled` and `expired` are reachable only from `queued`, and a terminal state never moves.
 */

const allStates: readonly PublishState[] = PublishStateSchema.options;
const terminalStates = allStates.filter((state) => !isOpenPublishState(state));

describe('publish state transitions', () => {
  it('lists exactly the four open states in rank order', () => {
    assert.deepEqual(openPublishStates, ['queued', 'uploading', 'processing', 'sent-to-inbox']);
    assert.deepEqual(terminalStates, [
      'published',
      'failed',
      'cancelled',
      'expired',
      'outcome-unknown',
      'inbox-unconfirmed',
    ]);
  });

  it('moves an open state forward to every higher-ranked open state', () => {
    assert.equal(canTransitionPublishState('queued', 'uploading'), true);
    assert.equal(canTransitionPublishState('queued', 'sent-to-inbox'), true);
    assert.equal(canTransitionPublishState('uploading', 'processing'), true);
    assert.equal(canTransitionPublishState('processing', 'sent-to-inbox'), true);
  });

  it('never moves an open state backwards or to itself', () => {
    for (const [fromIndex, from] of openPublishStates.entries()) {
      for (const to of openPublishStates.slice(0, fromIndex + 1)) {
        assert.equal(canTransitionPublishState(from, to), false, `${from} -> ${to}`);
      }
    }
  });

  it('reaches cancelled and expired only from queued', () => {
    assert.equal(canTransitionPublishState('queued', 'cancelled'), true);
    assert.equal(canTransitionPublishState('queued', 'expired'), true);
    for (const from of openPublishStates.filter((state) => state !== 'queued')) {
      assert.equal(canTransitionPublishState(from, 'cancelled'), false, `${from} -> cancelled`);
      assert.equal(canTransitionPublishState(from, 'expired'), false, `${from} -> expired`);
    }
  });

  it('lets any open state end published, failed, outcome-unknown or inbox-unconfirmed', () => {
    const endings: readonly PublishState[] = ['published', 'failed', 'outcome-unknown', 'inbox-unconfirmed'];
    for (const from of openPublishStates) {
      for (const to of endings) {
        assert.equal(canTransitionPublishState(from, to), true, `${from} -> ${to}`);
      }
    }
  });

  it('never moves a terminal state to any state', () => {
    for (const from of terminalStates) {
      for (const to of allStates) {
        assert.equal(canTransitionPublishState(from, to), false, `${from} -> ${to}`);
      }
    }
  });

  it('assertPublishTransition throws a typed refusal naming both states', () => {
    assert.doesNotThrow(() => assertPublishTransition('queued', 'uploading'));
    assert.throws(
      () => assertPublishTransition('published', 'failed'),
      (error: unknown) =>
        error instanceof PublishTransitionRefusedError && error.from === 'published' && error.to === 'failed',
    );
  });
});
