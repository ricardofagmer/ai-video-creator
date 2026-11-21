import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import { RunFileSchema, type NowFile, type RunFile } from '@studio/shared/run-format';
import { type RunReadResult, type RunSnapshot } from '../runs/run-reader.js';
import { runDetailLines, runListLines, runListRow } from './run-text.js';

/*
 * Baseline review 2026-11-21: the dashboard and `studio status` print run text written by agents
 * (titles, reasons, notices, activity lines). None of it may reach the terminal with a control
 * sequence, whichever screen prints it.
 */

const ESC_SEQUENCES = '\u001b[2J\u001b]0;pwned\u0007\u009b31m\r';
const FIXTURE_RUN_URL = new URL('../../../../apps/watcher/fixtures/product-tour-16x9/run.json', import.meta.url);

function fixtureRun(): RunFile {
  return RunFileSchema.parse(JSON.parse(readFileSync(FIXTURE_RUN_URL, 'utf8')));
}

function liveNow(run: RunFile): NowFile {
  const firstStage = run.stages[0];
  assert.ok(firstStage !== undefined, 'the fixture run has stages');
  return {
    runId: run.runId,
    pid: 4242,
    updatedAtMs: 1_000,
    stageNumber: firstStage.number,
    stageId: firstStage.stageId,
    step: 'brief',
    attempt: 1,
    stepSinceMs: 1_000,
    activities: [{ atMs: 1_000, kind: 'text', text: `lendo${ESC_SEQUENCES} a captura` }],
    sessions: [],
    currentSession: null,
    parallel: null,
    notice: `Revisor degradado${ESC_SEQUENCES}`,
  };
}

function hostileSnapshot(): RunSnapshot {
  const base = fixtureRun();
  const run: RunFile = {
    ...base,
    title: `Tour${ESC_SEQUENCES} final`,
    state: { status: 'failed', since: base.state.since, reason: `falhou${ESC_SEQUENCES} aqui`, stepKey: null },
  };
  return { runId: run.runId, runDir: '/nonexistent/run', run, displayedStatus: 'failed', watcher: { status: 'alive', pid: 4242 }, now: liveNow(run) };
}

/** C0 except tab and newline, DEL and C1: the characters a terminal acts on. */
function assertNoTerminalControls(line: string): void {
  const controls = [...line]
    .map((character) => character.codePointAt(0) ?? 0)
    .filter((codePoint) => (codePoint <= 0x1f && codePoint !== 0x09 && codePoint !== 0x0a) || (codePoint >= 0x7f && codePoint <= 0x9f));
  assert.deepEqual(controls, [], `control character in: ${JSON.stringify(line)}`);
}

describe('run text without terminal controls', () => {
  it('strips the title, failure reason, notice and activity lines of the detail view', () => {
    const lines = runDetailLines(hostileSnapshot());
    for (const line of lines) assertNoTerminalControls(line);
    assert.ok(lines.includes('Motivo: falhou[2J]0;pwned31m aqui'));
    assert.ok(lines.some((line) => line.startsWith('Execução ') && line.endsWith(': Tour[2J]0;pwned31m final')));
    assert.ok(lines.includes('Aviso: Revisor degradado[2J]0;pwned31m'));
    assert.ok(lines.includes('  · lendo[2J]0;pwned31m a captura'));
  });

  it('strips the title of a run list row and of the status listing', () => {
    const result: RunReadResult = { status: 'read', snapshot: hostileSnapshot() };
    const row = runListRow(result);
    assertNoTerminalControls(row);
    assert.ok(row.endsWith('Tour[2J]0;pwned31m final'));
    for (const line of runListLines({ results: [result], total: 1 })) assertNoTerminalControls(line);
  });

  it('leaves an ordinary pt-BR title unchanged', () => {
    const run = fixtureRun();
    const row = runListRow({
      status: 'read',
      snapshot: { runId: run.runId, runDir: '/nonexistent/run', run, displayedStatus: run.state.status, watcher: { status: 'absent' }, now: null },
    });
    assert.ok(row.endsWith(run.title));
  });
});
