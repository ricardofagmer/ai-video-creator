import { RunFileError, readCostFile, readQaSummary, readRunManifest, type OptionalFile } from '@studio/shared/run-files';
import { runFileNames } from '@studio/shared/run-format';
import { probeRunPath } from './run-folder-files';

export type ReviewReadiness = { status: 'ready' } | { status: 'not-ready'; missing: string[] };

/** Absent and unreadable both count as missing: review needs each file valid (K5). */
async function presentAndValid<T>(read: () => Promise<OptionalFile<T>>): Promise<boolean> {
  try {
    return (await read()).status === 'present';
  } catch (error) {
    if (error instanceof RunFileError) return false;
    throw error;
  }
}

async function nonEmptyFile(runDir: string, relativePath: string): Promise<boolean> {
  const probe = await probeRunPath(runDir, relativePath);
  return probe.status === 'file' && probe.sizeBytes > 0;
}

/**
 * SPEC 0002 K5: the `package` stage writes final.mp4, manifest.json, cost.json, qa/summary.json
 * and report.md before the run enters `review`. The engine checks them itself instead of trusting
 * the package executor's report, so a run never reaches `review` without its deliverables.
 */
export async function checkReviewReadiness(runDir: string): Promise<ReviewReadiness> {
  const checks: ReadonlyArray<readonly [string, () => Promise<boolean>]> = [
    [runFileNames.finalVideo, async () => nonEmptyFile(runDir, runFileNames.finalVideo)],
    [runFileNames.manifest, async () => presentAndValid(async () => readRunManifest(runDir))],
    [runFileNames.cost, async () => presentAndValid(async () => readCostFile(runDir))],
    [runFileNames.qaSummary, async () => presentAndValid(async () => readQaSummary(runDir))],
    [runFileNames.report, async () => nonEmptyFile(runDir, runFileNames.report)],
  ];
  const missing: string[] = [];
  for (const [name, check] of checks) {
    if (!(await check())) missing.push(name);
  }
  return missing.length === 0 ? { status: 'ready' } : { status: 'not-ready', missing };
}
