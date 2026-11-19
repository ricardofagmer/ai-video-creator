import { join } from 'node:path';
import { pipelineStages, stageStates, type PipelineStage, type RunFile } from '@studio/shared/ace';
import { InputError, ManifestChangedError } from '../errors';
import { hashManifest } from './hashing';
import { nextStepFor } from './next-steps';
import { stageManifestFiles } from './run-paths';
import { readJsonFile } from './run-store';

/** A stage may only run in its contracts runningIn state. */
export function assertStageReady(run: RunFile, stage: PipelineStage): void {
  const expected = stageStates[stage].runningIn;
  if (run.state === expected) return;
  const reason = run.stateReason ? ` (${run.stateReason})` : '';
  throw new InputError(
    `Stage "${stage}" needs state ${expected}, but run ${run.runId} is ${run.state}${reason}`,
    nextStepFor(run),
  );
}

function stagesBefore(stage: PipelineStage | 'all'): readonly PipelineStage[] {
  if (stage === 'all') return pipelineStages;
  return pipelineStages.slice(0, pipelineStages.indexOf(stage));
}

/**
 * Every upstream manifest must still hash to what was validated; otherwise the
 * downstream work would be built on content nobody checked.
 */
export async function assertUpstreamUnchanged(runDir: string, run: RunFile, stage: PipelineStage | 'all'): Promise<void> {
  for (const upstream of stagesBefore(stage)) {
    const fileName = stageManifestFiles[upstream];
    const expected = run.manifestHashes[upstream];
    if (expected === undefined) {
      throw new InputError(`${fileName} has not been validated for run ${run.runId}`, nextStepFor(run));
    }
    const actual = hashManifest(await readJsonFile(join(runDir, fileName)));
    if (actual === expected) continue;
    const canRevalidate = stageStates[upstream].runningIn === run.state;
    const next = canRevalidate
      ? `re-run ace validate ${run.runId} ${upstream}`
      : `restore the validated ${fileName} (${expected}); the state machine has no rewind, so changed content needs a new run (ace init)`;
    throw new ManifestChangedError(`${fileName} changed after it was validated (expected ${expected}, found ${actual})`, next);
  }
}
