import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { serializeFolderManifest } from '@studio/shared/catalog';
import { DataHome } from '../paths/data-home';
import { ContentStore } from './content-store';
import { MAX_FOLDER_MANIFEST_BYTES } from './content-verifier';
import { FolderListingError, FolderReader, type FolderListingRejection } from './folder-reader';
import { ReferenceInspector } from './reference-inspector';

/*
 * The read side of a folder asset (ADR 0003 decision 1): a stored folder is listed from its
 * manifest blob, whose sha-256 must be the version's hash; a referenced folder is walked and its
 * rebuilt manifest hash must match. The store and every source folder live under a fresh
 * temporary folder.
 */

const MAX_BYTES = 10 * 1024 * 1024;
const FILES: Readonly<Record<string, string>> = {
  'index.html': '<!doctype html><html><body><div data-no-timeline></div></body></html>',
  'style.css': 'body { margin: 0; }',
  'assets/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"></svg>',
};

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function expectListingRejection(action: Promise<unknown>, rejection: FolderListingRejection): Promise<void> {
  await assert.rejects(action, (error: unknown) => {
    assert.ok(error instanceof FolderListingError, `expected FolderListingError, got ${String(error)}`);
    assert.equal(error.rejection, rejection);
    return true;
  });
}

describe('FolderReader.listFiles', () => {
  let root: string;
  let store: ContentStore;
  let inspector: ReferenceInspector;
  let reader: FolderReader;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'studio-folder-reader-')));
    const dataHome = new DataHome(join(root, 'home'));
    store = new ContentStore(dataHome);
    inspector = new ReferenceInspector(dataHome);
    reader = new FolderReader(store, inspector);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function sourceFolder(name: string): Promise<string> {
    const folder = join(root, 'sources', name);
    for (const [relativePath, text] of Object.entries(FILES)) {
      const filePath = join(folder, relativePath);
      await mkdir(dirname(filePath), { recursive: true });
      await writeFile(filePath, text);
    }
    return folder;
  }

  /** Writes `bytes` straight to the blob path of `contentHash`, bypassing the store's hashing. */
  async function plantBlob(contentHash: string, bytes: string | Buffer): Promise<string> {
    const blobPath = store.blobPath(contentHash);
    await mkdir(dirname(blobPath), { recursive: true });
    await writeFile(blobPath, bytes);
    return blobPath;
  }

  describe('stored folders', () => {
    it('lists every file at its blob path with its size and hash, in manifest order', async () => {
      const stored = await store.putFolder(await sourceFolder('stored'), { maxTotalBytes: MAX_BYTES });

      const files = await reader.listFiles(
        { storage: 'store', contentHash: stored.contentHash, absolutePath: store.blobPath(stored.contentHash) },
        { maxBytes: MAX_BYTES },
      );

      const expected = Object.entries(FILES)
        .map(([relativePath, text]) => ({
          relativePath,
          absolutePath: store.blobPath(sha256(text)),
          sizeBytes: Buffer.byteLength(text),
          contentHash: sha256(text),
        }))
        .sort((left, right) => (left.relativePath < right.relativePath ? -1 : 1));
      assert.deepEqual(files, expected);
    });

    it('refuses a manifest blob whose sha-256 is not the version hash', async () => {
      const stored = await store.putFolder(await sourceFolder('mismatch'), { maxTotalBytes: MAX_BYTES });
      const otherHash = 'f'.repeat(64);
      await plantBlob(otherHash, stored.manifestText);

      await expectListingRejection(
        reader.listFiles({ storage: 'store', contentHash: otherHash, absolutePath: store.blobPath(otherHash) }, { maxBytes: MAX_BYTES }),
        'hash-mismatch',
      );
    });

    it('refuses an oversize manifest blob before reading it', async () => {
      const hugeHash = 'e'.repeat(64);
      await plantBlob(hugeHash, Buffer.alloc(MAX_FOLDER_MANIFEST_BYTES + 1, 0x20));

      await expectListingRejection(
        reader.listFiles({ storage: 'store', contentHash: hugeHash, absolutePath: store.blobPath(hugeHash) }, { maxBytes: MAX_BYTES }),
        'manifest-too-large',
      );
    });

    it('refuses a manifest blob that is not JSON', async () => {
      const text = 'not a folder manifest';
      const stored = await store.putBytes(Buffer.from(text), { maxBytes: MAX_BYTES });

      await expectListingRejection(
        reader.listFiles({ storage: 'store', contentHash: stored.contentHash, absolutePath: store.blobPath(stored.contentHash) }, { maxBytes: MAX_BYTES }),
        'manifest-invalid',
      );
    });

    it('refuses a JSON manifest blob that breaks the manifest schema', async () => {
      const text = JSON.stringify({ files: [] });
      const stored = await store.putBytes(Buffer.from(text), { maxBytes: MAX_BYTES });

      await expectListingRejection(
        reader.listFiles({ storage: 'store', contentHash: stored.contentHash, absolutePath: store.blobPath(stored.contentHash) }, { maxBytes: MAX_BYTES }),
        'manifest-invalid',
      );
    });

    it('refuses a manifest whose entries are out of canonical order', async () => {
      const entries = [
        { path: 'style.css', sizeBytes: 1, contentHash: 'a'.repeat(64) },
        { path: 'index.html', sizeBytes: 1, contentHash: 'b'.repeat(64) },
      ];
      const text = JSON.stringify({ files: entries });
      assert.notEqual(text, serializeFolderManifest(entries));
      const stored = await store.putBytes(Buffer.from(text), { maxBytes: MAX_BYTES });

      await expectListingRejection(
        reader.listFiles({ storage: 'store', contentHash: stored.contentHash, absolutePath: store.blobPath(stored.contentHash) }, { maxBytes: MAX_BYTES }),
        'manifest-invalid',
      );
    });
  });

  describe('referenced folders', () => {
    it('lists every file at its path inside the registered folder', async () => {
      const folder = await sourceFolder('referenced');
      const inspected = await inspector.inspectFolder(folder, { maxBytes: MAX_BYTES });

      const files = await reader.listFiles({ storage: 'reference', contentHash: inspected.contentHash, absolutePath: folder }, { maxBytes: MAX_BYTES });

      assert.deepEqual(
        files.map((file) => ({ relativePath: file.relativePath, absolutePath: file.absolutePath, contentHash: file.contentHash })),
        [
          { relativePath: 'assets/logo.svg', absolutePath: join(folder, 'assets', 'logo.svg'), contentHash: sha256(FILES['assets/logo.svg'] ?? '') },
          { relativePath: 'index.html', absolutePath: join(folder, 'index.html'), contentHash: sha256(FILES['index.html'] ?? '') },
          { relativePath: 'style.css', absolutePath: join(folder, 'style.css'), contentHash: sha256(FILES['style.css'] ?? '') },
        ],
      );
    });

    it('refuses a referenced folder whose files changed after registration', async () => {
      const folder = await sourceFolder('changed');
      const inspected = await inspector.inspectFolder(folder, { maxBytes: MAX_BYTES });
      await writeFile(join(folder, 'style.css'), 'body { margin: 1px; }');

      await expectListingRejection(
        reader.listFiles({ storage: 'reference', contentHash: inspected.contentHash, absolutePath: folder }, { maxBytes: MAX_BYTES }),
        'hash-mismatch',
      );
    });
  });
});
