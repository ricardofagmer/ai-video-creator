import { BlockedError, type PipelineStage, type ProviderUsage, type RunFile } from '@studio/shared/ace';

export function totalCostUsd(run: RunFile): number {
  return run.costs.reduce((sum, row) => sum + row.usdEstimate, 0);
}

/** Refuses work whose estimate would push the run past MAX_COST_PER_VIDEO_USD. */
export function assertWithinBudget(run: RunFile, budget: { additionalUsd: number; maxUsd: number }): void {
  const projected = totalCostUsd(run) + budget.additionalUsd;
  if (projected > budget.maxUsd) {
    throw new BlockedError(
      `Estimated run cost ${projected.toFixed(4)} USD would exceed MAX_COST_PER_VIDEO_USD=${budget.maxUsd}`,
      'COST_LIMIT',
    );
  }
}

export function appendUsage(run: RunFile, stage: PipelineStage, usage: readonly ProviderUsage[]): RunFile {
  const rows = usage.map((item) => ({
    stage,
    provider: item.provider,
    unit: item.unit,
    quantity: item.quantity,
    usdEstimate: item.usdEstimate,
    ...(item.requestId ? { requestId: item.requestId } : {}),
  }));
  return { ...run, costs: [...run.costs, ...rows] };
}
