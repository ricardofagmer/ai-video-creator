import assert from 'node:assert/strict';
import { type IncomingHttpHeaders } from 'node:http';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';
import { UploadRejectedError, type UploadRejection } from '../platform/api.errors';
import { multipartParts, type MultipartLimits, type MultipartPart, type MultipartSource } from './multipart-parts';

/*
 * The streamed multipart parser behind catalog uploads and the metrics import (hardening note after
 * run 2: the catalog had no multipart tests). Bodies are built in memory; no Nest, no disk.
 */

const BOUNDARY = 'studio-catalog-boundary';
const LIMITS: MultipartLimits = { maxFiles: 2, maxFileBytes: 16, maxFieldBytes: 64 };

type Part = { name: string; value: string } | { name: string; filename: string; content: string };

function body(parts: readonly Part[]): Buffer {
  const chunks = parts.map((part) =>
    'value' in part
      ? `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"\r\n\r\n${part.value}\r\n`
      : `--${BOUNDARY}\r\nContent-Disposition: form-data; name="${part.name}"; filename="${part.filename}"\r\nContent-Type: application/octet-stream\r\n\r\n${part.content}\r\n`,
  );
  return Buffer.from(`${chunks.join('')}--${BOUNDARY}--\r\n`);
}

function request(payload: Buffer, contentType = `multipart/form-data; boundary=${BOUNDARY}`): MultipartSource {
  const headers: IncomingHttpHeaders = { 'content-type': contentType };
  return Object.assign(Readable.from([payload], { objectMode: false }), { headers });
}

type ReadPart = { kind: 'field'; name: string; value: string } | { kind: 'file'; name: string; filename: string; content: string };

async function readPart(part: MultipartPart): Promise<ReadPart> {
  if (part.kind === 'field') return part;
  const chunks: Buffer[] = [];
  for await (const chunk of part.stream) chunks.push(Buffer.from(chunk));
  return { kind: 'file', name: part.name, filename: part.filename, content: Buffer.concat(chunks).toString('utf8') };
}

async function readAll(source: MultipartSource, limits: MultipartLimits = LIMITS): Promise<ReadPart[]> {
  const parts: ReadPart[] = [];
  for await (const part of multipartParts(source, limits)) parts.push(await readPart(part));
  return parts;
}

async function rejection(source: MultipartSource, limits: MultipartLimits = LIMITS): Promise<UploadRejection> {
  try {
    await readAll(source, limits);
  } catch (error) {
    if (error instanceof UploadRejectedError) return error.rejection;
    throw error;
  }
  return assert.fail('expected the upload to be refused');
}

describe('multipartParts', () => {
  it('yields the fields part and each file in arrival order, keeping a folder upload path', async () => {
    const parts = await readAll(
      request(
        body([
          { name: 'fields', value: '{"kind":"image"}' },
          { name: 'file', filename: 'pasta/sub/a.png', content: 'abc' },
          { name: 'file', filename: 'b.png', content: 'de' },
        ]),
      ),
    );
    assert.deepEqual(parts, [
      { kind: 'field', name: 'fields', value: '{"kind":"image"}' },
      { kind: 'file', name: 'file', filename: 'pasta/sub/a.png', content: 'abc' },
      { kind: 'file', name: 'file', filename: 'b.png', content: 'de' },
    ]);
  });

  it('accepts a file one byte under the limit', async () => {
    const parts = await readAll(request(body([{ name: 'file', filename: 'a.bin', content: 'x'.repeat(15) }])));
    assert.equal(parts.length, 1);
  });

  // busboy marks a file truncated once it reaches `fileSize`, so reaching the limit is refused.
  it('refuses a file that reaches the limit with file-too-large instead of truncating it', async () => {
    assert.equal(await rejection(request(body([{ name: 'file', filename: 'a.bin', content: 'x'.repeat(16) }]))), 'file-too-large');
  });

  it('refuses more files than allowed', async () => {
    const three = ['a', 'b', 'c'].map((name) => ({ name: 'file', filename: `${name}.png`, content: name }));
    assert.equal(await rejection(request(body(three))), 'too-many-parts');
  });

  it('refuses a second text field when one is allowed', async () => {
    const twoFields = body([
      { name: 'fields', value: '{}' },
      { name: 'extra', value: '{}' },
    ]);
    assert.equal(await rejection(request(twoFields)), 'unexpected-part');
  });

  it('refuses a field longer than its limit', async () => {
    assert.equal(await rejection(request(body([{ name: 'fields', value: 'y'.repeat(65) }]))), 'field-too-large');
  });

  it('refuses a request that is not multipart', async () => {
    assert.equal(await rejection(request(Buffer.from('{}'), 'application/json')), 'not-multipart');
  });
});
