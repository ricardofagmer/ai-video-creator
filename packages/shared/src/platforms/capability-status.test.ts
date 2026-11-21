import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { applyGateChange, capabilityStatus, type CapabilityStatusInput } from './capability-status';
import { defaultGates, platformPublishSupport } from './constants';

/*
 * Capability status derivation (SPEC 0007 section 5.2, OD2, OD8). Order matters: `unsupported`
 * first, then the gate, then credentials, then the account, then the watcher's health.
 */

const CONNECTION_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const OTHER_CONNECTION_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1D';

function connectedInput(overrides: Partial<CapabilityStatusInput> = {}): CapabilityStatusInput {
  return {
    platform: 'youtube',
    capability: 'metrics',
    gates: { metrics: 'enabled', publish: 'enabled' },
    mode: 'live',
    credentialsConfigured: true,
    account: { state: 'connected', connectionId: CONNECTION_ID, capabilities: ['metrics', 'publish'] },
    health: { connectionId: CONNECTION_ID, token: 'ok' },
    ...overrides,
  };
}

describe('capabilityStatus', () => {
  it('answers connected for an enabled capability on a connected account with a healthy token', () => {
    assert.equal(capabilityStatus(connectedInput()), 'connected');
  });

  it('answers unsupported for Instagram publish before every other check (OD8)', () => {
    assert.equal(platformPublishSupport.instagram, false);
    const input = connectedInput({
      platform: 'instagram',
      capability: 'publish',
      gates: { metrics: 'awaiting-review', publish: 'awaiting-review' },
      credentialsConfigured: false,
      account: null,
      health: null,
    });
    assert.equal(capabilityStatus(input), 'unsupported');
  });

  it('answers awaiting-review for a gated capability even without credentials or account (AC 44)', () => {
    const input = connectedInput({
      gates: { metrics: 'awaiting-review', publish: 'enabled' },
      credentialsConfigured: false,
      account: null,
    });
    assert.equal(capabilityStatus(input), 'awaiting-review');
  });

  it('answers not-configured in live mode when the client credentials do not resolve', () => {
    assert.equal(capabilityStatus(connectedInput({ credentialsConfigured: false })), 'not-configured');
  });

  it('ignores missing credentials in mock mode', () => {
    assert.equal(capabilityStatus(connectedInput({ mode: 'mock', credentialsConfigured: false })), 'connected');
  });

  it('answers disconnected for no account, a disconnected account, or a capability not granted', () => {
    assert.equal(capabilityStatus(connectedInput({ account: null })), 'disconnected');
    assert.equal(
      capabilityStatus(
        connectedInput({ account: { state: 'disconnected', connectionId: CONNECTION_ID, capabilities: ['metrics'] } }),
      ),
      'disconnected',
    );
    assert.equal(
      capabilityStatus(
        connectedInput({
          capability: 'publish',
          account: { state: 'connected', connectionId: CONNECTION_ID, capabilities: ['metrics'] },
        }),
      ),
      'disconnected',
    );
  });

  it('answers needs-reconnect only when the health file belongs to the current connection', () => {
    assert.equal(
      capabilityStatus(connectedInput({ health: { connectionId: CONNECTION_ID, token: 'needs-reconnect' } })),
      'needs-reconnect',
    );
    assert.equal(
      capabilityStatus(connectedInput({ health: { connectionId: OTHER_CONNECTION_ID, token: 'needs-reconnect' } })),
      'connected',
    );
  });

  it('answers connected when the watcher has not written a health file yet', () => {
    assert.equal(capabilityStatus(connectedInput({ health: null })), 'connected');
  });
});

describe('applyGateChange', () => {
  it('starts Instagram and TikTok gated and YouTube enabled', () => {
    assert.deepEqual(defaultGates.youtube, { metrics: 'enabled', publish: 'enabled' });
    assert.deepEqual(defaultGates.instagram, { metrics: 'awaiting-review', publish: 'awaiting-review' });
    assert.deepEqual(defaultGates.tiktok, { metrics: 'awaiting-review', publish: 'awaiting-review' });
  });

  it('refuses to enable Instagram publish with platform-publish-unsupported', () => {
    assert.deepEqual(
      applyGateChange({ platform: 'instagram', gates: defaultGates.instagram, capability: 'publish', state: 'enabled' }),
      { status: 'refused', reason: 'platform-publish-unsupported' },
    );
  });

  it('enables Instagram metrics and leaves its publish gate untouched', () => {
    assert.deepEqual(
      applyGateChange({ platform: 'instagram', gates: defaultGates.instagram, capability: 'metrics', state: 'enabled' }),
      { status: 'applied', gates: { metrics: 'enabled', publish: 'awaiting-review' } },
    );
  });

  it('closes a publish gate and keeps the metrics gate', () => {
    assert.deepEqual(
      applyGateChange({ platform: 'youtube', gates: defaultGates.youtube, capability: 'publish', state: 'awaiting-review' }),
      { status: 'applied', gates: { metrics: 'enabled', publish: 'awaiting-review' } },
    );
  });

  it('enables TikTok publish', () => {
    assert.deepEqual(
      applyGateChange({ platform: 'tiktok', gates: defaultGates.tiktok, capability: 'publish', state: 'enabled' }),
      { status: 'applied', gates: { metrics: 'awaiting-review', publish: 'enabled' } },
    );
  });
});
