import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { DataHome } from '../paths/data-home';
import { AssetStoreIoError, UnsafePathError } from './asset-store.errors';
import { ContentStore } from './content-store';
import { ContentVerifier } from './content-verifier';
import { listFolderFiles } from './folder-walk';
import { hashFile, hashRegularFile } from './hashing';
import { assertSafeSourcePath } from './path-guards';
import { ReferenceInspector } from './reference-inspector';
import { openRegularFile } from './regular-file';

/*
 * Baseline review L1 (lstat/open race) and L3 (raw Node errors carry absolute paths). Everything
 * lives under a fresh temporary folder; permission cases are skipped when running as root, which
 * reads any file.
 */

const MAX_BYTES = 1024 * 1024;
const runsAsRoot = process.getuid?.() === 0;

async function expectUnsafe(action: Promise<unknown>): Promise<void> {
  await assert.rejects(action, (error: unknown) => error instanceof UnsafePathError && error.reason === 'not-a-file');
}

async function expectPathFreeIoError(action: Promise<unknown>, code: string, secretFragment: string): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof AssetStoreIoError, `expected AssetStoreIoError, got ${String(error)}`);
    assert.equal(error.code, code);
    assert.ok(!error.message.includes(secretFragment), 'message must not name the path');
    assert.equal(error.cause, undefined);
    assert.ok(!('path' in error), 'no path field');
    return true;
  });
}

describe('checked open (L1)', () => {
  let root: string;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'studio-regular-file-')));
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('opens a regular file and reads from the checked handle', async () => {
    const file = join(root, 'plain.txt');
    await writeFile(file, 'hello');
    const handle = await openRegularFile(file);
    try {
      assert.equal(await handle.readFile({ encoding: 'utf8' }), 'hello');
    } finally {
      await handle.close();
    }
  });

  it('refuses a symlink instead of following it', async () => {
    await writeFile(join(root, 'target.txt'), 'target');
    await symlink(join(root, 'target.txt'), join(root, 'link.txt'));
    await expectUnsafe(openRegularFile(join(root, 'link.txt')));
  });

  it('refuses a folder entry replaced after the walk (different inode)', async () => {
    const folder = join(root, 'folder');
    await mkdir(folder);
    await writeFile(join(folder, 'a.txt'), 'original');
    const [listed] = await listFolderFiles(folder);
    assert.ok(listed !== undefined);
    await rm(listed.absolutePath);
    await writeFile(listed.absolutePath, 'swapped in after the lstat');

    await expectUnsafe(openRegularFile(listed.absolutePath, listed.identity));
    await expectUnsafe(hashRegularFile(listed.absolutePath, { maxBytes: MAX_BYTES }, listed.identity));
  });

  it('refuses a folder entry turned into a symlink after the walk', async () => {
    const folder = join(root, 'folder');
    await mkdir(folder);
    await writeFile(join(folder, 'a.txt'), 'original');
    await writeFile(join(root, 'elsewhere.txt'), 'outside the folder');
    const [listed] = await listFolderFiles(folder);
    assert.ok(listed !== undefined);
    await rm(listed.absolutePath);
    await symlink(join(root, 'elsewhere.txt'), listed.absolutePath);

    await expectUnsafe(openRegularFile(listed.absolutePath, listed.identity));
  });

  it('copies a folder into the store from the walked files', async () => {
    const folder = join(root, 'folder');
    await mkdir(folder);
    await writeFile(join(folder, 'a.txt'), 'alpha');
    const store = new ContentStore(new DataHome(join(root, 'home')));
    const stored = await store.putFolder(folder, { maxTotalBytes: MAX_BYTES });
    assert.deepEqual(
      stored.manifest.files.map((file) => file.path),
      ['a.txt'],
    );
  });
});

describe('typed, path-free file-system errors (L3)', { skip: runsAsRoot }, () => {
  let root: string;
  const locked: string[] = [];

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'studio-io-errors-')));
  });

  afterEach(async () => {
    for (const path of locked.splice(0)) await chmod(path, 0o700);
    await rm(root, { recursive: true, force: true });
  });

  async function lock(path: string): Promise<void> {
    await chmod(path, 0o000);
    locked.push(path);
  }

  it('hashFile: an unreadable file is AssetStoreIoError(EACCES) without the path', async () => {
    const file = join(root, 'fake-voice-sample.wav');
    await writeFile(file, 'bytes');
    await lock(file);
    await expectPathFreeIoError(hashFile(file, { maxBytes: MAX_BYTES }), 'EACCES', 'fake-voice-sample');
  });

  it('listFolderFiles: an unreadable folder is AssetStoreIoError(EACCES) without the path', async () => {
    const folder = join(root, 'fake-clone-folder');
    await mkdir(folder);
    await lock(folder);
    await expectPathFreeIoError(listFolderFiles(folder), 'EACCES', 'fake-clone-folder');
  });

  it('listFolderFiles: a missing folder keeps code ENOENT, category not_found, no path', async () => {
    await assert.rejects(listFolderFiles(join(root, 'fake-missing-folder')), (error: unknown) => {
      assert.ok(error instanceof AssetStoreIoError);
      assert.equal(error.code, 'ENOENT');
      assert.equal(error.category, 'not_found');
      assert.ok(!error.message.includes('fake-missing-folder'));
      return true;
    });
  });

  it('assertSafeSourcePath: a realpath EACCES is typed and path-free', async () => {
    const parent = join(root, 'fake-locked-parent');
    await mkdir(parent);
    await writeFile(join(parent, 'inner.txt'), 'x');
    await lock(parent);
    await expectPathFreeIoError(assertSafeSourcePath(join(parent, 'inner.txt'), join(root, 'store')), 'EACCES', 'fake-locked-parent');
  });

  it('ContentVerifier.rehashReference: EACCES is rethrown typed, not raw', async () => {
    const dataHome = new DataHome(join(root, 'home'));
    const verifier = new ContentVerifier(new ContentStore(dataHome), new ReferenceInspector(dataHome));
    const file = join(root, 'fake-avatar-frame.png');
    await writeFile(file, 'bytes');
    await lock(file);
    await expectPathFreeIoError(
      verifier.rehashReference(file, 'file', new AbortController().signal),
      'EACCES',
      'fake-avatar-frame',
    );
  });
});
