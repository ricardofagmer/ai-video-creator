import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { type HyperframesRefusalReason } from '@studio/shared/hyperframes';
import { hyperframesRefusalText } from '../shared/stage-texts';
import {
  DEFAULT_TEMPLATE_FILES,
  HYPERFRAMES_TEMPLATE_REF,
  STEP_KEY,
  createCompositionHarness,
  eventRecords,
  needsPersonOf,
  type CompositionHarness,
  type CompositionHarnessOptions,
} from './composition-stage.harness.test';

/*
 * SPEC 0008 revision 2 refusals around the staged copy (section 17.8) through the real composition
 * executor in live mode with a HyperFrames template bound. Each stops the stage as `needs-person`
 * with its section 5.7 text, sends no tool-runner request (the runner is the only way a process
 * starts), records no cost and logs exactly one `hyperframes.render-refused` event naming the
 * reason (AC 96). The render runtime gate's own checks (sections 17.5, 17.6, 18.3, 18.5; AC 89,
 * 91, 100, 102) and their order are tested once, at the gate, in `@studio/hyperframes`
 * (docs/specs/2026-11-25-render-runtime-gate-design.md decision 9). The child environment's keys
 * are covered by `stages/process/runner/hyperframes.handlers.test.ts` ("gives the child exactly the
 * eleven environment keys and none of the parent sentinels").
 */

async function assertRefusedBeforeAnyStart(harness: CompositionHarness, reason: HyperframesRefusalReason): Promise<void> {
  const failure = needsPersonOf(await harness.execute());
  const expected = hyperframesRefusalText(reason, HYPERFRAMES_TEMPLATE_REF);

  assert.equal(failure.message, expected.message);
  assert.equal(failure.whatToDo, expected.whatToDo);
  assert.deepEqual(failure.cause, { kind: 'needs-person', stepKey: STEP_KEY });
  assert.deepEqual(harness.runner.requests, [], 'no process was started');
  assert.deepEqual(harness.ledger.records, []);
  assert.equal(existsSync(harness.compositionOutputPath), false);
  assert.deepEqual(
    eventRecords(harness.logs, 'hyperframes.render-refused').map((event) => event.reasonId),
    [reason],
  );
  assert.deepEqual(eventRecords(harness.logs, 'hyperframes.render-finished'), []);
}

describe('composition HyperFrames rev 2 refusals stop before any start', () => {
  let harness: CompositionHarness | null = null;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  async function open(options: CompositionHarnessOptions = {}): Promise<CompositionHarness> {
    harness = await createCompositionHarness(options);
    return harness;
  }

  describe('the render runtime gate answers before the staged copy (section 5.2 check 1)', () => {
    it('asks the gate once with the stage settings', async () => {
      const current = await open();

      await current.execute();

      assert.deepEqual(
        current.ports.runtimeSettings.map((settings) => ({ home: settings.home, path: settings.path, studioPorts: settings.studioPorts })),
        [{ home: current.ownerHome, path: '/usr/bin:/bin', studioPorts: { api: 4311, web: 4310 } }],
      );
    });

    it('never lists or stages the template copy when the gate refuses', async () => {
      const current = await open();
      current.ports.refusal = 'chrome-missing';

      await assertRefusedBeforeAnyStart(current, 'chrome-missing');
      assert.deepEqual(current.ports.calls, ['renderRuntime']);
    });
  });

  describe('the staged copy refuses a source that is not the manifest file (AC 96, section 17.8)', () => {
    it('refuses template-not-self-contained when a listed source path is a symlink to a regular file', async () => {
      const current = await open();
      const decoy = join(current.root, 'decoy.css');
      const link = join(current.root, 'linked-style.css');
      // Same bytes as the listed style.css, so only the link at the source path can refuse it.
      await writeFile(decoy, DEFAULT_TEMPLATE_FILES['style.css'] ?? '');
      await symlink(decoy, link);
      current.ports.listingEdit = (files) => files.map((file) => (file.relativePath === 'style.css' ? { ...file, absolutePath: link } : file));

      await assertRefusedBeforeAnyStart(current, 'template-not-self-contained');
    });

    it('refuses template-not-self-contained when a listed source is larger than its manifest size', async () => {
      const current = await open();
      current.ports.listingEdit = (files) => files.map((file) => (file.relativePath === 'style.css' ? { ...file, sizeBytes: file.sizeBytes - 1 } : file));

      await assertRefusedBeforeAnyStart(current, 'template-not-self-contained');
    });
  });
});
