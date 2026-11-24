import { readdir } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { AssetJobKindSchema, type AssetJobCostFile, type AssetJobKind } from '@studio/shared/asset-jobs';
import { listAssetJobRefs, readAssetJobCost } from '@studio/shared/asset-jobs/files';
import { type AssetRef } from '@studio/shared/catalog';
import { type CurationCostFile } from '@studio/shared/curation';
import { listCurationIds, readCurationCost } from '@studio/shared/curation/files';
import { readCostFile, runDirectory, type OptionalFile } from '@studio/shared/run-files';
import { RunIdSchema, type CostFile } from '@studio/shared/run-format';
import { DataHome } from '../paths/data-home';
import { assetJobCostSessionKey, assetJobSessionOccurredAt } from './asset-job-cost.mapper';
import { CostEntryRepository, IndexedKeysLimitError } from './cost-entry.repository';
import { costSessionKey, costSessionKeyText, costSessionOccurredAt, type CostSessionKey } from './cost-session.mapper';
import { MonthToDateUnavailableError } from './costs.errors';
import { curationCostSessionKey, curationSessionOccurredAt } from './curation-cost.mapper';

/** Run folders scanned per computation; past it the spend is unknown and the check fails closed. */
export const MAX_SCANNED_RUNS = 5000;

/** Curation folders scanned per computation (SPEC 0005 section 5.8); past it the spend is unknown. */
export const MAX_SCANNED_CURATIONS = 5000;

/** Asset job folders scanned per computation, all kinds together (spec Amendment 3); past it the spend is unknown. */
export const MAX_SCANNED_ASSET_JOBS = 5000;

export interface CalendarMonth {
  start: Date;
  end: Date;
}

/** The calendar month containing `at`, in local time (C6 `CostLedgerPort.monthToDateUsd`). */
export function calendarMonthOf(at: Date): CalendarMonth {
  return {
    start: new Date(at.getFullYear(), at.getMonth(), 1),
    end: new Date(at.getFullYear(), at.getMonth() + 1, 1),
  };
}

/** One folder's in-month sessions; `runId` is the `cost_entries.run_id` they index under. */
interface UnindexedCandidate {
  runId: string;
  sessions: readonly { key: CostSessionKey; usd: number }[];
}

function isInMonth(occurredAt: Date, month: CalendarMonth): boolean {
  return occurredAt >= month.start && occurredAt < month.end;
}

function hasErrorCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code;
}

/**
 * Month-to-date spend per SPEC 0002 rev 2: `cost_entries` in the calendar month, plus the
 * sessions in run folders' cost.json that are not indexed yet, deduplicated by
 * (runId, sessionId, callIndex). Every run folder is scanned, not only the live one, so spend of a
 * run the api has not indexed yet is never missed; the live run is part of that scan. Curation
 * folders' cost.json are scanned the same way (SPEC 0005 section 5.8), keyed by curation id, so
 * the run, comparison and curation gates read one month total. Asset job folders' cost.json are
 * scanned likewise (spec Amendment 3), keyed by the job ref, which is their `cost_entries.run_id`.
 *
 * Read-only on SQLite and on run, curation and asset job folders, so the watcher may call it (ADR 0003).
 */
@Injectable()
export class MonthToDateSpend {
  constructor(
    private readonly dataHome: DataHome,
    private readonly entries: CostEntryRepository,
  ) {}

  async computeUsd(at: Date): Promise<number> {
    const month = calendarMonthOf(at);
    const indexedUsd = await this.entries.sumUsdBetween(month.start, month.end);
    const candidates = [
      ...(await this.unindexedCandidates(month)),
      ...(await this.unindexedCurationCandidates(month)),
      ...(await this.unindexedAssetJobCandidates(month)),
    ];
    if (candidates.length === 0) return indexedUsd;

    let indexedKeys: Set<string>;
    try {
      indexedKeys = await this.entries.findKeysForRuns(candidates.map((candidate) => candidate.runId));
    } catch (error) {
      if (error instanceof IndexedKeysLimitError) throw new MonthToDateUnavailableError('too-many-entries', null);
      throw error;
    }

    let unindexedUsd = 0;
    const counted = new Set<string>();
    for (const candidate of candidates) {
      for (const session of candidate.sessions) {
        const key = costSessionKeyText(candidate.runId, session.key);
        if (indexedKeys.has(key) || counted.has(key)) continue;
        counted.add(key);
        unindexedUsd += session.usd;
      }
    }
    return indexedUsd + unindexedUsd;
  }

