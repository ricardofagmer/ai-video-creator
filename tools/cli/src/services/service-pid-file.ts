import { mkdir, open, readFile, rename, rm } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { AbsolutePathSchema, IsoDateTimeSchema } from '@studio/shared/catalog';

const PID_FILE_MODE = 0o600;
const MAX_PID_FILE_BYTES = 4096;

/** What `studio start` records, so `stop` signals only a process it launched (and recognises). */
export const ServicePidRecordSchema = z
  .object({
    service: z.enum(['api', 'web']),
    pid: z.number().int().positive(),
    startedAt: IsoDateTimeSchema,
    entryPath: AbsolutePathSchema,
    port: z.number().int().min(1024).max(65535),
  })
  .strict();
export type ServicePidRecord = z.infer<typeof ServicePidRecordSchema>;

export type PidFileRead = { status: 'absent' } | { status: 'invalid' } | { status: 'present'; record: ServicePidRecord };

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** A missing file is `absent`; anything that is not a valid record is `invalid` and never trusted. */
export async function readPidFile(path: string): Promise<PidFileRead> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return { status: 'absent' };
    throw error;
  }
  if (text.length > MAX_PID_FILE_BYTES) return { status: 'invalid' };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // An unparsable record names no process; it is treated like any other invalid record.
    return { status: 'invalid' };
  }
  const checked = ServicePidRecordSchema.safeParse(parsed);
  return checked.success ? { status: 'present', record: checked.data } : { status: 'invalid' };
}

/** Owner-only, written to a temporary file and renamed, so a reader never sees half a record. */
export async function writePidFile(path: string, record: ServicePidRecord): Promise<void> {
  await mkdir(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.tmp-${process.pid}`;
  const handle = await open(temporary, 'w', PID_FILE_MODE);
  try {
    await handle.writeFile(`${JSON.stringify(ServicePidRecordSchema.parse(record))}\n`, 'utf8');
  } finally {
    await handle.close();
  }
  await rename(temporary, path);
}

export async function removePidFile(path: string): Promise<void> {
  await rm(path, { force: true });
}
