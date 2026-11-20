import { Alert, Card, PageHeader, formatUsd } from '@studio/ui';
import { INSIGHTS_MAX_RUNS, insightsTargets, type InsightsView } from '@studio/shared/api';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import layout from '@/features/common/layout.module.css';
import { CatalogShareTable, RatingTrendTable, ReviewTimeTable, VerdictBadge } from '@/features/insights/InsightsTables';
import { serverInsightsApi } from '@/features/insights/insights-api.server';
import { formatShare } from '@/features/insights/insights-labels';
import { formatDateTime } from '@/features/runs/run-labels';

export const metadata: Metadata = { title: 'Indicadores' };
export const dynamic = 'force-dynamic';

interface SummaryCardProps {
  title: string;
  value: string;
  isMet: boolean | null;
  children: ReactNode;
}

function SummaryCard({ title, value, isMet, children }: SummaryCardProps) {
  return (
    <li>
      <Card title={title} as="h3" actions={<VerdictBadge isMet={isMet} />}>
        <p className="mono">{value}</p>
        {children}
      </Card>
    </li>
  );
}

function costIsMet(cost: InsightsView['cost']): boolean | null {
  if (cost.costPerApprovedUsd === null && cost.monthToDateUsd === null) return null;
  const perRunOk = cost.costPerApprovedUsd === null || cost.costPerApprovedUsd <= cost.runLimitUsd;
  const monthOk = cost.monthToDateUsd === null || cost.monthToDateUsd <= cost.monthLimitUsd;
  return perRunOk && monthOk;
}

function SummaryCards({ insights }: { insights: InsightsView }) {
  const { reviewReach, catalogShare, cost } = insights;
  return (
    <ul className={layout.cardGrid}>
      <SummaryCard
        title="Revisão sem reparo manual"
        value={formatShare(reviewReach.share)}
        isMet={reviewReach.share === null ? null : reviewReach.share >= insightsTargets.reviewWithoutRepairShare}
      >
        <p>
          {reviewReach.withoutRepair} de {reviewReach.reachedReview} execuções chegaram à revisão sem sair de &quot;falhou&quot;. Meta:{' '}
          {formatShare(insightsTargets.reviewWithoutRepairShare)} ou mais.
        </p>
        {reviewReach.withoutHistory > 0 && <p>{reviewReach.withoutHistory} sem histórico legível ficaram de fora.</p>}
      </SummaryCard>
      <SummaryCard
        title="Ativos vindos do catálogo"
        value={`${catalogShare.meetingTarget} de ${catalogShare.fromTargetRun}`}
        isMet={catalogShare.fromTargetRun === 0 ? null : catalogShare.meetingTarget === catalogShare.fromTargetRun}
      >
        <p>
          Execuções a partir da {insightsTargets.catalogShareFromRun}ª com {formatShare(insightsTargets.catalogShare)} ou mais dos ativos já no
          catálogo antes de começar.
        </p>
        {catalogShare.withoutManifest > 0 && <p>{catalogShare.withoutManifest} sem manifesto ficaram de fora.</p>}
      </SummaryCard>
      <SummaryCard
        title="Custo por vídeo aprovado"
        value={cost.costPerApprovedUsd === null ? 'sem dados' : formatUsd(cost.costPerApprovedUsd)}
        isMet={costIsMet(cost)}
      >
        <p>
          {cost.approvedRuns} aprovados, {formatUsd(cost.approvedCostUsd)} no total. Limite por execução: {formatUsd(cost.runLimitUsd)};{' '}
          {cost.runsOverRunLimit} acima dele.
        </p>
        <p>
          Mês atual: {cost.monthToDateUsd === null ? 'indisponível' : formatUsd(cost.monthToDateUsd)} de {formatUsd(cost.monthLimitUsd)}.
        </p>
      </SummaryCard>
      <SummaryCard
        title="Publicados sem aprovação"
        value={String(insights.unapprovedPublications)}
        isMet={insights.unapprovedPublications === insightsTargets.unapprovedPublications}
      >
        <p>Vídeos publicados cuja execução não tem aprovação registrada. Meta: nenhum.</p>
      </SummaryCard>
    </ul>
  );
}

/** PRD 0001 R4 goal 4: `/indicadores`, the section 14 success metrics from `GET /insights`. */
export default async function InsightsPage() {
  const insights = await serverInsightsApi().getInsights();

  return (
    <div className={layout.page}>
      <PageHeader
        title="Indicadores"
        description="As metas de sucesso do estúdio, calculadas das execuções que chegaram à revisão."
        meta={`Calculado em ${formatDateTime(insights.computedAt)}`}
      />
      {insights.truncated && (
        <Alert variant="info">Só as {INSIGHTS_MAX_RUNS} execuções mais recentes que chegaram à revisão entram na conta.</Alert>
      )}
      <SummaryCards insights={insights} />
      <Card title="Tempo do briefing à revisão" as="h2" description="Por receita: a execução mais recente contra a primeira.">
        <ReviewTimeTable rows={insights.reviewTime} />
      </Card>
      <Card title="Tendência de nota" as="h2" description="Por receita: média das últimas 5 avaliações contra as 5 anteriores.">
        <RatingTrendTable rows={insights.ratingTrend} />
      </Card>
      <Card title="Ativos do catálogo por execução" as="h2" description="As execuções mais recentes, com a parcela de ativos que já estava no catálogo.">
        <CatalogShareTable rows={insights.catalogShare.latestRuns} target={insightsTargets.catalogShare} />
      </Card>
    </div>
  );
}
