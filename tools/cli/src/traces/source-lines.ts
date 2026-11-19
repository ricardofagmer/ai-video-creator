import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { z } from 'zod';
import { readJsonLines } from '@studio/shared/run-files';
import { TraceExportError } from './trace-errors.js';

/** One page of an append-only JSON-lines file; no C3 line comes near it. */
const PAGE_BYTES = 1_048_576;

/** Lines are kept raw: the telemetry mapper validates each one and counts what it cannot map. */
const RawLineSchema = z.unknown();

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

export interface SourceLinesRequest {
  filePath: string;
  /** Bytes read before the export refuses the file as too large. */
  maxBytes: number;
  targetId: string;
  signal: AbortSignal;
  /** Keeps only the lines the export needs, so large session lines are not held in memory. */
  keep?: (line: unknown) => boolean;
}

/**
 * Complete lines of an append-only JSON-lines file, read page by page through the C5 reader (which
 * ignores a trailing partial line, an append in progress). A missing file reads as no lines. Past
 * `maxBytes` the export stops with `source-too-large` instead of reading the rest.
 */
export async function readSourceLines(request: SourceLinesRequest): Promise<unknown[]> {
  const kept: unknown[] = [];
  let fromByte = 0;
  for (;;) {
    request.signal.throwIfAborted();
    const page = await readJsonLines(request.filePath, RawLineSchema, fromByte, PAGE_BYTES);
    for (const line of page.entries) {
      if (request.keep === undefined || request.keep(line)) kept.push(line);
    }
    if (page.nextByte === fromByte) return kept;
    fromByte = page.nextByte;
    if (fromByte > request.maxBytes) throw new TraceExportError('source-too-large', request.targetId);
  }
}

export type LastLine = { status: 'absent' } | { status: 'line'; value: unknown } | { status: 'invalid' };

const ABSENT: LastLine = { status: 'absent' };

function lastCompleteLine(text: string, startsAtFileStart: boolean): LastLine {
  const lastNewline = text.lastIndexOf('\n');
  if (lastNewline < 0) return startsAtFileStart ? ABSENT : { status: 'invalid' };
  const complete = text.slice(0, lastNewline);
  const previousNewline = complete.lastIndexOf('\n');
  // The window starts mid-file and holds no line start: the last line is longer than the window.
  if (previousNewline < 0 && !startsAtFileStart) return { status: 'invalid' };
  const line = complete.slice(previousNewline + 1).trim();
  if (line === '') return ABSENT;
  try {
    const value: unknown = JSON.parse(line);
    return { status: 'line', value };
  } catch {
    return { status: 'invalid' };
  }
}

/**
 * The last complete line of a file, reading at most `maxBytes` from its end. A session stream ends
 * with its `end` line (written in a `finally` block, RUN-FORMAT section 15), so the packet, tool
 * and output lines before it are never read. Links and non-regular files read as absent.
 */
export async function readLastLine(filePath: string, maxBytes: number): Promise<LastLine> {
  let handle: FileHandle;
  try {
    // O_NONBLOCK keeps a FIFO planted in the folder from blocking the open.
    handle = await open(filePath, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ELOOP') || hasErrorCode(error, 'ENOTDIR')) return ABSENT;
    throw error;
  }
  try {
    const stats = await handle.stat();
    if (!stats.isFile()) return ABSENT;
    const length = Math.min(stats.size, maxBytes);
    const start = stats.size - length;
    const buffer = Buffer.alloc(length);
    let filled = 0;
    while (filled < length) {
      const { bytesRead } = await handle.read(buffer, filled, length - filled, start + filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    return lastCompleteLine(buffer.subarray(0, filled).toString('utf8'), start === 0);
  } finally {
    await handle.close();
  }
}