  /** Runs whose cost.json holds sessions inside the month; unreadable files fail closed. */
  private async unindexedCandidates(month: CalendarMonth): Promise<UnindexedCandidate[]> {
    const candidates: UnindexedCandidate[] = [];
    for (const runId of await this.listRunIds()) {
      let cost: OptionalFile<CostFile>;
      try {
        cost = await readCostFile(runDirectory(this.dataHome.runs, runId));
      } catch {
        // A corrupt or newer-format cost.json makes the month's spend unknown; the error names
        // the run so the owner can repair it. The cause is dropped: it may quote file content.
        throw new MonthToDateUnavailableError('unreadable-cost-file', runId);
      }
      if (cost.status === 'absent') continue;
      if (cost.value.runId !== runId) throw new MonthToDateUnavailableError('unreadable-cost-file', runId);
      const sessions = cost.value.sessions
        .filter((session) => isInMonth(costSessionOccurredAt(session), month))
        .map((session) => ({ key: costSessionKey(session), usd: session.usd }));
      if (sessions.length > 0) candidates.push({ runId, sessions });
    }
    return candidates;
  }

  /** Curations whose cost.json holds sessions inside the month; unreadable files fail closed. */
  private async unindexedCurationCandidates(month: CalendarMonth): Promise<UnindexedCandidate[]> {
    const curationIds = await listCurationIds(this.dataHome.curations);
    if (curationIds.length > MAX_SCANNED_CURATIONS) throw new MonthToDateUnavailableError('too-many-curations', null);
    const candidates: UnindexedCandidate[] = [];
    for (const curationId of curationIds) {
      let cost: OptionalFile<CurationCostFile>;
      try {
        cost = await readCurationCost({ curationsRoot: this.dataHome.curations, curationId });
      } catch {
        // As for runs: the cause may quote file content, so only the curation id is kept.
        throw new MonthToDateUnavailableError('unreadable-curation-cost-file', curationId);
      }
      if (cost.status === 'absent') continue;
      if (cost.value.curationId !== curationId) throw new MonthToDateUnavailableError('unreadable-curation-cost-file', curationId);
      const sessions = cost.value.sessions
        .filter((session) => isInMonth(curationSessionOccurredAt(session), month))
        .map((session) => ({ key: curationCostSessionKey(session), usd: session.usd }));
      if (sessions.length > 0) candidates.push({ runId: curationId, sessions });
    }
    return candidates;
  }

  /**
   * Asset jobs whose cost.json holds sessions inside the month; unreadable files fail closed. A
   * folder of each kind is read, so a voice and a video reference of one asset never mask each other.
   */
  private async unindexedAssetJobCandidates(month: CalendarMonth): Promise<UnindexedCandidate[]> {
    const jobs: { kind: AssetJobKind; ref: AssetRef }[] = [];
    for (const kind of AssetJobKindSchema.options) {
      for (const ref of await listAssetJobRefs(this.dataHome.assetJobs, kind)) jobs.push({ kind, ref });
      if (jobs.length > MAX_SCANNED_ASSET_JOBS) throw new MonthToDateUnavailableError('too-many-asset-jobs', null);
    }
    const candidates: UnindexedCandidate[] = [];
    for (const { kind, ref } of jobs) {
      let cost: OptionalFile<AssetJobCostFile>;
      try {
        cost = await readAssetJobCost({ assetJobsRoot: this.dataHome.assetJobs, kind, ref });
      } catch {
        // As for runs: the cause may quote file content, so only the job ref is kept.
        throw new MonthToDateUnavailableError('unreadable-asset-job-cost-file', ref);
      }
      if (cost.status === 'absent') continue;
      if (cost.value.ref !== ref || cost.value.kind !== kind) throw new MonthToDateUnavailableError('unreadable-asset-job-cost-file', ref);
      const sessions = cost.value.sessions
        .filter((session) => isInMonth(assetJobSessionOccurredAt(session), month))
        .map((session) => ({ key: assetJobCostSessionKey(session), usd: session.usd }));
      if (sessions.length > 0) candidates.push({ runId: ref, sessions });
    }
    return candidates;
  }

  private async listRunIds(): Promise<string[]> {
    let names: string[];
    try {
      const entries = await readdir(this.dataHome.runs, { withFileTypes: true });
      names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT')) return [];
      throw error;
    }
    const runIds = names.filter((name) => RunIdSchema.safeParse(name).success);
    if (runIds.length > MAX_SCANNED_RUNS) throw new MonthToDateUnavailableError('too-many-runs', null);
    return runIds;
  }
}
