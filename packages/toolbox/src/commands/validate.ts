import { join } from 'node:path';
import {
  ClaimManifestSchema,
  ResearchManifestSchema,
  runFiles,
  type RunFile,
} from '@studio/shared/ace';
import type { CommandContext, CommandOutcome } from '../cli/context';
import { InputError } from '../errors';
import { hashManifest } from '../run/hashing';
import { nextStepFor } from '../run/next-steps';
import { assertStageReady, assertUpstreamUnchanged } from '../run/preconditions';
import { stageManifestFiles } from '../run/run-paths';
import { readJsonFile, readManifest } from '../run/run-store';
import { applyEvent, stageActor } from '../run/state';
import { checkClaims } from '../validation/claims-rules';
import { checkResearch } from '../validation/research-rules';
import { checkScript } from '../validation/script-rules';
import { raiseViolations, type Violation } from '../validation/violations';

const validatableStages = ['research', 'verify', 'script'] as const;
type ValidatableStage = (typeof validatableStages)[number];

function parseStage(argument: string): ValidatableStage {
  const stage = validatableStages.find((candidate) => candidate === argument);
  if (!stage) throw new InputError(`unknown stage "${argument}"; use research, verify or script`, 'run ace validate --help');
  return stage;
}

async function collectViolations(runDir: string, run: RunFile, stage: ValidatableStage, raw: unknown): Promise<Violation[]> {
  if (stage === 'research') return checkResearch(raw).violations;
  const research = await readManifest(runDir, runFiles.research, ResearchManifestSchema);
  if (stage === 'verify') return checkClaims(raw, research).violations;
  const claims = await readManifest(runDir, runFiles.verify, ClaimManifestSchema);
  return checkScript(raw, { research, claims, template: run.template }).violations;
}

/**
 * Validates a Claude-written manifest against its schema and the spec rules, stores its
 * hash and advances the state (research keeps RESEARCH; verify -> VERIFIED; script -> SCRIPTED).
 */
export async function validateCommand(context: CommandContext, runArgument: string, stageArgument: string): Promise<CommandOutcome> {
  const stage = parseStage(stageArgument);
  const { runDir, run } = await context.openRun(runArgument);
  assertStageReady(run, stage);
  await assertUpstreamUnchanged(runDir, run, stage);
  const fileName = stageManifestFiles[stage];
  const raw = await readJsonFile(join(runDir, fileName));

  context.beginStage(stage);
  const violations = await collectViolations(runDir, run, stage, raw);
  raiseViolations(fileName, violations);

  const inputHash = hashManifest(raw);
  const advanced = applyEvent(
    { ...run, manifestHashes: { ...run.manifestHashes, [stage]: inputHash } },
    { event: { type: 'STAGE_SUCCEEDED', stage }, actor: stageActor(stage), reason: `${fileName} validated`, inputHash },
  );
  const saved = await context.commit(runDir, advanced);
  context.log(`${fileName} valid (${inputHash}); state ${saved.state}`);
  return { runId: saved.runId, state: saved.state, next: nextStepFor(saved) };
}
