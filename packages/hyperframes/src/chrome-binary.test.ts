import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { HyperframesChromeMissingError, hashChromeBinary, verifyChromeBinary, type RecordedChromeBinary } from './index';

/*
 * The Chrome binary is verified before it runs (SPEC 0008 section 17.6, finding L1, AC 90). The
 * "binary" is a byte pattern in a fresh temporary folder, never executed. It is larger than one
 * read chunk (1 MiB), so a hash of only the first chunk would accept a changed file. The single
 * `O_NOFOLLOW` open of step 2 is an inspection item; the symlink case below shows its effect.
 */

/** One byte past two read chunks of 1 MiB, so the hash loop runs three times. */
const BINARY_SIZE_BYTES = 2 * 1_048_576 + 1;

let folder: string;
let cacheDir: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'hyperframes-chrome-binary-'));
  cacheDir = join(folder, 'cache');
  await mkdir(join(cacheDir, 'chrome', 'mac_arm-0.0.0', 'chrome-headless-shell'), { recursive: true });
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

function binaryBytes(): Buffer {
  const bytes = Buffer.alloc(BINARY_SIZE_BYTES);
  for (let index = 0; index < bytes.length; index += 1) bytes[index] = (index * 31 + 7) % 256;
  return bytes;
}

function sha256Of(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

/** Writes the binary at `path` (inside the cache by default) and returns its recorded identity. */
async function installedBinary(path = join(cacheDir, 'chrome', 'mac_arm-0.0.0', 'chrome-headless-shell', 'chrome-headless-shell')): Promise<{
  recorded: RecordedChromeBinary;
  bytes: Buffer;
}> {
  const bytes = binaryBytes();
  await writeFile(path, bytes);
  return { recorded: { executablePath: path, sha256: sha256Of(bytes), sizeBytes: bytes.length }, bytes };
}

function isChromeMissing(error: unknown): boolean {
  return (
    error instanceof HyperframesChromeMissingError &&
    error.reason === 'chrome-missing' &&
    (error.detail === 'changed' || error.detail === 'unreadable')
  );
}

describe('verifyChromeBinary accepts (AC 90)', () => {
  it('accepts the unchanged binary inside the cache folder', async () => {
    const { recorded } = await installedBinary();

    await assert.doesNotReject(verifyChromeBinary(recorded, { cacheDir }));
  });

  it('accepts the unchanged binary when the cache folder is given through a symlink', async () => {
    const { recorded } = await installedBinary();
    const linkedCacheDir = join(folder, 'linked-cache');
    await symlink(cacheDir, linkedCacheDir);

    await assert.doesNotReject(verifyChromeBinary(recorded, { cacheDir: linkedCacheDir }));
  });
});

describe('verifyChromeBinary refusals (AC 90)', () => {
  it('refuses a symlink at executablePath even when its target is the unchanged binary inside the cache', async () => {
    const { recorded } = await installedBinary(join(cacheDir, 'chrome', 'real-chrome-headless-shell'));
    const link = join(cacheDir, 'chrome', 'mac_arm-0.0.0', 'chrome-headless-shell', 'chrome-headless-shell');
    await symlink(recorded.executablePath, link);

    await assert.rejects(verifyChromeBinary({ ...recorded, executablePath: link }, { cacheDir }), isChromeMissing);
  });

  it('refuses an unchanged binary whose path lies outside the cache folder', async () => {
    const outside = join(folder, 'elsewhere');
    await mkdir(outside);
    const { recorded } = await installedBinary(join(outside, 'chrome-headless-shell'));

    await assert.rejects(verifyChromeBinary(recorded, { cacheDir }), isChromeMissing);
  });

  it('refuses a path under the cache whose real path leaves it through a symlinked folder', async () => {
    const outside = join(folder, 'elsewhere');
    await mkdir(outside);
    const linkedFolder = join(cacheDir, 'chrome', 'linked-out');
    await symlink(outside, linkedFolder);
    const { recorded } = await installedBinary(join(linkedFolder, 'chrome-headless-shell'));

    await assert.rejects(verifyChromeBinary(recorded, { cacheDir }), isChromeMissing);
  });

  it('refuses a binary in a sibling folder whose name only starts with the cache folder name', async () => {
    const sibling = `${cacheDir}-sibling`;
    await mkdir(sibling);
    const { recorded } = await installedBinary(join(sibling, 'chrome-headless-shell'));

    await assert.rejects(verifyChromeBinary(recorded, { cacheDir }), isChromeMissing);
  });

  it('refuses a directory at executablePath', async () => {
    const directory = join(cacheDir, 'chrome', 'mac_arm-0.0.0', 'chrome-headless-shell', 'chrome-headless-shell');
    await mkdir(directory);
    const recorded: RecordedChromeBinary = { executablePath: directory, sha256: sha256Of(binaryBytes()), sizeBytes: BINARY_SIZE_BYTES };

    await assert.rejects(verifyChromeBinary(recorded, { cacheDir }), isChromeMissing);
  });

  it('refuses a missing file', async () => {
    const missing = join(cacheDir, 'chrome', 'mac_arm-0.0.0', 'chrome-headless-shell', 'chrome-headless-shell');
    const recorded: RecordedChromeBinary = { executablePath: missing, sha256: sha256Of(binaryBytes()), sizeBytes: BINARY_SIZE_BYTES };

    await assert.rejects(verifyChromeBinary(recorded, { cacheDir }), isChromeMissing);
  });

  it('refuses a file of another size than recorded, even with the recorded hash', async () => {
    const { recorded } = await installedBinary();

    await assert.rejects(verifyChromeBinary({ ...recorded, sizeBytes: recorded.sizeBytes + 1 }, { cacheDir }), isChromeMissing);
  });

  it('refuses a file that grew by one byte since it was recorded', async () => {
    const { recorded, bytes } = await installedBinary();
    await writeFile(recorded.executablePath, Buffer.concat([bytes, Buffer.from([0])]));

    await assert.rejects(verifyChromeBinary(recorded, { cacheDir }), isChromeMissing);
  });

  it('refuses a file of the recorded size with its last byte changed', async () => {
    const { recorded, bytes } = await installedBinary();
    const changed = Buffer.from(bytes);
    changed[changed.length - 1] = ((changed[changed.length - 1] ?? 0) + 1) % 256;
    await writeFile(recorded.executablePath, changed);

    await assert.rejects(verifyChromeBinary(recorded, { cacheDir }), isChromeMissing);
  });

  it('keeps the binary path out of the refusal message', async () => {
    const { recorded, bytes } = await installedBinary();
    const changed = Buffer.from(bytes);
    changed[0] = ((changed[0] ?? 0) + 1) % 256;
    await writeFile(recorded.executablePath, changed);

    await assert.rejects(
      verifyChromeBinary(recorded, { cacheDir }),
      (error: unknown) => error instanceof Error && !error.message.includes(folder) && !error.message.includes(recorded.sha256),
    );
  });
});

describe('hashChromeBinary (section 17.6 steps 2 to 4)', () => {
  it('returns the sha-256 and the byte length of the binary', async () => {
    const { recorded } = await installedBinary();

    const hashed = await hashChromeBinary(recorded.executablePath);

    assert.deepEqual(hashed, { sha256: recorded.sha256, sizeBytes: BINARY_SIZE_BYTES });
  });

  it('refuses a symlink at the path', async () => {
    const { recorded } = await installedBinary(join(cacheDir, 'chrome', 'real-chrome-headless-shell'));
    const link = join(cacheDir, 'chrome', 'linked-chrome-headless-shell');
    await symlink(recorded.executablePath, link);

    await assert.rejects(hashChromeBinary(link), isChromeMissing);
  });

  it('refuses a directory at the path', async () => {
    await assert.rejects(hashChromeBinary(join(cacheDir, 'chrome')), isChromeMissing);
  });

  it('refuses a missing file', async () => {
    await assert.rejects(hashChromeBinary(join(cacheDir, 'chrome', 'missing-chrome-headless-shell')), isChromeMissing);
  });
});
