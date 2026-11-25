import { parseStepKey, type CostFile, type CostSession, type StageId, type StepName, type Totals } from '@studio/shared/run-format';

type CostTotals = Pick<Totals, 'costUsd' | 'costByProvider' | 'sessions'>;

function providerFamily(session: CostSession): keyof Totals['costByProvider'] {
  if (session.kind === 'model') return 'claude';
  if (session.kind === 'music') return 'music';
  return session.kind === 'tts' ? 'tts' : 'render';
}

/** Run totals derived from cost.json, the only cost record the watcher writes (SPEC 0002 rev 2, R1-11). */
export function costTotals(cost: CostFile): CostTotals {
  const costByProvider = { claude: 0, tts: 0, render: 0, music: 0 };
  for (const session of cost.sessions) costByProvider[providerFamily(session)] += session.usd;
  const sessionIds = new Set(cost.sessions.map((session) => session.sessionId));
  return { costUsd: cost.totalUsd, costByProvider, sessions: sessionIds.size };
}

/** USD billed under one step of one stage, summed over every attempt of that step. */
export function stepCostUsd(cost: CostFile, stageId: StageId, step: StepName): number {
  return cost.sessions
    .filter((session) => {
      const coordinates = parseStepKey(session.stepKey);
      return coordinates.stageId === stageId && coordinates.step === step;
    })
    .reduce((total, session) => total + session.usd, 0);
}
