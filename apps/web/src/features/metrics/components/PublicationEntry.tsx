import { Alert, textLinkClassName } from '@studio/ui';
import { type RunPublicationEntryView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import { baselineMissingText, formatIsoDate, platformLabels } from '../metric-labels';
import styles from '../metrics.module.css';
import { publicationHref } from '../publication-link';
import { MetricHistoryTable } from './MetricHistoryTable';
import { MetricSnapshotForm } from './MetricSnapshotForm';
import { RemovePublicationButton } from './RemovePublicationButton';

interface PublicationEntryProps {
  runId: string;
  entry: RunPublicationEntryView;
}

/**
 * One publication on the run page (SPEC 0006 section 5.9): the platform, the stored canonical
 * link as an `<a>` opened in a new tab without opener or referrer, the metrics in force with their
 * history, and the form for a new snapshot. Every URL, id and number is a text node.
 */
export function PublicationEntry({ runId, entry }: PublicationEntryProps): ReactElement {
  const { publication, inForce, history, baselineReady } = entry;
  const href = publicationHref(publication.url);
  const platform = platformLabels[publication.platform];
  const hasSnapshots = inForce !== null || history.length > 0;

  return (
    <article className={styles.publication} aria-labelledby={`publicacao-${publication.publicationId}`}>
      <h3 id={`publicacao-${publication.publicationId}`} className={styles.publicationHeader}>
        <span className="heading-3">{platform}</span>
        <span className="caption mono">{publication.platformVideoId}</span>
        {publication.publishedOn !== null && <span className="caption">{`Publicado em ${formatIsoDate(publication.publishedOn)}`}</span>}
      </h3>
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
