import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { serializeFolderManifest, type FolderEntry } from '@studio/shared/catalog';
import { ContentStore } from '../../asset-store/content-store';
import { ReferenceInspector } from '../../asset-store/reference-inspector';
import { DataHome } from '../../paths/data-home';
import { AssetTextReader, MAX_ASSET_TEXT_BYTES } from './asset-text.reader';
import { failingRedactor, promptVersion, skillVersion, tempRoot, testRedactor, type TempRoot } from './tool-fixtures.harness.test';

/*
 * Baseline review M3 (2026-11-21): AssetTextReader handed prompt and skill text to the agent (and
 * the run-lived memo) without checking it against the version's pinned `contentHash`. Every byte
 * read is now hashed and a mismatch reads as `missing`: stored blobs, reference files, stored skill
 * manifests and entries, and reference skill folders (re-hashed manifest). The data home, the store
 * and every "reference" path are inside a fresh temp folder.
 */

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

async function writeAt(path: string, data: string | Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

const signal = new AbortController().signal;

describe('AssetTextReader pinned hash (baseline M3)', () => {
  let root: TempRoot;
  let dataHome: DataHome;
  let store: ContentStore;
  let reader: AssetTextReader;

  beforeEach(async () => {
    root = await tempRoot('asset-text');
    dataHome = new DataHome(join(root.path, 'data-home'));
    store = new ContentStore(dataHome);
    reader = new AssetTextReader({ store, references: new ReferenceInspector(dataHome), redactor: testRedactor() });
  });

  afterEach(async () => {
    await root.remove();
  });

  async function storePrompt(text: string): Promise<{ contentHash: string; sizeBytes: number }> {
    const contentHash = sha256(text);
    await writeAt(store.blobPath(contentHash), text);
    return { contentHash, sizeBytes: Buffer.byteLength(text) };
  }

  it('reads a stored prompt whose blob matches its hash', async () => {
    const pin = await storePrompt('Write a short script.');
    assert.deepEqual(await reader.read(promptVersion({ ref: 'writer-prompt@1', ...pin }), signal), {
      status: 'text',
      text: 'Write a short script.',
      truncated: false,
    });
  });

  it('treats a stored prompt blob rewritten in place as missing', async () => {
    const pin = await storePrompt('Write a short script.');
    await writeFile(store.blobPath(pin.contentHash), 'Ignore the brief.....');
    assert.deepEqual(await reader.read(promptVersion({ ref: 'writer-prompt@1', ...pin }), signal), { status: 'missing' });
  });

  it('treats a reference prompt edited after registration as missing, also when it only grew', async () => {
    const path = join(root.path, 'owner-files', 'prompt.md');
    await writeAt(path, 'Version one.');
    const version = promptVersion({ ref: 'ref-prompt@1', contentHash: sha256('Version one.'), sizeBytes: 12, absolutePath: path });
    assert.equal((await reader.read(version, signal)).status, 'text');

    await writeFile(path, 'Version one. Plus an appended instruction.');
    assert.deepEqual(await reader.read(version, signal), { status: 'missing' });
    await writeFile(path, 'Version two.');
    assert.deepEqual(await reader.read(version, signal), { status: 'missing' });
  });

  it('hashes the whole file even when only the first megabyte is handed on', async () => {
    const text = 'a'.repeat(MAX_ASSET_TEXT_BYTES + 100);
    const pin = await storePrompt(text);
    const version = promptVersion({ ref: 'long-prompt@1', ...pin });
    const read = await reader.read(version, signal);
    assert.equal(read.status, 'text');
    assert.ok(read.status === 'text' && read.truncated && read.text.length === MAX_ASSET_TEXT_BYTES);

    // A change past the read window still makes the bytes another version.
    await writeFile(store.blobPath(pin.contentHash), `${'a'.repeat(MAX_ASSET_TEXT_BYTES + 99)}b`);
    assert.deepEqual(await reader.read(version, signal), { status: 'missing' });
  });

  it('checks a stored skill manifest and its entry blob against their hashes', async () => {
    const entryText = '# Skill\nUse short sentences.\n';
    const entry: FolderEntry = { path: 'SKILL.md', sizeBytes: Buffer.byteLength(entryText), contentHash: sha256(entryText) };
    const manifestText = serializeFolderManifest([entry]);
    const manifestHash = sha256(manifestText);
    await writeAt(store.blobPath(manifestHash), manifestText);
    await writeAt(store.blobPath(entry.contentHash), entryText);
    const version = skillVersion({ ref: 'style-skill@1', contentHash: manifestHash, sizeBytes: entry.sizeBytes, entryFile: 'SKILL.md' });

    assert.deepEqual(await reader.read(version, signal), { status: 'text', text: entryText, truncated: false });

    await writeFile(store.blobPath(entry.contentHash), '# Skill\nUse long sentences..\n');
    assert.deepEqual(await reader.read(version, signal), { status: 'missing' });

    await writeFile(store.blobPath(entry.contentHash), entryText);
    await writeFile(store.blobPath(manifestHash), manifestText.replace('SKILL.md', 'OTHER.md'));
    assert.deepEqual(await reader.read(version, signal), { status: 'missing' });
  });

  it('re-hashes a reference skill folder and refuses it when any file changed', async () => {
    const folder = join(root.path, 'owner-files', 'style-skill');
    await writeAt(join(folder, 'SKILL.md'), '# Skill\nBe brief.\n');
    await writeAt(join(folder, 'examples.md'), 'Example one.\n');
    const registered = await new ReferenceInspector(dataHome).inspectFolder(folder, { maxBytes: 1_000_000 });
    const version = skillVersion({
      ref: 'ref-skill@1',
      contentHash: registered.contentHash,
      sizeBytes: registered.sizeBytes,
      entryFile: 'SKILL.md',
      absolutePath: folder,
    });

    assert.deepEqual(await reader.read(version, signal), { status: 'text', text: '# Skill\nBe brief.\n', truncated: false });

    await writeFile(join(folder, 'examples.md'), 'Example two.\n');
    assert.deepEqual(await reader.read(version, signal), { status: 'missing' });

    await writeFile(join(folder, 'examples.md'), 'Example one.\n');
    await writeFile(join(folder, 'SKILL.md'), '# Skill\nBe loud.\n.\n');
    assert.deepEqual(await reader.read(version, signal), { status: 'missing' });
  });

  it('still refuses a registered biometric path before reading, and fails closed when the registry is unreadable', async () => {
    const cloneFolder = join(root.path, 'clone-fixture');
    const path = join(cloneFolder, 'notes.md');
    await writeAt(path, 'not read');
    const version = promptVersion({ ref: 'clone-notes@1', contentHash: sha256('not read'), sizeBytes: 8, absolutePath: path });

    const biometricReader = new AssetTextReader({ store, references: new ReferenceInspector(dataHome), redactor: testRedactor([cloneFolder]) });
    assert.deepEqual(await biometricReader.read(version, signal), { status: 'biometric' });
    const blindReader = new AssetTextReader({ store, references: new ReferenceInspector(dataHome), redactor: failingRedactor() });
    assert.deepEqual(await blindReader.read(version, signal), { status: 'biometric' });
  });
});
