import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { type ChromeMissingDetail } from '@studio/hyperframes';
import { hyperframesPaths, type HyperframesRefusalReason } from '@studio/shared/hyperframes';
import { hyperframesRefusalText } from '../shared/stage-texts';
import {
  DEFAULT_TEMPLATE_FILES,
  HYPERFRAMES_TEMPLATE_REF,
  STEP_KEY,
  createCompositionHarness,
  eventRecords,
  needsPersonOf,
  readyEngineFiles,
  type CompositionHarness,
  type CompositionHarnessOptions,
} from './composition-stage.harness.test';

/*
 * SPEC 0008 revision 2 refusals (section 17.5, 17.6, 17.8) through the real composition executor
 * in live mode with a HyperFrames template bound. Each stops the stage as `needs-person` with its
 * section 5.7 text, sends no tool-runner request (the runner is the only way a process starts),
 * records no cost and logs exactly one `hyperframes.render-refused` event naming the reason
 * (AC 89, 91, 96). The child environment's eleven keys (AC 89, last sentence) are covered by
 * `stages/process/runner/hyperframes.handlers.test.ts` ("gives the child exactly the eleven
 * environment keys and none of the parent sentinels").
 */

const CHROME_VERIFY_FAILURES: readonly ChromeMissingDetail[] = ['changed', 'unreadable'];

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

  describe('sandbox parameters that cannot be resolved (AC 89, section 17.5)', () => {
    it('refuses sandbox-unavailable when ffmpeg cannot be resolved on the stage PATH', async () => {
      const current = await open();
      current.ports.unresolvableExecutables.add('ffmpeg');

      await assertRefusedBeforeAnyStart(current, 'sandbox-unavailable');
    });

    it('refuses sandbox-unavailable when ffprobe cannot be resolved on the stage PATH', async () => {
      const current = await open();
      current.ports.unresolvableExecutables.add('ffprobe');

      await assertRefusedBeforeAnyStart(current, 'sandbox-unavailable');
    });

    for (const folder of ['cacheDir', 'configDir', 'homeDir'] as const) {
      it(`refuses runtime-not-prepared when the hyperframes ${folder} folder is missing`, async () => {
        const current = await open();
        current.ports.missingFolders.add(hyperframesPaths(current.dataHomeRoot)[folder]);

        await assertRefusedBeforeAnyStart(current, 'runtime-not-prepared');
        // AC 100: the folders answer before Chrome is verified (SPEC 0008 section 18.3).
        assert.deepEqual(current.ports.chromeVerifications, []);
      });
    }

    // AC 102: a media program the sandbox could have replaced never runs outside it (section 18.5).
    it('refuses sandbox-unavailable when ffmpeg resolves inside the hyperframes cache folder', async () => {
      const current = await open();
      current.ports.resolvedExecutables.set('ffmpeg', join(hyperframesPaths(current.dataHomeRoot).cacheDir, 'ffmpeg'));

      await assertRefusedBeforeAnyStart(current, 'sandbox-unavailable');
    });

    it('refuses sandbox-unavailable when ffprobe resolves anywhere under the data home', async () => {
      const current = await open();
      current.ports.resolvedExecutables.set('ffprobe', join(current.dataHomeRoot, 'runs', 'ffprobe'));

      await assertRefusedBeforeAnyStart(current, 'sandbox-unavailable');
    });

    for (const folder of ['configDir', 'homeDir'] as const) {
      it(`refuses sandbox-unavailable when ffmpeg resolves inside a ${folder} symlinked outside the data home`, async () => {
        const current = await open();
        const outside = join('/elsewhere', `hyperframes-${folder}`);
        current.ports.redirectedFolders.set(hyperframesPaths(current.dataHomeRoot)[folder], outside);
        current.ports.resolvedExecutables.set('ffmpeg', join(outside, 'bin', 'ffmpeg'));

        await assertRefusedBeforeAnyStart(current, 'sandbox-unavailable');
      });
    }

    it('refuses sandbox-unavailable when the studio api port is below 1024', async () => {
      const current = await open({ studioPorts: { api: 80, web: 4310 } });

      await assertRefusedBeforeAnyStart(current, 'sandbox-unavailable');
    });

    it('refuses sandbox-unavailable when the studio web port is above 65535', async () => {
      const current = await open({ studioPorts: { api: 4311, web: 65536 } });

      await assertRefusedBeforeAnyStart(current, 'sandbox-unavailable');
    });
  });

  describe('the Chrome binary is verified before every render (AC 91, section 17.6)', () => {
    for (const detail of CHROME_VERIFY_FAILURES) {
      it(`refuses chrome-missing when the gate files are ready but the binary is ${detail}`, async () => {
        const current = await open();
        current.ports.chromeVerifyFailure = detail;

        await assertRefusedBeforeAnyStart(current, 'chrome-missing');
      });
    }

    it('verifies the binary chrome.json records against the hyperframes cache folder', async () => {
      const current = await open();
      const chromeRecord = readyEngineFiles(current.dataHomeRoot).chrome;
      if (chromeRecord.status !== 'present') return assert.fail('the ready gate files record a Chrome binary');
      current.ports.chromeVerifyFailure = 'changed';

      await current.execute();

      assert.deepEqual(current.ports.chromeVerifications, [{ recorded: chromeRecord.value, cacheDir: hyperframesPaths(current.dataHomeRoot).cacheDir }]);
    });

    it('never stages the template copy when the Chrome binary fails verification', async () => {
      const current = await open();
      current.ports.chromeVerifyFailure = 'changed';

      await assertRefusedBeforeAnyStart(current, 'chrome-missing');
      assert.equal(current.ports.calls.includes('listTemplateFiles'), false);
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
