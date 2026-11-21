import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import { type StageExecutionResult } from '@studio/shared/ports';
import {
  DEFAULT_TEMPLATE_FILES,
  VARIABLES_INPUT_SCHEMA,
  createCompositionHarness,
  eventRecords,
  hyperframesDetails,
  onlyRequest,
  scriptFixture,
  type CompositionHarness,
  type CompositionHarnessOptions,
} from './composition-stage.harness.test';

/*
 * K12, AC 81: no log line, HyperFrames event, run activity, stage event or stage result carries a
 * variable value, a path or child output. Sentinel strings sit in the script title (a vocabulary
 * value), a recipe variable and the folder names of the scratch root (so the staged copy's path)
 * and the data home. Each scenario first proves the sentinel reached the request or the run, so a
 * clean log is not clean by accident.
 */

const SENTINEL_TITLE = 'sentinel-title-5f1c';
const SENTINEL_VARIABLE = 'sentinel-variable-9a2e';
const SENTINEL_PATH = 'sentinel-path-3d7b';
const SENTINELS = [SENTINEL_TITLE, SENTINEL_VARIABLE, SENTINEL_PATH];

const sentinelOptions: CompositionHarnessOptions = {
  template: hyperframesDetails({ inputSchema: VARIABLES_INPUT_SCHEMA }),
  script: scriptFixture({ title: `Titulo ${SENTINEL_TITLE}` }),
  params: { templateVariables: { tagline: `Linha ${SENTINEL_VARIABLE}` } },
  scratchDirName: `scratch-${SENTINEL_PATH}`,
  dataHomeDirName: `data-home-${SENTINEL_PATH}`,
};

/** Everything the stage leaves for a person or a log reader to see. */
function observableTexts(harness: CompositionHarness, result: StageExecutionResult): string[] {
  return [
    ...harness.logs.lines,
    JSON.stringify(result),
    ...harness.activities.map((activity) => activity.text),
    ...harness.events.map((event) => JSON.stringify(event)),
  ];
}

function assertNoSentinel(harness: CompositionHarness, result: StageExecutionResult): void {
  const texts = observableTexts(harness, result);
  assert.ok(texts.length > 0, 'the stage left nothing to inspect');
  for (const sentinel of SENTINELS) {
    const leaks = texts.filter((text) => text.includes(sentinel));
    assert.deepEqual(leaks, [], `"${sentinel}" leaked`);
  }
}

const REFUSED_FIELDS = ['event', 'reasonId', 'runId', 'stepKey', 'templateRef'];
const FINISHED_FIELDS = ['event', 'ok', 'pin', 'renderSeconds', 'runId', 'stepKey', 'templateRef', 'variableCount'];

describe('HyperFrames renders keep variable values, paths and child output out of logs, events and outcomes (AC 81)', () => {
  let harness: CompositionHarness | null = null;

  afterEach(async () => {
    await harness?.close();
    harness = null;
  });

  it('leaks no sentinel from a finished render', async () => {
    const current = await createCompositionHarness(sentinelOptions);
    harness = current;

    const result = await current.execute();

    const request = onlyRequest(current.runner, 'hyperframes-render');
    assert.equal(request.variables.title, `Titulo ${SENTINEL_TITLE}`);
    assert.equal(request.variables.tagline, `Linha ${SENTINEL_VARIABLE}`);
    assert.ok(request.templateDir.includes(SENTINEL_PATH));
    assert.ok(request.runtime.configDir.includes(SENTINEL_PATH));
    assert.equal(result.status, 'reported-success');
    assertNoSentinel(current, result);
  });

  it('leaks no sentinel when the staged copy is refused', async () => {
    const current = await createCompositionHarness({
      ...sentinelOptions,
      templateFiles: { ...DEFAULT_TEMPLATE_FILES, 'index.html': '<!doctype html><html><body><img src="https://cdn.example.com/a.png" data-no-timeline></body></html>' },
    });
    harness = current;

    const result = await current.execute();

    assert.ok(current.ports.calls.includes('listTemplateFiles'), 'the copy was staged under the sentinel scratch path');
    assert.equal(result.status, 'failed');
    assert.deepEqual(current.runner.requests, []);
    assertNoSentinel(current, result);
  });

  it('leaks no sentinel from a refused variable value', async () => {
    const current = await createCompositionHarness({
      ...sentinelOptions,
      params: { templateVariables: { tagline: SENTINEL_VARIABLE.repeat(20) } },
    });
    harness = current;

    const result = await current.execute();

    assert.equal(result.status, 'failed');
    assert.deepEqual(
      eventRecords(current.logs, 'hyperframes.render-refused').map((event) => event.reasonId),
      ['variable-type'],
    );
    assertNoSentinel(current, result);
  });

  it('leaks no sentinel when the runner reports a failed render', async () => {
    const current = await createCompositionHarness(sentinelOptions);
    harness = current;
    current.runner.reply = { status: 'failed', kind: 'tool', message: 'hyperframes-render failed (tool)' };

    const result = await current.execute();

    assert.equal(result.status, 'failed');
    assert.equal(current.runner.requests.length, 1);
    assertNoSentinel(current, result);
  });

  it('logs render-refused with only runId, stepKey, templateRef and reasonId', async () => {
    const current = await createCompositionHarness({ ...sentinelOptions, params: { templateVariables: { subtitle: SENTINEL_VARIABLE } } });
    harness = current;

    await current.execute();

    const refused = eventRecords(current.logs, 'hyperframes.render-refused');
    assert.equal(refused.length, 1);
    assert.deepEqual(Object.keys(refused[0] ?? {}).sort(), REFUSED_FIELDS);
    assert.equal(refused[0]?.reasonId, 'variable-undeclared');
  });

  it('logs render-finished with only runId, stepKey, templateRef, pin, ok, renderSeconds and variableCount', async () => {
    const current = await createCompositionHarness(sentinelOptions);
    harness = current;

    await current.execute();

    const finished = eventRecords(current.logs, 'hyperframes.render-finished');
    assert.equal(finished.length, 1);
    assert.deepEqual(Object.keys(finished[0] ?? {}).sort(), FINISHED_FIELDS);
    assert.equal(finished[0]?.variableCount, 6);
  });
});
