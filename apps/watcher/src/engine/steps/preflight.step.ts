import { Inject, Injectable } from '@nestjs/common';
import { type StepName } from '@studio/shared/run-format';
import { CostCeilingCheck, isUsableUsd } from '../cost/cost-ceiling.check';
import { PREFLIGHT_CHECKS } from '../engine.tokens';
import { ownerTexts } from '../owner-texts';
import { licenseDoubtAsset } from '../postconditions/asset-guards';
import { resolveBoundAssets } from '../postconditions/asset-resolution';
import { type PreflightCheck } from '../seams';
import { postconditionFailed, type StepContext, type StepHandler, type StepOutcome } from './step-handler';

/**
 * Step 2: re-hash every bound asset through `AssetResolverPort` (criterion 9), warn about a
 * third-party asset without a licence, ask the executor for its estimate, check both cost ceilings
 * (criteria 20 and 28), then run the composition root's extra `PREFLIGHT_CHECKS`. The owner handles
 * licences outside the studio (decision 2026-11-25), so a missing licence is a caveat, not a stop.
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
    const licenseWarning = doubtful === undefined ? null : ownerTexts.licenseDoubtWarning(doubtful.asset.ref);

    const estimate = await workspace.executor.estimate(workspace.planningContext());
    // An invalid estimate is never recorded (run.json would refuse it); the cost check warns about it.
    if (isUsableUsd(estimate.usd)) workspace.active.setStageEstimate(workspace.location.stageNumber, estimate);

    const cost = await this.costCeiling.check(workspace, estimate);
    if (cost.status === 'failed') return { kind: 'failed', failure: cost.failure, detail: failureDetail(cost.failure) };
    workspace.markCostChecked();

    for (const check of this.checks) {
      const verdict = await check.check(workspace, signal);
      if (verdict.status === 'failed') return { kind: 'failed', failure: verdict.failure, detail: `${check.name}: ${failureDetail(verdict.failure)}` };
    }
    const usableEstimateUsd = isUsableUsd(estimate.usd) ? estimate.usd : 0;
    const verified = `${ownerTexts.assetsVerified(resolution.assets.length, usableEstimateUsd)} ${cost.detail}`;
    const detail = licenseWarning === null ? verified : `${verified} ${licenseWarning}`;
    return { kind: cost.caveat === true || licenseWarning !== null ? 'passed-with-caveat' : 'passed', detail };
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
