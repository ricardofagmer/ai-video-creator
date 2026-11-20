import { join } from 'node:path';
import { AbsolutePathSchema, IsoDateTimeSchema } from '@studio/shared/catalog';
import { readBoundedText } from './bounded-file';

/*
 * The shell's own reader of `<data home>/logs/<service>.pid.json`. The writer's schema lives in
 * `tools/cli/src/services/service-pid-file.ts` (`ServicePidRecordSchema`), which this release does not
 * move to a shared package, so the same five fields and bounds are checked here. The fixture
 * `fixtures/service-pid-record.json` holds one record in that shape so drift shows in review.
 */

export type ServiceName = 'api' | 'web';

export interface ServicePidRecord {
  readonly service: ServiceName;
  readonly pid: number;
  readonly startedAt: string;
  readonly entryPath: string;
  readonly port: number;
}

export type PidRecordRead = { status: 'absent' } | { status: 'invalid' } | { status: 'present'; record: ServicePidRecord };

/** Same bound as the CLI's `MAX_PID_FILE_BYTES`. */
export const MAX_PID_RECORD_BYTES = 4096;

const RECORD_FIELDS = ['service', 'pid', 'startedAt', 'entryPath', 'port'] as const;

export function pidRecordPath(logsDirectory: string, service: ServiceName): string {
  return join(logsDirectory, `${service}.pid.json`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isServiceName(value: unknown): value is ServiceName {
  return value === 'api' || value === 'web';
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isPort(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1024 && value <= 65535;
}

/**
 * Strict: exactly the five fields. A record naming the other service is `invalid`, because the
 * file name is what the CLI keys on and a mismatch means the file is not one it wrote.
 */
export function parseServicePidRecord(text: string, expected: ServiceName): PidRecordRead {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // An unparsable record names no process; it reads like any other invalid record.
    return { status: 'invalid' };
  }
  if (!isRecord(parsed)) return { status: 'invalid' };
  const keys = Object.keys(parsed);
  if (keys.length !== RECORD_FIELDS.length || !RECORD_FIELDS.every((field) => keys.includes(field))) return { status: 'invalid' };
  const { service, pid, startedAt, entryPath, port } = parsed;
  if (!isServiceName(service) || service !== expected) return { status: 'invalid' };
  if (!isPositiveInteger(pid) || !isPort(port)) return { status: 'invalid' };
  const checkedStartedAt = IsoDateTimeSchema.safeParse(startedAt);
  const checkedEntryPath = AbsolutePathSchema.safeParse(entryPath);
  if (!checkedStartedAt.success || !checkedEntryPath.success) return { status: 'invalid' };
  return { status: 'present', record: { service, pid, startedAt: checkedStartedAt.data, entryPath: checkedEntryPath.data, port } };
}

/** Never writes, renames or removes the record, a stale one included: `studio start` and `stop` own it. */
export async function readServicePidRecord(logsDirectory: string, service: ServiceName): Promise<PidRecordRead> {
  try {
    const read = await readBoundedText(pidRecordPath(logsDirectory, service), { maxBytes: MAX_PID_RECORD_BYTES });
    switch (read.status) {
      case 'absent':
        return { status: 'absent' };
      case 'read':
        return parseServicePidRecord(read.text, service);
      case 'rejected':
      case 'unchanged':
        return { status: 'invalid' };
    }
  } catch {
    // Present but unreadable (permission): the state is `unknown`, never `stopped`.
    return { status: 'invalid' };
  }
}
