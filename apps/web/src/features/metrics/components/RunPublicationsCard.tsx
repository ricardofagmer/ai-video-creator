import { Alert, Card, textLinkClassName } from '@studio/ui';
import { metricsBounds } from '@studio/shared/metrics';
import Link from 'next/link';
import type { ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import styles from '../metrics.module.css';
import { type RunPublicationsData } from '../run-publications.server';
import { PublicationAddForm } from './PublicationAddForm';
import { PublicationEntry } from './PublicationEntry';

interface RunPublicationsCardProps {
  runId: string;
  data: RunPublicationsData;
}

/**
 * "Publicações" on the page of an approved run (SPEC 0006 section 5.9, AC 37, R3-AC-03): where the
 * video was published, and its platform metrics typed in, imported from a CSV or pulled from the
 * platform. Rev 7 (SPEC 0007 section 5.9) lists studio and mock uploads beside pasted links;
 * publishing itself is the publish card's. Nothing here publishes, approves or promotes anything.
 */
export function RunPublicationsCard({ runId, data }: RunPublicationsCardProps): ReactElement {
  return (
    <Card
      title="Publicações"
      description="Onde este vídeo foi publicado, pelo estúdio ou por você, e as métricas que entram na nota das versões que ele usou. Publicou por fora? Cole o link abaixo."
    >
      {data.status === 'failed' ? (
        <Alert variant="warning">{`Não foi possível carregar as publicações. ${data.message}`}</Alert>
      ) : (
        <div className={layout.stack}>
          {data.view.publications.length === 0 ? (
            <p className="caption">Nenhuma publicação registrada.</p>
          ) : (
            <ul className={styles.publicationList}>
              {data.view.publications.map((entry) => (
                <li key={entry.publication.publicationId}>
                  <PublicationEntry runId={runId} entry={entry} />
                </li>
              ))}
            </ul>
          )}
          {data.view.publications.length < metricsBounds.maxPublicationsPerRun ? (
            <PublicationAddForm runId={runId} />
          ) : (
            <p className="caption">{`Limite de ${metricsBounds.maxPublicationsPerRun} publicações por execução.`}</p>
          )}
          <p className="caption">
            {'Tem a exportação da plataforma? '}
            <Link href="/metricas/importar" className={textLinkClassName()}>
              Importar métricas de um CSV
            </Link>
          </p>
        </div>
      )}
    </Card>
  );
}
