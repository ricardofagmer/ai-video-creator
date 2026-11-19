import { appendFile, mkdir, open, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { type z } from 'zod';
import { RunFileSchemaError, RunFileWriteError, describeZodIssues } from './errors';

/** Run files hold personal production data; only the owner's account reads them. */
const FILE_MODE = 0o600;

const queues = new Map<string, Promise<void>>();

/**
 * Runs writes to one path one after another inside this process. The tmp name carries only the
 * pid, so two overlapping writes of the same file in one process would share it; across processes
 * the single-writer rule of ADR 0003 applies.
 */
async function serialized(filePath: string, write: () => Promise<void>): Promise<void> {
  const previous = queues.get(filePath) ?? Promise.resolve();
  // The previous write's failure was already delivered to its own caller; it must not block this one.
  const current = previous.catch(() => undefined).then(write);
  queues.set(filePath, current);
  try {
    await current;
  } finally {
    if (queues.get(filePath) === current) queues.delete(filePath);
  }
}

async function discardTemporary(temporaryPath: string, targetPath: string, writeError: unknown): Promise<void> {
  try {
    await rm(temporaryPath, { force: true });
  } catch (cleanupError) {
    throw new RunFileWriteError(targetPath, {
      cause: new AggregateError([writeError, cleanupError], 'write failed and the temporary file was not removed'),
    });
  }
}

async function writeOnce(targetPath: string, content: string | Uint8Array): Promise<void> {
  const temporaryPath = `${targetPath}.tmp-${process.pid}`;
  try {
    await mkdir(dirname(targetPath), { recursive: true });
    const handle = await open(temporaryPath, 'w', FILE_MODE);
    try {
      await handle.writeFile(content, { encoding: 'utf8' });
      // Flushed before the rename so a crash never leaves a renamed but empty file (crash resume).
      await handle.sync();
    } finally {
      await handle.close();
    }
    await rename(temporaryPath, targetPath);
  } catch (error) {
    await discardTemporary(temporaryPath, targetPath, error);
    throw new RunFileWriteError(targetPath, { cause: error });
  }
}

/**
 * The only way a run file is written (ADR 0003): write `<file>.tmp-<pid>`, flush, then rename
 * over the target. Strings are written as UTF-8. Readers see the old or the new file, never a mix.
 */
export async function writeFileAtomic(targetPath: string, content: string | Uint8Array): Promise<void> {
  await serialized(targetPath, () => writeOnce(targetPath, content));
}

/** Validates against the contract first, then writes indented JSON with a trailing newline. */
export async function writeJsonAtomic<T>(
  targetPath: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: T,
): Promise<void> {
  const checked = schema.safeParse(value);
  if (!checked.success) throw new RunFileSchemaError(targetPath, describeZodIssues(checked.error.issues));
  await writeFileAtomic(targetPath, `${JSON.stringify(checked.data, null, 2)}\n`);
}

/**
 * Appends one validated JSON line. Append-only files (`events.jsonl`, `egress.jsonl`, session
 * streams) are never rewritten, so they bypass the tmp + rename path; one line is one `write` with
 * O_APPEND.
 */
export async function appendJsonLine<T>(
  targetPath: string,
  schema: z.ZodType<T, z.ZodTypeDef, unknown>,
  value: T,
): Promise<void> {
  const checked = schema.safeParse(value);
  if (!checked.success) throw new RunFileSchemaError(targetPath, describeZodIssues(checked.error.issues));
  const line = `${JSON.stringify(checked.data)}\n`;
  await serialized(targetPath, async () => {
    try {
      await mkdir(dirname(targetPath), { recursive: true });
      await appendFile(targetPath, line, { encoding: 'utf8', mode: FILE_MODE, flag: 'a' });
    } catch (error) {
      throw new RunFileWriteError(targetPath, { cause: error });
    }
  });
}
