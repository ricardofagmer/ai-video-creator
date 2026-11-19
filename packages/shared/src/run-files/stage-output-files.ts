import { CostFileSchema, type CostFile } from '../run-format/cost';
import {
  checkOutputPath,
  checkResultPath,
  runFileNames,
  stageBriefPath,
  stageInputManifestPath,
  type CheckLocation,
  type StageLocation,
} from '../run-format/layout';
import { RunManifestSchema, type RunManifest } from '../run-format/manifest';
import { missingSections, planSections, reportSections } from '../run-format/markdown';
import { QaSummarySchema, type QaSummary } from '../run-format/qa';
import {
  CheckResultSchema,
  StageBriefSchema,
  StageInputManifestSchema,
  type CheckResult,
  type StageBrief,
  type StageInputManifest,
} from '../run-format/stage-files';
import { writeFileAtomic, writeJsonAtomic } from './atomic-write';
import { RunFileSchemaError } from './errors';
import { readJsonFile, readOptionalJsonFile, type OptionalFile } from './read';
import { resolveInsideRun } from './run-paths';

/** `brief` step output; its postcondition is "exists and validates" (PRD 7.2). */
export async function readStageBrief(runDir: string, location: StageLocation): Promise<StageBrief> {
  return readJsonFile(resolveInsideRun(runDir, stageBriefPath(location)), StageBriefSchema);
}

export async function writeStageBrief(runDir: string, brief: StageBrief): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, stageBriefPath(brief)), StageBriefSchema, brief);
}

/** `snapshot` step output. */
export async function readStageInputManifest(runDir: string, location: StageLocation): Promise<StageInputManifest> {
  return readJsonFile(resolveInsideRun(runDir, stageInputManifestPath(location)), StageInputManifestSchema);
}

export async function writeStageInputManifest(runDir: string, manifest: StageInputManifest): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, stageInputManifestPath(manifest)), StageInputManifestSchema, manifest);
}

/** `verify` step: one check result per check and attempt. */
export async function writeCheckResult(runDir: string, result: CheckResult): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, checkResultPath(result)), CheckResultSchema, result);
}

export async function readCheckResult(runDir: string, location: CheckLocation): Promise<CheckResult> {
  return readJsonFile(resolveInsideRun(runDir, checkResultPath(location)), CheckResultSchema);
}

/** Raw, already redacted command output of a check; the caller redacts before writing. */
export async function writeCheckOutput(runDir: string, location: CheckLocation, output: string): Promise<void> {
  await writeFileAtomic(resolveInsideRun(runDir, checkOutputPath(location)), output);
}

export async function readRunManifest(runDir: string): Promise<OptionalFile<RunManifest>> {
  return readOptionalJsonFile(resolveInsideRun(runDir, runFileNames.manifest), RunManifestSchema);
}

export async function writeRunManifest(runDir: string, manifest: RunManifest): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, runFileNames.manifest), RunManifestSchema, manifest);
}

/** cost.json; it does not parse unless `totalUsd` equals the sum of sessions (criterion 19). */
export async function readCostFile(runDir: string): Promise<OptionalFile<CostFile>> {
  return readOptionalJsonFile(resolveInsideRun(runDir, runFileNames.cost), CostFileSchema);
}

export async function writeCostFile(runDir: string, cost: CostFile): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, runFileNames.cost), CostFileSchema, cost);
}

export async function readQaSummary(runDir: string): Promise<OptionalFile<QaSummary>> {
  return readOptionalJsonFile(resolveInsideRun(runDir, runFileNames.qaSummary), QaSummarySchema);
}

export async function writeQaSummary(runDir: string, summary: QaSummary): Promise<void> {
  await writeJsonAtomic(resolveInsideRun(runDir, runFileNames.qaSummary), QaSummarySchema, summary);
}

export type RunMarkdownFile = 'plan' | 'report';

/** plan.md (export of run.json) or report.md (package output); refused when a section is missing. */
export async function writeRunMarkdown(runDir: string, file: RunMarkdownFile, markdown: string): Promise<void> {
  const filePath = resolveInsideRun(runDir, file === 'plan' ? runFileNames.plan : runFileNames.report);
  const missing = missingSections(markdown, file === 'plan' ? planSections : reportSections);
  if (missing.length > 0) throw new RunFileSchemaError(filePath, missing.map((section) => `missing section "## ${section}"`));
  await writeFileAtomic(filePath, markdown.endsWith('\n') ? markdown : `${markdown}\n`);
}
