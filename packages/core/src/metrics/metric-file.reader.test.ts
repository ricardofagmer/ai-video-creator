import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { PlatformMetricsSchema, metricsBounds, provisionalPlatformColumnAliases, type Platform, type PlatformMetrics } from '@studio/shared/metrics';
import { readMetricFile, type MetricFileRead } from './metric-file.reader';

/*
 * SPEC 0006 section 5.3 pure stages end to end (decode, read, map, parse), R3-AC-04 and R3-AC-09.
 * Fixtures are synthetic; header names come from `provisionalPlatformColumnAliases` (Q7: the real
 * header rows are still owed), so these tests follow that file when the aliases are corrected.
 */

const aliases = provisionalPlatformColumnAliases;
const youtubeColumns = aliases.youtube.columns;
const instagramColumns = aliases.instagram.columns;
const tiktokColumns = aliases.tiktok.columns;

function alias(list: readonly string[] | undefined): string {
  const first = list?.[0];
  if (first === undefined) assert.fail('the provisional alias list names this column');
  return first;
}

function csvBytes(lines: readonly (readonly string[])[]): Uint8Array {
  return new TextEncoder().encode(`${lines.map((cells) => cells.join(',')).join('\n')}\n`);
}

function readOrFail(bytes: Uint8Array, platform: Platform): Extract<MetricFileRead, { status: 'read' }> {
  const result = readMetricFile(bytes, platform);
  if (result.status !== 'read') assert.fail(`expected the file to be read, got ${result.refusal}`);
  return result;
}

const youtubeHeader: readonly string[] = [
  alias(aliases.youtube.idColumns),
  'Video title',
  alias(youtubeColumns.views?.aliases),
  alias(youtubeColumns.watchTimeSeconds?.aliases),
  alias(youtubeColumns.averageViewDurationSeconds?.aliases),
  alias(youtubeColumns.averageViewPercent?.aliases),
  alias(youtubeColumns.likes?.aliases),
  alias(youtubeColumns.comments?.aliases),
  alias(youtubeColumns.shares?.aliases),
  alias(youtubeColumns.followersGained?.aliases),
  alias(youtubeColumns.impressions?.aliases),
];

const emptyMetrics: PlatformMetrics = {
  views: 0,
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
};

describe('readMetricFile: profiles map to the one PlatformMetrics shape (R3-AC-04)', () => {
  it('maps a YouTube table export, skipping the Total row', () => {
    const result = readOrFail(
      csvBytes([
        youtubeHeader,
        ['Total', '', '9000', '10', '0:40', '41%', '300', '30', '40', '5', '20000'],
        ['dQw4w9WgXcQ', '"A title, with comma"', '"4,000"', '1.5', '0:45', '45.5%', '200', '20', '30', '3', '12000'],
      ]),
      'youtube',
    );
    assert.equal(result.parsed.dataRows, 1);
    assert.deepEqual(result.parsed.issues, []);
    assert.equal(result.ignoredColumns, 1);
    assert.deepEqual(result.parsed.rows, [
      {
        line: 3,
        platformVideoId: 'dQw4w9WgXcQ',
        metrics: {
          ...emptyMetrics,
          views: 4000,
          watchTimeSeconds: 5400,
          averageViewDurationSeconds: 45,
          averageViewPercent: 45.5,
          likes: 200,
          comments: 20,
          shares: 30,
          followersGained: 3,
          impressions: 12000,
        },
      },
    ]);
  });

  it('maps an Instagram export by the post URL in the permalink column', () => {
    const header = [
      'Post ID',
      alias(aliases.instagram.idColumns),
      'Description',
      alias(instagramColumns.views?.aliases),
      alias(instagramColumns.reach?.aliases),
      alias(instagramColumns.impressions?.aliases),
      alias(instagramColumns.likes?.aliases),
      alias(instagramColumns.comments?.aliases),
      alias(instagramColumns.shares?.aliases),
      alias(instagramColumns.saves?.aliases),
      alias(instagramColumns.followersGained?.aliases),
    ];
    const result = readOrFail(
      csvBytes([header, ['17900000000000001', 'https://www.instagram.com/reel/C0dEfGhIjK1/', 'caption', '1500', '1200', '1800', '90', '12', '7', '15', '4']]),
      'instagram',
    );
    assert.deepEqual(result.parsed.rows, [
      {
        line: 2,
        platformVideoId: 'C0dEfGhIjK1',
        metrics: { ...emptyMetrics, views: 1500, reach: 1200, impressions: 1800, likes: 90, comments: 12, shares: 7, saves: 15, followersGained: 4 },
      },
    ]);
  });

  it('maps a TikTok export by the video link, and accepts a bare numeric id', () => {
    const header = [
      alias(aliases.tiktok.idColumns),
      alias(tiktokColumns.views?.aliases),
      alias(tiktokColumns.likes?.aliases),
      alias(tiktokColumns.comments?.aliases),
      alias(tiktokColumns.shares?.aliases),
    ];
    const result = readOrFail(
      csvBytes([
        header,
        ['https://www.tiktok.com/@creator/video/7212345678901234567', '2500', '150', '9', '11'],
        ['7212345678901234568', '300', '-', '', 'N/A'],
      ]),
      'tiktok',
    );
    assert.deepEqual(result.parsed.rows, [
      { line: 2, platformVideoId: '7212345678901234567', metrics: { ...emptyMetrics, views: 2500, likes: 150, comments: 9, shares: 11 } },
      { line: 3, platformVideoId: '7212345678901234568', metrics: { ...emptyMetrics, views: 300 } },
    ]);
  });

  it('gives a parsed row exactly the PlatformMetrics keys, valid against the shared schema', () => {
    for (const row of readOrFail(csvBytes([youtubeHeader.slice(0, 3), ['dQw4w9WgXcQ', 't', '10']]), 'youtube').parsed.rows) {
      assert.equal(PlatformMetricsSchema.safeParse(row.metrics).success, true);
      assert.deepEqual(Object.keys(row.metrics).sort(), Object.keys(emptyMetrics).sort());
    }
  });

  it('matches header text trimmed and case-insensitively', () => {
    const result = readOrFail(csvBytes([['  content ', 'VIEWS'], ['dQw4w9WgXcQ', '10']]), 'youtube');
    assert.equal(result.parsed.rows[0]?.metrics.views, 10);
  });
});

