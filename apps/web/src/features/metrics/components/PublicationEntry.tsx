import { Alert, Badge, textLinkClassName, type BadgeTone } from '@studio/ui';
import { type RunPublicationEntryView } from '@studio/shared/api';
import { type PublicationOrigin } from '@studio/shared/metrics';
import type { ReactElement } from 'react';
import { baselineMissingText, formatIsoDate, localTodayIso, platformLabels, pollingLineText, publicationOriginLabels } from '../metric-labels';
import styles from '../metrics.module.css';
import { publicationHref } from '../publication-link';
import { MetricHistoryTable } from './MetricHistoryTable';
import { MetricSnapshotForm } from './MetricSnapshotForm';
import { RemovePublicationButton } from './RemovePublicationButton';

interface PublicationEntryProps {
  runId: string;
  entry: RunPublicationEntryView;
  /** The Mac's local date for "Próxima coleta: amanhã"; injected so the line is testable. */
  todayIso?: string;
}

const originTones: Readonly<Record<PublicationOrigin, BadgeTone>> = {
  manual: 'neutral',
  studio: 'success',
  mock: 'info',
};

/**
 * One publication on the run page (SPEC 0006 section 5.9): the platform, the stored canonical
 * link as an `<a>` opened in a new tab without opener or referrer, the metrics in force with their
 * history, and the form for a new snapshot. Every URL, id and number is a text node. Rev 7 (SPEC
 * 0007 sections 4.1 and 5.9): the origin badge ("simulado" on a mock upload), the studio attempt
 * that created it (AC 49) and the polling line. An absent `origin` reads `manual`.
 */
export function PublicationEntry({ runId, entry, todayIso = localTodayIso() }: PublicationEntryProps): ReactElement {
  const { publication, inForce, history, baselineReady } = entry;
  const origin = publication.origin ?? 'manual';
  const polling = publication.polling ?? null;
  const attemptId = publication.attemptId ?? null;
  const href = publicationHref(publication.url);
  const platform = platformLabels[publication.platform];
  const hasSnapshots = inForce !== null || history.length > 0;

  return (
    <article className={styles.publication} aria-labelledby={`publicacao-${publication.publicationId}`}>
      <h3 id={`publicacao-${publication.publicationId}`} className={styles.publicationHeader}>
        <span className="heading-3">{platform}</span>
        <span className="caption mono">{publication.platformVideoId}</span>
        {publication.publishedOn !== null && <span className="caption">{`Publicado em ${formatIsoDate(publication.publishedOn)}`}</span>}
        <Badge tone={originTones[origin]}>{publicationOriginLabels[origin]}</Badge>
      </h3>
      {attemptId !== null && <p className="caption mono">{`Envio ${attemptId}`}</p>}
      {polling !== null && (
        <p className="caption">
          {pollingLineText(polling, todayIso)}
          {polling.lastPolledOn !== null && ` · Última coleta: ${formatIsoDate(polling.lastPolledOn)}`}
        </p>
      )}
      {href === null ? (
        <p className={`mono ${styles.breakable}`}>{publication.url}</p>
      ) : (
        <p className={styles.breakable}>
          <a href={href} target="_blank" rel="noopener noreferrer" className={textLinkClassName()}>
            {href}
            <span className="visually-hidden"> (abre em uma nova aba)</span>
          </a>
        </p>
      )}
      {!baselineReady && <Alert variant="info">{baselineMissingText(publication.platform)}</Alert>}
      <MetricHistoryTable inForce={inForce} history={history} caption={`Métricas de ${platform}`} />
      <details>
        <summary className="label">Registrar métricas</summary>
        <MetricSnapshotForm runId={runId} publicationId={publication.publicationId} />
      </details>
      {!hasSnapshots && (
        <div className={styles.actions}>
          <RemovePublicationButton runId={runId} publicationId={publication.publicationId} />
        </div>
      )}
    </article>
  );
}
