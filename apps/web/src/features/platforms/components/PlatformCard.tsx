import { Alert, Badge, Card, DescriptionList, textLinkClassName } from '@studio/ui';
import { type PlatformView } from '@studio/shared/api';
import { PlatformCapabilitySchema, type CapabilityStatus } from '@studio/shared/platforms';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { formatDateTime } from '@/features/catalog/catalog-labels';
import { rev7ReasonText } from '@/features/common/platform-error-text';
import { getI18n } from '@/lib/i18n/server';
import { platformLabels } from '@/features/metrics/metric-labels';
import { capabilityStatusBadge } from '../platform-labels';
import styles from '../platforms.module.css';
import { ConnectionActions } from './ConnectionActions';
import { GateSwitch } from './GateSwitch';

interface PlatformCardProps {
  view: PlatformView;
}

const NO_VALUE = '—';

/**
 * One platform on `/contas` (SPEC 0007 section 5.9): the status of each capability, the account
 * label, the gate switches, connect, reconnect and disconnect, the last poll, the backoff and the
 * note that the CSV and form import stay available. The account label is a text node only.
 */
export async function PlatformCard({ view }: PlatformCardProps): Promise<ReactElement> {
  const { t, locale } = await getI18n();
  const texts = t.platforms;
  const { platform, mode, gates, status } = view;
  const statuses: readonly CapabilityStatus[] = [status.metrics, status.publish];
  const canConnect = statuses.some((value) => value === 'disconnected' || value === 'needs-reconnect');
  const notConfigured = statuses.includes('not-configured');
  const awaitingReview = statuses.includes('awaiting-review');

  return (
    <Card
      title={platformLabels[platform]}
      actions={mode === 'mock' ? <Badge tone="info">{texts.mockBadge}</Badge> : undefined}
    >
      <div className={styles.cardBody}>
        <ul className={styles.capabilities}>
          {PlatformCapabilitySchema.options.map((capability) => {
            const badge = capabilityStatusBadge(status[capability], texts);
            return (
              <li key={capability} className={styles.capability}>
                <div className={styles.capabilityHeader}>
                  <span className="label">{texts.capabilities[capability]}</span>
                  <Badge tone={badge.tone} dot>
                    {badge.label}
                  </Badge>
                </div>
                {status[capability] !== 'unsupported' && (
                  <GateSwitch platform={platform} capability={capability} gate={gates[capability]} mode={mode} />
                )}
              </li>
            );
          })}
        </ul>
        {mode === 'mock' && <Alert variant="info">{texts.mockMode}</Alert>}
        {notConfigured && <Alert variant="warning">{rev7ReasonText('platform-not-configured', { platform, mode }, t)}</Alert>}
        {view.reconnectReason !== null && <Alert variant="warning">{texts.reconnectReasons[view.reconnectReason]}</Alert>}
        <DescriptionList
          items={[
            { term: texts.card.account, description: view.accountLabel ?? texts.card.noAccount },
            { term: texts.card.connectedAt, description: view.connectedAt === null ? NO_VALUE : formatDateTime(view.connectedAt, locale) },
            { term: texts.card.lastPoll, description: view.lastPollAt === null ? NO_VALUE : formatDateTime(view.lastPollAt, locale) },
            {
              term: texts.card.backoff,
              description:
                view.backoff === null
                  ? NO_VALUE
                  : texts.card.backoffValue(texts.backoffReasons[view.backoff.reasonId], formatDateTime(view.backoff.until, locale)),
            },
            { term: texts.card.publications, description: texts.card.tracked(view.trackedPublications) },
          ]}
        />
        <p className={awaitingReview ? undefined : 'caption'}>
          {`${texts.importFallback} `}
          <Link href="/metricas/importar" className={textLinkClassName()}>
            {texts.importLink}
          </Link>
        </p>
        <ConnectionActions platform={platform} mode={mode} canConnect={canConnect && !notConfigured} hasAccount={view.connectedAt !== null} />
      </div>
    </Card>
  );
}