describe('readMetricFile: refusals write nothing and name their reason (R3-AC-09)', () => {
  it('refuses a file over 2 MiB', () => {
    const big = new Uint8Array(metricsBounds.maxFileBytes + 1).fill(0x61);
    assert.deepEqual(readMetricFile(big, 'youtube'), { status: 'refused', refusal: 'file-too-large' });
  });

  it('refuses over 5,000 rows and over 64 columns', () => {
    const rows = Array.from({ length: metricsBounds.maxRows + 1 }, () => ['dQw4w9WgXcQ', '1']);
    assert.deepEqual(readMetricFile(csvBytes([['Content', 'Views'], ...rows]), 'youtube'), { status: 'refused', refusal: 'too-many-rows' });
    const wide = Array.from({ length: metricsBounds.maxColumns + 1 }, (_, index) => `c${index}`);
    assert.deepEqual(readMetricFile(csvBytes([wide, wide]), 'youtube'), { status: 'refused', refusal: 'too-many-columns' });
  });

  it('refuses non-UTF-8 and a zip', () => {
    assert.deepEqual(readMetricFile(new Uint8Array([0x43, 0xe9, 0x0a, 0x31]), 'youtube'), { status: 'refused', refusal: 'not-utf8' });
    assert.deepEqual(readMetricFile(new Uint8Array([0x50, 0x4b, 0x03, 0x04]), 'youtube'), { status: 'refused', refusal: 'not-csv' });
  });

  it('refuses an empty file', () => {
    assert.deepEqual(readMetricFile(new Uint8Array(0), 'youtube'), { status: 'refused', refusal: 'empty-file' });
  });

  it('refuses a file missing the id column or the views column', () => {
    assert.deepEqual(readMetricFile(csvBytes([['Video title', 'Views'], ['x', '1']]), 'youtube'), {
      status: 'refused',
      refusal: 'required-column-missing',
    });
    assert.deepEqual(readMetricFile(csvBytes([['Content', 'Likes'], ['dQw4w9WgXcQ', '1']]), 'youtube'), {
      status: 'refused',
      refusal: 'required-column-missing',
    });
  });
});

describe('readMetricFile: a bad cell skips its row, reported by line number (R3-AC-09)', () => {
  it('skips each bad row with its issue and keeps the good ones', () => {
    const result = readOrFail(
      csvBytes([
        ['Content', 'Views', 'Likes'],
        ['dQw4w9WgXcQ', '1000', '10'],
        ['aaaaaaaaaaa', '=1+1', '3'],
        ['bbbbbbbbbbb', '2000', 'many'],
        ['', '100', '1'],
        ['too-short', '100', '1'],
        ['ccccccccccc', '', '1'],
        ['ddddddddddd', '-5', '1'],
        ['https://youtu.be/eeeeeeeeeee', '300', '1'],
      ]),
      'youtube',
    );
    assert.deepEqual(result.parsed.issues, [
      { line: 3, issue: 'number-invalid' },
      { line: 4, issue: 'number-invalid' },
      { line: 5, issue: 'id-missing' },
      { line: 6, issue: 'id-invalid' },
      { line: 7, issue: 'views-missing' },
      { line: 8, issue: 'number-invalid' },
    ]);
    assert.deepEqual(
      result.parsed.rows.map((row) => ({ line: row.line, id: row.platformVideoId })),
      [
        { line: 2, id: 'dQw4w9WgXcQ' },
        { line: 9, id: 'eeeeeeeeeee' },
      ],
    );
    assert.equal(result.parsed.dataRows, 8);
  });

  it('refuses a URL of another platform in the id column as id-invalid', () => {
    const result = readOrFail(csvBytes([['Content', 'Views'], ['https://www.instagram.com/reel/C0dEfGhIjK1/', '10']]), 'youtube');
    assert.deepEqual(result.parsed.issues, [{ line: 2, issue: 'id-invalid' }]);
  });

  it('reports a row with a cell over the cell bound as cell-too-long', () => {
    const longTitle = 'x'.repeat(metricsBounds.maxCellChars + 1);
    const result = readOrFail(csvBytes([['Content', 'Video title', 'Views'], ['dQw4w9WgXcQ', longTitle, '10']]), 'youtube');
    assert.deepEqual(result.parsed.issues, [{ line: 2, issue: 'cell-too-long' }]);
    assert.deepEqual(result.parsed.rows, []);
  });

  it('reports the physical line after a quoted multi-line cell', () => {
    const result = readOrFail(csvBytes([['Content', 'Video title', 'Views'], ['dQw4w9WgXcQ', '"two\nlines"', '10'], ['aaaaaaaaaaa', 't', 'bad']]), 'youtube');
    assert.deepEqual(result.parsed.issues, [{ line: 4, issue: 'number-invalid' }]);
  });
});
