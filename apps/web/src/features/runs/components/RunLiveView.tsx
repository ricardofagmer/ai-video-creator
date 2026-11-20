'use client';

import {
  Alert,
  Button,
  Card,
  CostMeter,
  EventLog,
  PageHeader,
  StatusBadge,
  StepTimeline,
  WatcherIndicator,
  buttonClassName,
  textLinkClassName,
} from '@studio/ui';
import { type RunStateResponse } from '@studio/shared/api';
import Link from 'next/link';
import { useState, type ReactElement, type ReactNode } from 'react';
import layout from '@/features/common/layout.module.css';
import { useRunLive } from '../hooks/useRunLive';
import { describeRunError } from '../run-error-text';
import { formatDateTime, hasReview, runWatcherState } from '../run-labels';
import { buildTimeline, currentPosition } from '../run-timeline';
import { browserRunsApi } from '../runs-api';
import styles from '../runs.module.css';
import { MonthSpendMeter } from './MonthSpendMeter';
import { RunNowCard } from './RunNowCard';
import { RunPlanCard } from './RunPlanCard';
import { RunWaitingNotice } from './RunWaitingNotice';

interface RunLiveViewProps {
  runId: string;
  initialState: RunStateResponse;
  /** The new-run form created the draft but `start` failed (`?aviso=inicio-falhou`). */
  startFailed: boolean;
  /**
   * SPEC 0006 section 5.7: the schedule that created this run (`run.json.schedule`), with its title
   * when the api could read it; null for a run created by the api or CLI.
   */
  scheduleOrigin: ScheduleOrigin | null;
  /** Server-rendered cards below the live grid (the "Publicações" card of an approved run). */
  footer?: ReactNode;
}

export interface ScheduleOrigin {
  scheduleId: string;
  title: string | null;
}

/** "Criada pelo agendamento {título}", linked to the schedule page. */
function ScheduleOriginLine({ origin }: { origin: ScheduleOrigin }): ReactElement {
  return (
    <p className="caption">
      <Link href={`/agendamentos/${encodeURIComponent(origin.scheduleId)}`} className={textLinkClassName()}>
        {origin.title === null ? 'Criada por um agendamento' : `Criada pelo agendamento ${origin.title}`}
      </Link>
    </p>
  );
}

function DraftNotice({ runId, onStarted }: { runId: string; onStarted: () => void }): ReactElement {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await browserRunsApi.startRun(runId);
      onStarted();
    } catch (caught) {
      setError(describeRunError(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <Alert
      variant="info"
      title="Esta execução ainda é um rascunho."
      actions={
        <Button variant="primary" loading={pending} loadingLabel="Iniciando…" onClick={() => void start()}>
          Iniciar execução
        </Button>
      }
    >
      {error ?? 'Nenhuma etapa roda antes de você iniciar a execução.'}
    </Alert>
  );
}

/**
 * `/execucoes/[runId]` (design/telas/08): header, the "Aguardando você" notice, Agora with the run
 * controls, cost (the run and, from rev 4, the month), the seven-step timeline, the resolved plan
 * and the event log, kept live by `useRunLive` (1 s polling, events read from `fromByte`). SPEC
 * 0006 adds the schedule a run came from and, below, the slot for the "Publicações" card.
 */
export function RunLiveView({ runId, initialState, startFailed, scheduleOrigin, footer }: RunLiveViewProps): ReactElement {
  const live = useRunLive(runId, initialState);
  const { run, displayedStatus } = live.state;
  const reachable = live.connection === 'live';
  const watcherState = runWatcherState(live.state.watcher, reachable);
  const state = run.state;

  return (
    <div className={layout.page}>
      <PageHeader
        back={
          <Link href="/execucoes" className={textLinkClassName()}>
            ← Execuções
          </Link>
        }
        title={<span className="mono">{runId}</span>}
        meta={
          <>
            <StatusBadge kind="run" status={displayedStatus} />
            {watcherState !== null && <WatcherIndicator state={watcherState} />}
          </>
        }
        description={`${run.recipe.definition.name} · ${run.recipe.ref} · iniciada ${formatDateTime(run.createdAt)}`}
        actions={
          hasReview(state) ? (
            <Link href={`/execucoes/${runId}/revisao`} className={buttonClassName({ variant: 'primary' })}>
              Abrir revisão
            </Link>
          ) : undefined
        }
      />
      {scheduleOrigin !== null && <ScheduleOriginLine origin={scheduleOrigin} />}
      <div className={styles.liveGrid}>
        <div className={styles.notice}>
          {startFailed && displayedStatus === 'draft' && (
            <Alert variant="error">A execução foi criada, mas não foi iniciada. Tente iniciar de novo.</Alert>
          )}
          {displayedStatus === 'draft' && <DraftNotice runId={runId} onStarted={live.refresh} />}
          {state.status === 'waiting' && <RunWaitingNotice run={run} state={state} onChanged={live.refresh} />}
          {state.status === 'failed' && (
            <Alert variant="error" title="A execução falhou">
              {state.reason}
            </Alert>
          )}
          {displayedStatus === 'interrupted' && (
            <Alert variant="warning" title="A execução foi interrompida">
              O watcher parou no meio de um passo. Ele retoma deste passo quando voltar; você também pode retomar agora.
            </Alert>
          )}
        </div>
        <div className={styles.now}>
          <RunNowCard
            state={live.state}
            freshness={live.polling ? { lastUpdatedAtMs: live.lastUpdatedAtMs, checkedAtMs: live.checkedAtMs } : null}
            onChanged={live.refresh}
          />
        </div>
        <div className={styles.cost}>
          <Card title="Custo">
            <div className={layout.stack}>
              <CostMeter
                label="Custo da execução"
                spentUsd={run.totals.costUsd}
                limitUsd={run.limits.costPerRunUsd}
                estimateUsd={run.plan?.totalEstimateUsd}
              />
              <MonthSpendMeter monthSpendUsd={live.state.monthSpendUsd} limitUsd={run.limits.costPerMonthUsd} />
            </div>
          </Card>
        </div>
        <div className={styles.timeline}>
          <Card title="Linha do tempo">
            <StepTimeline phases={buildTimeline(run, displayedStatus)} current={currentPosition(run, live.state.now)} />
          </Card>
        </div>
        <div className={styles.plan}>
          <RunPlanCard run={run} />
        </div>
        <div className={styles.events}>
          <Card title="Eventos">
            <EventLog items={live.events} />
          </Card>
        </div>
      </div>
      {footer}
    </div>
  );
}
