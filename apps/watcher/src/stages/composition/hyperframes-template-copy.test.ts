import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { type FolderFileSource } from '@studio/core/asset-store';
import { type ResolvedAsset } from '@studio/shared/ports';
import { DEFAULT_TEMPLATE_FILES, HYPERFRAMES_TEMPLATE_REF, RecordingHyperframesPorts } from '../executors/composition-stage.harness.test';
import { stageTemplateCopy, type TemplateCopyOutcome } from './hyperframes-template-copy';

/*
 * SPEC 0008 section 17.8 (L3), AC 96: the staged copy opens each listed source once without
 * following a link, requires a regular file of the manifest's `sizeBytes`, and hashes the bytes it
 * copied. Every refusal is the bare `{ status: 'refused' }` (the stage maps it to
 * `template-not-self-contained`, no path in the outcome), and a refused file never puts more than
 * `sizeBytes` bytes into the target. The listing is the manifest under test, answered by the
 * harness's `RecordingHyperframesPorts`; nothing here starts a process. A FIFO at the source path
 * is not covered: Node has no API to create one without starting `mkfifo`.
 */

const BAD_FILE = 'style.css';

interface CopyWorld {
  root: string;
  sourceDir: string;
  targetDir: string;
  ports: RecordingHyperframesPorts;
}

function templateAsset(absolutePath: string): ResolvedAsset {
  return {
    ref: HYPERFRAMES_TEMPLATE_REF,
    kind: 'template',
    assetStatus: 'active',
    contentHash: 'e'.repeat(64),
    sizeBytes: 1024,
    mimeType: 'application/vnd.studio.folder+json',
    layout: 'folder',
    sensitivity: 'normal',
    license: null,
    storage: 'reference',
    absolutePath,
  };
}

function sha256(bytes: Buffer | string): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** A manifest entry whose size and hash describe `bytes`, read from `absolutePath`. */
function manifestEntry(options: { relativePath: string; absolutePath: string; bytes: Buffer | string }): FolderFileSource {
  return {
    relativePath: options.relativePath,
    absolutePath: options.absolutePath,
    sizeBytes: Buffer.byteLength(options.bytes),
    contentHash: sha256(options.bytes),
  };
}

/** The default template's entries with `edit` applied to the style.css entry. */
function listingWithBadFile(world: CopyWorld, edit: (entry: FolderFileSource) => FolderFileSource): FolderFileSource[] {
  return Object.entries(DEFAULT_TEMPLATE_FILES).map(([relativePath, text]) => {
    const entry = manifestEntry({ relativePath, absolutePath: join(world.sourceDir, relativePath), bytes: text });
    return relativePath === BAD_FILE ? edit(entry) : entry;
  });
}

async function stage(world: CopyWorld): Promise<TemplateCopyOutcome> {
  return stageTemplateCopy(templateAsset(world.sourceDir), world.targetDir, world.ports, new AbortController().signal);
}

/** Bytes the copy put into the target file; 0 when it never created it. */
async function bytesWritten(path: string): Promise<number> {
  try {
    return (await stat(path)).size;
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return 0;
    throw error;
  }
}

async function assertRefusedWithinManifestSize(world: CopyWorld, sizeBytes: number): Promise<void> {
  const outcome = await stage(world);

  assert.deepEqual(outcome, { status: 'refused' });
  const written = await bytesWritten(join(world.targetDir, BAD_FILE));
  assert.ok(written <= sizeBytes, `the target holds ${written} bytes, more than the manifest's ${sizeBytes}`);
}

