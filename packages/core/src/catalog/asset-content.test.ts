import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, readdir, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { ContentStore } from '../asset-store/content-store';
import { ReferenceInspector } from '../asset-store/reference-inspector';
import { DataHome } from '../paths/data-home';
import { AssetContentService } from './asset-content';
import { BiometricSourceGuard } from './biometric-source.guard';
import { BiometricSourceRefusedError, ContentTypeMismatchError, type BiometricSourceRefusal } from './catalog.errors';

/*
 * Baseline review M1 (biometric containment by location, not label) and the upload magic-byte
 * check. The "clone" folder is a fake one created for the test under a fresh temporary folder;
 * the biometric registry is an in-memory list, never SQLite.
 */

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0x0d]);
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]);
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x24, 0, 0, 0]), Buffer.from('WAVEfmt ')]);
const runsAsRoot = process.getuid?.() === 0;

async function filesUnder(folder: string): Promise<number> {
  let entries;
  try {
    entries = await readdir(folder, { withFileTypes: true });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0;
    throw error;
  }
  let count = 0;
  for (const entry of entries) count += entry.isDirectory() ? await filesUnder(join(folder, entry.name)) : 1;
  return count;
}

describe('AssetContentService.prepare', () => {
  let root: string;
  let dataHome: DataHome;
  let cloneFolder: string;
  let registered: string[];
  let service: AssetContentService;

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'studio-asset-content-')));
    dataHome = new DataHome(join(root, 'home'));
    cloneFolder = join(root, 'media', 'fake-clone-for-test');
    await mkdir(cloneFolder, { recursive: true });
    await writeFile(join(cloneFolder, 'voice.wav'), WAV);
    registered = [cloneFolder];
    const guard = new BiometricSourceGuard({ listBiometricReferencePaths: async () => registered });
    service = new AssetContentService(new ContentStore(dataHome), new ReferenceInspector(dataHome), guard);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  async function expectBiometricRefusal(action: Promise<unknown>, refusal: BiometricSourceRefusal = 'overlaps-biometric-reference'): Promise<void> {
    await assert.rejects(action, (error: unknown) => {
      assert.ok(error instanceof BiometricSourceRefusedError, `expected BiometricSourceRefusedError, got ${String(error)}`);
      assert.equal(error.refusal, refusal);
      assert.ok(!error.message.includes('fake-clone'), 'message must not name the path');
      assert.ok(!error.message.includes(root), 'message must not name the path');
      return true;
    });
    assert.equal(await filesUnder(dataHome.assets), 0, 'nothing may enter the store');
  }

  describe('biometric containment (M1)', () => {
    it('refuses a normal-labelled import of a file under a biometric reference', async () => {
      await expectBiometricRefusal(
        service.prepare({
          kind: 'reference',
          sensitivity: 'normal',
          content: { source: 'import-file', absolutePath: join(cloneFolder, 'voice.wav'), mimeType: 'audio/wav' },
        }),
      );
    });

    it('refuses importing a folder that contains a biometric reference', async () => {
      await expectBiometricRefusal(
        service.prepare({ kind: 'reference', sensitivity: 'normal', content: { source: 'import-folder', absolutePath: join(root, 'media') } }),
      );
    });

    it('refuses an import reached through a symlink into the biometric folder', async () => {
      await symlink(cloneFolder, join(root, 'innocent-looking-link'));
      await expectBiometricRefusal(
        service.prepare({
          kind: 'reference',
          sensitivity: 'third-party',
          content: { source: 'import-file', absolutePath: join(root, 'innocent-looking-link', 'voice.wav'), mimeType: 'audio/wav' },
        }),
      );
    });

    it('refuses a real-path import when the reference was registered through a symlink', async () => {
      const registeredLink = join(root, 'registered-link');
      await symlink(cloneFolder, registeredLink);
      registered = [registeredLink];
      await expectBiometricRefusal(
        service.prepare({ kind: 'reference', sensitivity: 'normal', content: { source: 'import-folder', absolutePath: cloneFolder } }),
      );
    });

    it('refuses a normal-labelled reference to biometric material, and accepts the biometric-labelled one', async () => {
      const content = { source: 'reference-file', absolutePath: join(cloneFolder, 'voice.wav'), mimeType: 'audio/wav' } as const;
      await expectBiometricRefusal(service.prepare({ kind: 'reference', sensitivity: 'normal', content }));
      const prepared = await service.prepare({ kind: 'reference', sensitivity: 'biometric', content });
      assert.equal(prepared.storage.mode, 'reference');
    });

    it('imports an unrelated file next to the biometric folder', async () => {
      const sibling = join(root, 'media', 'fake-clone-for-test-2.wav');
      await writeFile(sibling, WAV);
      const prepared = await service.prepare({
        kind: 'reference',
        sensitivity: 'normal',
        content: { source: 'import-file', absolutePath: sibling, mimeType: 'audio/wav' },
      });
      assert.equal(prepared.storage.mode, 'store');
    });

    it('fails closed when a registered reference cannot be resolved', { skip: runsAsRoot }, async () => {
      const lockedParent = join(root, 'locked');
      await mkdir(join(lockedParent, 'fake-clone-locked'), { recursive: true });
      registered = [join(lockedParent, 'fake-clone-locked')];
      const unrelated = join(root, 'unrelated.wav');
      await writeFile(unrelated, WAV);
      await chmod(lockedParent, 0o000);
      try {
        await expectBiometricRefusal(
          service.prepare({ kind: 'reference', sensitivity: 'normal', content: { source: 'import-file', absolutePath: unrelated, mimeType: 'audio/wav' } }),
          'biometric-registry-unresolvable',
        );
      } finally {
        await chmod(lockedParent, 0o700);
      }
    });
  });

  describe('magic-byte check of the declared MIME type', () => {
    async function expectMismatch(action: Promise<unknown>, relativePath: string | null): Promise<void> {
      await assert.rejects(action, (error: unknown) => {
        assert.ok(error instanceof ContentTypeMismatchError, `expected ContentTypeMismatchError, got ${String(error)}`);
        assert.equal(error.relativePath, relativePath);
        return true;
      });
    }

    it('accepts an upload whose bytes match the declared type', async () => {
      const prepared = await service.prepare({
        kind: 'image',
        sensitivity: 'normal',
        content: { source: 'upload', stream: Readable.from([PNG]), mimeType: 'image/png' },
      });
      assert.equal(prepared.sizeBytes, PNG.length);
    });

    it('refuses an upload declared image/png whose bytes are JPEG, and leaves nothing in the store', async () => {
      await expectMismatch(
        service.prepare({ kind: 'image', sensitivity: 'normal', content: { source: 'upload', stream: Readable.from([JPEG]), mimeType: 'image/png' } }),
        null,
      );
      assert.equal(await filesUnder(dataHome.assets), 0);
    });

    it('refuses an imported file declared audio/mpeg that holds text', async () => {
      const file = join(root, 'not-really.mp3');
      await writeFile(file, 'just some text');
      await expectMismatch(
        service.prepare({ kind: 'music', sensitivity: 'normal', content: { source: 'import-file', absolutePath: file, mimeType: 'audio/mpeg' } }),
        null,
      );
      assert.equal(await filesUnder(dataHome.assets), 0);
    });

    it('refuses inline text that holds a NUL byte', async () => {
      await expectMismatch(
        service.prepare({ kind: 'prompt', sensitivity: 'normal', content: { source: 'inline', text: 'a\u0000b', mimeType: 'text/plain' } }),
        null,
      );
    });

    it('checks each file of an imported folder against its extension', async () => {
      const folder = join(root, 'brand');
      await mkdir(join(folder, 'assets'), { recursive: true });
      await writeFile(join(folder, 'README.md'), '# Brand');
      await writeFile(join(folder, 'assets', 'logo.png'), 'text pretending to be a png');
      await expectMismatch(
        service.prepare({ kind: 'reference', sensitivity: 'normal', content: { source: 'import-folder', absolutePath: folder } }),
        'assets/logo.png',
      );
    });

    it('imports a folder whose files match their extensions', async () => {
      const folder = join(root, 'brand-ok');
      await mkdir(join(folder, 'assets'), { recursive: true });
      await writeFile(join(folder, 'README.md'), '# Brand');
      await writeFile(join(folder, 'assets', 'logo.png'), PNG);
      await writeFile(join(folder, 'assets', 'font.woff2'), Buffer.from([0, 1, 2, 3]));
      const prepared = await service.prepare({ kind: 'reference', sensitivity: 'normal', content: { source: 'import-folder', absolutePath: folder } });
      assert.equal(prepared.layout, 'folder');
    });
  });
});
