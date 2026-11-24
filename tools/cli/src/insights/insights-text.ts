import { INSIGHTS_MAX_RUNS, insightsTargets, type InsightsView } from '@studio/shared/api';
import { cliLocale, cliText } from '../i18n/messages.js';
import { type CliLocale } from '../i18n/locale.js';

interface InsightsFormatters {
  percent: Intl.NumberFormat;
  rating: Intl.NumberFormat;
  usd: Intl.NumberFormat;
}

const formattersByLocale = new Map<CliLocale, InsightsFormatters>();

/** Percent and rating follow the active language; pt-BR keeps its `$1.25` (en-US) money format. */
function formatters(): InsightsFormatters {
  const locale = cliLocale();
  let found = formattersByLocale.get(locale);
  if (found === undefined) {
    found = {
      percent: new Intl.NumberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }),
      rating: new Intl.NumberFormat(locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      usd: new Intl.NumberFormat(locale === 'pt-BR' ? 'en-US' : locale, { style: 'currency', currency: 'USD' }),
    };
    formattersByLocale.set(locale, found);
  }
  return found;
}

const minuteMs = 60_000;
const hourMs = 60 * minuteMs;
const dayMs = 24 * hourMs;

function share(value: number | null): string {
  return value === null ? cliText().metrics.insights.noData : formatters().percent.format(value);
}

function usd(value: number | null): string {
  return value === null ? cliText().metrics.insights.unavailable : formatters().usd.format(value);
}

function duration(ms: number): string {
  if (ms < minuteMs) return cliText().metrics.insights.underAMinute;
  if (ms >= dayMs) return `${Math.floor(ms / dayMs)} d ${Math.floor((ms % dayMs) / hourMs)} h`;
  if (ms >= hourMs) return `${Math.floor(ms / hourMs)} h ${Math.floor((ms % hourMs) / minuteMs)} min`;
  return `${Math.floor(ms / minuteMs)} min`;
}

function verdict(isMet: boolean | null): string {
  const text = cliText().metrics.insights;
  if (isMet === null) return text.noData;
  return isMet ? text.onTarget : text.offTarget;
}

function reviewReachLines(insights: InsightsView): string[] {
  const text = cliText().metrics.insights;
  const { reviewReach } = insights;
  const isMet = reviewReach.share === null ? null : reviewReach.share >= insightsTargets.reviewWithoutRepairShare;
  const lines = [
    text.reviewReach(share(reviewReach.share), reviewReach.withoutRepair, reviewReach.reachedReview, share(insightsTargets.reviewWithoutRepairShare), verdict(isMet)),
  ];
  if (reviewReach.withoutHistory > 0) lines.push(text.withoutHistory(reviewReach.withoutHistory));
  return lines;
}

function reviewTimeLines(insights: InsightsView): string[] {
  const text = cliText().metrics.insights;
  if (insights.reviewTime.length === 0) return [text.reviewTimeNone];
  return [
    text.reviewTimeHeading,
    ...insights.reviewTime.map((recipe) =>
      text.reviewTimeLine(
        recipe.recipeId,
        duration(recipe.firstRunMs),
        recipe.latestRunMs === null ? '-' : duration(recipe.latestRunMs),
        recipe.runs,
        verdict(recipe.faster),
      ),
    ),
  ];
}

function catalogLines(insights: InsightsView): string[] {
  const text = cliText().metrics.insights;
  const { catalogShare } = insights;
  const isMet = catalogShare.fromTargetRun === 0 ? null : catalogShare.meetingTarget === catalogShare.fromTargetRun;
  const lines = [
    text.catalog(catalogShare.meetingTarget, catalogShare.fromTargetRun, insightsTargets.catalogShareFromRun, share(insightsTargets.catalogShare), verdict(isMet)),
    ...catalogShare.latestRuns.map((run) => text.catalogRun(run.ordinal, run.runId, run.fromCatalog, run.assetVersions, share(run.share))),
  ];
  if (catalogShare.withoutManifest > 0) lines.push(text.withoutManifest(catalogShare.withoutManifest));
  return lines;
}

function costLines(insights: InsightsView): string[] {
  const text = cliText().metrics.insights;
  const { cost } = insights;
  return [
    text.costPerApproved(cost.costPerApprovedUsd === null ? text.noData : usd(cost.costPerApprovedUsd), cost.approvedRuns, usd(cost.approvedCostUsd)),
    text.costLimits(usd(cost.runLimitUsd), cost.runsOverRunLimit, usd(cost.monthToDateUsd), usd(cost.monthLimitUsd)),
  ];
}

function ratingLines(insights: InsightsView): string[] {
  const text = cliText().metrics.insights;
  const { rating } = formatters();
  if (insights.ratingTrend.length === 0) return [text.ratingNone];
  return [
    text.ratingHeading,
    ...insights.ratingTrend.map((recipe) =>
      text.ratingLine(
        recipe.recipeId,
        `${rating.format(recipe.latestMean)} (${recipe.latestCount})`,
        recipe.previousMean === null ? '-' : `${rating.format(recipe.previousMean)} (${recipe.previousCount})`,
        verdict(recipe.holding),
      ),
    ),
  ];
}

/** The owner-facing text of `studio insights`: the PRD 0001 section 14 metrics, one block each. */
export function insightsLines(insights: InsightsView): string[] {
  const text = cliText().metrics.insights;
  const unapproved = insights.unapprovedPublications;
  return [
    text.headline(insights.runsRead, insights.truncated ? INSIGHTS_MAX_RUNS : null),
    ...reviewReachLines(insights),
    ...reviewTimeLines(insights),
    ...catalogLines(insights),
    ...costLines(insights),
    ...ratingLines(insights),
    text.unapproved(unapproved, verdict(unapproved === insightsTargets.unapprovedPublications)),
  ];
}
