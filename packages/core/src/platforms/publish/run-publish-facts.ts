import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { Injectable } from '@nestjs/common';
import { publishBounds } from '@studio/shared/platforms';
import {
  RunFileError,
  readApprovalFile,
  readRunFile,
  readRunManifest,
  resolveInsideRun,
  runDirectory,
} from '@studio/shared/run-files';
import { latestDecision, runFileNames, type RunId, type RunManifest } from '@studio/shared/run-format';
import { isInsideOrEqual } from '../../asset-store';
import { DataHome } from '../../paths/data-home';
import { PrismaService } from '../../prisma/prisma.service';

/** Section 5.4 step 4: all three records say `approved`; `decidedAt` is the final decision in force. */
export type RunApprovalFacts = { status: 'approved'; decidedAt: Date } | { status: 'not-approved' };

/** `final.mp4` as the manifest recorded it, and where it is on disk (inside the real run folder). */
export interface RecordedFinalVideo {
  absolutePath: string;
  manifestSha256: string;
  sizeBytes: number;
}

/** Section 5.4 step 5 facts before hashing: `missing` covers absent, unrecorded, unsafe and oversized. */
export type FinalVideoLookup = { status: 'present'; video: RecordedFinalVideo } | { status: 'missing' };

function isMissingFile(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

/** The run's manifest when it is present, readable and names this run; null otherwise. */
async function manifestOf(runDir: string, runId: RunId): Promise<RunManifest | null> {
  try {
    const manifest = await readRunManifest(runDir);
    return manifest.status === 'present' && manifest.value.runId === runId ? manifest.value : null;
  } catch (error) {
    if (error instanceof RunFileError) return null;
    throw error;
  }
}

/**
 * Reads the approval and artifact facts of a run for `RequestPublish` (SPEC 0007 section 5.4 steps
 * 4 and 5) and the dialog. Read-only: SQLite reads, `run.json`, `approval.json`, `manifest.json`
 * and a streamed hash of `final.mp4`. A record that is missing or unreadable answers "not
 * approved" / "missing", never a guess.
 */
@Injectable()
export class RunPublishFacts {
  constructor(
    private readonly prisma: PrismaService,
    private readonly dataHome: DataHome,
  ) {}

  runDirOf(runId: RunId): string {
    return runDirectory(this.dataHome.runs, runId);
  }

  async approval(runId: RunId): Promise<RunApprovalFacts> {
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
      // A missing or broken run record is not an approval (RunFileNotFoundError is a RunFileError).
      if (error instanceof RunFileError) return { status: 'not-approved' };
      throw error;
    }
  }

  /** `final.mp4` as recorded in `manifest.json.outputs`, present on disk, inside the run, at most 4 GiB. */
  async finalVideo(runId: RunId): Promise<FinalVideoLookup> {
    const runDir = this.runDirOf(runId);
    const manifest = await manifestOf(runDir, runId);
    const output = manifest === null ? undefined : manifest.outputs.find((candidate) => candidate.path === runFileNames.finalVideo);
    if (output === undefined) return { status: 'missing' };
    try {
      const [realRunDir, realVideo] = await Promise.all([realpath(runDir), realpath(resolveInsideRun(runDir, output.path))]);
      if (realVideo === realRunDir || !isInsideOrEqual(realRunDir, realVideo)) return { status: 'missing' };
      const stats = await stat(realVideo);
      if (!stats.isFile() || stats.size === 0 || stats.size > publishBounds.maxArtifactBytes) return { status: 'missing' };
      return { status: 'present', video: { absolutePath: realVideo, manifestSha256: output.contentHash, sizeBytes: stats.size } };
    } catch (error) {
      if (isMissingFile(error)) return { status: 'missing' };
      throw error;
    }
  }

  /** Lowercase hex sha-256 of a file, streamed so a 4 GiB video never sits in memory. */
  async sha256Of(absolutePath: string): Promise<string> {
    const hash = createHash('sha256');
    for await (const chunk of createReadStream(absolutePath)) hash.update(chunk);
    return hash.digest('hex');
  }
}
