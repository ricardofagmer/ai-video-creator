'use client';

import { Alert, Badge, formatBytes, useI18n, type BadgeTone, type Locale } from '@studio/ui';
import { type PublishAttemptView } from '@studio/shared/api';
import { isOpenPublishState, type PublishState } from '@studio/shared/platforms';
import type { ReactElement } from 'react';
import { platformLabels } from '@/features/metrics/metric-labels';
import { useWebMessages } from '@/lib/i18n/client';
import { type WebMessages } from '@/messages';
import { formatInstant } from '../publish-labels';
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
  const t = useWebMessages().publishing;
  return (
    <Badge tone={stateTones[attempt.state]} dot={isOpenPublishState(attempt.state) ? 'live' : true}>
      {t.states[attempt.state]}
    </Badge>
  );
}

function progressText(attempt: PublishAttemptView, t: WebMessages['publishing'], locale: Locale): string | null {
  if (attempt.state !== 'uploading' || attempt.bytesTotal === 0) return null;
  return t.attempts.progress(formatBytes(attempt.bytesSent, locale), formatBytes(attempt.bytesTotal, locale));
}

/**
 * The newest attempt of one platform in its tab (SPEC 0007 section 5.4): its state, the queued
 * sentence of section 5.5, the bytes sent while uploading, and for a terminal failure its reason with "Nada será reenviado sem um novo
 * clique." An `outcome-unknown` attempt says to check the platform before trying again.
 */
export function PublishAttemptStatus({ attempt }: { attempt: PublishAttemptView }): ReactElement {
  const messages = useWebMessages();
  const t = messages.publishing;
  const { locale } = useI18n();
  const progress = progressText(attempt, t, locale);
  return (
    <div className={styles.attemptStatus} aria-live="polite">
      <p className={styles.attemptLine}>
        <span className="label">{t.attempts.sendingTo(platformLabels[attempt.platform])}</span>
        <PublishStateBadge attempt={attempt} />
        {attempt.mode === 'mock' && <Badge tone="info">{messages.platforms.mockBadge}</Badge>}
        <span className="caption">{t.attempts.since(formatInstant(attempt.since, locale))}</span>
        {progress !== null && <span className="caption">{progress}</span>}
      </p>
      {attempt.state === 'queued' && <p className="caption">{t.queuedBetweenRuns}</p>}
      {attempt.state === 'failed' && (
        <Alert variant="error">{`${attempt.reasonId === null ? '' : `${t.failures[attempt.reasonId]} `}${t.noResend}`}</Alert>
      )}
      {attempt.state === 'outcome-unknown' && <Alert variant="warning">{t.outcomeUnknown(platformLabels[attempt.platform])}</Alert>}
    </div>
  );
}
