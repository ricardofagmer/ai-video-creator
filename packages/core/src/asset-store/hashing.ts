import { createHash, type Hash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { addAbortSignal, type Readable } from 'node:stream';
import { type Sha256 } from '@studio/shared/catalog';
import { ContentTooLargeError, SourceNotFoundError, UnsupportedChunkError } from './asset-store.errors';
import { isErrnoException } from './path-guards';

export interface HashedContent {
  contentHash: Sha256;
  sizeBytes: number;
}

export function sha256Hex(data: string | Buffer): Sha256 {
  return createHash('sha256').update(data).digest('hex');
}

export function chunkToBuffer(chunk: unknown): Buffer {
  if (Buffer.isBuffer(chunk)) return chunk;
  if (typeof chunk === 'string') return Buffer.from(chunk, 'utf8');
  if (chunk instanceof Uint8Array) return Buffer.from(chunk.buffer, chunk.byteOffset, chunk.byteLength);
  throw new UnsupportedChunkError();
}

/**
 * Running sha-256 and byte count with a hard ceiling, so an oversized upload stops while it
 * streams instead of after it filled the disk.
 */
export class BoundedHasher {
  private readonly hash: Hash = createHash('sha256');
  private bytes = 0;

  constructor(private readonly maxBytes: number) {}

  update(chunk: Buffer): void {
    this.bytes += chunk.byteLength;
    if (this.bytes > this.maxBytes) throw new ContentTooLargeError(this.maxBytes);
    this.hash.update(chunk);
  }

  digest(): HashedContent {
    return { contentHash: this.hash.digest('hex'), sizeBytes: this.bytes };
  }
}

export interface HashOptions {
  maxBytes: number;
  signal?: AbortSignal;
}

/** Streams a readable through sha-256 without keeping its bytes. */
export async function hashReadable(source: Readable, options: HashOptions): Promise<HashedContent> {
  const hasher = new BoundedHasher(options.maxBytes);
  const stream = options.signal === undefined ? source : addAbortSignal(options.signal, source);
  try {
    for await (const chunk of stream) hasher.update(chunkToBuffer(chunk));
  } finally {
    source.destroy();
  }
  return hasher.digest();
}

/** Read-only: opens the file, streams it through sha-256 and closes it. Writes nothing. */
export async function hashFile(absolutePath: string, options: HashOptions): Promise<HashedContent> {
  try {
    return await hashReadable(createReadStream(absolutePath), options);
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') throw new SourceNotFoundError();
    throw error;
  }
}
