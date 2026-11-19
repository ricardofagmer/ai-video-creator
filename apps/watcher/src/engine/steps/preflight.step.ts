import { Inject, Injectable } from '@nestjs/common';
import { type StepName } from '@studio/shared/run-format';
import { CostCeilingCheck } from '../cost/cost-ceiling.check';
import { PREFLIGHT_CHECKS } from '../engine.tokens';
import { ownerTexts } from '../owner-texts';
import { licenseDoubtAsset } from '../postconditions/asset-guards';
import { resolveBoundAssets } from '../postconditions/asset-resolution';
import { type PreflightCheck } from '../seams';
import { postconditionFailed, type StepContext, type StepHandler, type StepOutcome } from './step-handler';

/**
 * Step 2: re-hash every bound asset through `AssetResolverPort` (criterion 9), refuse a third-party
 * asset without a licence, ask the executor for its estimate, check both cost ceilings (criteria 20
 * and 28), then run the composition root's extra `PREFLIGHT_CHECKS`. The licence and cost guards
 * are built in, so no `PREFLIGHT_CHECKS` binding can remove them.
 */
@Injectable()
export class PreflightStep implements StepHandler {
  readonly step: StepName = 'preflight';

  constructor(
    @Inject(CostCeilingCheck) private readonly costCeiling: CostCeilingCheck,
    @Inject(PREFLIGHT_CHECKS) private readonly checks: readonly PreflightCheck[],
  ) {}

  async run({ workspace, signal }: StepContext): Promise<StepOutcome> {
    const resolution = await resolveBoundAssets(workspace.resolver, workspace.active.snapshot, signal);
    if (resolution.problems.length > 0) return postconditionFailed(this.step, resolution.problems.join(' '));
    workspace.rememberBoundAssets(resolution.assets);

    const doubtful = licenseDoubtAsset(resolution.assets);
    if (doubtful !== undefined) {
      const ref = doubtful.asset.ref;
      const reason = ownerTexts.licenseDoubtReason(ref);
      return {
        kind: 'failed',
        failure: { origin: 'guard', cause: { kind: 'license-doubt', ref }, reason, whatToDo: ownerTexts.licenseDoubtWhatToDo(ref) },
        detail: reason,
      };
    }

    const estimate = await workspace.executor.estimate(workspace.planningContext());
    workspace.active.setStageEstimate(workspace.location.stageNumber, estimate);

    const cost = await this.costCeiling.check(workspace, estimate);
    if (cost.status === 'failed') return { kind: 'failed', failure: cost.failure, detail: failureDetail(cost.failure) };

    for (const check of this.checks) {
      const verdict = await check.check(workspace, signal);
      if (verdict.status === 'failed') return { kind: 'failed', failure: verdict.failure, detail: `${check.name}: ${failureDetail(verdict.failure)}` };
    }
    return { kind: 'passed', detail: `${ownerTexts.assetsVerified(resolution.assets.length, estimate.usd)} ${cost.detail}` };
  }
}

function failureDetail(failure: Extract<StepOutcome, { kind: 'failed' }>['failure']): string {
  switch (failure.origin) {
    case 'guard':
      return failure.reason;
    case 'executor':
      return failure.failure.message;
    case 'postcondition':
    case 'checks':
      return failure.detail;
  }
}
