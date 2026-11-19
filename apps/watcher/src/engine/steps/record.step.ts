import { Inject, Injectable } from '@nestjs/common';
import { readCostFile } from '@studio/shared/run-files';
import { type StageOutput, type StepName } from '@studio/shared/run-format';
import { type Clock } from '../clock';
import { CLOCK } from '../engine.tokens';
import { ownerTexts } from '../owner-texts';
import { findMissingDeclaredOutputs, isOptionalOutput } from '../postconditions/declared-outputs';
import { probeRunPath, sha256OfRunFile } from '../run-folder-files';
import { postconditionFailed, type StepContext, type StepHandler, type StepOutcome } from './step-handler';

/**
 * Step 7: hash every declared output into run.json (ADR 0003 decision 4) and copy cost.json into
 * the totals; optional outputs that exist are hashed, absent ones are skipped (SPEC 0002 rev 4,
 * section 13.6). The runner marks the stage delivered once this step is `ok`.
 */
@Injectable()
export class RecordStep implements StepHandler {
  readonly step: StepName = 'record';

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async run({ workspace }: StepContext): Promise<StepOutcome> {
    const brief = await workspace.stageBrief();
    const missing = await findMissingDeclaredOutputs(workspace.runDir, brief.declaredOutputs);
    if (missing.length > 0) return postconditionFailed(this.step, ownerTexts.outputsMissing(missing.map((output) => output.name)));

    const recordedAt = this.clock.now().toISOString();
    const outputs: StageOutput[] = [];
    for (const declared of brief.declaredOutputs) {
      const probe = await probeRunPath(workspace.runDir, declared.path);
      // A30: an optional output `execute` left absent has nothing to hash; the postcondition above held the rest.
      if (probe.status === 'absent' && isOptionalOutput(declared)) continue;
      outputs.push({
        name: declared.name,
        path: declared.path,
        contentHash: await sha256OfRunFile(workspace.runDir, declared.path),
        sizeBytes: probe.status === 'file' ? probe.sizeBytes : 0,
        recordedAt,
      });
    }
    workspace.active.setStageOutputs(workspace.location.stageNumber, outputs);

    const cost = await readCostFile(workspace.runDir);
    if (cost.status === 'present') workspace.active.applyCost(cost.value);
    return { kind: 'passed', detail: ownerTexts.recorded(outputs.length) };
  }
}
