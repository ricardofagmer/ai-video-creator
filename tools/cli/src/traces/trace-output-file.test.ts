import assert from 'node:assert/strict';
import { link, mkdir, mkdtemp, readFile, readdir, rename, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import type { TraceExport } from '@studio/shared/telemetry';
import type { Printer } from '../output/printer.js';
import { TraceExportError, type TraceExportRefusal } from './trace-errors.js';
import { checkTraceOutput, writeTraceOutput } from './trace-output-file.js';
import { type TraceSource } from './trace-source.js';
import { tracesExportCommand } from './traces-export.command.js';

/*
 * ADR 0006 decision 2, RUN-FORMAT section 4: `--force` replaces only the regular file the check saw,
 * and never a data-home file reached through a hard link or a swapped folder. The data home is an
 * `fs.mkdtemp` folder under the OS temp directory. No SQLite, no real data home, no network.
 */

const RUN_ID = '01JDA60000000000000000RNN1';
const APPROVAL = '{"format":1,"decision":"approved"}\n';

class UnusedTraceSource implements TraceSource {
  readonly loads: string[] = [];

  async load(targetId: string): Promise<TraceExport> {
    this.loads.push(targetId);
    throw new Error('the output check must refuse before the source is read');
  }
}

class RecordingPrinter implements Printer {
  readonly lines: string[] = [];

  line(text = ''): void {
    this.lines.push(text);
  }

  error(text: string): void {
    this.lines.push(text);
  }
}

function refusedWith(refusal: TraceExportRefusal, fileName: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof TraceExportError && error.refusal === refusal && !error.message.includes(fileName);
}

describe('trace output file', () => {
  let root = '';
  let folder = '';
  let dataHome = '';
  let runFolder = '';
  let approvalPath = '';

  before(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio-cli-trace-out-'));
  });

  beforeEach(async () => {
    folder = await mkdtemp(join(root, 'case-'));
    dataHome = join(folder, 'data-home');
    runFolder = join(dataHome, 'runs', RUN_ID);
    await mkdir(runFolder, { recursive: true });
    approvalPath = join(runFolder, 'approval.json');
  });

  after(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('refuses a hard link to a data-home file under --force, before reading the source, changing nothing', async () => {
    await writeFile(approvalPath, APPROVAL);
    const out = join(folder, 'linked.json');
    await link(approvalPath, out);
    const source = new UnusedTraceSource();

    await assert.rejects(
      tracesExportCommand({ targetId: RUN_ID, out, force: true }, { source, dataHomeRoot: dataHome }, { printer: new RecordingPrinter(), signal: new AbortController().signal }),
      refusedWith('output-not-a-file', 'linked.json'),
    );
    assert.deepEqual(source.loads, []);
    assert.equal(await readFile(approvalPath, 'utf8'), APPROVAL);
    assert.equal(await readFile(out, 'utf8'), APPROVAL);
    assert.deepEqual(await readdir(runFolder), ['approval.json']);
  });

  it('refuses a checked file swapped for a hard link to a data-home file before the write', async () => {
    await writeFile(approvalPath, APPROVAL);
    const out = join(folder, 'export.json');
    await writeFile(out, 'old export\n');
    const checked = await checkTraceOutput({ path: out, force: true, dataHomeRoot: dataHome, targetId: RUN_ID });
    await unlink(out);
    await link(approvalPath, out);

    await assert.rejects(writeTraceOutput(checked, '{"resourceSpans":[]}\n'), refusedWith('output-not-a-file', 'export.json'));
    assert.equal(await readFile(approvalPath, 'utf8'), APPROVAL);
  });

  it('refuses a checked file that gained a second name inside the data home before the write', async () => {
    const out = join(folder, 'export.json');
    await writeFile(out, 'old export\n');
    const checked = await checkTraceOutput({ path: out, force: true, dataHomeRoot: dataHome, targetId: RUN_ID });
    const controlPath = join(runFolder, 'control.json');
    await link(out, controlPath);

    await assert.rejects(writeTraceOutput(checked, '{"resourceSpans":[]}\n'), refusedWith('output-not-a-file', 'export.json'));
    assert.equal(await readFile(controlPath, 'utf8'), 'old export\n');
  });

  it('refuses a folder swapped for a link into the data home after the check and removes what it created', async () => {
    const outFolder = join(folder, 'exports');
    await mkdir(outFolder);
    const checked = await checkTraceOutput({ path: join(outFolder, 'approval.json'), force: false, dataHomeRoot: dataHome, targetId: RUN_ID });
    await rename(outFolder, join(folder, 'exports-moved'));
    await symlink(runFolder, outFolder, 'dir');

    await assert.rejects(writeTraceOutput(checked, '{"resourceSpans":[]}\n'), refusedWith('output-inside-data-home', 'approval.json'));
    assert.deepEqual(await readdir(runFolder), []);
  });

  it('empties a longer file it replaces under --force, so no old byte remains', async () => {
    const out = join(folder, 'export.json');
    await writeFile(out, `${'old export '.repeat(100)}\n`);
    const checked = await checkTraceOutput({ path: out, force: true, dataHomeRoot: dataHome, targetId: RUN_ID });

    await writeTraceOutput(checked, '{"resourceSpans":[]}\n');

    assert.equal(await readFile(out, 'utf8'), '{"resourceSpans":[]}\n');
  });
});
