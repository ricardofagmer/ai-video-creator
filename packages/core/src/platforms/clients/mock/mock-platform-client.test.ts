import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, open, rm, writeFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { sentinelTokenBundle } from '../../token-fixtures.harness.test';
import { PlatformClientError } from '../platform-client.errors';
import { type MetricTarget, type UploadRequest } from '../platform-client.port';
import { MockPlatformClient } from './mock-platform-client';
import { mockPlatformProfiles } from './mock-profiles';

/*
 * The offline mock client (SPEC 0007 section 5.8; findings S2 and C7, core side): an upload reads
 * the bytes only through the caller's file handle, from position 0, and never by path; metrics stop
 * with `network` once the pass budget's signal is aborted. A throwaway file under os.tmpdir().
 */

const NOW = new Date('2026-11-20T10:00:00.000Z');
const ATTEMPT_ID = '01JD2Q7F3M8V5K9X4T6R2N0B1C';
const VIDEO = Buffer.from('mock final video bytes\n'.repeat(512), 'utf8');

let root: string;
let handle: FileHandle;

function uploadRequest(file: FileHandle, overrides: Partial<UploadRequest> = {}): UploadRequest {
  return {
    attemptId: ATTEMPT_ID,
    file,
    sizeBytes: VIDEO.length,
    sha256: createHash('sha256').update(VIDEO).digest('hex'),
    metadata: { title: 'Tour', caption: '', tags: [], visibility: 'private', aiDisclosure: true },
    tokens: sentinelTokenBundle('youtube'),
    now: NOW,
    onProgress: () => undefined,
    ...overrides,
  };
}

function target(publicationId: string): MetricTarget {
  return { publicationId, platformVideoId: 'AbCdEfGhIjK', platformMediaId: null, dayIndex: 1 };
}

function networkFailure(error: unknown): boolean {
  return error instanceof PlatformClientError && error.reason === 'network' && error.operation === 'metrics';
}

describe('MockPlatformClient upload through the caller handle (S2)', () => {
  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'studio-core-mock-upload-'));
    const filePath = join(root, 'final.mp4');
    await writeFile(filePath, VIDEO);
    handle = await open(filePath, 'r');
  });

  afterEach(async () => {
    await handle.close();
    await rm(root, { recursive: true, force: true });
  });

  it('reads every byte through the handle, reporting progress up to the size', async () => {
    const progress: number[] = [];

    const outcome = await new MockPlatformClient(mockPlatformProfiles.youtube, 'none').upload(
      uploadRequest(handle, { onProgress: (bytesSent) => progress.push(bytesSent) }),
    );

    assert.equal(outcome.state, 'processing');
    assert.equal(progress.at(-1), VIDEO.length);
  });

  it('reads from position 0 even when the handle was already read to its end', async () => {
    await handle.readFile();

    const outcome = await new MockPlatformClient(mockPlatformProfiles.youtube, 'none').upload(uploadRequest(handle));

    assert.equal(outcome.state, 'processing');
  });

  it('rejects as media-rejected when the handle holds fewer bytes than the request says', async () => {
    await assert.rejects(
      new MockPlatformClient(mockPlatformProfiles.youtube, 'none').upload(uploadRequest(handle, { sizeBytes: VIDEO.length + 1 })),
      (error: unknown) => error instanceof PlatformClientError && error.reason === 'media-rejected',
    );
  });

  it('keeps the handle open for the caller to close', async () => {
    await new MockPlatformClient(mockPlatformProfiles.youtube, 'none').upload(uploadRequest(handle));
    const { bytesRead } = await handle.read(Buffer.alloc(4), 0, 4, 0);
    assert.equal(bytesRead, 4);
  });
});

describe('MockPlatformClient metrics and the pass budget signal (C7)', () => {
  it('answers every target while the signal is not aborted', async () => {
    const results = await new MockPlatformClient(mockPlatformProfiles.youtube, 'none').fetchMetrics({
      targets: [target('01JD2Q7F3M8V5K9X4T6R2N0B1D'), target('01JD2Q7F3M8V5K9X4T6R2N0B1E')],
      tokens: sentinelTokenBundle('youtube'),
      now: NOW,
      signal: new AbortController().signal,
    });
    assert.equal(results.length, 2);
  });

  it('rejects with network, returning nothing, once the signal is aborted', async () => {
    const controller = new AbortController();
    controller.abort();

    await assert.rejects(
      new MockPlatformClient(mockPlatformProfiles.youtube, 'none').fetchMetrics({
        targets: [target('01JD2Q7F3M8V5K9X4T6R2N0B1D')],
        tokens: sentinelTokenBundle('youtube'),
        now: NOW,
        signal: controller.signal,
      }),
      networkFailure,
    );
  });
});
