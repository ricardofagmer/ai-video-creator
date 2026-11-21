import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { HYPERFRAMES_FOLDER_NAME, type HyperframesRefusalReason } from '@studio/shared/hyperframes';
import { readHyperframesEngineFiles } from '@studio/shared/hyperframes/files';
import { hyperframesRefusalText } from '../shared/stage-texts';
import {
  CHROME_SHA256,
  DEFAULT_TEMPLATE_FILES,
  HYPERFRAMES_TEMPLATE_REF,
  STEP_KEY,
  createCompositionHarness,
  eventRecords,
  hyperframesDetails,
  needsPersonOf,
  readyEngineFiles,
  readyTrace,
  type CompositionHarness,
  type CompositionHarnessOptions,
} from './composition-stage.harness.test';

/*
 * The pre-start checks of SPEC 0008 section 5.2, through the real composition executor in live
 * mode with a HyperFrames template bound. Each first failure stops the stage as `needs-person`
 * with its section 5.7 text, sends no tool-runner request (nothing is spawned), records no cost and
 * logs one `hyperframes.render-refused` event naming the reason (AC 70, 78, 80).
 */

interface RefusalCase {
  name: string;
  reason: HyperframesRefusalReason;
  options?: CompositionHarnessOptions;
  arrange?: (harness: CompositionHarness) => void;
}

const nestedObjectSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title'],
  properties: { title: { type: 'string' }, meta: { type: 'object', properties: { size: { type: 'number' } } } },
};

const requiredTaglineSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['title', 'tagline'],
  properties: { title: { type: 'string', maxLength: 120 }, tagline: { type: 'string', maxLength: 200 } },
};

const refusals: readonly RefusalCase[] = [
  {
    name: 'refuses engine-disabled when engine.json is absent',
    reason: 'engine-disabled',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), engine: { status: 'absent' } });
    },
  },
  {
    name: 'refuses engine-disabled when engine.json says disabled',
    reason: 'engine-disabled',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({
        ...readyEngineFiles(root),
        engine: { status: 'present', value: { format: 1, state: 'disabled', updatedAt: '2026-11-20T10:05:00.000Z', updatedBy: 'owner' } },
      });
    },
  },
  {
    name: 'refuses engine-disabled when engine.json is invalid',
    reason: 'engine-disabled',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), engine: { status: 'invalid' } });
    },
  },
  {
    name: 'refuses chrome-missing when chrome.json is absent',
    reason: 'chrome-missing',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), chrome: { status: 'absent' }, chromeBinaryPresent: false });
    },
  },
  {
    name: 'refuses chrome-missing when the binary chrome.json names is gone',
    reason: 'chrome-missing',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), chromeBinaryPresent: false });
    },
  },
  {
    name: 'refuses runtime-not-prepared when config/config.json was never seeded',
    reason: 'runtime-not-prepared',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), configSeeded: false });
    },
  },
  {
    name: 'refuses trace-missing when no trace.json exists',
    reason: 'trace-missing',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), trace: { status: 'absent' } });
    },
  },
  {
    name: 'refuses trace-stale when the recorded trace failed',
    reason: 'trace-stale',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), trace: { status: 'present', value: { ...readyTrace(), result: 'fail' } } });
    },
  },
  {
    name: 'refuses trace-stale when the trace was taken for another pin (AC 70)',
    reason: 'trace-stale',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), trace: { status: 'present', value: { ...readyTrace(), pin: '0.9.71' } } });
    },
  },
  {
    name: 'refuses trace-stale when the trace names another Chrome hash (AC 70)',
    reason: 'trace-stale',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({
        ...readyEngineFiles(root),
        trace: { status: 'present', value: { ...readyTrace(), chromeSha256: CHROME_SHA256.replace(/^a/, '0') } },
      });
    },
  },
  {
    name: 'refuses trace-stale when the sandbox profile changed after the trace (AC 70)',
    reason: 'trace-stale',
    arrange: (harness) => {
      harness.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), trace: { status: 'present', value: { ...readyTrace(), profileSha256: '9'.repeat(64) } } });
    },
  },
  {
    name: 'refuses pin-mismatch when the installed hyperframes package is not the approved version',
    reason: 'pin-mismatch',
    arrange: (harness) => {
      harness.ports.pinMismatch = true;
    },
  },
  {
    name: 'refuses sandbox-unavailable when the macOS sandbox tool is missing',
    reason: 'sandbox-unavailable',
    arrange: (harness) => {
      harness.ports.sandboxToolPresent = false;
    },
  },
  {
    name: 'refuses sandbox-unavailable when the sandbox profile cannot be read',
    reason: 'sandbox-unavailable',
    arrange: (harness) => {
      harness.ports.profileUnreadable = true;
    },
  },
  {
    name: 'refuses template-not-flat when the template declares a scene schema',
    reason: 'template-not-flat',
    options: { template: hyperframesDetails({ sceneSchema: { type: 'object' } }) },
  },
  {
    name: 'refuses template-not-flat when the input schema nests an object',
    reason: 'template-not-flat',
    options: { template: hyperframesDetails({ inputSchema: nestedObjectSchema }) },
  },
  {
    name: 'refuses canvas-mismatch when the template canvas differs from the recipe canvas (AC 80)',
    reason: 'canvas-mismatch',
    options: { template: hyperframesDetails({ canvas: { width: 1080, height: 1920 }, aspect: '9:16' }) },
  },
  {
    name: 'refuses canvas-mismatch when the template fps differs from the recipe fps (AC 80)',
    reason: 'canvas-mismatch',
    options: { template: hyperframesDetails({ fps: 60 }) },
  },
  {
    name: 'refuses duration-out-of-range when the narration is longer than the template allows (AC 80)',
    reason: 'duration-out-of-range',
    options: { template: hyperframesDetails({ duration: { minSec: 5, maxSec: 30 } }), narrationS: 50 },
  },
  {
    name: 'refuses duration-out-of-range when the narration is shorter than the template allows (AC 80)',
    reason: 'duration-out-of-range',
    options: { template: hyperframesDetails({ duration: { minSec: 60, maxSec: 120 } }), narrationS: 50 },
  },
  {
    name: 'refuses variable-missing when a required property has no value and no default (AC 78)',
    reason: 'variable-missing',
    options: { template: hyperframesDetails({ inputSchema: requiredTaglineSchema }) },
  },
  {
    name: 'refuses variable-undeclared when the recipe sets a name the template does not declare (AC 78)',
    reason: 'variable-undeclared',
    options: { params: { templateVariables: { subtitle: 'Uma linha a mais' } } },
  },
  {
    name: 'refuses variable-type when a recipe value has the wrong type (AC 78)',
    reason: 'variable-type',
    options: { params: { templateVariables: { durationS: 'cinquenta' } } },
  },
  {
    name: 'refuses variable-type when a string is longer than its maxLength instead of cutting it (AC 78)',
    reason: 'variable-type',
    options: { params: { templateVariables: { title: 'x'.repeat(121) } } },
  },
  {
    name: 'refuses variable-type when templateVariables is not a flat object (AC 78)',
    reason: 'variable-type',
    options: { params: { templateVariables: ['title'] } },
  },
  {
    name: 'refuses template-not-self-contained when the staged copy loads a remote script',
    reason: 'template-not-self-contained',
    options: {
      templateFiles: {
        ...DEFAULT_TEMPLATE_FILES,
        'index.html': '<!doctype html><html><body><div data-no-timeline><script src="https://cdn.example.com/lib.js"></script></div></body></html>',
      },
    },
  },
  {
    name: 'refuses template-not-self-contained when the staged copy has no timeline marker',
    reason: 'template-not-self-contained',
    options: { templateFiles: { ...DEFAULT_TEMPLATE_FILES, 'index.html': '<!doctype html><html><body><div id="card"></div></body></html>' } },
  },
  {
    name: 'refuses template-not-self-contained when the staged copy has no index.html',
    reason: 'template-not-self-contained',
    options: { templateFiles: { 'main.html': '<!doctype html><html><body><div data-no-timeline></div></body></html>' } },
  },
  {
    name: 'refuses template-not-self-contained when a copied file does not match its manifest hash',
    reason: 'template-not-self-contained',
    arrange: (harness) => {
      harness.ports.listingEdit = (files) => files.map((file) => (file.relativePath === 'style.css' ? { ...file, contentHash: '0'.repeat(64) } : file));
    },
  },
];

