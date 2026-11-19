import { open, readFile, type FileHandle } from 'node:fs/promises';
import { z } from 'zod';
import { RUN_FORMAT_VERSION } from '../run-format/vocabulary';
import {
  AppendOnlyViolationError,
  RunFileInvalidJsonError,
  RunFileNotFoundError,
  RunFileSchemaError,
  UnsupportedRunFormatError,
  describeZodIssues,
  hasErrorCode,
} from './errors';

/** Absence is a normal state for `control.json`, `approval.json` and `watcher.pid`. */
export type OptionalFile<T> = { status: 'absent' } | { status: 'present'; value: T };

const FormatPeekSchema = z.object({ format: z.number().int() }).passthrough();

export async function readTextFile(filePath: string): Promise<string> {
  try {
    return await readFile(filePath, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) throw new RunFileNotFoundError(filePath, { cause: error });
    throw error;
  }
}

function parseJson(filePath: string, text: string, location: string): unknown {
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    throw new RunFileInvalidJsonError(filePath, location, { cause: error });
  }
}

/** Refuses any file whose `format` is newer than this reader (ADR 0003 decision 5). */
function assertSupportedFormat(filePath: string, parsed: unknown): void {
  const peek = FormatPeekSchema.safeParse(parsed);
  if (peek.success && peek.data.format > RUN_FORMAT_VERSION) {
    throw new UnsupportedRunFormatError(filePath, peek.data.format);
  }
}

function validate<T>(filePath: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>, parsed: unknown): T {
  const checked = schema.safeParse(parsed);
  if (!checked.success) throw new RunFileSchemaError(filePath, describeZodIssues(checked.error.issues));
  return checked.data;
}

/** Reads, checks the format number, then validates against the contract. */
export async function readJsonFile<T>(filePath: string, schema: z.ZodType<T, z.ZodTypeDef, unknown>): Promise<T> {
  const parsed = parseJson(filePath, await readTextFile(filePath), 'document');
  assertSupportedFormat(filePath, parsed);
  return validate(filePath, schema, parsed);
}

export async function readOptionalJsonFile<T>(
  filePath: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
): Promise<OptionalFile<T>> {
  try {
    return { status: 'present', value: await readJsonFile(filePath, schema) };
  } catch (error) {
    if (error instanceof RunFileNotFoundError) return { status: 'absent' };
    throw error;
  }
}

export interface JsonLinesPage<T> {
  entries: T[];
  /** Offset to pass as `fromByte` on the next poll. */
  nextByte: number;
  /**
   * Bytes after the last newline. Non-zero while the writer is mid-append or after a crash
   * mid-append; those bytes are not consumed and are read again on the next poll.
   */
  pendingTailBytes: number;
}

async function openForReading(filePath: string): Promise<FileHandle | 'absent'> {
  try {
    return await open(filePath, 'r');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return 'absent';
    throw error;
  }
}

async function readBytesFrom(filePath: string, fromByte: number, maxBytes?: number): Promise<Buffer | 'absent'> {
  const handle = await openForReading(filePath);
  if (handle === 'absent') return 'absent';
  try {
    const { size } = await handle.stat();
    if (fromByte > size) throw new AppendOnlyViolationError(filePath, fromByte, size);
    const available = size - fromByte;
    const buffer = Buffer.alloc(maxBytes === undefined ? available : Math.min(available, maxBytes));
    let filled = 0;
    while (filled < buffer.length) {
      const { bytesRead } = await handle.read(buffer, filled, buffer.length - filled, fromByte + filled);
      if (bytesRead === 0) break;
      filled += bytesRead;
    }
    return buffer.subarray(0, filled);
  } finally {
    await handle.close();
  }
}

/**
 * Reads complete lines of an append-only JSON-lines file from a byte offset, so pollers (web
 * through the api, CLI) read only what is new. A missing file reads as an empty page. `maxBytes`
 * bounds one page for request handlers; a caller that needs the whole file (package) omits it.
 * A capped page that holds no complete line means one line is longer than the page, which no C3
 * line can be, so it is reported as a schema error instead of looping on the same offset.
 */
export async function readJsonLines<T>(
  filePath: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  fromByte = 0,
  maxBytes?: number,
): Promise<JsonLinesPage<T>> {
  const bytes = await readBytesFrom(filePath, fromByte, maxBytes);
  if (bytes === 'absent') return { entries: [], nextByte: fromByte, pendingTailBytes: 0 };
  const completeLength = bytes.lastIndexOf(0x0a) + 1;
  if (maxBytes !== undefined && completeLength === 0 && bytes.length === maxBytes) {
    throw new RunFileSchemaError(filePath, [`line at byte ${fromByte} is longer than the ${maxBytes}-byte page`]);
  }
  const entries: T[] = [];
  let lineStart = 0;
  for (const line of bytes.subarray(0, completeLength).toString('utf8').split('\n')) {
    const location = `line at byte ${fromByte + lineStart}`;
    lineStart += Buffer.byteLength(line, 'utf8') + 1;
    if (line.trim() === '') continue;
    const parsed = parseJson(filePath, line, location);
    const checked = schema.safeParse(parsed);
    if (!checked.success) {
      throw new RunFileSchemaError(filePath, describeZodIssues(checked.error.issues).map((problem) => `${location}: ${problem}`));
    }
    entries.push(checked.data);
  }
  return { entries, nextByte: fromByte + completeLength, pendingTailBytes: bytes.length - completeLength };
}
