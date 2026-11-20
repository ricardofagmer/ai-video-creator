import { basename } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { RunFileError, readRunFile, runDirectory, type RunFileErrorCode } from '@studio/shared/run-files';
import { type RunFile, type RunId } from '@studio/shared/run-format';
import { DataHome } from '../paths/data-home';
import { linkedRunFactsOf, pairComparisonArms, type LinkedRunFacts } from './run-comparison';
import { listRunFolderIds } from './run-folders';
import { toRunIndexData, toRunIndexEntry, type RunIndexEntry } from './run-index.mapper';
import { RunIndexRepository } from './run-index.repository';
import { RunFolderMismatchError } from './runs.errors';

/** Run folders read per rebuild; ADR 0003 revisits the index design near 1,000 runs. */
export const MAX_INDEXED_RUN_FOLDERS = 5000;

export type UnreadableRunProblem = RunFileErrorCode | 'run-id-mismatch';

export interface RunIndexRebuildReport {
  /** Rows written from run folders. */
  indexed: number;
  /** Folders whose run.json could not be read or validated; their rows are left untouched. */
  unreadable: { runId: RunId; problem: UnreadableRunProblem }[];
  /**
   * Rows with no run folder. Reported, not deleted: a reviewed run's outcome references its row,
   * and a missing folder may be a moved data home rather than a deleted run.
   */
  orphaned: string[];
  /** `comparisons` rows restored from pairs of linked run folders (SPEC 0003 section 5.3). */
  comparisons: number;
  /** Comparison ids whose run folders do not hold one consistent `a` and `b` arm; no row is written. */
  unpairedComparisons: string[];
}

/**
 * The run index (ADR 0003 decision 3): a rebuildable SQLite mirror of `runs/<id>/run.json`. It
 * only reads run folders and writes `run_index_entries`; the files always win. Runs in the api
 * and the CLI only (the watcher never writes SQLite).
 */
@Injectable()
export class RunIndexService {
  private readonly logger = new Logger(RunIndexService.name);

  constructor(
    private readonly dataHome: DataHome,
    private readonly entries: RunIndexRepository,
  ) {}

  /** Mirrors one run folder into its row. */
  async syncRun(runDir: string): Promise<RunIndexEntry> {
    const run = await this.readRun(runDir);
    return toRunIndexEntry(await this.entries.upsert(toRunIndexData(run, new Date())));
  }

  /**
   * Re-reads every run folder and overwrites the matching rows (files win on disagreement), then
   * restores the `comparisons` row of every consistent pair of linked runs.
   */
  async rebuild(): Promise<RunIndexRebuildReport> {
    const runIds = await listRunFolderIds(this.dataHome.runs, MAX_INDEXED_RUN_FOLDERS);
    const report: RunIndexRebuildReport = { indexed: 0, unreadable: [], orphaned: [], comparisons: 0, unpairedComparisons: [] };
    const linkedRuns: LinkedRunFacts[] = [];
    const indexedAt = new Date();
    // One folder at a time: SQLite has one writer, and parallel reads of thousands of run.json
    // files would only compete for the same disk.
    for (const runId of runIds) {
      const run = await this.tryReadRun(runId, report);
      if (run === null) continue;
      await this.entries.upsert(toRunIndexData(run, indexedAt));
      report.indexed += 1;
      const linked = linkedRunFactsOf(run);
      if (linked !== null) linkedRuns.push(linked);
    }
    const pairing = pairComparisonArms(linkedRuns);
    for (const row of pairing.rows) await this.entries.upsertComparison(row);
    report.comparisons = pairing.rows.length;
    report.unpairedComparisons = pairing.unpaired;
    const folders = new Set<string>(runIds);
    report.orphaned = (await this.entries.listIds(MAX_INDEXED_RUN_FOLDERS + 1)).filter((id) => !folders.has(id));
    this.logger.log({
      event: 'runs.index-rebuilt',
      indexed: report.indexed,
      unreadable: report.unreadable.length,
      orphaned: report.orphaned.length,
      comparisons: report.comparisons,
      unpairedComparisons: report.unpairedComparisons.length,
    });
    return report;
  }

  private async tryReadRun(runId: RunId, report: RunIndexRebuildReport): Promise<RunFile | null> {
    try {
      return await this.readRun(runDirectory(this.dataHome.runs, runId));
    } catch (error) {
      if (error instanceof RunFolderMismatchError) report.unreadable.push({ runId, problem: 'run-id-mismatch' });
      else if (error instanceof RunFileError) report.unreadable.push({ runId, problem: error.code });
      else throw error;
      this.logger.warn({ event: 'runs.index-skipped-folder', runId, problem: report.unreadable.at(-1)?.problem });
      return null;
    }
  }

  private async readRun(runDir: string): Promise<RunFile> {
    const run = await readRunFile(runDir);
    if (run.runId !== basename(runDir)) throw new RunFolderMismatchError(basename(runDir), run.runId);
    return run;
  }
}
