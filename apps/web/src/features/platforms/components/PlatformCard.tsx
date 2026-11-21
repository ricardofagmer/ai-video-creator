import { Alert, Badge, Card, DescriptionList, textLinkClassName } from '@studio/ui';
import { type PlatformView } from '@studio/shared/api';
import { PlatformCapabilitySchema, type CapabilityStatus } from '@studio/shared/platforms';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { formatDateTime } from '@/features/catalog/catalog-labels';
import { rev7ReasonText } from '@/features/common/platform-error-text';
import { platformLabels } from '@/features/metrics/metric-labels';
import {
  IMPORT_FALLBACK_TEXT,
  MOCK_BADGE_TEXT,
  MOCK_MODE_TEXT,
  backoffReasonTexts,
  capabilityLabels,
  capabilityStatusBadge,
  reconnectReasonTexts,
  trackedPublicationsText,
} from '../platform-labels';
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
export function PlatformCard({ view }: PlatformCardProps): ReactElement {
  const { platform, mode, gates, status } = view;
  const statuses: readonly CapabilityStatus[] = [status.metrics, status.publish];
  const canConnect = statuses.some((value) => value === 'disconnected' || value === 'needs-reconnect');
  const notConfigured = statuses.includes('not-configured');
  const awaitingReview = statuses.includes('awaiting-review');

  return (
    <Card
      title={platformLabels[platform]}
      actions={mode === 'mock' ? <Badge tone="info">{MOCK_BADGE_TEXT}</Badge> : undefined}
    >
      <div className={styles.cardBody}>
        <ul className={styles.capabilities}>
          {PlatformCapabilitySchema.options.map((capability) => {
            const badge = capabilityStatusBadge(status[capability]);
            return (
              <li key={capability} className={styles.capability}>
                <div className={styles.capabilityHeader}>
                  <span className="label">{capabilityLabels[capability]}</span>
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
        {mode === 'mock' && <Alert variant="info">{MOCK_MODE_TEXT}</Alert>}
        {notConfigured && <Alert variant="warning">{rev7ReasonText('platform-not-configured', { platform, mode })}</Alert>}
        {view.reconnectReason !== null && <Alert variant="warning">{reconnectReasonTexts[view.reconnectReason]}</Alert>}
        <DescriptionList
          items={[
            { term: 'Conta', description: view.accountLabel ?? 'Nenhuma conta conectada' },
            { term: 'Conectada em', description: view.connectedAt === null ? NO_VALUE : formatDateTime(view.connectedAt) },
            { term: 'Última coleta', description: view.lastPollAt === null ? NO_VALUE : formatDateTime(view.lastPollAt) },
            {
              term: 'Coleta pausada',
              description:
                view.backoff === null ? NO_VALUE : `${backoffReasonTexts[view.backoff.reasonId]}; tenta de novo em ${formatDateTime(view.backoff.until)}`,
            },
            { term: 'Publicações', description: trackedPublicationsText(view.trackedPublications) },
          ]}
        />
        <p className={awaitingReview ? undefined : 'caption'}>
          {`${IMPORT_FALLBACK_TEXT} `}
          <Link href="/metricas/importar" className={textLinkClassName()}>
            Importar métricas de um CSV
          </Link>
        </p>
        <ConnectionActions platform={platform} mode={mode} canConnect={canConnect && !notConfigured} hasAccount={view.connectedAt !== null} />
      </div>
    </Card>
  );
}
