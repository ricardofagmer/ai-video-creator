'use client';

import { Alert, NowPanel, RunControls, type RunAction } from '@studio/ui';
import { type RunStateResponse } from '@studio/shared/api';
import { useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { stageLabels } from '@/features/recipes/recipe-labels';
import { describeRunError } from '../run-error-text';
import { availableRunActions, stepLabels } from '../run-labels';
import { browserRunsApi } from '../runs-api';

/** design/telas/08: above 5 s without fresh data the update line turns to warning. */
const STALE_AFTER_MS = 5000;

interface RunNowCardProps {
  state: RunStateResponse;
  /** Null when the page is not polling (terminal status or hidden tab). */
  freshness: { lastUpdatedAtMs: number; checkedAtMs: number } | null;
  onChanged: () => void;
}

/** The latest activity line of now.json (redacted engine text, rendered as React text). */
function latestActivity(state: RunStateResponse): string | undefined {
  const { now, run } = state;
  if (now === null) return undefined;
  if (now.stageId === 'plan' && now.step === 'execute' && run.plan === null) return 'Montando o plano da execução';
  return now.activities.at(-1)?.text;
}

function positionKey(state: RunStateResponse): string {
  const { now, displayedStatus } = state;
  return now === null ? displayedStatus : `${displayedStatus}|${now.stageNumber}|${now.step}|${now.attempt}`;
}

/**
 * The live message changes only when the step changes, so the polite live region does not repeat
 * an announcement every second (design/telas/08, Acessibilidade). A step that had no message yet
 * takes its first one. Adjusting state during render is React's documented pattern for this.
 */
function useStepMessage(state: RunStateResponse): string | undefined {
  const key = positionKey(state);
  const candidate = latestActivity(state);
  const [held, setHeld] = useState<{ key: string; message: string | undefined }>({ key, message: candidate });
  if (held.key !== key || (held.message === undefined && candidate !== undefined)) {
    setHeld({ key, message: candidate });
    return candidate;
  }
  return held.message;
}

function updatedLabel(freshness: RunNowCardProps['freshness']): { text: string; stale: boolean } | null {
  if (freshness === null) return null;
  const ageMs = freshness.checkedAtMs - freshness.lastUpdatedAtMs;
  const seconds = Math.max(1, Math.ceil(ageMs / 1000));
  return ageMs > STALE_AFTER_MS ? { text: `sem atualização há ${seconds} s`, stale: true } : { text: `atualizado há ${seconds} s`, stale: false };
}

/** "Agora" (design/telas/08): position, live message, freshness and RunControls through C10. */
export function RunNowCard({ state, freshness, onChanged }: RunNowCardProps): ReactElement {
  const { run, now, displayedStatus } = state;
  const stepMessage = useStepMessage(state);
  const [pendingAction, setPendingAction] = useState<RunAction | undefined>(undefined);
  const [pauseRequested, setPauseRequested] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function act(action: RunAction): Promise<void> {
    setPendingAction(action);
    setError(null);
    try {
      await browserRunsApi.requestControl(run.runId, { kind: action });
      setPauseRequested(action === 'pause');
      onChanged();
    } catch (caught) {
      setError(describeRunError(caught));
    } finally {
      setPendingAction(undefined);
    }
  }

  const position = now ?? run.cursor;
  let stageLabel = position === null ? undefined : stageLabels[position.stageId];
  let stepLabel = position === null ? undefined : stepLabels[position.step];
  let message = stepMessage;
  if (displayedStatus === 'paused' && position !== null) {
    message = `Pausada em ${stageLabels[position.stageId]} · ${stepLabels[position.step]}`;
  } else if (position === null || (now === null && displayedStatus === 'pending')) {
    stageLabel = undefined;
    stepLabel = undefined;
    message = 'Esperando o watcher iniciar a execução';
  }

  const freshnessLabel = updatedLabel(freshness);
  const actions = availableRunActions(displayedStatus);
  const hasActions = actions.pause || actions.resume || actions.stop;
  const showPauseNotice = pauseRequested && (displayedStatus === 'pending' || displayedStatus === 'running');

  return (
    <div className={layout.stack}>
      <NowPanel
        runStatus={displayedStatus}
        stageLabel={stageLabel}
        stepLabel={stepLabel}
        message={message}
        updatedLabel={freshnessLabel?.text}
        stale={freshnessLabel?.stale ?? false}
        actions={
          hasActions ? <RunControls available={actions} pendingAction={pendingAction} onAction={(action) => void act(action)} /> : undefined
        }
      />
      {showPauseNotice && <Alert variant="info">Pausa pedida. A execução para depois do passo atual.</Alert>}
      {now !== null && now.notice !== null && <Alert variant="info">{now.notice}</Alert>}
      {error !== null && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
