import { join } from 'node:path';
import {
  AssetManifestSchema,
  BlockedError,
  ClaimManifestSchema,
  EditorialReviewSchema,
  QaResultSchema,
  ResearchManifestSchema,
  ScriptManifestSchema,
  runFiles,
  type EditorialReview,
  type QaResult,
} from '@studio/shared/ace';
import type { CommandContext, CommandOutcome } from '../cli/context';
import { InputError } from '../errors';
import { detectBlackAndSilence } from '../media/ffmpeg';
import { probeMedia } from '../media/ffprobe';
import { contentChecks } from '../qa/content-checks';
import { technicalChecks } from '../qa/technical-checks';
import { hashManifest } from '../run/hashing';
import { nextStepFor } from '../run/next-steps';
import { assertStageReady, assertUpstreamUnchanged } from '../run/preconditions';
import { fileExists, readJsonFile, readManifest, writeJsonAtomic } from '../run/run-store';
import { applyAfterQaPassed, applyEvent } from '../run/state';

async function readEditorial(runDir: string, runId: string): Promise<EditorialReview> {
  const path = join(runDir, runFiles.editorial);
  if (!(await fileExists(path))) {
    throw new InputError(`${runFiles.editorial} is missing`, `run fagmer-video-quality-gate first to write ${runFiles.editorial}, then ace qa ${runId}`);
  }
  const parsed = EditorialReviewSchema.safeParse(await readJsonFile(path));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
    throw new InputError(`${runFiles.editorial} is invalid: ${issues.join('; ')}`, `fix ${runFiles.editorial} and re-run ace qa ${runId}`);
  }
  return parsed.data;
}

/** Technical ffprobe/ffmpeg checks + content checks + editorial.json -> qa.json; pass moves to REVIEW. */
export async function qaCommand(context: CommandContext, runArgument: string): Promise<CommandOutcome> {
  const { runDir, run } = await context.openRun(runArgument);
  assertStageReady(run, 'qa');
  await assertUpstreamUnchanged(runDir, run, 'qa');
  const editorial = await readEditorial(runDir, run.runId);
  const research = await readManifest(runDir, runFiles.research, ResearchManifestSchema);
  const claims = await readManifest(runDir, runFiles.verify, ClaimManifestSchema);
  const script = await readManifest(runDir, runFiles.script, ScriptManifestSchema);
  const assets = await readManifest(runDir, runFiles.assets, AssetManifestSchema);

  context.beginStage('qa');
  const videoPath = join(runDir, runFiles.video);
  context.log('probing video.mp4 and scanning for black frames and silence');
  const probe = await probeMedia(context.env.ffprobePath, videoPath);
  const detection = await detectBlackAndSilence(context.env.ffmpegPath, videoPath, probe.durationS);
  const checks = [...technicalChecks(probe, detection), ...contentChecks({ research, claims, script, assets }), ...editorial.checks];
  const blockingFailures = checks.filter((item) => item.blocking && !item.passed);
  const result: QaResult = QaResultSchema.parse({
    schemaVersion: 1,
    verdict: blockingFailures.length === 0 ? 'pass' : 'fail',
    checks,
    seo: editorial.seo,
  });
  // Written on fail too, so the reviewer can see exactly what blocked.
  await writeJsonAtomic(join(runDir, runFiles.qa), result);
  for (const item of checks) context.log(`${item.passed ? 'pass' : item.blocking ? 'FAIL' : 'warn'}  ${item.id}: ${item.detail}`);

  if (blockingFailures.length > 0) {
    throw new BlockedError(`blocking QA checks failed: ${blockingFailures.map((item) => item.id).join(', ')}`, 'QA_BLOCKING');
  }
  const inputHash = hashManifest(result);
  const qaPassed = applyEvent(
    { ...run, manifestHashes: { ...run.manifestHashes, qa: inputHash } },
    { event: { type: 'STAGE_SUCCEEDED', stage: 'qa' }, actor: 'toolbox', reason: `${checks.length} checks passed`, inputHash },
  );
  const saved = await context.commit(runDir, applyAfterQaPassed(qaPassed, 'toolbox'));
  return { runId: saved.runId, state: saved.state, next: nextStepFor(saved) };
}
