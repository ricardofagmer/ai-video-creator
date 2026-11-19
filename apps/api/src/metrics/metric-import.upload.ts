import { type Readable } from 'node:stream';
import { MetricImportFieldsSchema, type MetricImportFields } from '@studio/shared/api';
import { metricsBounds } from '@studio/shared/metrics';
import { multipartParts, type MultipartLimits, type MultipartSource } from '../catalog/multipart-parts';
import { MetricsFileTooLargeError, RequestValidationError, UploadRejectedError } from '../platform/api.errors';

/** The C10 rev 5 part of `POST /metrics/imports` that holds the CSV bytes (SPEC 0006 section 4.4). */
export const METRIC_FILE_PART = 'file';

/** Multipart framing and the two short text fields stay well under this. */
const MULTIPART_OVERHEAD_BYTES = 64 * 1024;

/**
 * SPEC 0006 section 5.3 receive stage: one file of at most 2 MiB and at most four text fields. The
 * contract has two fields (`platform`, `asOfDate`); a third or fourth name is refused by the strict
 * schema, a fifth by the parser.
 *
 * The parser's file limit is one byte above the 5.3 bound: busboy emits `limit` when a part REACHES
 * its `fileSize`, and 5.3 refuses only a file OVER 2 MiB, so an exactly-2-MiB export (which the
 * shared reader accepts) must pass. `collectFile` keeps the exact `> 2 MiB` check.
 */
const metricImportLimits: MultipartLimits = {
  maxFiles: 1,
  maxFileBytes: metricsBounds.maxFileBytes + 1,
  maxFieldBytes: 256,
  maxFields: 4,
};

/** What the receive stage hands to the import command: the fields and the bytes, held in memory. */
export interface ReceivedMetricImport {
  fields: MetricImportFields;
  /** Backed by a plain `ArrayBuffer`, the type core's `ImportMetricsInputSchema` declares. */
  file: Uint8Array<ArrayBuffer>;
}

/** Refuses a declared body that cannot hold a file within the limit before a byte is parsed. */
function assertDeclaredSize(source: MultipartSource): void {
  const declared = source.headers['content-length'];
  if (declared === undefined) return;
  const bytes = Number.parseInt(declared, 10);
  if (Number.isSafeInteger(bytes) && bytes > metricsBounds.maxFileBytes + MULTIPART_OVERHEAD_BYTES) throw new MetricsFileTooLargeError();
}

function parseFields(values: ReadonlyMap<string, string>): MetricImportFields {
  if (values.size === 0) throw new UploadRejectedError('missing-fields');
  const parsed = MetricImportFieldsSchema.safeParse(Object.fromEntries(values));
  if (!parsed.success) {
    // Path and zod code only: a rejected value is never echoed.
    throw new RequestValidationError(parsed.error.issues.slice(0, 50).map((issue) => ({ path: issue.path.join('.').slice(0, 200), code: issue.code })));
  }
  return parsed.data;
}

/** One fresh copy of the received chunks, in memory, owning its own `ArrayBuffer`. */
function joinChunks(chunks: readonly Uint8Array[], totalBytes: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return bytes;
}

/**
 * The file part's bytes, in memory only: nothing is written to disk. The parser destroys the part
 * when it passes the limit (`file-too-large`); the running total here is a second, independent bound.
 */
function collectFile(stream: Readable, maxBytes: number): Promise<Uint8Array<ArrayBuffer>> {
  return new Promise<Uint8Array<ArrayBuffer>>((resolve, reject) => {
    const chunks: Uint8Array[] = [];
    const state = { total: 0, settled: false };
    const settle = (outcome: { bytes: Uint8Array<ArrayBuffer> } | { error: unknown }): void => {
      if (state.settled) return;
      state.settled = true;
      if ('bytes' in outcome) resolve(outcome.bytes);
      else reject(outcome.error);
    };
    stream.on('data', (chunk: unknown) => {
      if (!(chunk instanceof Uint8Array)) {
        stream.destroy(new UploadRejectedError('malformed'));
        return;
      }
      state.total += chunk.length;
      if (state.total > maxBytes) {
        stream.destroy(new MetricsFileTooLargeError());
        return;
      }
      chunks.push(chunk);
    });
    stream.on('error', (error: unknown) => settle({ error }));
    stream.once('end', () => settle({ bytes: joinChunks(chunks, state.total) }));
    stream.once('close', () => settle({ error: new UploadRejectedError('malformed') }));
  });
}

/**
 * Receives `POST /metrics/imports` (SPEC 0006 section 5.3, first stage). The text fields come
 * first and the one `file` part last, as C10 orders them. The part's file name and declared content
 * type are ignored, never logged and never stored. Every limit refuses before the caller can hand
 * anything to core: the declared size and the file size with 413 `metrics-file-too-large`, a second
 * file or a fifth field with 400, an unknown or repeated part with 400.
 */
export async function receiveMetricImport(source: MultipartSource): Promise<ReceivedMetricImport> {
  assertDeclaredSize(source);
  try {
    return await receiveParts(source);
  } catch (error) {
    // The parser refuses an oversize part with the catalog's generic rejection, either from the
    // loop (limit reached before the part was yielded) or from the part stream; both are 5.3's 413.
    if (error instanceof UploadRejectedError && error.rejection === 'file-too-large') throw new MetricsFileTooLargeError();
    throw error;
  }
}

async function receiveParts(source: MultipartSource): Promise<ReceivedMetricImport> {
  const values = new Map<string, string>();
  const received: { fields: MetricImportFields | null; file: Uint8Array<ArrayBuffer> | null } = { fields: null, file: null };
  for await (const part of multipartParts(source, metricImportLimits)) {
    if (part.kind === 'field') {
      if (received.file !== null || values.has(part.name)) throw new UploadRejectedError('unexpected-part');
      values.set(part.name, part.value);
      continue;
    }
    if (part.name !== METRIC_FILE_PART || received.file !== null) {
      part.stream.resume();
      throw new UploadRejectedError('unexpected-part');
    }
    try {
      received.fields = parseFields(values);
    } catch (error) {
      part.stream.resume();
      throw error;
    }
    received.file = await collectFile(part.stream, metricsBounds.maxFileBytes);
  }
  if (received.file === null || received.fields === null) {
    throw new UploadRejectedError(values.size === 0 ? 'missing-fields' : 'missing-file');
  }
  return { fields: received.fields, file: received.file };
}
