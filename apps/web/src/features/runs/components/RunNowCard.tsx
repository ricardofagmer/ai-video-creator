'use client';

import { Alert, NowPanel, RunControls, useI18n, type RunAction } from '@studio/ui';
import { type RunStateResponse } from '@studio/shared/api';
import { useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { describeRunError } from '../run-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { availableRunActions } from '../run-labels';
import { browserRunsApi } from '../runs-api';
import { RunManageActions } from './RunManageActions';

/** design/telas/08: above 5 s without fresh data the update line turns to warning. */
const STALE_AFTER_MS = 5000;

interface RunNowCardProps {
  state: RunStateResponse;
  /** Null when the page is not polling (terminal status or hidden tab). */
  freshness: { lastUpdatedAtMs: number; checkedAtMs: number } | null;
  onChanged: () => void;
  /** Where "Excluir" leads once the run is gone. */
  deletedHref: string;
}

/** The latest activity line of now.json (redacted engine text, rendered as React text). */
function latestActivity(state: RunStateResponse, buildingPlan: string): string | undefined {
  const { now, run } = state;
  if (now === null) return undefined;
  if (now.stageId === 'plan' && now.step === 'execute' && run.plan === null) return buildingPlan;
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
function useStepMessage(state: RunStateResponse, buildingPlan: string): string | undefined {
  const key = positionKey(state);
  const candidate = latestActivity(state, buildingPlan);
  const [held, setHeld] = useState<{ key: string; message: string | undefined }>({ key, message: candidate });
  if (held.key !== key || (held.message === undefined && candidate !== undefined)) {
    setHeld({ key, message: candidate });
    return candidate;
  }
  return held.message;
}

function updatedLabel(freshness: RunNowCardProps['freshness'], t: WebMessages['runs']['now']): { text: string; stale: boolean } | null {
  if (freshness === null) return null;
  const ageMs = freshness.checkedAtMs - freshness.lastUpdatedAtMs;
  const seconds = Math.max(1, Math.ceil(ageMs / 1000));
  return ageMs > STALE_AFTER_MS ? { text: t.stale(seconds), stale: true } : { text: t.updated(seconds), stale: false };
}

/** "Agora" (design/telas/08): position, live message, freshness and RunControls through C10. */
export function RunNowCard({ state, freshness, onChanged, deletedHref }: RunNowCardProps): ReactElement {
  const { run, now, displayedStatus } = state;
  const t = useWebMessages();
  const { ui, locale } = useI18n();
  const nowTexts = t.runs.now;
  const stepMessage = useStepMessage(state, nowTexts.buildingPlan);
  const stageLabels = t.runs.stages;
  const stepLabels = t.runs.steps;
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
      setError(describeRunError(caught, t));
    } finally {
      setPendingAction(undefined);
    }
  }

  const position = now ?? run.cursor;
  let stageLabel = position === null ? undefined : stageLabels[position.stageId];
  let stepLabel = position === null ? undefined : stepLabels[position.step];
  let message = stepMessage;
  if (displayedStatus === 'paused' && position !== null) {
    message = nowTexts.pausedAt(stageLabels[position.stageId], stepLabels[position.step]);
  } else if (position === null || (now === null && displayedStatus === 'pending')) {
    stageLabel = undefined;
    stepLabel = undefined;
    message = nowTexts.waitingForWatcher;
  }

  const freshnessLabel = updatedLabel(freshness, nowTexts);
  const actions = availableRunActions(displayedStatus);
  const hasActions = actions.pause || actions.resume || actions.stop;
  const showPauseNotice = pauseRequested && (displayedStatus === 'pending' || displayedStatus === 'running');

  return (
    <div className={layout.stack}>
      <NowPanel
        title={ui.runs.nowTitle}
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
      <RunManageActions run={run} status={displayedStatus} onChanged={onChanged} deletedHref={deletedHref} />
      {showPauseNotice &&<Alert variant="info">{nowTexts.pauseRequested}</Alert>}
      {now !== null && now.notice !== null && (
        <Alert variant="info">
          <span lang={locale === 'pt-BR' ? undefined : 'pt-BR'}>{now.notice}</span>
        </Alert>
      )}
      {error !== null && <Alert variant="error">{error}</Alert>}
    </div>
  );
}
