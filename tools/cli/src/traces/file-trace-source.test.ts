import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { fileTraceSource, type TraceDataFolders } from './file-trace-source.js';

/*
 * ADR 0006 consequences: the export counts and reports the lines it cannot map; one bad line never
 * aborts it. The data home is an `fs.mkdtemp` folder under the OS temp directory holding a run and a
 * curation fixture. No SQLite, no real data home, no network.
 */

const RUN_ID = '01JDA60000000000000000RNN1';
const RUN_SESSION = '01JDA60000000000000000SES1';
const CURATION_ID = '01JDA70000000000000000CRT1';
const CURATION_SESSION = '01JDA70000000000000000SES1';

/** Past the reader's 1 MiB page, so the line cannot be read in one page. */
const OVER_ONE_MEBIBYTE = 'x'.repeat(1_100_000);

function jsonLines(lines: readonly string[]): string {
  return lines.map((line) => `${line}\n`).join('');
}

function runEvent(atMs: number, stepKey: string | null, fields: Record<string, unknown>): string {
  return JSON.stringify({ atMs, runId: RUN_ID, level: 'info', text: 'texto', stepKey, correlationId: 'req-7f3a', ...fields });
}

const RUN_EVENTS: readonly string[] = [
  runEvent(1000, null, { type: 'run.status', from: null, to: 'running' }),
  runEvent(1100, 'script:execute:1', { type: 'step.status', status: 'running' }),
  runEvent(1200, 'script:execute:1', { type: 'session.started', sessionId: RUN_SESSION, role: 'writer', modelId: 'claude-sonnet-5-5' }),
  runEvent(1500, 'script:execute:1', { type: 'session.ended', sessionId: RUN_SESSION, role: 'writer', modelId: 'claude-sonnet-5-5', outcome: 'ok', costUsd: 0.12 }),
  runEvent(1550, 'script:execute:1', { type: 'step.status', status: 'ok' }),
  runEvent(2000, null, { type: 'run.status', from: 'running', to: 'review' }),
];

const RUN_SESSION_END = JSON.stringify({
  atMs: 1490,
  sessionId: RUN_SESSION,
  type: 'end',
  outcome: 'ok',
  error: null,
  promptRefs: ['script-writer@3'],
  skillRefs: [],
  noteIds: [],
});

const TOKENS = { inputTokens: 5200, outputTokens: 900, cacheReadTokens: 4000, cacheWriteTokens: 0 };

const CURATION_EVENTS: readonly string[] = [
  { type: 'curation.claimed', at: '2026-11-19T12:00:00.000Z', curationId: CURATION_ID, pid: 4242 },
  { type: 'curation.collected', at: '2026-11-19T12:00:01.000Z', curationId: CURATION_ID, counts: { runs: 3, notes: 2, evidence: 1, declined: 0 } },
  {
    type: 'curation.call.started',
    at: '2026-11-19T12:00:02.000Z',
    curationId: CURATION_ID,
    sessionId: CURATION_SESSION,
    attempt: 1,
    role: 'curator',
    modelId: 'claude-opus-5-5',
    instructionVersion: 'curator@1',
  },
  {
    type: 'curation.call.ended',
    at: '2026-11-19T12:00:05.000Z',
    curationId: CURATION_ID,
    sessionId: CURATION_SESSION,
    attempt: 1,
    outcome: 'ok',
    tokens: TOKENS,
    usd: 0.05,
    durationMs: 3000,
  },
  { type: 'curation.check', at: '2026-11-19T12:00:06.000Z', curationId: CURATION_ID, attempt: 1, passed: ['evidence-in-packet', 'body-changed'], failed: [] },
  { type: 'curation.ended', at: '2026-11-19T12:00:06.500Z', curationId: CURATION_ID, status: 'proposed', reasonId: null, spentUsd: 0.05, durationMs: 6500 },
].map((line) => JSON.stringify(line));

const CURATION_PROMPT_OVER_A_PAGE = JSON.stringify({ type: 'prompt', sessionId: CURATION_SESSION, text: OVER_ONE_MEBIBYTE, at: '2026-11-19T12:00:02.000Z' });

