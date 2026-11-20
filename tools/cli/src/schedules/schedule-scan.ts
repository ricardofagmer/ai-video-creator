import { stat } from 'node:fs/promises';
import { SLOT_LOG_PAGE_BYTES } from '@studio/core/schedules';
import { runDirectory } from '@studio/shared/run-files';
import { type RunId } from '@studio/shared/run-format';
import { type ScheduleId, type ScheduleStatus } from '@studio/shared/schedules';
import { listScheduleIds, readScheduleFile, readSlotLines, type ScheduleLocation } from '@studio/shared/schedules/files';
import { type ScheduleScan } from '../doctor/schedule-checks.js';

export interface ScheduleScanRoots {
  schedulesRoot: string;
  runsRoot: string;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/** Every `runId` a `fired` line names, read page by page; never held as one buffer. */
async function firedRunIds(location: ScheduleLocation, signal: AbortSignal): Promise<RunId[]> {
  const runIds = new Set<RunId>();
  let fromByte = 0;
  for (;;) {
    signal.throwIfAborted();
    const page = await readSlotLines(location, fromByte, SLOT_LOG_PAGE_BYTES);
    for (const line of page.entries) if (line.result === 'fired' && line.runId !== null) runIds.add(line.runId);
    // No complete line left: the end of the file, or a tail the watcher is still appending.
    if (page.nextByte === fromByte) break;
    fromByte = page.nextByte;
  }
  return [...runIds];
}

async function runFolderExists(runsRoot: string, runId: RunId): Promise<boolean> {
  try {
    return (await stat(runDirectory(runsRoot, runId))).isDirectory();
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

/** `absent` while the api or the CLI is creating the folder; a file naming another id is unreadable. */
async function readStatus(location: ScheduleLocation, signal: AbortSignal): Promise<ScheduleStatus | 'absent' | 'unreadable'> {
  try {
    const state = await readScheduleFile(location);
    if (state.status === 'absent') return 'absent';
    return state.value.scheduleId === location.scheduleId ? state.value.status : 'unreadable';
  } catch (error) {
    if (signal.aborted) throw error;
    return 'unreadable';
  }
}

async function scanOne(scheduleId: ScheduleId, roots: ScheduleScanRoots, scan: ScheduleScan, signal: AbortSignal): Promise<void> {
  const location: ScheduleLocation = { schedulesRoot: roots.schedulesRoot, scheduleId };
  const status = await readStatus(location, signal);
  if (status === 'absent') return;
  if (status === 'unreadable') {
    scan.unreadable.push({ scheduleId, file: 'schedule' });
    return;
  }
  scan.schedules.push({ scheduleId, status });
  let runIds: RunId[];
  try {
    runIds = await firedRunIds(location, signal);
  } catch (error) {
    if (signal.aborted) throw error;
    scan.unreadable.push({ scheduleId, file: 'slots' });
    return;
  }
  for (const runId of runIds) {
    if (!(await runFolderExists(roots.runsRoot, runId))) scan.missingFiredRuns.push({ scheduleId, runId });
  }
}

/**
 * Reads every schedule folder through the shared C5 helpers (which refuse any path outside
 * `schedules/<ULID>/`) for `studio doctor`. Read only: the CLI writes `schedule.json` only through
 * the core handlers and never `cursor.json` or `slots.jsonl` (ADR 0003). File-only, so it still
 * reports when the database cannot boot. One broken folder never hides the others.
 */
export async function scanSchedules(roots: ScheduleScanRoots, signal: AbortSignal): Promise<ScheduleScan> {
  const scan: ScheduleScan = { schedules: [], unreadable: [], missingFiredRuns: [] };
  for (const scheduleId of await listScheduleIds(roots.schedulesRoot)) {
    signal.throwIfAborted();
    await scanOne(scheduleId, roots, scan, signal);
  }
  return scan;
}
