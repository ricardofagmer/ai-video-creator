import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { startGate } from './start-gate';
import { type OptionalComponentsReport, type SetupProgress, type StepReport } from './setup-types';

/*
 * docs/specs/2026-11-24-installer-upgrade-guards-design.md, gap 2: the packaged menu's Start runs
 * `studio start` only after the last setup run of this launch completed; every other state is
 * answered by setup.
 */

const STEPS: readonly StepReport[] = [
  { id: 'verify-payload', status: 'already-done' },
  { id: 'data-folders', status: 'already-done' },
  { id: 'migrations', status: 'failed', reason: 'api-still-running' },
];

const COMPONENTS: OptionalComponentsReport = { searchModel: 'not-installed', captureBrowser: 'not-installed' };

describe('start gate (packaged Start waits for setup)', () => {
  it('lets Start through once setup completed', () => {
    assert.deepEqual(startGate({ phase: 'complete', steps: STEPS, components: COMPONENTS }), { kind: 'start' });
  });

  it('runs setup first when no setup progress exists yet in this launch', () => {
    assert.deepEqual(startGate(null), { kind: 'setup-first', setup: 'not-run' });
  });

  it('runs setup first while setup is running', () => {
    assert.deepEqual(startGate({ phase: 'running', steps: STEPS }), { kind: 'setup-first', setup: 'running' });
  });

  it('runs setup first after setup stopped at a failed step', () => {
    const failed: SetupProgress = { phase: 'failed', steps: STEPS, failedStep: 'migrations', reason: 'api-still-running' };
    assert.deepEqual(startGate(failed), { kind: 'setup-first', setup: 'failed' });
  });

  it('runs setup first after setup refused the app location', () => {
    assert.deepEqual(startGate({ phase: 'refused', problem: 'disk-image' }), { kind: 'setup-first', setup: 'refused' });
  });
});
