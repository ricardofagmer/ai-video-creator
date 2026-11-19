import {
  platformBaseline,
  platformSignal,
  selectSnapshotInForce,
  type MetricSource,
  type Platform,
  type PlatformBaseline,
  type PlatformMetrics,
} from '@studio/shared/metrics';

/** One stored platform snapshot with the run and platform of its publication. */
export interface PlatformSnapshotFact {
  runId: string;
  publicationId: string;
  platform: Platform;
  asOfDate: string;
  source: MetricSource;
  metrics: PlatformMetrics;
}

function groupBy<Item>(items: readonly Item[], keyOf: (item: Item) => string): Map<string, Item[]> {
  const groups = new Map<string, Item[]>();
  for (const item of items) {
    const group = groups.get(keyOf(item)) ?? [];
    group.push(item);
    groups.set(keyOf(item), group);
  }
  return groups;
}

/** The snapshot in force of every publication (latest `asOfDate`, `form` over `csv` on a tie). */
export function snapshotsInForce(facts: readonly PlatformSnapshotFact[]): PlatformSnapshotFact[] {
  return [...groupBy(facts, (fact) => fact.publicationId).values()].flatMap((snapshots) => {
    const inForce = selectSnapshotInForce(snapshots);
    return inForce === null ? [] : [inForce];
  });
}

/** One baseline per platform over the snapshots in force; null where fewer than 5 videos qualify. */
export function platformBaselines(inForce: readonly PlatformSnapshotFact[]): Record<Platform, PlatformBaseline | null> {
  return {
    youtube: platformBaseline('youtube', inForce),
    instagram: platformBaseline('instagram', inForce),
    tiktok: platformBaseline('tiktok', inForce),
  };
}

/**
 * `p_i` of every run that has one (SPEC 0006 section 5.4): the baselines are taken over the
 * snapshots in force of all publications, then each run's signal is the shared `platformSignal`
 * over its own snapshots in force. Runs without an eligible snapshot on a platform with a baseline
 * are absent, so their adjusted score stays exactly the version 1 value. Callers pass facts in a
 * stable order, so the same rows always give the same doubles.
 */
export function runPlatformSignals(facts: readonly PlatformSnapshotFact[]): Map<string, number> {
  const inForce = snapshotsInForce(facts);
  const baselines = platformBaselines(inForce);
  const signals = new Map<string, number>();
  for (const [runId, runSnapshots] of groupBy(inForce, (fact) => fact.runId)) {
    const signal = platformSignal(runSnapshots, baselines);
    if (signal !== null) signals.set(runId, signal);
  }
  return signals;
}
