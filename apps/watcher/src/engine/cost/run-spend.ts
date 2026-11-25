import { readCostFile } from '@studio/shared/run-files';

/** USD billed so far by this run: the live cost.json total, the only cost the watcher writes (SPEC 0002 rev 2). */
export async function liveRunSpendUsd(runDir: string): Promise<number> {
  const cost = await readCostFile(runDir);
  return cost.status === 'present' ? cost.value.totalUsd : 0;
}
