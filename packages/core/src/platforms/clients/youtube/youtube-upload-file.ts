import { createHash, type Hash } from 'node:crypto';
import { type FileHandle } from 'node:fs/promises';
import { youtubeError } from './youtube-http';

/*
 * Reads `final.mp4` for the upload through the caller's handle only, from position 0, never by path
 * (finding S2), and hashes every byte the first time it is read. Before the last chunk leaves, the
 * hash must equal the SHA-256 the caller computed from the same handle: a file that changed after
 * the re-check never completes an upload (AC 50), and YouTube discards the unfinished session.
 *
 * A resume re-sends part of the chunk sent last. Those bytes were hashed on their first read, so a
 * re-read is checked against that chunk's own digest, in the same read that produces the bytes to
 * send: a file changed between the first send and the resume is refused, not uploaded.
 */

interface SentRange {
  start: number;
  end: number;
  digest: string;
}

function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export class UploadFileReader {
  /** Two chunks: a resume reads the previous chunk again together with the bytes it re-sends. */
  private readonly buffer: Buffer;
  private readonly hash: Hash = createHash('sha256');
  private hashedUpTo = 0;
  private lastSent: SentRange | null = null;
  private digest: string | null = null;

  constructor(
    private readonly file: FileHandle,
    private readonly sizeBytes: number,
    private readonly chunkBytes: number,
  ) {
    this.buffer = Buffer.alloc(Math.min(chunkBytes * 2, sizeBytes));
  }

  /**
   * The bytes `[offset, offset + length)`. The returned view is reused by the next read, so the
   * caller sends it before reading again. A short read means the file shrank and a re-read that
   * differs means it changed: both are `media-rejected`.
   */
  async read(offset: number, length: number): Promise<Uint8Array> {
    if (length > this.chunkBytes || offset + length > this.sizeBytes || offset > this.hashedUpTo) {
      throw youtubeError('upload', 'invalid-response');
    }
    const previous = this.lastSent;
    const rewind = offset < this.hashedUpTo;
    // Bytes before the last chunk were confirmed by a 308; a resume can only fall inside that chunk.
    if (rewind && (previous === null || offset < previous.start)) throw youtubeError('upload', 'invalid-response');
    const start = rewind && previous !== null ? previous.start : offset;
    const span = await this.fill(start, offset + length - start);
    if (rewind && previous !== null && sha256Of(span.subarray(0, previous.end - start)) !== previous.digest) {
      throw youtubeError('upload', 'media-rejected');
    }
    const chunk = span.subarray(offset - start);
    if (offset + length > this.hashedUpTo) {
      this.hash.update(chunk.subarray(this.hashedUpTo - offset));
      this.hashedUpTo = offset + length;
    }
    this.lastSent = { start: offset, end: offset + length, digest: sha256Of(chunk) };
    return chunk;
  }

  /** True once every byte was read and their hash equals the caller's `sha256`. */
  matches(expectedSha256: string): boolean {
    if (this.hashedUpTo !== this.sizeBytes) return false;
    this.digest ??= this.hash.digest('hex');
    return this.digest === expectedSha256.toLowerCase();
  }

  private async fill(position: number, length: number): Promise<Buffer> {
    let filled = 0;
    while (filled < length) {
      const { bytesRead } = await this.file.read(this.buffer, filled, length - filled, position + filled);
      if (bytesRead === 0) throw youtubeError('upload', 'media-rejected');
      filled += bytesRead;
    }
    return this.buffer.subarray(0, length);
  }
}
