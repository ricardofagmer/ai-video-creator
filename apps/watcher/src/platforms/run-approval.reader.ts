import { realpath, stat } from 'node:fs/promises';
import { Inject, Injectable } from '@nestjs/common';
import { isInsideOrEqual } from '@studio/core/asset-store';
import { DataHome } from '@studio/core/paths';
import { PrismaService } from '@studio/core/prisma';
import { publishBounds } from '@studio/shared/platforms';
import { RunFileError, readApprovalFile, readRunFile, readRunManifest, resolveInsideRun, runDirectory } from '@studio/shared/run-files';
import { latestDecision, runFileNames, type RunId, type RunManifest } from '@studio/shared/run-format';

/** Section 5.5 re-check: all three records say `approved`; `decidedAt` is the final decision in force. */
export type RunApproval = { status: 'approved'; decidedAt: Date } | { status: 'not-approved' };

/** `final.mp4` as the manifest recorded it, resolved inside the real run folder. */
export type FinalVideo =
  | { status: 'present'; absolutePath: string; manifestSha256: string; sizeBytes: number }
  | { status: 'missing' };

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/**
 * The approval and artifact facts the watcher re-checks before the first byte (SPEC 0007 section
 * 5.5, AC 50). Read-only: one SQLite read (`run_outcomes.decision`, K1 allows reads), `run.json`,
 * `approval.json` and `manifest.json`; the hash of `final.mp4` is taken from the upload's own handle
 * (`final-video.handle.ts`). A record that is missing or unreadable answers "not approved" /
 * "missing", never a guess. No Prisma write exists here (AC 57).
 */
@Injectable()
export class RunApprovalReader {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(DataHome) private readonly dataHome: DataHome,
  ) {}

  async approval(runId: RunId): Promise<RunApproval> {
    const outcome = await this.prisma.runOutcome.findUnique({ where: { runId }, select: { decision: true } });
    if (outcome === null || outcome.decision !== 'approved') return { status: 'not-approved' };
    const runDir = this.runDirOf(runId);
    try {
      const run = await readRunFile(runDir);
      if (run.runId !== runId || run.state.status !== 'approved') return { status: 'not-approved' };
      const approval = await readApprovalFile(runDir);
      if (approval.status !== 'present' || approval.value.runId !== runId) return { status: 'not-approved' };
      const decision = latestDecision(approval.value, 'final');
      if (decision === undefined || decision.kind !== 'final' || decision.outcome !== 'approved') return { status: 'not-approved' };
      return { status: 'approved', decidedAt: new Date(decision.decidedAt) };
    } catch (error) {
      if (error instanceof RunFileError) return { status: 'not-approved' };
      throw error;
    }
  }

  /** `final.mp4` as recorded in `manifest.json.outputs`, a regular file inside the run, at most 4 GiB. */
  async finalVideo(runId: RunId): Promise<FinalVideo> {
    const runDir = this.runDirOf(runId);
    const manifest = await this.manifestOf(runDir, runId);
    const output = manifest === null ? undefined : manifest.outputs.find((candidate) => candidate.path === runFileNames.finalVideo);
    if (output === undefined) return { status: 'missing' };
    try {
      const [realRunDir, realVideo] = await Promise.all([realpath(runDir), realpath(resolveInsideRun(runDir, output.path))]);
      if (realVideo === realRunDir || !isInsideOrEqual(realRunDir, realVideo)) return { status: 'missing' };
      const stats = await stat(realVideo);
      if (!stats.isFile() || stats.size === 0 || stats.size > publishBounds.maxArtifactBytes) return { status: 'missing' };
      return { status: 'present', absolutePath: realVideo, manifestSha256: output.contentHash, sizeBytes: stats.size };
    } catch (error) {
      if (isMissingFile(error)) return { status: 'missing' };
      throw error;
    }
  }

  private runDirOf(runId: RunId): string {
    return runDirectory(this.dataHome.runs, runId);
  }

  private async manifestOf(runDir: string, runId: RunId): Promise<RunManifest | null> {
    try {
      const manifest = await readRunManifest(runDir);
      return manifest.status === 'present' && manifest.value.runId === runId ? manifest.value : null;
    } catch (error) {
      if (error instanceof RunFileError) return null;
      throw error;
    }
  }
}