const CURATION_SESSION_END = JSON.stringify({
  type: 'end',
  sessionId: CURATION_SESSION,
  outcome: 'ok',
  instructionVersion: 'curator@1',
  usage: TOKENS,
  at: '2026-11-19T12:00:05.000Z',
});

/** A line cut mid-object, as a crash mid-append leaves it, followed by more lines. */
const CORRUPT_LINE = '{"atMs":1300,"runId":"01JDA6';

describe('fileTraceSource', () => {
  let root = '';
  let folders: TraceDataFolders = { runs: '', curations: '' };

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio-cli-trace-source-'));
  });

  beforeEach(async () => {
    const dataHome = await mkdtemp(join(root, 'data-home-'));
    folders = { runs: join(dataHome, 'runs'), curations: join(dataHome, 'curations') };
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function writeRun(events: readonly string[], trailingPartialLine = ''): Promise<void> {
    const runFolder = join(folders.runs, RUN_ID);
    await mkdir(join(runFolder, 'sessions'), { recursive: true });
    await writeFile(join(runFolder, 'events.jsonl'), `${jsonLines(events)}${trailingPartialLine}`);
    await writeFile(join(runFolder, 'sessions', `${RUN_SESSION}.jsonl`), jsonLines([RUN_SESSION_END]));
  }

  it('exports a run whose events.jsonl has a corrupt middle line, counting that line as unmapped', async () => {
    const [first, second, third, ...rest] = RUN_EVENTS;
    assert.ok(first !== undefined && second !== undefined && third !== undefined);
    // The partial last line is an append in progress: neither mapped nor counted.
    await writeRun([first, second, third, CORRUPT_LINE, ...rest], '{"atMs":2100,"runId"');

    const exported = await fileTraceSource(folders).load(RUN_ID, new AbortController().signal);

    assert.equal(exported.summary.kind, 'run');
    assert.equal(exported.summary.targetId, RUN_ID);
    // Six events and the session end line.
    assert.equal(exported.summary.mappedLines, 7);
    assert.equal(exported.summary.unmappedLines, 1);
    assert.equal(exported.summary.sessionsWithoutEnd, 0);
    assert.ok(exported.document.resourceSpans[0]?.scopeSpans[0]?.spans.some((span) => span.name === 'run'));
  });

  it('counts an events.jsonl line longer than the read page as unmapped instead of aborting', async () => {
    await writeRun([...RUN_EVENTS.slice(0, 3), JSON.stringify({ atMs: 1300, runId: RUN_ID, type: 'log', text: OVER_ONE_MEBIBYTE }), ...RUN_EVENTS.slice(3)]);

    const exported = await fileTraceSource(folders).load(RUN_ID, new AbortController().signal);

    assert.equal(exported.summary.mappedLines, 7);
    assert.equal(exported.summary.unmappedLines, 1);
  });

  it('exports a curation with a corrupt events line, a corrupt session line and a session line over 1 MiB', async () => {
    const curationFolder = join(folders.curations, CURATION_ID);
    await mkdir(curationFolder, { recursive: true });
    const [claimed, collected, ...rest] = CURATION_EVENTS;
    assert.ok(claimed !== undefined && collected !== undefined);
    await writeFile(join(curationFolder, 'events.jsonl'), jsonLines([claimed, collected, CORRUPT_LINE, ...rest]));
    await writeFile(join(curationFolder, 'session.jsonl'), jsonLines([CURATION_PROMPT_OVER_A_PAGE, '{"type":"output","sess', CURATION_SESSION_END]));

    const exported = await fileTraceSource(folders).load(CURATION_ID, new AbortController().signal);

    assert.equal(exported.summary.kind, 'curation');
    assert.equal(exported.summary.targetId, CURATION_ID);
    // Six events and the session end line; the long prompt line is not a line the export needs.
    assert.equal(exported.summary.mappedLines, 7);
    // The corrupt events line and the corrupt session line.
    assert.equal(exported.summary.unmappedLines, 2);
    assert.equal(exported.summary.sessionsWithoutEnd, 0);
  });
});
