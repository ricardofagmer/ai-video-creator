import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { RunPublicationLineSchema, type RunPublicationLine } from '../run-format/publications';
import { RunFileSchemaError } from './errors';
import { appendRunPublicationLine, readRunPublicationLines } from './log-files';

/*
 * `publications.jsonl` (SPEC 0007 sections 4.3 and 5.5, AC 48, AC 49): append-only, strict, sizes,
 * hashes and refs only; a missing file reads as an empty page.
 */

const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';

function line(overrides: Partial<RunPublicationLine> = {}): RunPublicationLine {
  return {
    at: '2026-11-20T10:00:00.000Z',
    attemptId: ATTEMPT_ID,
    platform: 'youtube',
    mode: 'mock',
    event: 'upload-started',
    sizeBytes: 1024,
    artifactSha256: 'b'.repeat(64),
    visibility: 'private',
    biometricRefs: ['voz-ricardo@3'],
    platformVideoId: null,
    reasonId: null,
    ...overrides,
  };
}

describe('publications.jsonl', () => {
  let runDir: string;

  beforeEach(async () => {
    runDir = await mkdtemp(join(tmpdir(), 'run-publications-'));
  });

  afterEach(async () => {
    await rm(runDir, { recursive: true, force: true });
  });

  it('reads an empty page when the run has no publications file', async () => {
    assert.deepEqual(await readRunPublicationLines(runDir), { entries: [], nextByte: 0, pendingTailBytes: 0 });
  });

  it('appends upload-started then published, mode 600, and reads both in order', async () => {
    const started = line();
    const published = line({ event: 'published', at: '2026-11-20T10:05:00.000Z', platformVideoId: 'N0B1C123456' });

    await appendRunPublicationLine(runDir, started);
    await appendRunPublicationLine(runDir, published);

    const page = await readRunPublicationLines(runDir);
    assert.deepEqual(page.entries, [started, published]);
    assert.equal(page.pendingTailBytes, 0);
    const filePath = join(runDir, 'publications.jsonl');
    assert.equal(page.nextByte, (await stat(filePath)).size);
    assert.equal((await stat(filePath)).mode & 0o777, 0o600);
  });

  it('continues from nextByte with only the new lines', async () => {
    await appendRunPublicationLine(runDir, line());
    const first = await readRunPublicationLines(runDir);
    await appendRunPublicationLine(runDir, line({ event: 'failed', reasonId: 'network' }));

    const second = await readRunPublicationLines(runDir, first.nextByte);
    assert.deepEqual(second.entries, [line({ event: 'failed', reasonId: 'network' })]);
  });

  it('refuses a line that breaks the rules and writes nothing', async () => {
    await assert.rejects(appendRunPublicationLine(runDir, line({ event: 'failed' })), RunFileSchemaError);
    await assert.rejects(appendRunPublicationLine(runDir, line({ event: 'published' })), RunFileSchemaError);
    await assert.rejects(appendRunPublicationLine(runDir, line({ reasonId: 'network' })), RunFileSchemaError);
    await assert.rejects(appendRunPublicationLine(runDir, line({ sizeBytes: 0 })), RunFileSchemaError);
    await assert.rejects(appendRunPublicationLine(runDir, line({ biometricRefs: ['/Users/x/voz.wav'] })), RunFileSchemaError);
    await assert.rejects(readFile(join(runDir, 'publications.jsonl')), { code: 'ENOENT' });
  });

  it('carries no field for a title, caption, tag, URL or account label', () => {
    const extra = { ...line(), title: 'Tour do produto' };
    assert.equal(RunPublicationLineSchema.safeParse(extra).success, false);
    assert.equal(RunPublicationLineSchema.safeParse({ ...line(), url: 'https://www.youtube.com/watch?v=x' }).success, false);
  });

  it('refuses a relative run folder', async () => {
    await assert.rejects(appendRunPublicationLine('relative-run', line()));
  });
});
