import { type IncomingHttpHeaders } from 'node:http';
import { type Readable } from 'node:stream';
import busboy from 'busboy';
import { UploadRejectedError, type UploadRejection } from '../platform/api.errors';

/** What the parser reads: the request body stream and its headers (an express `Request` is one). */
export type MultipartSource = Readable & { headers: IncomingHttpHeaders };

export type MultipartPart =
  | { kind: 'field'; name: string; value: string }
  | { kind: 'file'; name: string; filename: string; mimeType: string; stream: Readable };

export interface MultipartLimits {
  maxFiles: number;
  /** Per file. A part that reaches it is destroyed with `file-too-large`, never truncated. */
  maxFileBytes: number;
  maxFieldBytes: number;
  /** Text fields accepted; one when absent (the catalog's JSON `fields` part). */
  maxFields?: number;
}

function createParser(request: MultipartSource, limits: MultipartLimits): busboy.Busboy {
  const maxFields = limits.maxFields ?? 1;
  try {
    return busboy({
      headers: request.headers,
      // Folder uploads send `dir/sub/file` as the filename; it is validated as a relative path.
      preservePath: true,
      defParamCharset: 'utf8',
      limits: {
        fields: maxFields,
        fieldSize: limits.maxFieldBytes,
        files: limits.maxFiles,
        // busboy emits `partsLimit` when the count reaches this value, not when it is exceeded, so
        // a full request of `maxFiles` files and `maxFields` fields needs one more; the files and
        // fields limits still refuse the first extra part.
        parts: limits.maxFiles + maxFields + 1,
        fileSize: limits.maxFileBytes,
        headerPairs: 20,
      },
    });
  } catch {
    // busboy throws on a missing or non-multipart Content-Type; nothing else is thrown here.
    throw new UploadRejectedError('not-multipart');
  }
}

/**
 * The parts of a `multipart/form-data` request, in arrival order, streamed: file bytes are never
 * buffered here, so a 2 GB upload reaches the asset store as a stream (ADR 0003). The consumer must
 * read or `resume()` each file stream before the next part arrives. Leaving the loop early stops
 * parsing and drains the rest of the request, so an error response can still be written.
 */
export async function* multipartParts(request: MultipartSource, limits: MultipartLimits): AsyncGenerator<MultipartPart, void, void> {
  const parser = createParser(request, limits);
  const queue: MultipartPart[] = [];
  // Mutated by parser callbacks; an object so the loop below reads current values.
  const state: { failure: UploadRejectedError | null; finished: boolean; wake: (() => void) | null } = {
    failure: null,
    finished: false,
    wake: null,
  };

  const notify = (): void => {
    const resolve = state.wake;
    state.wake = null;
    resolve?.();
  };
  const fail = (rejection: UploadRejection | UploadRejectedError): void => {
    state.failure ??= rejection instanceof UploadRejectedError ? rejection : new UploadRejectedError(rejection);
    notify();
  };

  parser.on('field', (name, value, info) => {
    if (info.valueTruncated || info.nameTruncated) fail('field-too-large');
    else queue.push({ kind: 'field', name, value });
    notify();
  });
  parser.on('file', (name, stream, info) => {
    stream.on('limit', () => {
      const tooLarge = new UploadRejectedError('file-too-large');
      fail(tooLarge);
      stream.destroy(tooLarge);
    });
    // A part can be destroyed (limit, unexpected end) before its consumer attaches a listener, when
    // its bytes arrive in the same chunk as its headers. The destroy emits `error` on a later tick;
    // without this listener that is an unhandled `error` event that crashes the process. The failure
    // ends the loop; a consumer's own listeners still receive the error.
    stream.on('error', (error: unknown) => fail(error instanceof UploadRejectedError ? error : 'malformed'));
    // busboy gives no filename for a bare `application/octet-stream` part. The empty text is
    // refused by every consumer that reads a filename (`RelativePathSchema` needs at least one
    // character), exactly as the missing value was.
    queue.push({ kind: 'file', name, filename: info.filename ?? '', mimeType: info.mimeType, stream });
    notify();
  });
  parser.on('partsLimit', () => fail('too-many-parts'));
  parser.on('filesLimit', () => fail('too-many-parts'));
  parser.on('fieldsLimit', () => fail('unexpected-part'));
  parser.on('error', () => fail('malformed'));
  parser.on('close', () => {
    state.finished = true;
    notify();
  });
  request.on('error', () => fail('malformed'));
  request.pipe(parser);

  try {
    while (true) {
      if (state.failure !== null) throw state.failure;
      const next = queue.shift();
      if (next !== undefined) {
        yield next;
        continue;
      }
      if (state.finished) return;
      await new Promise<void>((resolve) => {
        state.wake = resolve;
      });
    }
  } finally {
    request.unpipe(parser);
    for (const part of queue) if (part.kind === 'file') part.stream.resume();
    if (!state.finished) request.resume();
  }
}
