import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type Platform } from './enums';
import { platformBaseline, platformSignal, snapshotSignal, type PlatformBaseline, type PlatformSnapshotInForce } from './platform-signal';
import { type PlatformMetrics } from './snapshot';

/*
 * SPEC 0006 section 5.4, B2, B13, R3-AC-06: a baseline needs 5 snapshots in force with at least
 * 100 views on the platform; with fewer the platform term is absent (null).
 */

function metrics(values: Partial<PlatformMetrics> & Pick<PlatformMetrics, 'views'>): PlatformMetrics {
  return {
    likes: null,
    comments: null,
    shares: null,
    saves: null,
    impressions: null,
    reach: null,
    followersGained: null,
    watchTimeSeconds: null,
    averageViewDurationSeconds: null,
    averageViewPercent: null,
    ...values,
  };
}

function snapshot(platform: Platform, values: Partial<PlatformMetrics> & Pick<PlatformMetrics, 'views'>): PlatformSnapshotInForce {
  return { platform, metrics: metrics(values) };
}

/** Six YouTube snapshots whose medians are views 1000, engagement 0.040, view percent 40 (5.4). */
const workedExampleRunB = snapshot('youtube', { views: 4000, likes: 200, comments: 20, shares: 30, averageViewPercent: 45 });
const workedExampleBaselineSnapshots: readonly PlatformSnapshotInForce[] = [
  snapshot('youtube', { views: 500, likes: 15, averageViewPercent: 30 }),
  snapshot('youtube', { views: 800, likes: 28, averageViewPercent: 35 }),
  snapshot('youtube', { views: 1000, likes: 40, averageViewPercent: 40 }),
  snapshot('youtube', { views: 1000, likes: 40, averageViewPercent: 40 }),
  snapshot('youtube', { views: 2000, likes: 100, averageViewPercent: 50 }),
  workedExampleRunB,
];

function eligibleYoutube(count: number): PlatformSnapshotInForce[] {
  return Array.from({ length: count }, (_, index) => snapshot('youtube', { views: 100 + index * 100, likes: 5 }));
}

describe('platformBaseline', () => {
  it('is null with 4 eligible videos, even with more snapshots under 100 views', () => {
    const snapshots = [...eligibleYoutube(4), snapshot('youtube', { views: 99, likes: 50 }), snapshot('youtube', { views: 0 })];
    assert.equal(platformBaseline('youtube', snapshots), null);
  });

  it('is null when the 5 eligible videos are on other platforms', () => {
    const snapshots = [...eligibleYoutube(4), snapshot('instagram', { views: 5000, likes: 5 })];
    assert.equal(platformBaseline('youtube', snapshots), null);
  });

  it('exists from the fifth eligible video on (100 views counts)', () => {
    const baseline = platformBaseline('youtube', eligibleYoutube(5));
    if (baseline === null) assert.fail('expected a baseline from 5 eligible videos');
    assert.equal(baseline.videoCount, 5);
    assert.equal(baseline.medianViews, 300);
  });

  it('takes the medians of the 5.4 worked example', () => {
    const baseline = platformBaseline('youtube', workedExampleBaselineSnapshots);
    if (baseline === null) assert.fail('expected a baseline');
    assert.equal(baseline.videoCount, 6);
    assert.equal(baseline.medianViews, 1000);
    assert.ok(Math.abs(baseline.medianEngagementRate - 0.04) < 1e-12);
    assert.equal(baseline.medianViewPercent, 40);
  });

  it('has a null view-percent median when no eligible snapshot reports it', () => {
    const baseline = platformBaseline('youtube', eligibleYoutube(5));
    assert.equal(baseline?.medianViewPercent, null);
  });
});

describe('platformSignal', () => {
  it('is null when the platform has fewer than 5 eligible videos', () => {
    const snapshots = eligibleYoutube(4);
    const baselines = { youtube: platformBaseline('youtube', snapshots) };
    const runSnapshot = snapshots[0];
    if (runSnapshot === undefined) assert.fail('fixture has a snapshot');
    assert.equal(platformSignal([runSnapshot], baselines), null);
  });

  it('is null for a run with no snapshot, or whose platform has no baseline entry', () => {
    const baseline = platformBaseline('youtube', workedExampleBaselineSnapshots);
    assert.equal(platformSignal([], { youtube: baseline }), null);
    assert.equal(platformSignal([snapshot('tiktok', { views: 5000, likes: 50 })], { youtube: baseline }), null);
  });

  it('is null for a snapshot under 100 views even with a baseline', () => {
    const baseline = platformBaseline('youtube', workedExampleBaselineSnapshots);
    assert.equal(platformSignal([snapshot('youtube', { views: 99, likes: 50 })], { youtube: baseline }), null);
  });

  it('reproduces x = 0.4299 of the 5.4 worked example', () => {
    const baseline = platformBaseline('youtube', workedExampleBaselineSnapshots);
    const signal = platformSignal([workedExampleRunB], { youtube: baseline });
    if (signal === null) assert.fail('expected a signal');
    // v = log10(4) = 0.602, er = 0.5625, ret = 0.125; x is their mean.
    assert.ok(Math.abs(signal - (Math.log10(4) + 0.5625 + 0.125) / 3) < 1e-9);
    assert.ok(Math.abs(signal - 0.4299) < 0.0001);
  });

  it('uses two terms when the snapshot or the baseline lacks the view percent', () => {
    const baseline: PlatformBaseline = { platform: 'youtube', videoCount: 6, medianViews: 1000, medianEngagementRate: 0.04, medianViewPercent: 40 };
    const withoutPercent = snapshot('youtube', { views: 4000, likes: 200, comments: 20, shares: 30 });
    const signal = snapshotSignal(withoutPercent, baseline);
    if (signal === null) assert.fail('expected a signal');
    assert.ok(Math.abs(signal - (Math.log10(4) + 0.5625) / 2) < 1e-9);
  });

  // Every term of `viral` is far above 1 and every term of `flop` far below -1 before clamping.
  const clampBaseline: PlatformBaseline = { platform: 'youtube', videoCount: 6, medianViews: 100_000, medianEngagementRate: 0.04, medianViewPercent: 40 };
  const viral = snapshot('youtube', { views: 1_000_000_000, likes: 900_000_000, averageViewPercent: 400 });
  const flop = snapshot('youtube', { views: 100, averageViewPercent: 0 });

  it('clamps every term to [-1, 1]', () => {
    assert.equal(snapshotSignal(viral, clampBaseline), 1);
    assert.equal(snapshotSignal(flop, clampBaseline), -1);
  });

  it('averages x over the run eligible snapshots in force', () => {
    const ignored = snapshot('youtube', { views: 50, likes: 50 });
    assert.equal(platformSignal([viral, flop, ignored], { youtube: clampBaseline }), 0);
  });
});
