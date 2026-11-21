import { type Dirent } from 'node:fs';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import {
  RunFileError,
  readApprovalFile,
  readControlRequest,
  readRunFile,
  readWatcherState,
  runDirectory,
  type OptionalFile,
} from '@studio/shared/run-files';
import {
  RunIdSchema,
  resumableStatuses,
  runFileNames,
  type ApprovalFile,
  type RunFile,
  type RunId,
  type RunStatus,
} from '@studio/shared/run-format';
import { DAEMON_PROCESS, type DaemonProcess } from './daemon.settings';
import { classifyRun, compareCandidates, type RunCandidate, type RunFacts, type RunVerdict } from './run-classification';

type RunSummary = { kind: 'readable'; run: Pick<RunFile, 'runId' | 'state'> } | { kind: 'unreadable'; code: string };

interface CachedSummary {
  /** inode, size and mtime of run.json: every C5 write is a tmp+rename, so a new write is a new inode. */
  stamp: string;
  summary: RunSummary;
}

/** Statuses the daemon may start; `draft` belongs to the api or CLI, the rest are finished or under review. */
const schedulableStatuses: readonly RunStatus[] = ['pending', 'running', ...resumableStatuses];

const noApproval: OptionalFile<ApprovalFile> = { status: 'absent' };

function isMissing(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/**
 * Finds the runs the daemon may start (SPEC 0002 R1-09): `pending` runs, held runs with a resume
 * request or a newly answered gate, and `running` runs whose `watcher.pid` is dead or absent. It
 * only reads run files (C5 readers); claiming a run is `RunEngine.execute`'s job. run.json is
 * parsed again only when the file changed, so a poll over many finished runs costs one `stat` each.
 */
@Injectable()
export class RunScanner {
  private readonly logger = new Logger(RunScanner.name);
  private readonly summaries = new Map<RunId, CachedSummary>();
  /** Notices already logged; a condition logs once while it lasts, and again if it comes back. */
  private reported = new Set<string>();

  constructor(
    @Inject(DataHome) private readonly dataHome: DataHome,
    @Inject(DAEMON_PROCESS) private readonly daemonProcess: DaemonProcess,
  ) {}

  /** Startable runs, highest priority first. */
  async scan(): Promise<RunCandidate[]> {
    const runIds = await this.listRunIds();
    const notices = new Set<string>();
    const candidates: RunCandidate[] = [];
    for (const runId of runIds) {
      const runDir = runDirectory(this.dataHome.runs, runId);
      const verdict = await this.inspect(runId, runDir, notices);
      if (verdict.kind === 'start') candidates.push({ runId, runDir, trigger: verdict.trigger });
    }
    const present = new Set<string>(runIds);
    for (const runId of this.summaries.keys()) if (!present.has(runId)) this.summaries.delete(runId);
    this.reported = notices;
    return candidates.sort(compareCandidates);
  }

  private async listRunIds(): Promise<RunId[]> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.dataHome.runs, { withFileTypes: true });
    } catch (error) {
      // No runs/ yet: nothing to run. `PrismaService` creates the data folders at start anyway.
      if (isMissing(error)) return [];
      throw error;
    }
    const runIds: RunId[] = [];
    for (const entry of entries) {
      const parsed = RunIdSchema.safeParse(entry.name);
      if (entry.isDirectory() && parsed.success) runIds.push(parsed.data);
    }
    return runIds;
  }

  private async inspect(runId: RunId, runDir: string, notices: Set<string>): Promise<RunVerdict> {
    const summary = await this.summaryOf(runId, runDir);
    if (summary === null) return { kind: 'idle' };
    if (summary.kind === 'unreadable') return this.unreadable(runId, summary.code, notices);
    if (!schedulableStatuses.includes(summary.run.state.status)) return { kind: 'idle' };
    let facts: RunFacts;
    try {
      facts = await this.factsOf(summary.run, runDir);
    } catch (error) {
      if (!(error instanceof RunFileError)) throw error;
      return this.unreadable(runId, error.code, notices);
    }
    const verdict = classifyRun(facts);
    if (verdict.kind === 'owned') {
      this.notice(notices, `${runId}:owned:${verdict.ownerPid}`, () =>
        this.logger.warn({ event: 'run.refused', reason: 'live-owner', runId, ownerPid: verdict.ownerPid }),
      );
    }
    return verdict;
  }

  private unreadable(runId: RunId, code: string, notices: Set<string>): RunVerdict {
    // The error message names the file path only (RunFileError contract); the code is enough to act on.
    this.notice(notices, `${runId}:unreadable:${code}`, () => this.logger.warn({ event: 'run.skipped', reason: 'unreadable', runId, code }));
    return { kind: 'idle' };
  }

  private notice(notices: Set<string>, key: string, write: () => void): void {
    notices.add(key);
    if (!this.reported.has(key)) write();
  }

  /** Null while run.json does not exist yet (a folder the api or CLI is still creating). */
  private async summaryOf(runId: RunId, runDir: string): Promise<RunSummary | null> {
    let stamp: string;
    try {
      const stats = await stat(join(runDir, runFileNames.run), { bigint: true });
      stamp = `${stats.ino}:${stats.size}:${stats.mtimeNs}`;
    } catch (error) {
      if (!isMissing(error)) throw error;
      this.summaries.delete(runId);
      return null;
    }
    const cached = this.summaries.get(runId);
    if (cached !== undefined && cached.stamp === stamp) return cached.summary;
    const summary = await this.readSummary(runId, runDir);
    this.summaries.set(runId, { stamp, summary });
    return summary;
  }

  private async readSummary(runId: RunId, runDir: string): Promise<RunSummary> {
    try {
      const run = await readRunFile(runDir);
      if (run.runId !== runId) return { kind: 'unreadable', code: 'folder-mismatch' };
      return { kind: 'readable', run: { runId: run.runId, state: run.state } };
    } catch (error) {
      if (error instanceof RunFileError) return { kind: 'unreadable', code: error.code };
      throw error;
    }
  }

  /** Reads only what the status needs: control.json for held runs, approval.json for waiting ones. */
  private async factsOf(run: Pick<RunFile, 'runId' | 'state'>, runDir: string): Promise<RunFacts> {
    const owner = await readWatcherState(runDir, { selfPid: this.daemonProcess.pid });
    const held = resumableStatuses.includes(run.state.status);
    const control = held ? await readControlRequest(runDir) : null;
    const approval = run.state.status === 'waiting' ? await readApprovalFile(runDir) : noApproval;
    return {
      run,
      owner,
      resumeRequested: control !== null && control.status === 'present' && control.value.resume === true,
      approval,
    };
  }
}
