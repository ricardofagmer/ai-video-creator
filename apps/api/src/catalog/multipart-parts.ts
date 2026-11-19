import { type Readable } from 'node:stream';
import busboy from 'busboy';
import { type Request } from 'express';
import { UploadRejectedError, type UploadRejection } from '../platform/api.errors';

export type MultipartPart =
  | { kind: 'field'; name: string; value: string }
  | { kind: 'file'; name: string; filename: string; mimeType: string; stream: Readable };

export interface MultipartLimits {
  maxFiles: number;
  /** Per file. A part that reaches it is destroyed with `file-too-large`, never truncated. */
  maxFileBytes: number;
  maxFieldBytes: number;
}

function createParser(request: Request, limits: MultipartLimits): busboy.Busboy {
  try {
    return busboy({
      headers: request.headers,
      // Folder uploads send `dir/sub/file` as the filename; it is validated as a relative path.
      preservePath: true,
      defParamCharset: 'utf8',
      limits: {
        fields: 1,
        fieldSize: limits.maxFieldBytes,
        files: limits.maxFiles,
        parts: limits.maxFiles + 1,
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
export async function* multipartParts(request: Request, limits: MultipartLimits): AsyncGenerator<MultipartPart, void, void> {
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
  const fail = (rejection: UploadRejection): void => {
    state.failure ??= new UploadRejectedError(rejection);
    notify();
  };

  parser.on('field', (name, value, info) => {
    if (info.valueTruncated || info.nameTruncated) fail('field-too-large');
    else queue.push({ kind: 'field', name, value });
    notify();
  });
  parser.on('file', (name, stream, info) => {
    stream.on('limit', () => stream.destroy(new UploadRejectedError('file-too-large')));
    queue.push({ kind: 'file', name, filename: info.filename, mimeType: info.mimeType, stream });
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
