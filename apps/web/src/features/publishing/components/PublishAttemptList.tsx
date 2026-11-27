'use client';

import { Alert, Badge, Button, useI18n } from '@studio/ui';
import { type PublishAttemptView } from '@studio/shared/api';
import { useState, type ReactElement } from 'react';
import { describePlatformApiError } from '@/features/common/platform-error-text';
import { useWebMessages } from '@/lib/i18n/client';
import { platformLabels } from '@/features/metrics/metric-labels';
import { formatInstant } from '../publish-labels';
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
  const t = useWebMessages();
  const texts = t.publishing;
  const { locale } = useI18n();
  const [state, setState] = useState<CancelState>({ status: 'idle' });

  async function cancel(attempt: PublishAttemptView): Promise<void> {
    if (state.status === 'cancelling') return;
    setState({ status: 'cancelling', attemptId: attempt.attemptId });
    try {
      onAttempt(await browserPublishingApi.cancelAttempt(runId, attempt.attemptId));
      setState({ status: 'idle' });
    } catch (error) {
      setState({ status: 'failed', message: describePlatformApiError(error, { platform: attempt.platform, mode: attempt.mode }, t) });
    }
  }

  if (attempts.length === 0) return null;
  return (
    <div className={styles.attempts}>
      <h3 className="label">{texts.attempts.title}</h3>
      {state.status === 'failed' && <Alert variant="error">{state.message}</Alert>}
      <ul className={styles.attemptList}>
        {attempts.map((attempt) => (
          <li key={attempt.attemptId} className={styles.attemptLine}>
            <span className="label">{platformLabels[attempt.platform]}</span>
            <PublishStateBadge attempt={attempt} />
            {attempt.mode === 'mock' && <Badge tone="info">{t.platforms.mockBadge}</Badge>}
            <span className="caption">{texts.attempts.requestedAt(formatInstant(attempt.requestedAt, locale))}</span>
            {attempt.state === 'queued' && <span className="caption">{texts.queuedBetweenRuns}</span>}
            {attempt.state === 'queued' && (
              <Button
                variant="ghost"
                size="sm"
                loading={state.status === 'cancelling' && state.attemptId === attempt.attemptId}
                loadingLabel={texts.attempts.cancelling}
                disabled={state.status === 'cancelling'}
                onClick={() => void cancel(attempt)}
              >
                {texts.attempts.cancel}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
