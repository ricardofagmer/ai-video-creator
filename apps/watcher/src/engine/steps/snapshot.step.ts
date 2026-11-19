import { Inject, Injectable } from '@nestjs/common';
import { RunFileSchemaError, readStageInputManifest, writeStageInputManifest } from '@studio/shared/run-files';
import { stageBriefPath, type StepName } from '@studio/shared/run-format';
import { type Clock } from '../clock';
import { CLOCK } from '../engine.tokens';
import { ownerTexts } from '../owner-texts';
import { sha256OfRunFile } from '../run-folder-files';
import { toInputManifest } from './input-manifest.mapper';
import { postconditionFailed, type StepContext, type StepHandler, type StepOutcome } from './step-handler';

/** Step 3: write `input-manifest.json`; postcondition "exists and validates". */
@Injectable()
export class SnapshotStep implements StepHandler {
  readonly step: StepName = 'snapshot';

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async run({ workspace, attempt, signal }: StepContext): Promise<StepOutcome> {
    const brief = await workspace.stageBrief();
    const manifest = toInputManifest({
      runId: workspace.active.snapshot.runId,
      brief,
      briefHash: await sha256OfRunFile(workspace.runDir, stageBriefPath(workspace.location)),
      attempt,
      assets: await workspace.resolvedBindings(signal),
      parameters: workspace.planningContext().params,
      createdAt: this.clock.now(),
    });
    try {
      await writeStageInputManifest(workspace.runDir, manifest);
      workspace.rememberInputManifest(await readStageInputManifest(workspace.runDir, workspace.location));
    } catch (error) {
      if (error instanceof RunFileSchemaError) return postconditionFailed(this.step, error.problems.slice(0, 3).join('; '));
      throw error;
    }
    return { kind: 'passed', detail: ownerTexts.snapshotWritten(manifest.assets.length, manifest.inputs.length) };
  }
}
