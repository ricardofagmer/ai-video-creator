import { isTerminalCurationStatus, type CurationId, type CurationStatus } from '@studio/shared/curation';
import { listCurationIds, readCurationState } from '@studio/shared/curation/files';

export interface CurationStatusEntry {
  curationId: CurationId;
  status: CurationStatus;
  /** Model calls made so far (0 to 2). */
  attempts: number;
  /** Set once the curation is terminal. */
  endedAt?: string;
}

export interface CurationScan {
  curations: CurationStatusEntry[];
  unreadable: CurationId[];
}

export interface CurationQueueCounts {
  /** Status `requested`: waiting for a watcher claim. */
  queued: number;
  /** Claimed by a watcher and not terminal yet. */
  inProgress: number;
}

/**
 * Status of every curation folder, read through the shared C5 helpers only (never written here).
 * A folder whose `curation.json` is still absent is being created by the api and is skipped; one
 * that cannot be read is reported by id, so a single broken folder never hides the others.
 */
export async function scanCurations(curationsRoot: string, signal?: AbortSignal): Promise<CurationScan> {
  const scan: CurationScan = { curations: [], unreadable: [] };
  for (const curationId of await listCurationIds(curationsRoot)) {
    signal?.throwIfAborted();
    try {
      const state = await readCurationState({ curationsRoot, curationId });
      if (state.status === 'present') {
        const { status, attempts, endedAt } = state.value;
        scan.curations.push({ curationId, status, attempts, ...(endedAt === undefined ? {} : { endedAt }) });
      }
    } catch (error) {
      if (signal?.aborted) throw error;
      scan.unreadable.push(curationId);
    }
  }
  return scan;
}

export function terminalCurationIds(scan: CurationScan): CurationId[] {
  return scan.curations.filter((entry) => isTerminalCurationStatus(entry.status)).map((entry) => entry.curationId);
}

export function countCurationQueue(scan: CurationScan): CurationQueueCounts {
  let queued = 0;
  let inProgress = 0;
  for (const entry of scan.curations) {
    if (entry.status === 'requested') queued += 1;
    else if (!isTerminalCurationStatus(entry.status)) inProgress += 1;
  }
  return { queued, inProgress };
}

/**
 * Curations that ended `failed` without a single model call, ended at or after `since`. This is
 * where a parked request lands (3 claim failures, ended `failed` / `internal-error` by the
 * watcher), together with a sweep after a restart and a fault before the first call: in every
 * case no proposal will come, so the owner has to ask again.
 */
export function failedBeforeAnyCall(scan: CurationScan, since: Date): CurationStatusEntry[] {
  const sinceMs = since.getTime();
  return scan.curations.filter(
    (entry) => entry.status === 'failed' && entry.attempts === 0 && entry.endedAt !== undefined && Date.parse(entry.endedAt) >= sinceMs,
  );
}
