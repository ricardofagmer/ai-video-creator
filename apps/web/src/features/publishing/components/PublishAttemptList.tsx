'use client';

import { Alert, Badge, Button } from '@studio/ui';
import { type PublishAttemptView } from '@studio/shared/api';
import { useState, type ReactElement } from 'react';
import { describePlatformApiError } from '@/features/common/platform-error-text';
import { platformLabels } from '@/features/metrics/metric-labels';
import { MOCK_BADGE_TEXT } from '@/features/platforms/platform-labels';
import { QUEUED_WATCHER_BUSY_TEXT, formatInstant } from '../publish-labels';
import { browserPublishingApi } from '../publishing-api';
import styles from '../publishing.module.css';
import { PublishStateBadge } from './PublishAttemptStatus';

interface PublishAttemptListProps {
  runId: string;
  attempts: readonly PublishAttemptView[];
  onAttempt: (attempt: PublishAttemptView) => void;
}

type CancelState = { status: 'idle' } | { status: 'cancelling'; attemptId: string } | { status: 'failed'; message: string };

/**
 * The newest attempts of the run, newest first (SPEC 0007 section 5.4). An attempt still `queued`
 * can be cancelled; once the watcher claimed it the api answers `publish-attempt-not-cancellable`.
 * Attempts carry no title, caption or tag, so none is shown. A `queued` attempt says the watcher
 * is busy (section 5.5): it claims publish requests first whenever it is idle, so an attempt still
 * queued is waiting for a run to end; the api exposes no per-run busy flag to check this against.
 */
export function PublishAttemptList({ runId, attempts, onAttempt }: PublishAttemptListProps): ReactElement | null {
  const [state, setState] = useState<CancelState>({ status: 'idle' });

  async function cancel(attempt: PublishAttemptView): Promise<void> {
    if (state.status === 'cancelling') return;
    setState({ status: 'cancelling', attemptId: attempt.attemptId });
    try {
      onAttempt(await browserPublishingApi.cancelAttempt(runId, attempt.attemptId));
      setState({ status: 'idle' });
    } catch (error) {
      setState({ status: 'failed', message: describePlatformApiError(error, { platform: attempt.platform, mode: attempt.mode }) });
    }
  }

  if (attempts.length === 0) return null;
  return (
    <div className={styles.attempts}>
      <h3 className="label">Envios</h3>
      {state.status === 'failed' && <Alert variant="error">{state.message}</Alert>}
      <ul className={styles.attemptList}>
        {attempts.map((attempt) => (
          <li key={attempt.attemptId} className={styles.attemptLine}>
            <span className="label">{platformLabels[attempt.platform]}</span>
            <PublishStateBadge attempt={attempt} />
            {attempt.mode === 'mock' && <Badge tone="info">{MOCK_BADGE_TEXT}</Badge>}
            <span className="caption">{`pedido em ${formatInstant(attempt.requestedAt)}`}</span>
            {attempt.state === 'queued' && <span className="caption">{QUEUED_WATCHER_BUSY_TEXT}</span>}
            {attempt.state === 'queued' && (
              <Button
                variant="ghost"
                size="sm"
                loading={state.status === 'cancelling' && state.attemptId === attempt.attemptId}
                loadingLabel="Cancelando…"
                disabled={state.status === 'cancelling'}
                onClick={() => void cancel(attempt)}
              >
                Cancelar envio
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
