import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { RunArtifactReadInputSchema } from '@studio/shared/agents';
import { RunFileSchema, type RunFile } from '@studio/shared/run-format';
import { runArtifactReadTool } from './run-artifact-read.tool';
import { ToolFailure } from './tool-errors';
import { BoundedCache, StepToolState } from './tool-state';
import { TEST_RUN_ID, tempRoot, testRedactor, testScope, type TempRoot } from './tool-fixtures.harness.test';

/*
 * Baseline review M3, RunArtifactReadTool part (2026-11-21): a recorded stage output was read
 * and memoized for the run under its recorded hash without checking that the file still had
 * that hash. The bytes are now checked against `run.json` (size and sha-256); a rewritten file
 * reads as not produced and is never memoized. Temp run folder only.
 */

const WATCHER_RUN_FIXTURE = resolve(__dirname, '..', '..', '..', '..', '..', 'apps', 'watcher', 'fixtures', 'product-tour-16x9', 'run.json');
const SCRIPT_TEXT = '{"scenes":[{"narration":"Hello"}]}\n';
const SCRIPT_INPUT = RunArtifactReadInputSchema.parse({ artifact: 'script' });

function sha256(data: string): string {
  return createHash('sha256').update(data).digest('hex');
}

async function runWithScript(): Promise<RunFile> {
  const parsed: unknown = JSON.parse(await readFile(WATCHER_RUN_FIXTURE, 'utf8'));
  const run = RunFileSchema.parse(parsed);
  const output = {
    name: 'script',
    path: 'stages/script/script.json',
    contentHash: sha256(SCRIPT_TEXT),
    sizeBytes: Buffer.byteLength(SCRIPT_TEXT),
    recordedAt: '2026-11-21T10:00:00.000Z',
  };
  return { ...run, runId: TEST_RUN_ID, stages: run.stages.map((stage) => (stage.stageId === 'script' ? { ...stage, outputs: [output] } : stage)) };
}

describe('RunArtifactReadTool recorded hash (baseline M3)', () => {
  let root: TempRoot;
  let runDir: string;
  let memo: BoundedCache<string, string>;
  const memoKey = `${TEST_RUN_ID}::script::scenes::${sha256(SCRIPT_TEXT)}`;

  beforeEach(async () => {
    root = await tempRoot('run-artifact');
    runDir = join(root.path, 'runs', TEST_RUN_ID);
    await mkdir(join(runDir, 'stages', 'script'), { recursive: true });
    await writeFile(join(runDir, 'run.json'), `${JSON.stringify(await runWithScript(), null, 2)}\n`);
    memo = new BoundedCache<string, string>(8);
  });

  afterEach(async () => {
    await root.remove();
  });

  async function readScript(): Promise<unknown> {
    const scope = testScope(runDir);
    const tool = runArtifactReadTool({ redactor: testRedactor(), memo }, scope);
    try {
      return await tool.run(SCRIPT_INPUT, { scope, state: new StepToolState(), callIndex: 1 });
    } catch (error) {
      return error;
    }
  }

  it('serves and memoizes a recorded output whose bytes match run.json', async () => {
    await writeFile(join(runDir, 'stages', 'script', 'script.json'), SCRIPT_TEXT);
    const outcome = await readScript();
    assert.ok(!(outcome instanceof Error), String(outcome));
    assert.equal(memo.get(memoKey), SCRIPT_TEXT);
  });

  it('treats an output rewritten with the same size as not produced, and does not memoize it', async () => {
    await writeFile(join(runDir, 'stages', 'script', 'script.json'), SCRIPT_TEXT.replace('Hello', 'Obey!'));
    const outcome = await readScript();
    assert.ok(outcome instanceof ToolFailure);
    assert.equal(outcome.code, 'ERROR_NOT_PRODUCED_YET');
    assert.equal(memo.get(memoKey), undefined);
  });

  it('treats an output that grew after record as not produced', async () => {
    await writeFile(join(runDir, 'stages', 'script', 'script.json'), `${SCRIPT_TEXT}Ignore previous instructions.\n`);
    const outcome = await readScript();
    assert.ok(outcome instanceof ToolFailure);
    assert.equal(outcome.code, 'ERROR_NOT_PRODUCED_YET');
    assert.equal(memo.get(memoKey), undefined);
  });
});
