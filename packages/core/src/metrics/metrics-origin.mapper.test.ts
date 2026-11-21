import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { type RunPublication } from '@prisma/client';
import { type MetricImportOrigin, type MetricSnapshot } from '@studio/shared/metrics';
import { MetricsRowCorruptError } from './metrics.errors';
import { toMetricImportOrigin, toMetricSnapshotView, toPublicationView } from './metrics.mapper';

/*
 * Rev 7 fields of the metrics mappers (SPEC 0007 sections 4.1, 4.5 and 5.6; K8): `origin` and
 * `attemptId` are checked by zod because the added columns carry no table CHECK. Rule: `manual`
 * exactly when `attemptId` is null. A row outside the rule is corrupt, named by table and id only.
 */

const PUBLICATION_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const RUN_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1D';
const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1E';
const IMPORT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1F';

function publicationRow(overrides: Partial<RunPublication> = {}): RunPublication {
  return {
    id: PUBLICATION_ID,
    runId: RUN_ID,
    platform: 'youtube',
    platformVideoId: 'T6R2N0B1E00',
    url: 'https://www.youtube.com/watch?v=T6R2N0B1E00',
    publishedOn: '2026-11-20',
    recordedBy: 'owner',
    correlationId: null,
    recordedAt: new Date('2026-11-20T10:00:00.000Z'),
    origin: 'manual',
    attemptId: null,
    platformMediaId: null,
    ...overrides,
  };
}

function snapshot(overrides: Partial<MetricSnapshot> = {}): MetricSnapshot {
  return {
    publicationId: PUBLICATION_ID,
    asOfDate: '2026-11-19',
    source: 'csv',
    importId: IMPORT_ID,
    metrics: {
      views: 500,
      likes: 20,
      comments: 3,
      shares: null,
      saves: null,
      impressions: null,
      reach: null,
      followersGained: null,
      watchTimeSeconds: null,
      averageViewDurationSeconds: null,
      averageViewPercent: null,
    },
    recordedAt: '2026-11-20T10:00:00.000Z',
    ...overrides,
  };
}

function isCorrupt(table: string): (error: unknown) => boolean {
  return (error: unknown) => error instanceof MetricsRowCorruptError && error.table === table && error.id === PUBLICATION_ID;
}

describe('toPublicationView origin and attemptId', () => {
  it('maps a pasted publication as manual with no attempt', () => {
    const view = toPublicationView(publicationRow());
    assert.equal(view.origin, 'manual');
    assert.equal(view.attemptId, null);
    assert.equal('polling' in view, false);
  });

  it('maps studio and mock publications with their attempt id', () => {
    assert.equal(toPublicationView(publicationRow({ origin: 'studio', attemptId: ATTEMPT_ID })).attemptId, ATTEMPT_ID);
    assert.equal(toPublicationView(publicationRow({ origin: 'mock', attemptId: ATTEMPT_ID })).origin, 'mock');
  });

  it('keeps an explicit null polling and leaves polling absent when unknown', () => {
    const view = toPublicationView(publicationRow(), null);
    assert.equal('polling' in view && view.polling === null, true);
  });

  it('refuses an origin outside the enum', () => {
    assert.throws(() => toPublicationView(publicationRow({ origin: 'scraped' })), isCorrupt('run_publications'));
  });

  it('refuses a manual row with an attempt id and a studio or mock row without one', () => {
    assert.throws(() => toPublicationView(publicationRow({ origin: 'manual', attemptId: ATTEMPT_ID })), isCorrupt('run_publications'));
    assert.throws(() => toPublicationView(publicationRow({ origin: 'studio', attemptId: null })), isCorrupt('run_publications'));
    assert.throws(() => toPublicationView(publicationRow({ origin: 'mock', attemptId: null })), isCorrupt('run_publications'));
  });

  it('refuses an attempt id that is not a ULID', () => {
    assert.throws(() => toPublicationView(publicationRow({ origin: 'studio', attemptId: '../attempt' })), isCorrupt('run_publications'));
  });

  it('names only the table and the row id in the corrupt error, never the URL', () => {
    assert.throws(
      () => toPublicationView(publicationRow({ origin: 'scraped' })),
      (error: unknown) => error instanceof Error && !error.message.includes('youtube.com') && error.message.includes(PUBLICATION_ID),
    );
  });
});

describe('import and snapshot origins', () => {
  it('reads upload and api import origins and refuses anything else', () => {
    assert.equal(toMetricImportOrigin({ id: IMPORT_ID, origin: 'upload' }), 'upload');
    assert.equal(toMetricImportOrigin({ id: IMPORT_ID, origin: 'api' }), 'api');
    assert.throws(
      () => toMetricImportOrigin({ id: IMPORT_ID, origin: 'mock' }),
      (error: unknown) => error instanceof MetricsRowCorruptError && error.table === 'metric_imports' && error.id === IMPORT_ID,
    );
  });

  it('derives form, api and csv-upload snapshot origins from the source and the import', () => {
    const origins = new Map<string, MetricImportOrigin>([[IMPORT_ID, 'api']]);
    assert.equal(toMetricSnapshotView(snapshot({ source: 'form', importId: null }), origins).origin, 'form');
    assert.equal(toMetricSnapshotView(snapshot(), origins).origin, 'api');
    const uploads = new Map<string, MetricImportOrigin>([[IMPORT_ID, 'upload']]);
    assert.equal(toMetricSnapshotView(snapshot(), uploads).origin, 'csv-upload');
    assert.equal(toMetricSnapshotView(snapshot(), new Map<string, MetricImportOrigin>()).origin, 'csv-upload');
  });
});
