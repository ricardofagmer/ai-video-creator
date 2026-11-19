import { PageHeader } from '@studio/ui';
import type { Metadata } from 'next';
import layout from '@/features/common/layout.module.css';
import { MetricImportForm } from '@/features/metrics/components/MetricImportForm';

export const metadata: Metadata = { title: 'Importar métricas' };
export const dynamic = 'force-dynamic';

/**
 * SPEC 0006 section 5.9: `/metricas/importar`. Matching is by platform video id only, so a row
 * counts only for a video whose publication was registered on its run page first.
 */
export default function ImportMetricsPage() {
  return (
    <div className={layout.page}>
      <PageHeader
        title="Importar métricas"
        description="Envie o CSV que a plataforma exporta. Cada linha é ligada à execução pelo id do vídeo; registre antes a publicação na página da execução aprovada."
      />
      <MetricImportForm />
    </div>
  );
}
