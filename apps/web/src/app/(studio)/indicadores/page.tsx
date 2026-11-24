import { Alert, Card, PageHeader, formatUsd, type Locale } from '@studio/ui';
import { INSIGHTS_MAX_RUNS, insightsTargets, type InsightsView } from '@studio/shared/api';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import layout from '@/features/common/layout.module.css';
import { CatalogShareTable, RatingTrendTable, ReviewTimeTable, VerdictBadge } from '@/features/insights/InsightsTables';
import { serverInsightsApi } from '@/features/insights/insights-api.server';
import { formatShare } from '@/features/insights/insights-labels';
import { formatDateTime } from '@/features/runs/run-labels';
import { getI18n } from '@/lib/i18n/server';
import { type WebMessages } from '@/messages';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.metrics.insights.title };
}
export const dynamic = 'force-dynamic';

type InsightTexts = WebMessages['metrics']['insights'];

interface SummaryCardProps {
  title: string;
  value: string;
  isMet: boolean | null;
  t: InsightTexts;
  children: ReactNode;
}

function SummaryCard({ title, value, isMet, t, children }: SummaryCardProps) {
  return (
    <li>
      <Card title={title} as="h3" actions={<VerdictBadge isMet={isMet} t={t} />}>
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

function SummaryCards({ insights, t, locale }: { insights: InsightsView; t: InsightTexts; locale: Locale }) {
  const { reviewReach, catalogShare, cost } = insights;
  const usd = (amount: number): string => formatUsd(amount, locale);
  const share = (value: number | null): string => formatShare(value, t, locale);
  return (
    <ul className={layout.cardGrid}>
      <SummaryCard
        title={t.reviewReach.title}
        value={share(reviewReach.share)}
        isMet={reviewReach.share === null ? null : reviewReach.share >= insightsTargets.reviewWithoutRepairShare}
        t={t}
      >
        <p>{t.reviewReach.body(reviewReach.withoutRepair, reviewReach.reachedReview, share(insightsTargets.reviewWithoutRepairShare))}</p>
        {reviewReach.withoutHistory > 0 && <p>{t.reviewReach.withoutHistory(reviewReach.withoutHistory)}</p>}
      </SummaryCard>
      <SummaryCard
        title={t.catalogShare.title}
        value={t.catalogShare.value(catalogShare.meetingTarget, catalogShare.fromTargetRun)}
        isMet={catalogShare.fromTargetRun === 0 ? null : catalogShare.meetingTarget === catalogShare.fromTargetRun}
        t={t}
      >
        <p>{t.catalogShare.body(insightsTargets.catalogShareFromRun, share(insightsTargets.catalogShare))}</p>
        {catalogShare.withoutManifest > 0 && <p>{t.catalogShare.withoutManifest(catalogShare.withoutManifest)}</p>}
      </SummaryCard>
      <SummaryCard
        title={t.cost.title}
        value={cost.costPerApprovedUsd === null ? t.noData : usd(cost.costPerApprovedUsd)}
        isMet={costIsMet(cost)}
        t={t}
      >
        <p>{t.cost.body(cost.approvedRuns, usd(cost.approvedCostUsd), usd(cost.runLimitUsd), cost.runsOverRunLimit)}</p>
        <p>{t.cost.month(cost.monthToDateUsd === null ? t.unavailable : usd(cost.monthToDateUsd), usd(cost.monthLimitUsd))}</p>
      </SummaryCard>
      <SummaryCard
        title={t.unapproved.title}
        value={String(insights.unapprovedPublications)}
        isMet={insights.unapprovedPublications === insightsTargets.unapprovedPublications}
        t={t}
      >
        <p>{t.unapproved.body}</p>
      </SummaryCard>
    </ul>
  );
}

/** PRD 0001 R4 goal 4: `/indicadores`, the section 14 success metrics from `GET /insights`. */
export default async function InsightsPage() {
  const insights = await serverInsightsApi().getInsights();
  const { t: messages, locale } = await getI18n();
  const t = messages.metrics.insights;

  return (
    <div className={layout.page}>
      <PageHeader title={t.title} description={t.description} meta={t.computedAt(formatDateTime(insights.computedAt, locale))} />
      {insights.truncated && <Alert variant="info">{t.truncated(INSIGHTS_MAX_RUNS)}</Alert>}
      <SummaryCards insights={insights} t={t} locale={locale} />
      <Card title={t.reviewTime.title} as="h2" description={t.reviewTime.description}>
        <ReviewTimeTable rows={insights.reviewTime} t={t} />
      </Card>
      <Card title={t.ratingTrend.title} as="h2" description={t.ratingTrend.description}>
        <RatingTrendTable rows={insights.ratingTrend} t={t} locale={locale} />
      </Card>
      <Card title={t.catalogRuns.title} as="h2" description={t.catalogRuns.description}>
        <CatalogShareTable rows={insights.catalogShare.latestRuns} target={insightsTargets.catalogShare} t={t} locale={locale} />
      </Card>
    </div>
  );
}
