import { PageHeader } from '@studio/ui';
import type { Metadata } from 'next';
import layout from '@/features/common/layout.module.css';
import { MetricImportForm } from '@/features/metrics/components/MetricImportForm';
import { getI18n } from '@/lib/i18n/server';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.metrics.import.title };
}
export const dynamic = 'force-dynamic';

/**
 * SPEC 0006 section 5.9: `/metricas/importar`. Matching is by platform video id only, so a row
 * counts only for a video whose publication was registered on its run page first.
 */
export default async function ImportMetricsPage() {
  const { t } = await getI18n();
  return (
    <div className={layout.page}>
      <PageHeader title={t.metrics.import.title} description={t.metrics.import.description} />
      <MetricImportForm />
    </div>
  );
}
