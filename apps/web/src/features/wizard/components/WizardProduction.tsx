'use client';

import { type RunStateResponse } from '@studio/shared/api';
import { Alert, Button, Card, CostMeter, EventLog, StepTimeline, buttonClassName, useI18n } from '@studio/ui';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { MonthSpendMeter } from '@/features/runs/components/MonthSpendMeter';
import { RunNowCard } from '@/features/runs/components/RunNowCard';
import { RunPlanCard } from '@/features/runs/components/RunPlanCard';
import { RunWaitingNotice } from '@/features/runs/components/RunWaitingNotice';
import { useRunLive } from '@/features/runs/hooks/useRunLive';
import { describeRunError } from '@/features/runs/run-error-text';
import { hasReview } from '@/features/runs/run-labels';
import { buildTimeline, currentPosition } from '@/features/runs/run-timeline';
import { browserRunsApi } from '@/features/runs/runs-api';
import runStyles from '@/features/runs/runs.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import styles from '../wizard.module.css';

interface WizardProductionProps {
  runId: string;
  initialState: RunStateResponse;
  /** `aviso=inicio-falhou`: the run was created but "Iniciar" could not start it. */
  startFailed: boolean;
}

/**
 * Step 5 "Produção": the run page's live pieces without its page header (the wizard keeps its
 * own title and step list). When the final video reaches review, the server page is read again
 * and shows step 6.
 */
export function WizardProduction({ runId, initialState, startFailed }: WizardProductionProps): ReactElement {
  const live = useRunLive(runId, initialState);
  const router = useRouter();
  const t = useWebMessages();
  const texts = t.runs.run;
  const { locale } = useI18n();
  const { run, displayedStatus } = live.state;
  const state = run.state;
  const reviewReady = hasReview(state);

  useEffect(() => {
    if (reviewReady) router.refresh();
  }, [reviewReady, router]);

  return (
    <div className={layout.stack}>
      <div className={runStyles.liveGrid}>
        <div className={runStyles.notice}>
          {startFailed && displayedStatus === 'draft' && <Alert variant="error">{t.wizard.production.startFailed}</Alert>}
          {displayedStatus === 'draft' && <StartRunNotice runId={runId} onStarted={live.refresh} />}
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
        <div className={runStyles.now}>
          <RunNowCard
            state={live.state}
            freshness={live.polling ? { lastUpdatedAtMs: live.lastUpdatedAtMs, checkedAtMs: live.checkedAtMs } : null}
            onChanged={live.refresh}
          />
        </div>
        <div className={runStyles.cost}>
          <Card title={texts.costCard}>
            <div className={layout.stack}>
              <CostMeter label={texts.runCost} spentUsd={run.totals.costUsd} limitUsd={run.limits.costPerRunUsd} estimateUsd={run.plan?.totalEstimateUsd} />
              <MonthSpendMeter monthSpendUsd={live.state.monthSpendUsd} limitUsd={run.limits.costPerMonthUsd} />
            </div>
          </Card>
        </div>
        <div className={runStyles.timeline}>
          <Card title={texts.timelineCard}>
            <StepTimeline phases={buildTimeline(run, displayedStatus, { runs: t.runs, locale })} current={currentPosition(run, live.state.now)} />
          </Card>
        </div>
        <div className={runStyles.plan}>
          <RunPlanCard run={run} />
        </div>
        <div className={runStyles.events}>
          <Card title={texts.eventsCard}>
            <EventLog items={live.events} />
          </Card>
        </div>
      </div>
      <div className={styles.footer}>
        <Link href={`/execucoes/${encodeURIComponent(runId)}`} className={buttonClassName({ variant: 'secondary' })}>
          {t.wizard.production.openRun}
        </Link>
        <span className={styles.footerEnd}>
          <Link href="/criar" className={buttonClassName({ variant: 'secondary' })}>
            {t.wizard.production.createAnother}
          </Link>
        </span>
      </div>
    </div>
  );
}

/** The run page's draft notice is private to it; this one starts the run the same way. */
function StartRunNotice({ runId, onStarted }: { runId: string; onStarted: () => void }): ReactElement {
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
        <Button loading={pending} loadingLabel={t.wizard.production.starting} onClick={() => void start()}>
          {t.wizard.production.start}
        </Button>
      }
    >
      {error ?? t.runs.run.draftBody}
    </Alert>
  );
}
