import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type MetricSnapshot, type PlatformMetrics, type Publication } from '@studio/shared/metrics';
import { readMetricFile } from './metric-file.reader';
import { planMetricImport, type MetricImportPlan } from './metric-import.planner';
import { type ParsedMetricRow } from './metric-rows.parser';

/*
 * SPEC 0006 section 5.3 plan stage and idempotency, R3-AC-08. `InMemorySnapshotStore` stands in
 * for `platform_metric_snapshots`, keyed `(publicationId, asOfDate, 'csv')` like the upsert of
 * `ImportMetricsHandler`; no Prisma and no SQLite are involved.
 */

type PublicationKey = Pick<Publication, 'publicationId' | 'platformVideoId'>;
type StoredSnapshot = Pick<MetricSnapshot, 'publicationId' | 'metrics'>;

class InMemorySnapshotStore {
  private readonly rows = new Map<string, PlatformMetrics>();
  writeCount = 0;

  private static keyOf(publicationId: string, asOfDate: string): string {
    return `${publicationId}|${asOfDate}|csv`;
  }

  /** What `MetricSnapshotRepository.findCsvOn` answers: the day's `csv` snapshots of the publications. */
  findCsvOn(publicationIds: readonly string[], asOfDate: string): StoredSnapshot[] {
    return publicationIds.flatMap((publicationId) => {
      const metrics = this.rows.get(InMemorySnapshotStore.keyOf(publicationId, asOfDate));
      return metrics === undefined ? [] : [{ publicationId, metrics: { ...metrics } }];
    });
  }

  /** Applies a plan's writes the way the handler's transaction does. */
  apply(plan: MetricImportPlan, asOfDate: string): void {
    for (const write of plan.writes) {
      this.rows.set(InMemorySnapshotStore.keyOf(write.publicationId, asOfDate), { ...write.metrics });
      this.writeCount += 1;
    }
  }

  snapshot(): ReadonlyMap<string, PlatformMetrics> {
    return new Map(this.rows);
  }
}

const publicationA = '01JDA0000000000000000000AA';
const publicationB = '01JDA0000000000000000000BB';

const publications: readonly PublicationKey[] = [
  { publicationId: publicationA, platformVideoId: 'dQw4w9WgXcQ' },
  { publicationId: publicationB, platformVideoId: 'aaaaaaaaaaa' },
];

function youtubeFile(rows: readonly (readonly [string, string, string])[]): Uint8Array {
  const lines = [['Content', 'Views', 'Likes'], ...rows].map((cells) => cells.join(','));
  return new TextEncoder().encode(`${lines.join('\n')}\n`);
}

function parsedRows(bytes: Uint8Array): ParsedMetricRow[] {
  const read = readMetricFile(bytes, 'youtube');
  if (read.status !== 'read') assert.fail(`expected the fixture to be read, got ${read.refusal}`);
  return read.parsed.rows;
}

function planAgainst(store: InMemorySnapshotStore, rows: readonly ParsedMetricRow[], asOfDate: string): MetricImportPlan {
  return planMetricImport(rows, publications, store.findCsvOn(publications.map((publication) => publication.publicationId), asOfDate));
}

const fileBytes = youtubeFile([
  ['dQw4w9WgXcQ', '1000', '10'],
  ['aaaaaaaaaaa', '2000', '20'],
  ['zzzzzzzzzzz', '300', '3'],
]);

