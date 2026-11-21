import assert from 'node:assert/strict';
import { type Mode, type PathLike } from 'node:fs';
import fsPromises, { mkdtemp, realpath, rm, symlink, writeFile, type FileHandle } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { PlatformClientError } from '@studio/core/platforms';
import { openVerifiedVideo } from './final-video.handle';
import { queuePublishRequest, sha256Of } from './platform-fixtures.harness.test';
import { createPlatformHarness, prepareRun, stateOf, type PlatformHarness } from './platform-step.harness.test';

/*
 * `final.mp4` is opened once, O_NOFOLLOW, checked by fstat and hashed from that same handle, and the
 * upload reads the bytes through it (SPEC 0007 section 5.5 re-check 4, finding S2). To see which
 * handles were opened and whether they were closed, `fs.promises.open` is wrapped by a recorder
 * that calls the real function and keeps each handle; a closed `FileHandle` reports `fd` -1.
 */

interface OpenedFile {
  path: string;
  handle: FileHandle;
}

const realOpen = fsPromises.open;

/** Records every handle `fs.promises.open` returns from now until `mock.restoreAll()`. */
function recordOpenedFiles(): OpenedFile[] {
  const opened: OpenedFile[] = [];
  const recorder = mock.method(fsPromises, 'open', async (path: PathLike, flags?: string | number, mode?: Mode): Promise<FileHandle> => {
    const handle = await realOpen(path, flags, mode);
    opened.push({ path: String(path), handle });
    return handle;
  });
  assert.equal(fsPromises.open, recorder, 'fs.promises.open is the recorder');
  return opened;
}

const VIDEO = Buffer.alloc(4096, 7);
const VIDEO_SHA256 = sha256Of(VIDEO);

describe('openVerifiedVideo (finding S2)', () => {
  let folder: string;
  let videoPath: string;

  beforeEach(async () => {
    folder = await mkdtemp(join(tmpdir(), 'watcher-final-video-'));
    videoPath = join(folder, 'final.mp4');
    await writeFile(videoPath, VIDEO);
  });

  afterEach(async () => {
    mock.restoreAll();
    await rm(folder, { recursive: true, force: true });
  });

  it('opens a regular file of the expected size and hash, with the hash taken from the handle and the position left at byte 0', async () => {
    const opened = await openVerifiedVideo(videoPath, { sizeBytes: VIDEO.length, sha256: VIDEO_SHA256 });

    assert.ok(opened.status === 'opened');
    try {
      assert.equal(opened.sha256, VIDEO_SHA256);
      const head = Buffer.alloc(16);
      const { bytesRead } = await opened.file.read(head, 0, head.length, null);
      assert.equal(bytesRead, head.length);
      assert.deepEqual(head, VIDEO.subarray(0, head.length));
    } finally {
      await opened.file.close();
    }
  });

  it('refuses a symlink at final.mp4 as changed, even one pointing at identical bytes', async () => {
    const target = join(folder, 'elsewhere.mp4');
    await writeFile(target, VIDEO);
    await rm(videoPath);
    await symlink(target, videoPath);

    assert.deepEqual(await openVerifiedVideo(videoPath, { sizeBytes: VIDEO.length, sha256: VIDEO_SHA256 }), { status: 'changed' });
  });

  it('refuses a file whose size differs from the request as changed', async () => {
    assert.deepEqual(await openVerifiedVideo(videoPath, { sizeBytes: VIDEO.length - 1, sha256: VIDEO_SHA256 }), { status: 'changed' });
  });

  it('refuses a file of the right size whose hash differs as changed', async () => {
    const otherHash = sha256Of(Buffer.alloc(VIDEO.length, 9));

    assert.deepEqual(await openVerifiedVideo(videoPath, { sizeBytes: VIDEO.length, sha256: otherHash }), { status: 'changed' });
  });

  it('answers missing when final.mp4 is gone', async () => {
    await rm(videoPath);

    assert.deepEqual(await openVerifiedVideo(videoPath, { sizeBytes: VIDEO.length, sha256: VIDEO_SHA256 }), { status: 'missing' });
  });

  it('closes the handle it opened when it refuses on size or on hash', async () => {
    const opened = recordOpenedFiles();

    await openVerifiedVideo(videoPath, { sizeBytes: VIDEO.length + 1, sha256: VIDEO_SHA256 });
    await openVerifiedVideo(videoPath, { sizeBytes: VIDEO.length, sha256: sha256Of(Buffer.alloc(VIDEO.length, 9)) });

    assert.equal(opened.length, 2, 'one open per check');
    assert.deepEqual(
      opened.map((file) => file.handle.fd),
      [-1, -1],
    );
  });
});

describe('PublishStep sends the verified handle (finding S2)', () => {
  let harness: PlatformHarness;

  beforeEach(async () => {
    harness = await createPlatformHarness();
  });

  afterEach(async () => {
    mock.restoreAll();
    await harness.close();
  });

  async function queueYoutubeRequest(): Promise<{ realVideoPath: string; sha256: string; attemptId: string }> {
    const { connectionId, run } = await prepareRun(harness, 'youtube');
    const request = await queuePublishRequest(harness.platformRoot, { run, platform: 'youtube', connectionId, at: harness.clock.now() });
    return { realVideoPath: await realpath(run.videoPath), sha256: run.sha256, attemptId: request.attemptId };
  }

  it('opens final.mp4 once and gives the client that handle and its hash, then closes it after the upload', async () => {
    const queued = await queueYoutubeRequest();
    const opened = recordOpenedFiles();

    assert.equal(await harness.publish.claimNext(), true);

    const videoHandles = opened.filter((file) => file.path === queued.realVideoPath).map((file) => file.handle);
    assert.equal(videoHandles.length, 1, 'final.mp4 is opened exactly once');
    const sent = harness.clients.youtube.uploadRequests[0];
    assert.equal(sent?.file, videoHandles[0], 'the client reads the handle the hash was taken from');
    assert.equal(sent?.sha256, queued.sha256);
    assert.equal(sha256Of(harness.clients.youtube.uploadedBytes[0] ?? Buffer.alloc(0)), queued.sha256, 'the bytes sent are the bytes hashed');
    assert.equal(sent?.file.fd, -1, 'closed after the upload');
    assert.equal((await stateOf(harness, queued.attemptId))?.state, 'published');
  });

  it('closes the verified handle when the upload never starts because the token refresh failed', async () => {
    const queued = await queueYoutubeRequest();
    harness.clients.youtube.refreshFailures.push(new PlatformClientError('youtube', 'refresh', 'platform-unavailable'));
    const opened = recordOpenedFiles();

    assert.equal(await harness.publish.claimNext(), true);

    const videoHandles = opened.filter((file) => file.path === queued.realVideoPath).map((file) => file.handle);
    assert.equal(videoHandles.length, 1);
    assert.equal(videoHandles[0]?.fd, -1);
    assert.equal(harness.clients.youtube.calls.upload, 0);
    assert.equal((await stateOf(harness, queued.attemptId))?.state, 'failed');
  });

  it('closes the verified handle when the upload throws', async () => {
    const queued = await queueYoutubeRequest();
    harness.clients.youtube.uploadFailure = new PlatformClientError('youtube', 'upload', 'media-rejected');
    const opened = recordOpenedFiles();

    await harness.publish.claimNext();

    const videoHandles = opened.filter((file) => file.path === queued.realVideoPath).map((file) => file.handle);
    assert.equal(videoHandles.length, 1);
    assert.equal(videoHandles[0]?.fd, -1);
    assert.equal(harness.clients.youtube.calls.upload, 1);
  });
});