describe('stageTemplateCopy (AC 96, section 17.8)', () => {
  let world: CopyWorld;

  beforeEach(async () => {
    const root = await mkdtemp(join(tmpdir(), 'watcher-template-copy-'));
    const sourceDir = join(root, 'template-source');
    await mkdir(sourceDir);
    for (const [name, text] of Object.entries(DEFAULT_TEMPLATE_FILES)) await writeFile(join(sourceDir, name), text);
    world = { root, sourceDir, targetDir: join(root, 'staged'), ports: new RecordingHyperframesPorts(join(root, 'data-home')) };
  });

  afterEach(async () => {
    await rm(world.root, { recursive: true, force: true });
  });

  it('stages regular files that match the manifest byte for byte', async () => {
    world.ports.listingEdit = () => listingWithBadFile(world, (entry) => entry);

    const outcome = await stage(world);

    assert.deepEqual(outcome, { status: 'staged' });
    for (const [name, text] of Object.entries(DEFAULT_TEMPLATE_FILES)) assert.equal(await readFile(join(world.targetDir, name), 'utf8'), text);
  });

  it('creates every staged file readable and writable by the owner only', async () => {
    world.ports.listingEdit = () => listingWithBadFile(world, (entry) => entry);

    await stage(world);

    assert.equal((await stat(join(world.targetDir, BAD_FILE))).mode & 0o777, 0o600);
  });

  it('refuses a source path that is a symlink to a regular file with the manifest bytes', async () => {
    const text = DEFAULT_TEMPLATE_FILES[BAD_FILE] ?? '';
    const decoy = join(world.root, 'decoy.css');
    const link = join(world.root, 'linked-style.css');
    await writeFile(decoy, text);
    await symlink(decoy, link);
    world.ports.listingEdit = () => listingWithBadFile(world, (entry) => ({ ...entry, absolutePath: link }));

    await assertRefusedWithinManifestSize(world, Buffer.byteLength(text));
  });

  it('refuses a source path that is a symlink to /dev/zero without copying more than the manifest size', async () => {
    const sizeBytes = 64;
    const link = join(world.root, 'zero-link.css');
    await symlink('/dev/zero', link);
    world.ports.listingEdit = () =>
      listingWithBadFile(world, (entry) => ({ ...entry, absolutePath: link, sizeBytes, contentHash: sha256(Buffer.alloc(sizeBytes)) }));

    await assertRefusedWithinManifestSize(world, sizeBytes);
  });

  it('refuses a character device at the source path without copying more than the manifest size', async () => {
    const sizeBytes = 64;
    world.ports.listingEdit = () =>
      listingWithBadFile(world, (entry) => ({ ...entry, absolutePath: '/dev/zero', sizeBytes, contentHash: sha256(Buffer.alloc(sizeBytes)) }));

    await assertRefusedWithinManifestSize(world, sizeBytes);
  });

  it('refuses a directory at the source path', async () => {
    const folder = join(world.root, 'a-folder');
    await mkdir(folder);
    world.ports.listingEdit = () => listingWithBadFile(world, (entry) => ({ ...entry, absolutePath: folder }));

    await assertRefusedWithinManifestSize(world, Buffer.byteLength(DEFAULT_TEMPLATE_FILES[BAD_FILE] ?? ''));
  });

  it('refuses a source larger than the manifest sizeBytes and writes at most that many bytes', async () => {
    let sizeBytes = 0;
    world.ports.listingEdit = () =>
      listingWithBadFile(world, (entry) => {
        sizeBytes = entry.sizeBytes - 1;
        return { ...entry, sizeBytes };
      });

    await assertRefusedWithinManifestSize(world, sizeBytes);
  });

  it('refuses a source smaller than the manifest sizeBytes', async () => {
    let sizeBytes = 0;
    world.ports.listingEdit = () =>
      listingWithBadFile(world, (entry) => {
        sizeBytes = entry.sizeBytes + 1;
        return { ...entry, sizeBytes };
      });

    await assertRefusedWithinManifestSize(world, sizeBytes);
  });

  it('refuses a source of the manifest size whose hash differs and writes at most that many bytes', async () => {
    let sizeBytes = 0;
    world.ports.listingEdit = () =>
      listingWithBadFile(world, (entry) => {
        sizeBytes = entry.sizeBytes;
        return { ...entry, contentHash: '0'.repeat(64) };
      });

    await assertRefusedWithinManifestSize(world, sizeBytes);
  });

  it('refuses a listing that names the same target twice instead of overwriting the first copy', async () => {
    world.ports.listingEdit = () => {
      const entries = listingWithBadFile(world, (entry) => entry);
      const duplicate = entries.find((entry) => entry.relativePath === BAD_FILE);
      return duplicate === undefined ? entries : [...entries, duplicate];
    };

    const outcome = await stage(world);

    assert.deepEqual(outcome, { status: 'refused' });
  });
});
