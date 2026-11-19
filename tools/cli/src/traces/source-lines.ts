import { constants } from 'node:fs';
import { open, type FileHandle } from 'node:fs/promises';
import { TraceExportError } from './trace-errors.js';

/** One page of an append-only JSON-lines file; no C3 event line comes near it. */
const PAGE_BYTES = 1_048_576;

const NEWLINE = 0x0a;

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

/** A complete line of the file, or one longer than a page whose bytes were skipped unread. */
type RawLine = { status: 'text'; text: string } | { status: 'over-long' };

const OVER_LONG: RawLine = { status: 'over-long' };

async function openForReading(filePath: string): Promise<FileHandle | 'absent'> {
  try {
    return await open(filePath, constants.O_RDONLY);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return 'absent';
    throw error;
  }
}

/**
 * The complete lines of the file, page by page, holding at most one page of an unfinished line. A
 * trailing partial line (an append in progress) is not returned. Past `maxBytes` read, the export
 * stops with `source-too-large` instead of reading the rest.
 */
async function* completeLines(handle: FileHandle, request: SourceLinesRequest): AsyncGenerator<RawLine> {
  const page = Buffer.alloc(PAGE_BYTES);
  let pending = Buffer.alloc(0);
  let skippingOverLongLine = false;
  let position = 0;
  for (;;) {
    request.signal.throwIfAborted();
    const { bytesRead } = await handle.read(page, 0, PAGE_BYTES, position);
    if (bytesRead === 0) return;
    position += bytesRead;
    if (position > request.maxBytes) throw new TraceExportError('source-too-large', request.targetId);
    let chunk = page.subarray(0, bytesRead);
    for (let newline = chunk.indexOf(NEWLINE); newline >= 0; newline = chunk.indexOf(NEWLINE)) {
      const overLong = skippingOverLongLine || pending.length + newline > PAGE_BYTES;
      // A newline byte never occurs inside a UTF-8 sequence, so each line decodes on its own.
      yield overLong ? OVER_LONG : { status: 'text', text: Buffer.concat([pending, chunk.subarray(0, newline)]).toString('utf8') };
      skippingOverLongLine = false;
      pending = Buffer.alloc(0);
      chunk = chunk.subarray(newline + 1);
    }
    if (skippingOverLongLine) continue;
    if (pending.length + chunk.length > PAGE_BYTES) {
      skippingOverLongLine = true;
      pending = Buffer.alloc(0);
    } else {
      // Copied out: the page buffer is reused by the next read.
      pending = Buffer.concat([pending, chunk]);
    }
  }
}

/** An unreadable line is handed over as null, which the telemetry mapper counts as unmapped. */
function parsedLine(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch {
    return null;
  }
}

/**
 * Complete lines of an append-only JSON-lines file, kept raw: the telemetry mapper validates each
 * one and counts what it cannot map (ADR 0006), so one bad line never aborts the export. A line that
 * is not JSON is handed over as null. A line longer than a page is skipped unread; it is handed over
 * as null too unless `keep` is given, because a kept line (a session `end`) is always short while a
 * session's prompt and output lines may be long. A missing file reads as no lines.
 */
export async function readSourceLines(request: SourceLinesRequest): Promise<unknown[]> {
  const handle = await openForReading(request.filePath);
  if (handle === 'absent') return [];
  try {
    const kept: unknown[] = [];
    for await (const line of completeLines(handle, request)) {
      if (line.status === 'over-long') {
        if (request.keep === undefined) kept.push(null);
        continue;
      }
      if (line.text.trim() === '') continue;
      const value = parsedLine(line.text);
      if (value === null || request.keep === undefined || request.keep(value)) kept.push(value);
    }
    return kept;
  } finally {
    await handle.close();
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