async function assertRefused(harness: CompositionHarness, reason: HyperframesRefusalReason): Promise<void> {
  const failure = needsPersonOf(await harness.execute());
  const expected = hyperframesRefusalText(reason, HYPERFRAMES_TEMPLATE_REF);

  assert.equal(failure.message, expected.message);
  assert.equal(failure.whatToDo, expected.whatToDo);
  assert.deepEqual(failure.cause, { kind: 'needs-person', stepKey: STEP_KEY });
  assert.deepEqual(harness.runner.requests, []);
  assert.deepEqual(harness.ledger.records, []);
  assert.equal(existsSync(harness.compositionOutputPath), false);
  assert.deepEqual(
    eventRecords(harness.logs, 'hyperframes.render-refused').map((event) => event.reasonId),
    [reason],
  );
  assert.deepEqual(eventRecords(harness.logs, 'hyperframes.render-finished'), []);
}

describe('composition HyperFrames refusals stop as needs-person with zero runner requests (SPEC 0008 section 5.2)', () => {
  let harness: CompositionHarness | null = null;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  for (const refusal of refusals) {
    it(refusal.name, async () => {
      const current = await createCompositionHarness(refusal.options);
      harness = current;
      refusal.arrange?.(current);

      await assertRefused(current, refusal.reason);
    });
  }

  it('stops a live run at composition with the engine-disabled text when the data home has no hyperframes folder (AC 70)', async () => {
    const current = await createCompositionHarness();
    harness = current;
    current.ports.engineFiles = readHyperframesEngineFiles;

    const failure = needsPersonOf(await current.execute());

    assert.equal(failure.message, 'O motor HyperFrames está desligado.');
    assert.equal(failure.whatToDo, 'Rode `studio hyperframes status` e siga os passos, ou vincule um modelo Remotion.');
    assert.deepEqual(failure.cause, { kind: 'needs-person', stepKey: STEP_KEY });
    assert.deepEqual(current.runner.requests, []);
    assert.equal(existsSync(join(current.dataHomeRoot, HYPERFRAMES_FOLDER_NAME)), false, 'the watcher writes nothing under <data home>/hyperframes/');
  });

  it('checks the engine before the template, so a disabled engine wins over a non-flat template', async () => {
    const current = await createCompositionHarness({ template: hyperframesDetails({ sceneSchema: { type: 'object' } }) });
    harness = current;
    current.ports.engineFiles = async (root) => ({ ...readyEngineFiles(root), engine: { status: 'absent' } });

    await assertRefused(current, 'engine-disabled');
  });

  it('never lists or copies the template folder when a check before the copy refuses', async () => {
    const current = await createCompositionHarness({ params: { templateVariables: { subtitle: 'Uma linha a mais' } } });
    harness = current;

    await assertRefused(current, 'variable-undeclared');
    assert.equal(current.ports.calls.includes('listTemplateFiles'), false);
  });
});
