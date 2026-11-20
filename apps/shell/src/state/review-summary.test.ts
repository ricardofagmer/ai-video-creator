import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { RunFileSchema, type RunFile, type RunState } from '@studio/shared/run-format';
import { createTempDataHome, type TempDataHome } from '../test-support/temp-data-home';
import { MAX_RUN_FILE_BYTES, ReviewCounter } from './review-summary';

/*
 * R3-AC-25.4 (runs at review): runs at `review` are counted, every other status is not, and an
 * unreadable run.json is skipped and counted. Run files start from the watcher fixture, read only.
 */

const FIXTURE_RUN = resolve(__dirname, '../../../watcher/fixtures/product-tour-16x9/run.json');
const SINCE = '2026-11-19T12:00:00.000Z';
const RUN_IDS = {
  reviewA: '01JD2Q7F3M8V5K9X4T6R2N0C1A',
  reviewB: '01JD2Q7F3M8V5K9X4T6R2N0C1B',
  pending: '01JD2Q7F3M8V5K9X4T6R2N0C1C',
  paused: '01JD2Q7F3M8V5K9X4T6R2N0C1D',
  approved: '01JD2Q7F3M8V5K9X4T6R2N0C1E',
  broken: '01JD2Q7F3M8V5K9X4T6R2N0C1F',
  oversized: '01JD2Q7F3M8V5K9X4T6R2N0C1G',
} as const;

function runWith(fixture: RunFile, runId: string, state: RunState): string {
  return JSON.stringify(RunFileSchema.parse({ ...fixture, runId, state }));
}

describe('runs at review (R3-AC-25.4)', () => {
  let home: TempDataHome;
  let fixture: RunFile;

  beforeEach(async () => {
    home = await createTempDataHome();
    fixture = RunFileSchema.parse(JSON.parse(await readFile(FIXTURE_RUN, 'utf8')));
  });

  afterEach(async () => {
    await home.cleanup();
  });

  async function writeRun(runId: string, content: string): Promise<void> {
    await home.write(join('runs', runId, 'run.json'), content);
  }

  it('counts review runs only and skips and counts an unreadable run.json', async () => {
    await writeRun(RUN_IDS.reviewA, runWith(fixture, RUN_IDS.reviewA, { status: 'review', since: SINCE }));
    await writeRun(RUN_IDS.reviewB, runWith(fixture, RUN_IDS.reviewB, { status: 'review', since: SINCE }));
    await writeRun(RUN_IDS.pending, runWith(fixture, RUN_IDS.pending, { status: 'pending', since: SINCE }));
    await writeRun(RUN_IDS.paused, runWith(fixture, RUN_IDS.paused, { status: 'paused', since: SINCE }));
    await writeRun(RUN_IDS.approved, runWith(fixture, RUN_IDS.approved, { status: 'approved', since: SINCE, decidedBy: 'owner' }));
    await writeRun(RUN_IDS.broken, '{"format":1,"runId":');
    // A folder that is not named by a ULID is not a run folder.
    await home.write(join('runs', 'not-a-run', 'run.json'), runWith(fixture, RUN_IDS.reviewA, { status: 'review', since: SINCE }));
    const summary = await new ReviewCounter(home.paths.runs).count();
    assert.deepEqual(summary, { status: 'ok', count: 2, skipped: 1, truncated: false });
  });

  it('skips and counts a run.json over the size bound', async () => {
    await writeRun(RUN_IDS.reviewA, runWith(fixture, RUN_IDS.reviewA, { status: 'review', since: SINCE }));
    await writeRun(RUN_IDS.oversized, `${runWith(fixture, RUN_IDS.oversized, { status: 'review', since: SINCE })}${' '.repeat(MAX_RUN_FILE_BYTES)}`);
    assert.deepEqual(await new ReviewCounter(home.paths.runs).count(), { status: 'ok', count: 1, skipped: 1, truncated: false });
  });

  it('follows a run that leaves review between scans', async () => {
    const counter = new ReviewCounter(home.paths.runs);
    await writeRun(RUN_IDS.reviewA, runWith(fixture, RUN_IDS.reviewA, { status: 'review', since: SINCE }));
    assert.deepEqual(await counter.count(), { status: 'ok', count: 1, skipped: 0, truncated: false });
    await writeRun(RUN_IDS.reviewA, runWith(fixture, RUN_IDS.reviewA, { status: 'approved', since: SINCE, decidedBy: 'owner' }));
    assert.deepEqual(await counter.count(), { status: 'ok', count: 0, skipped: 0, truncated: false });
  });

  it('counts zero when there are no runs', async () => {
    assert.deepEqual(await new ReviewCounter(home.paths.runs).count(), { status: 'ok', count: 0, skipped: 0, truncated: false });
  });
});
