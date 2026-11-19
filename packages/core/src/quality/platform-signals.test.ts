import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type MetricSource, type PlatformMetrics } from '@studio/shared/metrics';
import { platformBaselines, runPlatformSignals, snapshotsInForce, type PlatformSnapshotFact } from './platform-signals';

/*
 * SPEC 0006 section 5.4 on stored facts, R3-AC-06: with fewer than 5 eligible videos on a platform
 * no run gets a platform signal, so no `qualityScore` moves; the snapshot in force is the latest
 * `asOfDate`, `form` over `csv` on a tie.
 */

function metrics(views: number, likes: number): PlatformMetrics {
  return {
    views,
    likes,
    comments: null,
    shares: null,
    saves: null,
    impressions: null,
    reach: null,
    followersGained: null,
    watchTimeSeconds: null,
    averageViewDurationSeconds: null,
    averageViewPercent: null,
  };
}

function fact(values: { runId: string; publicationId: string; views: number; asOfDate?: string; source?: MetricSource }): PlatformSnapshotFact {
  return {
    runId: values.runId,
    publicationId: values.publicationId,
    platform: 'youtube',
    asOfDate: values.asOfDate ?? '2026-11-18',
    source: values.source ?? 'csv',
    metrics: metrics(values.views, Math.round(values.views / 20)),
  };
}

function videos(count: number): PlatformSnapshotFact[] {
  return Array.from({ length: count }, (_, index) => fact({ runId: `run-${index}`, publicationId: `pub-${index}`, views: 1000 * (index + 1) }));
}

describe('runPlatformSignals', () => {
  it('gives no run a signal with 4 eligible videos (the fifth has 99 views)', () => {
    const facts = [...videos(4), fact({ runId: 'run-x', publicationId: 'pub-x', views: 99 })];
    assert.equal(platformBaselines(snapshotsInForce(facts)).youtube, null);
    assert.equal(runPlatformSignals(facts).size, 0);
  });

  it('gives eligible runs a signal from the fifth eligible video on', () => {
    const signals = runPlatformSignals(videos(5));
    assert.equal(signals.size, 5);
    for (const signal of signals.values()) assert.ok(signal >= -1 && signal <= 1);
  });

  it('counts one snapshot in force per publication, not every stored snapshot', () => {
    const history = [1, 2, 3, 4, 5].map((day) => fact({ runId: 'run-0', publicationId: 'pub-0', views: 500 * day, asOfDate: `2026-11-1${day}` }));
    const facts = [...history, ...videos(4).slice(1)];
    assert.equal(snapshotsInForce(facts).length, 4);
    assert.equal(runPlatformSignals(facts).size, 0);
  });

  it('keeps the latest asOfDate in force, and form over csv on the same day', () => {
    const inForce = snapshotsInForce([
      fact({ runId: 'run-0', publicationId: 'pub-0', views: 100, asOfDate: '2026-11-10' }),
      fact({ runId: 'run-0', publicationId: 'pub-0', views: 300, asOfDate: '2026-11-12', source: 'csv' }),
      fact({ runId: 'run-0', publicationId: 'pub-0', views: 400, asOfDate: '2026-11-12', source: 'form' }),
      fact({ runId: 'run-0', publicationId: 'pub-0', views: 200, asOfDate: '2026-11-11', source: 'form' }),
    ]);
    assert.equal(inForce.length, 1);
    assert.equal(inForce[0]?.metrics.views, 400);
  });
});
