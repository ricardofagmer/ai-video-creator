import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, it } from 'node:test';
import { HYPERFRAMES_FOLDER_NAME, type HyperframesRefusalReason } from '@studio/shared/hyperframes';
import { hyperframesRefusalText } from '../shared/stage-texts';
import {
  DEFAULT_TEMPLATE_FILES,
  HYPERFRAMES_TEMPLATE_REF,
  STEP_KEY,
  createCompositionHarness,
  eventRecords,
  hyperframesDetails,
  needsPersonOf,
  type CompositionHarness,
  type CompositionHarnessOptions,
} from './composition-stage.harness.test';

/*
 * The pre-start checks of SPEC 0008 section 5.2, through the real composition executor in live
 * mode with a HyperFrames template bound. Each first failure stops the stage as `needs-person`
 * with its section 5.7 text, sends no tool-runner request (nothing is spawned), records no cost and
 * logs one `hyperframes.render-refused` event naming the reason (AC 70, 78, 80). Check 1, the render
 * runtime gate, is scripted here by its answer: which files or tools give which reason, and in
 * what order, is tested once at the gate in `@studio/hyperframes`
 * (docs/specs/2026-11-25-render-runtime-gate-design.md decision 9).
 */

interface RefusalCase {
  name: string;
  reason: HyperframesRefusalReason;
  options?: CompositionHarnessOptions;
  arrange?: (harness: CompositionHarness) => void;
}

/** Every reason the render runtime gate can answer (SPEC 0008 section 4.5 and 5.2 check 1). */
const GATE_REASONS: readonly HyperframesRefusalReason[] = [
  'engine-disabled',
  'trace-missing',
  'trace-stale',
  'pin-mismatch',
  'chrome-missing',
  'runtime-not-prepared',
  'sandbox-unavailable',
];

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
  ...GATE_REASONS.map(
    (reason): RefusalCase => ({
      name: `turns the render runtime gate's ${reason} into its needs-person stop`,
      reason,
      arrange: (harness) => {
        harness.ports.refusal = reason;
      },
    }),
  ),
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

  it('stops a live run at composition with the engine-disabled text and writes nothing under the hyperframes folder (AC 70)', async () => {
    const current = await createCompositionHarness();
    harness = current;
    current.ports.refusal = 'engine-disabled';

    const failure = needsPersonOf(await current.execute());

    assert.equal(failure.message, 'O motor HyperFrames está desligado.');
    assert.equal(failure.whatToDo, 'Rode `studio hyperframes status` e siga os passos, ou vincule um modelo Remotion.');
    assert.deepEqual(failure.cause, { kind: 'needs-person', stepKey: STEP_KEY });
    assert.deepEqual(current.runner.requests, []);
    assert.equal(existsSync(join(current.dataHomeRoot, HYPERFRAMES_FOLDER_NAME)), false, 'the watcher writes nothing under <data home>/hyperframes/');
  });

  it('asks the render runtime gate before the template, so a disabled engine wins over a non-flat template', async () => {
    const current = await createCompositionHarness({ template: hyperframesDetails({ sceneSchema: { type: 'object' } }) });
    harness = current;
    current.ports.refusal = 'engine-disabled';

    await assertRefused(current, 'engine-disabled');
  });

  it('never lists or copies the template folder when a check before the copy refuses', async () => {
    const current = await createCompositionHarness({ params: { templateVariables: { subtitle: 'Uma linha a mais' } } });
    harness = current;

    await assertRefused(current, 'variable-undeclared');
    assert.equal(current.ports.calls.includes('listTemplateFiles'), false);
  });
});
