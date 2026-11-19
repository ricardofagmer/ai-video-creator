import assert from 'node:assert/strict';
import { mkdtemp, readFile, readdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import type { MetricImportReport } from '@studio/shared/api';
import { InputFileError, InputFileTooLargeError } from '../errors/cli.errors.js';
import { type MetricsImporter, type MetricsImportRequest } from '../metrics/metrics-importer.js';
import type { Printer } from '../output/printer.js';
import { metricsImportCommand } from './metrics-import.command.js';

/*
 * SPEC 0006 R3-07 and R3-AC-08: `studio metrics import --dry-run` writes nothing. The importer
 * fake stands in for the core `ImportMetricsCommand` handler and counts what a real import would
 * write; files live in an `fs.mkdtemp` folder under the OS temp directory. No SQLite, no data home.
 */

const CSV = 'Content,Views\nabcdefghijk,1200\n';

class FakeImporter implements MetricsImporter {
  readonly requests: MetricsImportRequest[] = [];
  /** What the handler would have written: one per created or updated snapshot of a real import. */
  writes = 0;

  constructor(readonly maxFileBytes: number) {}

  async importFile(request: MetricsImportRequest): Promise<MetricImportReport> {
    this.requests.push(request);
    if (!request.dryRun) this.writes += 1;
    return {
      importId: request.dryRun ? null : '01JDA70000000000000000MP01',
      dryRun: request.dryRun,
      platform: request.platform,
      asOfDate: request.asOfDate,
      rows: 1,
      matched: 1,
      created: 1,
      updated: 0,
      unchanged: 0,
      unmatched: [],
      unmatchedTotal: 0,
      issues: [{ line: 3, issue: 'number-invalid' }],
      issuesTotal: 1,
      ignoredColumns: 0,
      duplicateFile: false,
      scoreRecomputed: false,
    };
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

describe('studio metrics import', () => {
  let folder = '';

  before(async () => {
    folder = await mkdtemp(join(tmpdir(), 'studio-cli-metrics-'));
  });

  after(async () => {
    await rm(folder, { recursive: true, force: true });
  });

  it('--dry-run hands the bytes over as a dry run and writes nothing (R3-AC-08)', async () => {
    const file = join(folder, 'export.csv');
    await writeFile(file, CSV);
    const importer = new FakeImporter(2_097_152);
    const printer = new RecordingPrinter();

    const exitCode = await metricsImportCommand(
      { file, platform: 'youtube', asOfDate: '2026-11-18', dryRun: true },
      importer,
      { printer, signal: new AbortController().signal },
    );

    assert.equal(exitCode, 0);
    assert.equal(importer.requests.length, 1);
    assert.equal(importer.requests[0]?.dryRun, true);
    assert.equal(importer.requests[0]?.platform, 'youtube');
    assert.equal(importer.requests[0]?.asOfDate, '2026-11-18');
    assert.equal(Buffer.from(importer.requests[0]?.file ?? new Uint8Array()).toString('utf8'), CSV);
    assert.equal(importer.writes, 0);
    // The CLI itself wrote nothing: the folder holds only the input, unchanged.
    assert.deepEqual(await readdir(folder), ['export.csv']);
    assert.equal(await readFile(file, 'utf8'), CSV);
    assert.match(printer.lines[0] ?? '', /Simulação .*nada foi gravado/);
    assert.ok(printer.lines.some((line) => line === '  linha 3: número inválido'));
    // Nothing printed names the file.
    assert.ok(printer.lines.every((line) => !line.includes('export.csv')));
  });

  it('refuses a file over the cap without calling the handler', async () => {
    const file = join(folder, 'big.csv');
    await writeFile(file, 'x'.repeat(17));
    const importer = new FakeImporter(16);

    await assert.rejects(
      metricsImportCommand({ file, platform: 'tiktok', asOfDate: '2026-11-18', dryRun: false }, importer, {
        printer: new RecordingPrinter(),
        signal: new AbortController().signal,
      }),
      (error: unknown) => error instanceof InputFileTooLargeError && !error.message.includes('big.csv'),
    );
    assert.equal(importer.requests.length, 0);
    await rm(file);
  });

  it('accepts a file exactly at the cap', async () => {
    const file = join(folder, 'exact.csv');
    await writeFile(file, 'y'.repeat(16));
    const importer = new FakeImporter(16);
    await metricsImportCommand({ file, platform: 'instagram', asOfDate: '2026-11-18', dryRun: true }, importer, {
      printer: new RecordingPrinter(),
      signal: new AbortController().signal,
    });
    assert.equal(importer.requests[0]?.file.length, 16);
    await rm(file);
  });

  it('refuses a symbolic link and a missing file', async () => {
    const target = join(folder, 'target.csv');
    const link = join(folder, 'link.csv');
    await writeFile(target, CSV);
    await symlink(target, link);
    const importer = new FakeImporter(2_097_152);
    const dependencies = { printer: new RecordingPrinter(), signal: new AbortController().signal };

    await assert.rejects(
      metricsImportCommand({ file: link, platform: 'youtube', asOfDate: '2026-11-18', dryRun: true }, importer, dependencies),
      (error: unknown) => error instanceof InputFileError && error.problem === 'symlink',
    );
    await assert.rejects(
      metricsImportCommand({ file: join(folder, 'absent.csv'), platform: 'youtube', asOfDate: '2026-11-18', dryRun: true }, importer, dependencies),
      (error: unknown) => error instanceof InputFileError && error.problem === 'not-found',
    );
    assert.equal(importer.requests.length, 0);
    await rm(link);
    await rm(target);
  });
});
