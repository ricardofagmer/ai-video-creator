import { randomBytes } from 'node:crypto';
import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import type { z } from 'zod';
import { RunFileSchema, runFiles, type RunFile } from '@studio/shared/ace';
import { InputError, isErrnoException } from '../errors';

/** Writes next to the target then renames, so readers never see a half-written file. */
export async function writeFileAtomic(path: string, data: string | Uint8Array): Promise<void> {
  const temporaryPath = join(dirname(path), `.${basename(path)}.${randomBytes(6).toString('hex')}.tmp`);
  try {
    await writeFile(temporaryPath, data);
    await rename(temporaryPath, path);
  } catch (error) {
    await rm(temporaryPath, { force: true });
    throw error;
  }
}

export async function writeJsonAtomic(path: string, value: unknown): Promise<void> {
  await writeFileAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

export async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** Reads and JSON-parses a file; a missing or malformed file is an input problem. */
export async function readJsonFile(path: string): Promise<unknown> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (isErrnoException(error) && error.code === 'ENOENT') throw new InputError(`${basename(path)} not found at ${path}`);
    throw error;
  }
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new InputError(`${basename(path)} is not valid JSON: ${detail}`);
  }
}

/** Reads a manifest the toolbox already validated; a schema failure means it was edited by hand. */
export async function readManifest<T>(runDir: string, fileName: string, schema: z.ZodType<T>): Promise<T> {
  const result = schema.safeParse(await readJsonFile(join(runDir, fileName)));
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new InputError(`${fileName} does not match its schema: ${issues.join('; ')}`);
  }
  return result.data;
}

export async function readRun(runDir: string): Promise<RunFile> {
  const raw = await readJsonFile(join(runDir, runFiles.run));
  const result = RunFileSchema.safeParse(raw);
  if (!result.success) {
    const issues = result.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new InputError(`run.json in ${runDir} is invalid: ${issues.join('; ')}`);
  }
  return result.data;
}

/** Only the toolbox writes run.json; it is validated before every write. */
export async function writeRun(runDir: string, run: RunFile): Promise<void> {
  const validated = RunFileSchema.parse(run);
  await writeJsonAtomic(join(runDir, runFiles.run), validated);
}
