import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { TraceExport, TraceExportSummary } from '@studio/shared/telemetry';
import { ExitCode, exitCodeForCategory } from '../errors/exit-codes.js';
import type { Printer } from '../output/printer.js';
import { TraceExportError, type TraceExportRefusal } from './trace-errors.js';
import { type TraceSource } from './trace-source.js';
import { tracesExportCommand } from './traces-export.command.js';

/*
 * SPEC 0006 R3-09 and R3-AC-26, ADR 0006 decision 2: `studio traces export` writes only the `--out`
 * file and refuses an existing one unless `--force` is given. The trace source fake stands in for
 * the file reader and the shared mapper; files live in an `fs.mkdtemp` folder under the OS temp
 * directory. No SQLite, no real data home, no network.
 */

const RUN_ID = '01JDA60000000000000000RNN1';
const TRACE_ID = '0123456789abcdef0123456789abcdef';

function summary(mappedLines: number): TraceExportSummary {
  return {
    kind: 'run',
    targetId: RUN_ID,
    traceId: TRACE_ID,
    spans: 1,
    spanEvents: 0,
    mappedLines,
    unmappedLines: 0,
    droppedAttributes: 0,
    sessionsWithoutEnd: 0,
  };
}

function exported(mappedLines: number): TraceExport {
  return {
    document: {
      resourceSpans: [
        {
          resource: { attributes: [{ key: 'service.name', value: { stringValue: 'video-studio-watcher' } }] },
          scopeSpans: [
            {
              scope: { name: 'video-studio.traces', version: '1' },
              spans: [
                {
                  traceId: TRACE_ID,
                  spanId: '0123456789abcdef',
                  name: 'run',
                  kind: 1,
                  startTimeUnixNano: '1000000000',
                  endTimeUnixNano: '2000000000',
                  attributes: [{ key: 'studio.run.id', value: { stringValue: RUN_ID } }],
                  events: [],
                  status: { code: 1 },
                },
              ],
            },
          ],
        },
      ],
    },
    summary: summary(mappedLines),
  };
}

class FakeTraceSource implements TraceSource {
  readonly loads: string[] = [];

  constructor(private readonly result: TraceExport) {}

  async load(targetId: string): Promise<TraceExport> {
    this.loads.push(targetId);
    return this.result;
  }
}

class RecordingPrinter implements Printer {
  readonly lines: string[] = [];
  readonly errors: string[] = [];

  line(text = ''): void {
    this.lines.push(text);
  }

  error(text: string): void {
    this.errors.push(text);
  }
}

function dependencies(printer: Printer = new RecordingPrinter()): { printer: Printer; signal: AbortSignal } {
  return { printer, signal: new AbortController().signal };
}

function refusedWith(refusal: TraceExportRefusal, fileName: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof TraceExportError && error.refusal === refusal && !error.message.includes(fileName);
}

describe('studio traces export', () => {
  let root = '';
  let folder = '';
  let dataHomeRoot = '';

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio-cli-traces-'));
  });

  beforeEach(async () => {
    folder = await mkdtemp(join(root, 'case-'));
    dataHomeRoot = join(folder, 'data-home-absent');
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('writes only the --out file, owner-only, and prints ids and counts (R3-AC-26)', async () => {
    const out = join(folder, 'trace-export.json');
    const source = new FakeTraceSource(exported(5));
    const printer = new RecordingPrinter();

    const exitCode = await tracesExportCommand({ targetId: RUN_ID, out, force: false }, { source, dataHomeRoot }, dependencies(printer));

    assert.equal(exitCode, ExitCode.ok);
    assert.deepEqual(source.loads, [RUN_ID]);
    assert.deepEqual(await readdir(folder, { recursive: true }), ['trace-export.json']);
    assert.deepEqual(JSON.parse(await readFile(out, 'utf8')), exported(5).document);
    assert.equal((await stat(out)).mode & 0o777, 0o600);
    assert.ok(printer.lines[0]?.includes(RUN_ID));
    assert.ok(printer.lines[0]?.includes(TRACE_ID));
    assert.ok(printer.lines.every((line) => !line.includes('trace-export.json') && !line.includes(folder)));
  });

  it('refuses an existing --out file without reading the source or changing the file', async () => {
    const out = join(folder, 'existing.json');
    await writeFile(out, 'owner data\n');
    const source = new FakeTraceSource(exported(5));

    await assert.rejects(
      tracesExportCommand({ targetId: RUN_ID, out, force: false }, { source, dataHomeRoot }, dependencies()),
      refusedWith('output-exists', 'existing.json'),
    );
    assert.equal(exitCodeForCategory(new TraceExportError('output-exists').category), ExitCode.conflict);
    assert.deepEqual(source.loads, []);
    assert.equal(await readFile(out, 'utf8'), 'owner data\n');
    assert.deepEqual(await readdir(folder), ['existing.json']);
  });

  it('replaces an existing regular file only with --force (ADR 0006 decision 2)', async () => {
    const out = join(folder, 'existing.json');
    await writeFile(out, 'old export\n');

    await tracesExportCommand({ targetId: RUN_ID, out, force: true }, { source: new FakeTraceSource(exported(5)), dataHomeRoot }, dependencies());

    assert.deepEqual(JSON.parse(await readFile(out, 'utf8')), exported(5).document);
    assert.deepEqual(await readdir(folder), ['existing.json']);
  });

  it('never follows a link, even with --force', async () => {
    const target = join(folder, 'target.json');
    const link = join(folder, 'link.json');
    await writeFile(target, 'owner data\n');
    await symlink(target, link);

    await assert.rejects(
      tracesExportCommand({ targetId: RUN_ID, out: link, force: true }, { source: new FakeTraceSource(exported(5)), dataHomeRoot }, dependencies()),
      refusedWith('output-not-a-file', 'link.json'),
    );
    assert.equal(await readFile(target, 'utf8'), 'owner data\n');
  });

  it('refuses an --out inside the data home, so no run file such as approval.json is ever created', async () => {
    const dataHome = join(folder, 'data-home');
    const runFolder = join(dataHome, 'runs', RUN_ID);
    await mkdir(runFolder, { recursive: true });

    await assert.rejects(
      tracesExportCommand(
        { targetId: RUN_ID, out: join(runFolder, 'approval.json'), force: false },
        { source: new FakeTraceSource(exported(5)), dataHomeRoot: dataHome },
        dependencies(),
      ),
      refusedWith('output-inside-data-home', 'approval.json'),
    );
    assert.deepEqual(await readdir(runFolder), []);
  });

  it('refuses a missing folder and an empty source without writing anything', async () => {
    await assert.rejects(
      tracesExportCommand(
        { targetId: RUN_ID, out: join(folder, 'absent-folder', 'trace.json'), force: false },
        { source: new FakeTraceSource(exported(5)), dataHomeRoot },
        dependencies(),
      ),
      refusedWith('output-folder-missing', 'absent-folder'),
    );
    await assert.rejects(
      tracesExportCommand({ targetId: RUN_ID, out: join(folder, 'trace.json'), force: false }, { source: new FakeTraceSource(exported(0)), dataHomeRoot }, dependencies()),
      refusedWith('source-empty', 'trace.json'),
    );
    assert.deepEqual(await readdir(folder), []);
  });
});
