import { Inject, Injectable } from '@nestjs/common';
import { writeCheckResult } from '@studio/shared/run-files';
import { formatStepKey, type CheckResult, type StepName } from '@studio/shared/run-format';
import { collectCheckResults } from '../checks/stage-checks';
import { type Clock } from '../clock';
import { CLOCK } from '../engine.tokens';
import { ownerTexts, postconditions } from '../owner-texts';
import { type StageWorkspace } from '../stage-workspace';
import { buildExecutionContext } from './execution-context';
import { type StepContext, type StepHandler, type StepOutcome } from './step-handler';

const failingOutcomes: ReadonlySet<CheckResult['outcome']> = new Set<CheckResult['outcome']>(['failed', 'error']);

/**
 * Step 5: run the stage checks and decide from their outcomes; the executor's checks are evidence
 * and the engine adds its own (`outputs-present`, `output-schema`). Every result is written to
 * `checks/` and emitted as `check.result`. A failure carries the failed check ids; the failure
 * policy repeats the checks once, then calls Recovery (K3).
 */
@Injectable()
export class VerifyStep implements StepHandler {
  readonly step: StepName = 'verify';

  constructor(@Inject(CLOCK) private readonly clock: Clock) {}

  async run(context: StepContext): Promise<StepOutcome> {
    const { workspace } = context;
    const executionContext = await buildExecutionContext(context);
    const executorResults = await workspace.executor.verify(executionContext);
    const results = await collectCheckResults({
      runDir: workspace.runDir,
      brief: executionContext.stageBrief,
      attempt: context.attempt,
      clock: this.clock,
      executorResults,
    });
    await this.record(workspace, results);

    const failed = results.filter((result) => failingOutcomes.has(result.outcome)).map((result) => result.checkId);
    if (failed.length > 0) {
      // The failed check ids travel with the failure so the policy recognises a never-retried check.
      const detail = ownerTexts.checksFailed(failed);
      return { kind: 'failed', failure: { origin: 'checks', postcondition: postconditions[this.step], failedChecks: failed, detail }, detail };
    }
    const skipped = results.filter((result) => result.outcome === 'skipped').map((result) => result.checkId);
    if (skipped.length > 0) return { kind: 'passed-with-caveat', detail: ownerTexts.checksSkipped(skipped) };
    return { kind: 'passed', detail: ownerTexts.checksPassed(results.length) };
  }

  private async record(workspace: StageWorkspace, results: readonly CheckResult[]): Promise<void> {
    for (const result of results) {
      await writeCheckResult(workspace.runDir, result);
      await workspace.active.emit({
        type: 'check.result',
        level: failingOutcomes.has(result.outcome) ? 'error' : 'ok',
        text: `${result.checkId}: ${result.outcome}`,
        stepKey: formatStepKey({ stageId: result.stageId, step: this.step, attempt: result.attempt }),
        checkId: result.checkId,
        outcome: result.outcome,
      });
    }
    workspace.active.addChecksRun(results.length);
  }
}
