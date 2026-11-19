import { platformSignalRules } from './constants';
import { type Platform } from './enums';
import { engagementRate, type PlatformMetrics } from './snapshot';

/*
 * The platform term of `qualityScore` formula version 2 (SPEC 0006 section 5.4, B2, B13). Pure, no
 * I/O, so core's writer and the web's explanation share one definition. A video is compared with
 * the owner's own median on the same platform, never with an absolute number.
 */

/** Medians over the snapshots in force of one platform with at least `minViews` views. */
export interface PlatformBaseline {
  platform: Platform;
  /** How many eligible snapshots the medians cover; at least `baselineMinVideos`. */
  videoCount: number;
  medianViews: number;
  medianEngagementRate: number;
  /** Over the eligible snapshots that report `averageViewPercent`; null when none does. */
  medianViewPercent: number | null;
}

/** One snapshot in force, with the platform of its publication. */
export interface PlatformSnapshotInForce {
  platform: Platform;
  metrics: PlatformMetrics;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  const upper = sorted[middle];
  const lower = sorted[middle - 1];
  if (upper === undefined) return null;
  return sorted.length % 2 === 1 || lower === undefined ? upper : (lower + upper) / 2;
}

function clampUnit(value: number): number {
  return Math.min(1, Math.max(-1, value));
}

function isEligible(metrics: PlatformMetrics): boolean {
  return metrics.views >= platformSignalRules.minViews;
}

/**
 * The baseline of `platform` over the snapshots in force of all its publications, or null when
 * fewer than `baselineMinVideos` of them have at least `minViews` views (the score does not move
 * and the web says so). Snapshots of other platforms are ignored.
 */
export function platformBaseline(platform: Platform, snapshotsInForce: readonly PlatformSnapshotInForce[]): PlatformBaseline | null {
  const eligible = snapshotsInForce.filter((snapshot) => snapshot.platform === platform && isEligible(snapshot.metrics));
  if (eligible.length < platformSignalRules.baselineMinVideos) return null;
  const medianViews = median(eligible.map((snapshot) => snapshot.metrics.views));
  const rates = eligible.flatMap((snapshot) => {
    const rate = engagementRate(snapshot.metrics);
    return rate === null ? [] : [rate];
  });
  const medianEngagementRate = median(rates);
  const viewPercents = eligible.flatMap((snapshot) =>
    snapshot.metrics.averageViewPercent === null ? [] : [snapshot.metrics.averageViewPercent],
  );
  if (medianViews === null || medianEngagementRate === null) return null;
  return {
    platform,
    videoCount: eligible.length,
    medianViews,
    medianEngagementRate,
    medianViewPercent: median(viewPercents),
  };
}

/**
 * `x_k` of one snapshot against its platform's baseline, or null when the snapshot has fewer than
 * `minViews` views or the baseline is of another platform:
 * `v = clamp(log10(views / medViews), -1, 1)`,
 * `er = clamp((rate - medEr) / max(medEr, 0.001), -1, 1)`,
 * `ret = clamp((viewPercent - medRet) / max(medRet, 1), -1, 1)` only when both exist;
 * `x` is the mean of the terms that exist (2 or 3).
 */
export function snapshotSignal(snapshot: PlatformSnapshotInForce, baseline: PlatformBaseline): number | null {
  if (snapshot.platform !== baseline.platform || !isEligible(snapshot.metrics)) return null;
  const rate = engagementRate(snapshot.metrics);
  if (rate === null) return null;
  const terms = [
    clampUnit(Math.log10(snapshot.metrics.views / baseline.medianViews)),
    clampUnit((rate - baseline.medianEngagementRate) / Math.max(baseline.medianEngagementRate, 0.001)),
  ];
  const viewPercent = snapshot.metrics.averageViewPercent;
  if (viewPercent !== null && baseline.medianViewPercent !== null) {
    terms.push(clampUnit((viewPercent - baseline.medianViewPercent) / Math.max(baseline.medianViewPercent, 1)));
  }
  return terms.reduce((sum, term) => sum + term, 0) / terms.length;
}

/**
 * `p_i` of one run, the value of `QualityScoreRun.platformSignal`: the mean `x_k` over the run's
 * eligible snapshots in force (one per publication) whose platform has a baseline; null when none
 * is eligible, which leaves the run's adjusted score exactly as in version 1.
 */
export function platformSignal(
  runSnapshotsInForce: readonly PlatformSnapshotInForce[],
  baselines: Readonly<Partial<Record<Platform, PlatformBaseline | null>>>,
): number | null {
  const signals = runSnapshotsInForce.flatMap((snapshot) => {
    const baseline = baselines[snapshot.platform];
    const signal = baseline === undefined || baseline === null ? null : snapshotSignal(snapshot, baseline);
    return signal === null ? [] : [signal];
  });
  if (signals.length === 0) return null;
  return signals.reduce((sum, signal) => sum + signal, 0) / signals.length;
}
