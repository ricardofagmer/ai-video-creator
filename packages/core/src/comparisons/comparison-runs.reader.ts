import { Injectable } from '@nestjs/common';
import {
  RunFileNotFoundError,
  readApprovalFile,
  readCostFile,
  readQaSummary,
  readRunFile,
  readRunManifest,
  readWatcherState,
  runDirectory,
} from '@studio/shared/run-files';
import {
  latestDecision,
  type ComparisonId,
  type QaSummary,
  type RunComparisonLink,
  type RunFile,
  type RunId,
} from '@studio/shared/run-format';
import { DataHome } from '../paths/data-home';
import { type ComparisonRecord } from './comparison-record.mapper';
import { ComparisonLinkBrokenError } from './comparisons.errors';

export type ComparisonArm = 'a' | 'b';

/** One arm read from its run folder at request time (files win, ADR 0003). */
export interface LoadedArm {
  arm: ComparisonArm;
  runId: RunId;
  run: RunFile;
  link: RunComparisonLink;
  /** `cost.json` `totalUsd`; 0 before the first billed session. */
  costUsd: number;
  qa: QaSummary | null;
  finalDecision: { outcome: 'approved' | 'rejected'; rating: number } | null;
  hasManifest: boolean;
  watcherAlive: boolean;
}

export interface LoadedPair {
  a: LoadedArm;
  b: LoadedArm;
}

/**
 * Reads both arms of a comparison through the C5 helpers. A run.json that is missing or does not
 * link back to this comparison, arm and peer fails with `ComparisonLinkBrokenError`: an arm of
 * another comparison is never shown or started under this id (section 6 object-level check).
 */
@Injectable()
export class ComparisonRunsReader {
  constructor(private readonly dataHome: DataHome) {}

  async loadPair(record: ComparisonRecord): Promise<LoadedPair> {
    const a = await this.loadArm(record.comparisonId, { arm: 'a', runId: record.runAId, peerRunId: record.runBId });
    const b = await this.loadArm(record.comparisonId, { arm: 'b', runId: record.runBId, peerRunId: record.runAId });
    return { a, b };
  }

  private async loadArm(comparisonId: ComparisonId, expected: { arm: ComparisonArm; runId: RunId; peerRunId: RunId }): Promise<LoadedArm> {
    const runDir = runDirectory(this.dataHome.runs, expected.runId);
    const run = await this.readLinkedRun(runDir, comparisonId, expected.runId);
    const link = run.comparison;
    if (link === undefined || link.comparisonId !== comparisonId || link.arm !== expected.arm || link.peerRunId !== expected.peerRunId) {
      throw new ComparisonLinkBrokenError(comparisonId, expected.runId);
    }
    const [cost, qa, approval, manifest, watcher] = await Promise.all([
      readCostFile(runDir),
      readQaSummary(runDir),
      readApprovalFile(runDir),
      readRunManifest(runDir),
      readWatcherState(runDir),
    ]);
    const decision = approval.status === 'present' && approval.value.runId === run.runId ? latestDecision(approval.value, 'final') : undefined;
    return {
      arm: expected.arm,
      runId: expected.runId,
      run,
      link,
      costUsd: cost.status === 'present' && cost.value.runId === run.runId ? cost.value.totalUsd : 0,
      qa: qa.status === 'present' && qa.value.runId === run.runId ? qa.value : null,
      finalDecision: decision?.kind === 'final' ? { outcome: decision.outcome, rating: decision.rating } : null,
      hasManifest: manifest.status === 'present' && manifest.value.runId === run.runId,
      watcherAlive: watcher.status === 'alive',
    };
  }

  private async readLinkedRun(runDir: string, comparisonId: ComparisonId, runId: RunId): Promise<RunFile> {
    let run: RunFile;
    try {
      run = await readRunFile(runDir);
    } catch (error) {
      if (error instanceof RunFileNotFoundError) throw new ComparisonLinkBrokenError(comparisonId, runId);
      throw error;
    }
    if (run.runId !== runId) throw new ComparisonLinkBrokenError(comparisonId, runId);
    return run;
  }
}
