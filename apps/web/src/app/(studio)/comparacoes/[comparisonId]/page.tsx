import { Alert, Badge, EmptyState, PageHeader, buttonClassName, textLinkClassName } from '@studio/ui';
import { type ComparisonView } from '@studio/shared/api';
import { ComparisonIdSchema } from '@studio/shared/catalog';
import type { Metadata } from 'next';
import Link from 'next/link';
import layout from '@/features/common/layout.module.css';
import {
  comparisonStatusLabels,
  comparisonStatusTones,
  subjectText,
  verificationWarnings,
} from '@/features/comparisons/comparison-labels';
import { loadArmAspects, loadComparison } from '@/features/comparisons/comparison-page.server';
import styles from '@/features/comparisons/comparisons.module.css';
import { ComparisonArmColumn } from '@/features/comparisons/components/ComparisonArmColumn';
import { ComparisonCostCard } from '@/features/comparisons/components/ComparisonCostCard';
import { RunListAutoRefresh } from '@/features/runs/components/RunListAutoRefresh';
import { formatDateTime } from '@/features/runs/run-labels';

export const dynamic = 'force-dynamic';

interface ComparisonPageProps {
  params: Promise<{ comparisonId: string }>;
}

async function readComparison(comparisonId: string): Promise<ComparisonView | null> {
  return ComparisonIdSchema.safeParse(comparisonId).success ? loadComparison(comparisonId) : null;
}

export async function generateMetadata({ params }: ComparisonPageProps): Promise<Metadata> {
  const { comparisonId } = await params;
  const comparison = await readComparison(comparisonId);
  return { title: comparison === null ? 'Comparações' : `${comparison.title} · Comparações` };
}

function StatusNotice({ comparison }: { comparison: ComparisonView }) {
  if (comparison.status === 'draft') {
    return <Alert variant="info">As duas execuções estão em rascunho. Nada foi gasto até você aceitar o custo máximo do par.</Alert>;
  }
  if (comparison.status === 'incomplete') {
    return <Alert variant="warning">Uma das execuções falhou ou foi rejeitada sem manifesto, então a comparação ficou incompleta.</Alert>;
  }
  if (comparison.status === 'ready') {
    return (
      <Alert variant="info">
        Uma comparação é um único par de execuções: é uma evidência fraca. Veja também a nota de cada versão antes de decidir. Para ativar
        uma versão, abra a página dela.
      </Alert>
    );
  }
  return null;
}

/**
 * SPEC 0003 section 5.3: `/comparacoes/[comparisonId]`, both arms side by side with their status,
 * QA, reviewer scores, decision, cost and video, the pair's cost and the start control while both
 * runs are drafts. No control here changes a version's status (R2-AC-22): the arm cards link to
 * the version pages, where the promotion dialog lives.
 */
export default async function ComparisonPage({ params }: ComparisonPageProps) {
  const { comparisonId } = await params;
  const comparison = await readComparison(comparisonId);

  if (comparison === null) {
    return (
      <EmptyState
        title="Comparação não encontrada"
        description="Ela pode ter sido digitada errada no endereço."
        action={
          <Link href="/comparacoes" className={buttonClassName({ variant: 'secondary' })}>
            Voltar às comparações
          </Link>
        }
      />
    );
  }

  const aspects = await loadArmAspects(comparison);
  const warnings = verificationWarnings(comparison.verified);
  const rejectedHasVideo = comparison.status === 'ready';

  return (
    <div className={layout.page}>
      <PageHeader
        back={
          <Link href="/comparacoes" className={textLinkClassName()}>
            ← Comparações
          </Link>
        }
        title={comparison.title}
        meta={<Badge tone={comparisonStatusTones[comparison.status]}>{comparisonStatusLabels[comparison.status]}</Badge>}
        description={
          <>
            <span className="mono">{subjectText(comparison.subject)}</span>
            {` · criada por ${comparison.createdBy} em ${formatDateTime(comparison.createdAt)}`}
          </>
        }
      />
      {warnings.length > 0 && (
        <Alert variant="warning" title="As duas execuções não são comparáveis em tudo">
          <ul className={styles.warningList}>
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </Alert>
      )}
      <StatusNotice comparison={comparison} />
      <div className={styles.arms}>
        <ComparisonArmColumn
          comparisonId={comparison.comparisonId}
          subject={comparison.subject}
          arm={comparison.arms.a}
          rejectedHasVideo={rejectedHasVideo}
          aspect={aspects.a}
        />
        <ComparisonArmColumn
          comparisonId={comparison.comparisonId}
          subject={comparison.subject}
          arm={comparison.arms.b}
          rejectedHasVideo={rejectedHasVideo}
          aspect={aspects.b}
        />
      </div>
      <ComparisonCostCard comparison={comparison} />
      <RunListAutoRefresh active={comparison.status === 'running'} />
    </div>
  );
}