describe('planMetricImport', () => {
  it('creates a snapshot for each matched row and lists unmatched ids', () => {
    const plan = planAgainst(new InMemorySnapshotStore(), parsedRows(fileBytes), '2026-11-18');
    assert.equal(plan.matched, 2);
    assert.equal(plan.created, 2);
    assert.equal(plan.updated, 0);
    assert.equal(plan.unchanged, 0);
    assert.deepEqual(plan.unmatchedIds, ['zzzzzzzzzzz']);
    assert.deepEqual(
      plan.writes.map((write) => ({ kind: write.kind, publicationId: write.publicationId, views: write.metrics.views })),
      [
        { kind: 'created', publicationId: publicationA, views: 1000 },
        { kind: 'created', publicationId: publicationB, views: 2000 },
      ],
    );
  });

  it('the same file twice with the same asOfDate reports created 0, updated 0 and writes nothing', () => {
    const store = new InMemorySnapshotStore();
    const first = planAgainst(store, parsedRows(fileBytes), '2026-11-18');
    store.apply(first, '2026-11-18');
    const afterFirst = store.snapshot();
    const writesAfterFirst = store.writeCount;

    const second = planAgainst(store, parsedRows(fileBytes), '2026-11-18');
    assert.equal(second.created, 0);
    assert.equal(second.updated, 0);
    assert.equal(second.unchanged, second.matched);
    assert.equal(second.matched, 2);
    assert.deepEqual(second.writes, []);
    store.apply(second, '2026-11-18');
    assert.equal(store.writeCount, writesAfterFirst);
    assert.deepEqual(store.snapshot(), afterFirst);
  });

  it('the same file for another asOfDate creates new snapshots', () => {
    const store = new InMemorySnapshotStore();
    store.apply(planAgainst(store, parsedRows(fileBytes), '2026-11-18'), '2026-11-18');
    const nextDay = planAgainst(store, parsedRows(fileBytes), '2026-11-19');
    assert.equal(nextDay.created, 2);
    assert.equal(nextDay.unchanged, 0);
  });

  it('a changed number on the same day is updated, the rest unchanged', () => {
    const store = new InMemorySnapshotStore();
    store.apply(planAgainst(store, parsedRows(fileBytes), '2026-11-18'), '2026-11-18');
    const changed = youtubeFile([
      ['dQw4w9WgXcQ', '1500', '10'],
      ['aaaaaaaaaaa', '2000', '20'],
    ]);
    const plan = planAgainst(store, parsedRows(changed), '2026-11-18');
    assert.equal(plan.updated, 1);
    assert.equal(plan.unchanged, 1);
    assert.equal(plan.created, 0);
    assert.deepEqual(
      plan.writes.map((write) => ({ kind: write.kind, publicationId: write.publicationId, views: write.metrics.views })),
      [{ kind: 'updated', publicationId: publicationA, views: 1500 }],
    );
  });

  it('a dry run plans without applying, so the store is untouched and a later import still creates', () => {
    const store = new InMemorySnapshotStore();
    const existing = store.findCsvOn([publicationA, publicationB], '2026-11-18');
    const dryRunPlan = planMetricImport(Object.freeze(parsedRows(fileBytes)), Object.freeze([...publications]), Object.freeze(existing));
    assert.equal(dryRunPlan.created, 2);
    assert.equal(store.writeCount, 0);
    assert.equal(store.snapshot().size, 0);
    assert.equal(planAgainst(store, parsedRows(fileBytes), '2026-11-18').created, 2);
  });

  it('does not mutate the rows, publications or existing snapshots it is given', () => {
    const store = new InMemorySnapshotStore();
    store.apply(planAgainst(store, parsedRows(fileBytes), '2026-11-18'), '2026-11-18');
    const rows = parsedRows(youtubeFile([['dQw4w9WgXcQ', '9999', '1']]));
    const existing = store.findCsvOn([publicationA, publicationB], '2026-11-18');
    const before = JSON.stringify({ rows, publications, existing });
    planMetricImport(rows, publications, existing);
    assert.equal(JSON.stringify({ rows, publications, existing }), before);
  });

  it('keeps the first row of a repeated id and marks the rest duplicate-row by line', () => {
    const rows = parsedRows(
      youtubeFile([
        ['dQw4w9WgXcQ', '1000', '10'],
        ['dQw4w9WgXcQ', '5000', '50'],
        ['zzzzzzzzzzz', '1', '1'],
        ['zzzzzzzzzzz', '2', '2'],
      ]),
    );
    const plan = planAgainst(new InMemorySnapshotStore(), rows, '2026-11-18');
    assert.deepEqual(plan.duplicateIssues, [
      { line: 3, issue: 'duplicate-row' },
      { line: 5, issue: 'duplicate-row' },
    ]);
    assert.equal(plan.writes[0]?.metrics.views, 1000);
    assert.deepEqual(plan.unmatchedIds, ['zzzzzzzzzzz']);
  });

  it('matches only by platform video id, never by numbers', () => {
    const rows = parsedRows(youtubeFile([['bbbbbbbbbbb', '1000', '10']]));
    const plan = planAgainst(new InMemorySnapshotStore(), rows, '2026-11-18');
    assert.equal(plan.matched, 0);
    assert.deepEqual(plan.unmatchedIds, ['bbbbbbbbbbb']);
  });
});
