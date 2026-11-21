import { INSIGHTS_MAX_RUNS, insightsTargets, type InsightsView } from '@studio/shared/api';

const percentFormatter = new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 0 });
const ratingFormatter = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const usdFormatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

function share(value: number | null): string {
  return value === null ? 'sem dados' : percentFormatter.format(value);
}

function usd(value: number | null): string {
  return value === null ? 'indisponível' : usdFormatter.format(value);
}

function duration(ms: number): string {
  if (ms < minuteMs) return 'menos de 1 min';
  if (ms >= dayMs) return `${Math.floor(ms / dayMs)} d ${Math.floor((ms % dayMs) / hourMs)} h`;
  if (ms >= hourMs) return `${Math.floor(ms / hourMs)} h ${Math.floor((ms % hourMs) / minuteMs)} min`;
  return `${Math.floor(ms / minuteMs)} min`;
}

function verdict(isMet: boolean | null): string {
  if (isMet === null) return 'sem dados';
  return isMet ? 'na meta' : 'fora da meta';
}

function reviewReachLines(insights: InsightsView): string[] {
  const { reviewReach } = insights;
  const isMet = reviewReach.share === null ? null : reviewReach.share >= insightsTargets.reviewWithoutRepairShare;
  const lines = [
    `Revisão sem reparo manual: ${share(reviewReach.share)} (${reviewReach.withoutRepair} de ${reviewReach.reachedReview}) · meta ${share(insightsTargets.reviewWithoutRepairShare)} · ${verdict(isMet)}`,
  ];
  if (reviewReach.withoutHistory > 0) lines.push(`  ${reviewReach.withoutHistory} sem histórico legível ficaram de fora`);
  return lines;
}

function reviewTimeLines(insights: InsightsView): string[] {
  if (insights.reviewTime.length === 0) return ['Tempo do briefing à revisão: nenhuma execução chegou à revisão ainda'];
  return [
    'Tempo do briefing à revisão (primeira -> mais recente):',
    ...insights.reviewTime.map(
      (recipe) =>
        `  ${recipe.recipeId}: ${duration(recipe.firstRunMs)} -> ${recipe.latestRunMs === null ? '-' : duration(recipe.latestRunMs)} (${recipe.runs} execuções) · ${verdict(recipe.faster)}`,
    ),
  ];
}

function catalogLines(insights: InsightsView): string[] {
  const { catalogShare } = insights;
  const isMet = catalogShare.fromTargetRun === 0 ? null : catalogShare.meetingTarget === catalogShare.fromTargetRun;
  const lines = [
    `Ativos do catálogo: ${catalogShare.meetingTarget} de ${catalogShare.fromTargetRun} execuções a partir da ${insightsTargets.catalogShareFromRun}ª com ${share(insightsTargets.catalogShare)} ou mais · ${verdict(isMet)}`,
    ...catalogShare.latestRuns.map((run) => `  nº ${run.ordinal} ${run.runId}: ${run.fromCatalog} de ${run.assetVersions} (${share(run.share)})`),
  ];
  if (catalogShare.withoutManifest > 0) lines.push(`  ${catalogShare.withoutManifest} sem manifesto ficaram de fora`);
  return lines;
}

function costLines(insights: InsightsView): string[] {
  const { cost } = insights;
  return [
    `Custo por vídeo aprovado: ${cost.costPerApprovedUsd === null ? 'sem dados' : usd(cost.costPerApprovedUsd)} (${cost.approvedRuns} aprovados, ${usd(cost.approvedCostUsd)} no total)`,
    `  limite por execução ${usd(cost.runLimitUsd)}: ${cost.runsOverRunLimit} acima · mês atual ${usd(cost.monthToDateUsd)} de ${usd(cost.monthLimitUsd)}`,
  ];
}

function ratingLines(insights: InsightsView): string[] {
  if (insights.ratingTrend.length === 0) return ['Tendência de nota: nenhuma execução avaliada ainda'];
  return [
    'Tendência de nota (últimas 5 contra as 5 anteriores):',
    ...insights.ratingTrend.map(
      (recipe) =>
        `  ${recipe.recipeId}: ${ratingFormatter.format(recipe.latestMean)} (${recipe.latestCount}) contra ${recipe.previousMean === null ? '-' : `${ratingFormatter.format(recipe.previousMean)} (${recipe.previousCount})`} · ${verdict(recipe.holding)}`,
    ),
  ];
}

/** The owner-facing text of `studio insights`: the PRD 0001 section 14 metrics, one block each. */
export function insightsLines(insights: InsightsView): string[] {
  const unapproved = insights.unapprovedPublications;
  return [
    `Indicadores de ${insights.runsRead} execuções que chegaram à revisão${insights.truncated ? ` (só as ${INSIGHTS_MAX_RUNS} mais recentes)` : ''}.`,
    ...reviewReachLines(insights),
    ...reviewTimeLines(insights),
    ...catalogLines(insights),
    ...costLines(insights),
    ...ratingLines(insights),
    `Publicados sem aprovação: ${unapproved} · meta nenhum · ${verdict(unapproved === insightsTargets.unapprovedPublications)}`,
  ];
}
