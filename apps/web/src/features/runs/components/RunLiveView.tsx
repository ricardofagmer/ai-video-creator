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
  useI18n,
} from '@studio/ui';
import { type RunStateResponse } from '@studio/shared/api';
import Link from 'next/link';
import { useState, type ReactElement, type ReactNode } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
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
  const texts = useWebMessages().runs.run;
  return (
    <p className="caption">
      <Link href={`/agendamentos/${encodeURIComponent(origin.scheduleId)}`} className={textLinkClassName()}>
        {origin.title === null ? texts.createdByUnknownSchedule : texts.createdBySchedule(origin.title)}
      </Link>
    </p>
  );
}

function DraftNotice({ runId, onStarted }: { runId: string; onStarted: () => void }): ReactElement {
  const t = useWebMessages();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start(): Promise<void> {
    setPending(true);
    setError(null);
    try {
      await browserRunsApi.startRun(runId);
      onStarted();
    } catch (caught) {
      setError(describeRunError(caught, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <Alert
      variant="info"
      title={t.runs.run.draftTitle}
      actions={
        <Button variant="primary" loading={pending} loadingLabel={t.runs.run.starting} onClick={() => void start()}>
          {t.runs.run.start}
        </Button>
      }
    >
      {error ?? t.runs.run.draftBody}
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
  const t = useWebMessages();
  const texts = t.runs.run;
  const { locale } = useI18n();
  const { run, displayedStatus } = live.state;
  const reachable = live.connection === 'live';
  const watcherState = runWatcherState(live.state.watcher, reachable);
  const state = run.state;

  return (
    <div className={layout.page}>
      <PageHeader
        back={
          <Link href="/execucoes" className={textLinkClassName()}>
            {texts.back}
          </Link>
        }
        title={<span className="mono">{runId}</span>}
        meta={
          <>
            <StatusBadge kind="run" status={displayedStatus} />
            {watcherState !== null && <WatcherIndicator state={watcherState} />}
          </>
        }
        description={`${run.recipe.definition.name} · ${run.recipe.ref} · ${texts.startedAt(formatDateTime(run.createdAt, locale))}`}
        actions={
          hasReview(state) ? (
            <Link href={`/execucoes/${runId}/revisao`} className={buttonClassName({ variant: 'primary' })}>
              {texts.openReview}
            </Link>
          ) : undefined
        }
      />
      {scheduleOrigin !== null && <ScheduleOriginLine origin={scheduleOrigin} />}
      <div className={styles.liveGrid}>
        <div className={styles.notice}>
          {startFailed && displayedStatus === 'draft' && (
            <Alert variant="error">{texts.startFailed}</Alert>
          )}
          {displayedStatus === 'draft' && <DraftNotice runId={runId} onStarted={live.refresh} />}
          {state.status === 'waiting' && <RunWaitingNotice run={run} state={state} onChanged={live.refresh} />}
          {state.status === 'failed' && (
            <Alert variant="error" title={texts.failedTitle}>
              <span lang={locale === 'pt-BR' ? undefined : 'pt-BR'}>{state.reason}</span>
            </Alert>
          )}
          {displayedStatus === 'interrupted' && (
            <Alert variant="warning" title={texts.interruptedTitle}>
              {texts.interruptedBody}
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
          <Card title={texts.costCard}>
            <div className={layout.stack}>
              <CostMeter
                label={texts.runCost}
                spentUsd={run.totals.costUsd}
                limitUsd={run.limits.costPerRunUsd}
                estimateUsd={run.plan?.totalEstimateUsd}
              />
              <MonthSpendMeter monthSpendUsd={live.state.monthSpendUsd} limitUsd={run.limits.costPerMonthUsd} />
            </div>
          </Card>
        </div>
        <div className={styles.timeline}>
          <Card title={texts.timelineCard}>
            <StepTimeline phases={buildTimeline(run, displayedStatus, { runs: t.runs, locale })} current={currentPosition(run, live.state.now)} />
          </Card>
        </div>
        <div className={styles.plan}>
          <RunPlanCard run={run} />
        </div>
        <div className={styles.events}>
          <Card title={texts.eventsCard}>
            <EventLog items={live.events} />
          </Card>
        </div>
      </div>
      {footer}
    </div>
  );
}
