import { type QaResult } from '@studio/ui';
import { type CheckResult, type CostSession } from '@studio/shared/run-format';
import { type WebMessages } from '@/messages';

/** `skipped` is not a pass: it shows as a warning so the owner sees it was not checked. */
export const checkOutcomeResults: Readonly<Record<CheckResult['outcome'], QaResult>> = {
  passed: 'pass',
  skipped: 'warning',
  failed: 'fail',
  error: 'fail',
};

/** "Agente ou ferramenta" column of "Custo por sessão" (design/telas/09). */
export function costSessionActor(session: CostSession, t: WebMessages['runs']['review']['cost']): string {
  if (session.kind === 'model') return `${session.role} · ${session.modelId}`;
  if (session.kind === 'tts') return t.ttsProviders[session.provider];
  if (session.kind === 'music') return t.music;
  return t.render;
}
