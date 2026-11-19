import { Injectable } from '@nestjs/common';
import type { ResolvedAsset } from '@studio/shared/ports';
import { readEgressEntries, readRunFile, readStageInputManifest } from '@studio/shared/run-files';
import { type RunFile, type RunManifest, type StageInputManifest } from '@studio/shared/run-format';
import { toRunManifest, type RunManifestOutput } from './run-manifest.mapper';

export interface RunManifestRequest {
  /** Absolute run folder (C6 `StageExecutionContext.runDir`). */
  runDir: string;
  /** C6 `StageExecutionContext.assets` of the calling stage: every bound asset, re-hashed at its preflight. */
  assets: readonly ResolvedAsset[];
  /** The run's deliverables, hashed by the caller. */
  outputs: readonly RunManifestOutput[];
  createdAt: Date;
}

const settledSnapshot: ReadonlySet<string> = new Set(['ok', 'warning']);

/** Stages whose `snapshot` step wrote an input manifest: every delivered stage and the caller's own. */
function stagesWithInputManifest(run: Readonly<RunFile>): RunFile['stages'] {
  return run.stages.filter((stage) => stage.steps.some((step) => step.step === 'snapshot' && settledSnapshot.has(step.status)));
}

/**
 * Gathers what `manifest.json` lists from the run folder, read-only through C5: run.json for the
 * recipe pin, brief and references; each run stage's `input-manifest.json` for the parameters and
 * models it used; `egress.jsonl` for what left the machine. The `package` stage (R1-14) calls it
 * from `execute` and writes the result with C5 `writeRunManifest`, which validates it.
 */
@Injectable()
export class RunManifestBuilder {
  async build(request: RunManifestRequest): Promise<RunManifest> {
    const run = await readRunFile(request.runDir);
    const stageManifests: StageInputManifest[] = [];
    for (const stage of stagesWithInputManifest(run)) {
      stageManifests.push(await readStageInputManifest(request.runDir, { stageNumber: stage.number, stageId: stage.stageId }));
    }
    const egress = await readEgressEntries(request.runDir);
    return toRunManifest({
      run,
      assets: request.assets,
      stageManifests,
      outputs: request.outputs,
      egress: egress.entries,
      createdAt: request.createdAt,
    });
  }
}
