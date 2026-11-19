import { readCostFile } from '@studio/shared/run-files';
import { type WaitingCause } from '@studio/shared/run-format';
import { ownerTexts } from '../owner-texts';

/** USD billed so far by this run: the live cost.json total, the only cost the watcher writes (SPEC 0002 rev 2). */
export async function liveRunSpendUsd(runDir: string): Promise<number> {
  const cost = await readCostFile(runDir);
  return cost.status === 'present' ? cost.value.totalUsd : 0;
}

export interface CostCeilingWait {
  cause: Extract<WaitingCause, { kind: 'cost-ceiling' }>;
  reason: string;
  whatToDo: string;
}

/** Spend already past the run ceiling, found between steps or while a step runs (topology section 7). */
export function runSpentWait(spentUsd: number, limitUsd: number): CostCeilingWait {
  return {
    cause: { kind: 'cost-ceiling', ceiling: 'run', estimateUsd: spentUsd, limitUsd },
    reason: ownerTexts.costSpentReason(spentUsd, limitUsd),
    whatToDo: ownerTexts.costRunWhatToDo,
  };
}

export function runEstimateWait(estimateUsd: number, limitUsd: number): CostCeilingWait {
  return {
    cause: { kind: 'cost-ceiling', ceiling: 'run', estimateUsd, limitUsd },
    reason: ownerTexts.costRunReason(estimateUsd, limitUsd),
    whatToDo: ownerTexts.costRunWhatToDo,
  };
}

export function monthEstimateWait(totalUsd: number, limitUsd: number): CostCeilingWait {
  return {
    cause: { kind: 'cost-ceiling', ceiling: 'month', estimateUsd: totalUsd, limitUsd },
    reason: ownerTexts.costMonthReason(totalUsd, limitUsd),
    whatToDo: ownerTexts.costMonthWhatToDo,
  };
}
