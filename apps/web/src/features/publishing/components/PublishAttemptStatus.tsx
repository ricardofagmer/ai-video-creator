import { Alert, Badge, formatBytes, type BadgeTone } from '@studio/ui';
import { type PublishAttemptView } from '@studio/shared/api';
import { isOpenPublishState, type PublishState } from '@studio/shared/platforms';
import type { ReactElement } from 'react';
import { platformLabels } from '@/features/metrics/metric-labels';
import { MOCK_BADGE_TEXT } from '@/features/platforms/platform-labels';
import { NO_RESEND_TEXT, QUEUED_BETWEEN_RUNS_TEXT, formatInstant, outcomeUnknownText, publishFailureTexts, publishStateLabels } from '../publish-labels';
import styles from '../publishing.module.css';

const stateTones: Readonly<Record<PublishState, BadgeTone>> = {
  queued: 'active',
  uploading: 'active',
  processing: 'active',
  'sent-to-inbox': 'success',
  published: 'success',
  failed: 'danger',
  cancelled: 'neutral',
  expired: 'neutral',
  'outcome-unknown': 'warning',
  'inbox-unconfirmed': 'warning',
};

/** The state badge of one attempt; the dot pulses while it is open. */
export function PublishStateBadge({ attempt }: { attempt: PublishAttemptView }): ReactElement {
  return (
    <Badge tone={stateTones[attempt.state]} dot={isOpenPublishState(attempt.state) ? 'live' : true}>
      {publishStateLabels[attempt.state]}
    </Badge>
  );
}

function progressText(attempt: PublishAttemptView): string | null {
  if (attempt.state !== 'uploading' || attempt.bytesTotal === 0) return null;
  return `${formatBytes(attempt.bytesSent)} de ${formatBytes(attempt.bytesTotal)}`;
}

/**
 * The newest attempt of one platform in its tab (SPEC 0007 section 5.4): its state, the queued
 * sentence of section 5.5, the bytes sent while uploading, and for a terminal failure its reason with "Nada será reenviado sem um novo
 * clique." An `outcome-unknown` attempt says to check the platform before trying again.
 */
export function PublishAttemptStatus({ attempt }: { attempt: PublishAttemptView }): ReactElement {
  const progress = progressText(attempt);
  return (
    <div className={styles.attemptStatus} aria-live="polite">
      <p className={styles.attemptLine}>
        <span className="label">{`Envio para ${platformLabels[attempt.platform]}`}</span>
        <PublishStateBadge attempt={attempt} />
        {attempt.mode === 'mock' && <Badge tone="info">{MOCK_BADGE_TEXT}</Badge>}
        <span className="caption">{`desde ${formatInstant(attempt.since)}`}</span>
        {progress !== null && <span className="caption">{progress}</span>}
      </p>
      {attempt.state === 'queued' && <p className="caption">{QUEUED_BETWEEN_RUNS_TEXT}</p>}
      {attempt.state === 'failed' && (
        <Alert variant="error">{`${attempt.reasonId === null ? '' : `${publishFailureTexts[attempt.reasonId]} `}${NO_RESEND_TEXT}`}</Alert>
      )}
      {attempt.state === 'outcome-unknown' && <Alert variant="warning">{outcomeUnknownText(attempt.platform)}</Alert>}
    </div>
  );
}
