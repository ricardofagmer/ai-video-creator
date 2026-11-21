import { type FileHandle } from 'node:fs/promises';
import { publishBounds } from '@studio/shared/platforms';
import { PlatformClientError } from '../platform-client.errors';

/*
 * The FILE_UPLOAD chunk plan of TikTok's media transfer guide (read 2026-11-20): a chunk is at
 * least 5 MB and at most 64 MB, a file under 5 MB goes whole, a file over 64 MB is split,
 * `total_chunk_count` is `floor(video_size / chunk_size)`, the last chunk takes the trailing bytes
 * up to 128 MB, at most 1,000 chunks, sent in order.
 */

/**
 * 16 MiB sits inside 5 to 64 MB whichever unit TikTok means by MB. A file over 64 MB then always
 * splits into at least 3 chunks, the last one stays under two chunk sizes (far from 128 MB), and
 * the 4 GiB bound needs 256 chunks, far from 1,000.
 */
const TIKTOK_CHUNK_BYTES = 16 * 1024 * 1024;

/** 64 MB in decimal units, the smaller reading of "64 MB": a file up to here may go whole. */
const WHOLE_FILE_MAX_BYTES = 64_000_000;

const MAX_CHUNKS = 1_000;

export interface ChunkPlan {
  videoSize: number;
  chunkSize: number;
  totalChunkCount: number;
}

/** One chunk's byte range, inclusive, as `Content-Range` states it. */
export interface ChunkRange {
  index: number;
  first: number;
  last: number;
  length: number;
  isFinal: boolean;
}

/** The plan for `sizeBytes`; an empty file or one over the 4 GiB bound is `media-rejected`. */
export function planChunks(sizeBytes: number): ChunkPlan {
  if (!Number.isSafeInteger(sizeBytes) || sizeBytes <= 0 || sizeBytes > publishBounds.maxArtifactBytes) {
    throw new PlatformClientError('tiktok', 'upload', 'media-rejected');
  }
  if (sizeBytes <= WHOLE_FILE_MAX_BYTES) return { videoSize: sizeBytes, chunkSize: sizeBytes, totalChunkCount: 1 };
  const totalChunkCount = Math.floor(sizeBytes / TIKTOK_CHUNK_BYTES);
  if (totalChunkCount > MAX_CHUNKS) throw new PlatformClientError('tiktok', 'upload', 'media-rejected');
  return { videoSize: sizeBytes, chunkSize: TIKTOK_CHUNK_BYTES, totalChunkCount };
}

/** The ranges of a plan, in order; the final one runs to the last byte. */
export function chunkRanges(plan: ChunkPlan): ChunkRange[] {
  const ranges: ChunkRange[] = [];
  for (let index = 0; index < plan.totalChunkCount; index += 1) {
    const first = index * plan.chunkSize;
    const isFinal = index === plan.totalChunkCount - 1;
    const last = isFinal ? plan.videoSize - 1 : first + plan.chunkSize - 1;
    ranges.push({ index, first, last, length: last - first + 1, isFinal });
  }
  return ranges;
}

/**
 * Reads one chunk through the caller's handle at its offset (finding S2: the bytes that were
 * hashed, never a reopen by path). A file shorter than its stated size is `media-rejected`, found
 * before that chunk is sent.
 */
export async function readChunk(file: FileHandle, range: ChunkRange): Promise<Uint8Array> {
  const bytes = new Uint8Array(range.length);
  let filled = 0;
  while (filled < range.length) {
    const { bytesRead } = await file.read(bytes, filled, range.length - filled, range.first + filled);
    if (bytesRead === 0) throw new PlatformClientError('tiktok', 'upload', 'media-rejected');
    filled += bytesRead;
  }
  return bytes;
}
