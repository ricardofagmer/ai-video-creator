import assert from 'node:assert/strict';
import { type IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { ImportMetricsCommand, MetricImportRefusedError } from '@studio/core/metrics';
import { type MetricImportReport } from '@studio/shared/api';
import { metricsBounds } from '@studio/shared/metrics';
import { type MultipartSource } from '../catalog/multipart-parts';
import { MetricsFileTooLargeError, UploadRejectedError } from '../platform/api.errors';
import { mapError } from '../platform/error-mapping';
import { OWNER_SUBJECT, RequestContext, type Principal } from '../platform/request-context';
import { MetricImportsController, type MetricImportCommandPort } from './metric-imports.controller';
import { MetricsResponseAssembler } from './metrics-response.assembler';

const BOUNDARY = 'studio-test-boundary';
const CORRELATION_ID = 'req-metrics-1';
const AS_OF_DATE = '2026-11-18';
const principal: Principal = { subject: OWNER_SUBJECT, sessionId: '01JD0000000000000000000009', expiresAt: '2026-11-20T00:00:00.000Z' };

type Part = { name: string; value: string } | { name: string; filename: string; content: Uint8Array };

function multipartBody(parts: readonly Part[]): Buffer {
  const chunks: Buffer[] = [];
  for (const part of parts) {
    if ('value' in part) {
      chunks.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`));
      continue;
    }
    chunks.push(Buffer.from(`--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: text/csv\r\n\r\n`));
    chunks.push(Buffer.from(part.content));
    chunks.push(Buffer.from('\r\n'));
  }
  chunks.push(Buffer.from(`--${BOUNDARY}--\r\n`));
  return Buffer.concat(chunks);
}

function uploadRequest(body: Buffer, extraHeaders: IncomingHttpHeaders = {}): MultipartSource {
  const headers: IncomingHttpHeaders = { 'content-type': `multipart/form-data; boundary=${BOUNDARY}`, ...extraHeaders };
  return Object.assign(Readable.from([body], { objectMode: false }), { headers });
}

function fieldsThen(...files: Part[]): Part[] {
  return [{ name: 'platform', value: 'youtube' }, { name: 'asOfDate', value: AS_OF_DATE }, ...files];
}

const dryRunReport: MetricImportReport = {
  importId: null,
  dryRun: true,
  platform: 'youtube',
  asOfDate: AS_OF_DATE,
  rows: 1,
  matched: 0,
  created: 0,
  updated: 0,
  unchanged: 0,
  unmatched: [],
  unmatchedTotal: 0,
  issues: [],
  issuesTotal: 0,
  ignoredColumns: 0,
  duplicateFile: false,
  scoreRecomputed: false,
};

/** Records every import command; a refusal test passes only if this stays empty. */
class RecordingImportCommands implements MetricImportCommandPort {
  readonly received: ImportMetricsCommand[] = [];

  async execute(command: ImportMetricsCommand): Promise<MetricImportReport> {
    this.received.push(command);
    return dryRunReport;
  }
}

interface Harness {
  commands: RecordingImportCommands;
  submit(request: MultipartSource, dryRun?: 'true' | 'false'): Promise<MetricImportReport>;
}

function harness(): Harness {
  const commands = new RecordingImportCommands();
  const context = new RequestContext();
  const controller = new MetricImportsController(commands, context, new MetricsResponseAssembler());
  return {
    commands,
    submit: (request, dryRun) =>
      new Promise<MetricImportReport>((resolve, reject) => {
        context.run({ correlationId: CORRELATION_ID, principal }, () => {
          controller.importCsv(request, { dryRun: dryRun === undefined ? undefined : dryRun === 'true' }, principal).then(resolve, reject);
        });
      }),
  };
}

async function refusal(submission: Promise<MetricImportReport>): Promise<unknown> {
  try {
    await submission;
  } catch (error) {
    return error;
  }
  return assert.fail('the upload was accepted');
}

describe('POST /metrics/imports receive stage (SPEC 0006 section 5.3)', () => {
  it('refuses a file over 2 MiB with 413 metrics-file-too-large before any handler call', async () => {
    const { commands, submit } = harness();
    const oversize = Buffer.alloc(metricsBounds.maxFileBytes + 1, 0x61);
    const error = await refusal(submit(uploadRequest(multipartBody(fieldsThen({ name: 'file', filename: 'export.csv', content: oversize })))));
    assert.ok(error instanceof MetricsFileTooLargeError);
    const mapped = mapError(error);
    assert.equal(mapped.statusCode, 413);
    assert.equal(mapped.reason, 'metrics-file-too-large');
    assert.equal(commands.received.length, 0);
  });

  it('accepts a file of exactly 2 MiB with its true Content-Length and hands every byte to core', async () => {
    const { commands, submit } = harness();
    const atLimit = Buffer.alloc(metricsBounds.maxFileBytes, 0x61);
    assert.equal(atLimit.length, 2 * 1024 * 1024);
    const body = multipartBody(fieldsThen({ name: 'file', filename: 'export.csv', content: atLimit }));
    await submit(uploadRequest(body, { 'content-length': String(body.length) }), 'true');
    assert.equal(commands.received.length, 1);
    const [command] = commands.received;
    assert.ok(command !== undefined);
    assert.equal(command.input.file.length, metricsBounds.maxFileBytes);
  });

  it('refuses a file of 2 MiB + 1 with 413 even when its true Content-Length passes the declared precheck', async () => {
    const { commands, submit } = harness();
    const overByOne = Buffer.alloc(metricsBounds.maxFileBytes + 1, 0x61);
    const body = multipartBody(fieldsThen({ name: 'file', filename: 'export.csv', content: overByOne }));
    const error = await refusal(submit(uploadRequest(body, { 'content-length': String(body.length) })));
    assert.ok(error instanceof MetricsFileTooLargeError);
    assert.equal(mapError(error).statusCode, 413);
    assert.equal(commands.received.length, 0);
  });

  it('refuses a declared body over the limit before reading it', async () => {
    const { commands, submit } = harness();
    const body = multipartBody(fieldsThen({ name: 'file', filename: 'export.csv', content: Buffer.from('Content,Views\n') }));
    const error = await refusal(submit(uploadRequest(body, { 'content-length': String(metricsBounds.maxFileBytes * 2) })));
    assert.ok(error instanceof MetricsFileTooLargeError);
    assert.equal(commands.received.length, 0);
  });

  it('refuses a second file part (too many parts) before any handler call', async () => {
    const { commands, submit } = harness();
    const csv = Buffer.from('Content,Views\nabcdefghijk,10\n');
    const body = multipartBody(fieldsThen({ name: 'file', filename: 'a.csv', content: csv }, { name: 'file', filename: 'b.csv', content: csv }));
    const error = await refusal(submit(uploadRequest(body)));
    assert.ok(error instanceof UploadRejectedError);
    assert.equal(error.rejection, 'too-many-parts');
    assert.equal(mapError(error).statusCode, 400);
    assert.equal(commands.received.length, 0);
  });

  it('refuses more than four text fields before any handler call', async () => {
    const { commands, submit } = harness();
    const extra: Part[] = ['a', 'b', 'c'].map((name) => ({ name, value: 'x' }));
    const body = multipartBody([...fieldsThen(), ...extra, { name: 'file', filename: 'a.csv', content: Buffer.from('Content,Views\n') }]);
    const error = await refusal(submit(uploadRequest(body)));
    assert.ok(error instanceof UploadRejectedError);
    assert.equal(commands.received.length, 0);
  });

  it('refuses a zip (xlsx) with 422 metrics-not-csv before any handler call, whatever its name', async () => {
    const { commands, submit } = harness();
    const zip = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
    const error = await refusal(submit(uploadRequest(multipartBody(fieldsThen({ name: 'file', filename: 'export.csv', content: zip })))));
    assert.ok(error instanceof MetricImportRefusedError);
    const mapped = mapError(error);
    assert.equal(mapped.statusCode, 422);
    assert.equal(mapped.reason, 'metrics-not-csv');
    assert.doesNotMatch(mapped.message, /export\.csv/);
    assert.equal(commands.received.length, 0);
  });

  it('refuses bytes that are not UTF-8 with metrics-not-csv before any handler call', async () => {
    const { commands, submit } = harness();
    const malformed = Buffer.from([0x43, 0x6f, 0xc3, 0x28, 0x0a]);
    const error = await refusal(submit(uploadRequest(multipartBody(fieldsThen({ name: 'file', filename: 'export.csv', content: malformed })))));
    assert.ok(error instanceof MetricImportRefusedError);
    assert.equal(mapError(error).reason, 'metrics-not-csv');
    assert.equal(commands.received.length, 0);
  });

  it('refuses a file sent before its fields', async () => {
    const { commands, submit } = harness();
    const body = multipartBody([{ name: 'file', filename: 'a.csv', content: Buffer.from('Content,Views\n') }, ...fieldsThen()]);
    const error = await refusal(submit(uploadRequest(body)));
    assert.ok(error instanceof UploadRejectedError);
    assert.equal(commands.received.length, 0);
  });

  it('hands the bytes, the session owner and the request id to core, never the file name or a body actor', async () => {
    const { commands, submit } = harness();
    const csv = Buffer.from('Content,Views\nabcdefghijk,120\n');
    const report = await submit(uploadRequest(multipartBody(fieldsThen({ name: 'file', filename: 'secret-name.csv', content: csv }))), 'true');
    assert.deepEqual(report, dryRunReport);
    assert.equal(commands.received.length, 1);
    const [command] = commands.received;
    assert.ok(command !== undefined);
    assert.deepEqual(Object.keys(command.input).sort(), ['correlationId', 'dryRun', 'fields', 'file', 'importedBy']);
    assert.equal(command.input.importedBy, OWNER_SUBJECT);
    assert.equal(command.input.correlationId, CORRELATION_ID);
    assert.equal(command.input.dryRun, true);
    assert.deepEqual(command.input.fields, { platform: 'youtube', asOfDate: AS_OF_DATE });
    assert.deepEqual(Buffer.from(command.input.file), csv);
  });
});
