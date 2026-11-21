import 'reflect-metadata';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type CurationEvent, type CurationFile } from '@studio/shared/curation';
import { type CurationLocation } from '@studio/shared/curation/files';
import { type Clock } from '../engine/clock';
import { ClaimedCuration, CurationAlreadyEndedError } from './claimed-curation';
import { CurationEventRecorder } from './curation-event.recorder';

/*
 * A failed `curation.ended` append (baseline review): `end()` wrote the terminal curation.json and
 * then the event append threw. Before the fix, every retry of `end()` raised
 * CurationAlreadyEndedError and the event was never written. Now the retry appends only the owed
 * event, and an ending after that one is still refused. Files live under a temp `curations/` root.
 */

const CURATION_ID = '01JD3A00000000000000000000';
const CLAIMED_AT = '2026-11-21T10:00:00.000Z';
const clock: Clock = { now: () => new Date('2026-11-21T10:05:00.000Z') };

class FlakyRecorder extends CurationEventRecorder {
  readonly recorded: CurationEvent[] = [];
  private failuresLeft: number;

  constructor(failures: number) {
    super();
    this.failuresLeft = failures;
  }

  override async record(_location: CurationLocation, event: CurationEvent): Promise<void> {
    if (this.failuresLeft > 0) {
      this.failuresLeft -= 1;
      throw new Error('event append failed');
    }
    this.recorded.push(event);
  }
}

function collectingFile(): CurationFile {
  return {
    format: 1,
    curationId: CURATION_ID,
    status: 'collecting',
    subject: { kind: 'recipe', ref: 'demo-recipe@1' },
    correlationId: 'curation-test',
    requestedAt: '2026-11-21T09:59:00.000Z',
    claim: { pid: 4242, claimedAt: CLAIMED_AT },
    attempts: 0,
    spentUsd: 0,
    sessionIds: [],
    updatedAt: CLAIMED_AT,
  };
}

let base: string;
let location: CurationLocation;

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'claimed-curation-'));
  const curationsRoot = join(base, 'curations');
  await mkdir(join(curationsRoot, CURATION_ID), { recursive: true });
  location = { curationsRoot, curationId: CURATION_ID };
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

describe('ClaimedCuration.end after a failed curation.ended append', () => {
  it('appends only the owed event on retry, then refuses a further ending', async () => {
    const events = new FlakyRecorder(1);
    const curation = new ClaimedCuration({ location, file: collectingFile(), events, clock, claimedAtMs: Date.parse(CLAIMED_AT) });

    await assert.rejects(curation.end({ status: 'failed', reasonId: 'provider-error' }), /event append failed/);
    const written = JSON.parse(await readFile(join(location.curationsRoot, CURATION_ID, 'curation.json'), 'utf8'));
    assert.equal(written.status, 'failed');
    assert.equal(events.recorded.length, 0);

    // The retry may carry another ending; the one on disk is the one recorded.
    await curation.end({ status: 'failed', reasonId: 'curation-timeout' });
    assert.equal(events.recorded.length, 1);
    const [ended] = events.recorded;
    assert.equal(ended?.type, 'curation.ended');
    if (ended?.type !== 'curation.ended') return;
    assert.equal(ended.status, 'failed');
    assert.equal(ended.reasonId, 'provider-error');
    assert.equal(ended.durationMs, 300_000);

    await assert.rejects(curation.end({ status: 'failed', reasonId: 'provider-error' }), CurationAlreadyEndedError);
    assert.equal(events.recorded.length, 1);
  });

  it('refuses a second ending once the event was appended the first time', async () => {
    const events = new FlakyRecorder(0);
    const curation = new ClaimedCuration({ location, file: collectingFile(), events, clock, claimedAtMs: Date.parse(CLAIMED_AT) });
    await curation.end({ status: 'failed', reasonId: 'provider-error' });
    await assert.rejects(curation.end({ status: 'failed', reasonId: 'provider-error' }), CurationAlreadyEndedError);
    assert.equal(events.recorded.length, 1);
  });
});
