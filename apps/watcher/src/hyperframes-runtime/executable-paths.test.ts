import assert from 'node:assert/strict';
import { chmod, mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { delimiter, join, relative } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { HyperframesSandboxUnavailableError, realPathOfExistingPrefix, resolveExecutable } from '@studio/hyperframes';

/*
 * Real paths for the sandbox parameters (SPEC 0008 section 17.5, K16, AC 88). Every file lives in
 * a fresh temporary folder; the "programs" are inert bytes with an execute bit and are never run.
 * Expected real paths come from `fs.realpath`, so the macOS `/var` to `/private/var` link of the
 * temporary folder is part of what is checked.
 */

const PROGRAM_NAME = 'studio-fixture-tool';
const INERT_PROGRAM_BYTES = 'inert fixture bytes, never executed\n';

let folder: string;

beforeEach(async () => {
  folder = await mkdtemp(join(tmpdir(), 'watcher-executable-paths-'));
});

afterEach(async () => {
  await rm(folder, { recursive: true, force: true });
});

async function folderNamed(name: string): Promise<string> {
  const path = join(folder, name);
  await mkdir(path, { recursive: true });
  return path;
}

async function programFile(directory: string, options: { executable: boolean; name?: string }): Promise<string> {
  const path = join(directory, options.name ?? PROGRAM_NAME);
  await writeFile(path, INERT_PROGRAM_BYTES);
  // Set after the write so the process umask cannot strip the execute bit.
  await chmod(path, options.executable ? 0o755 : 0o644);
  return path;
}

function searchPathOf(folders: readonly string[]): string {
  return folders.join(delimiter);
}

function isSandboxUnavailable(error: unknown): boolean {
  return error instanceof HyperframesSandboxUnavailableError && error.reason === 'sandbox-unavailable';
}

describe('resolveExecutable with an absolute setting (AC 88)', () => {
  it('returns the real path of an absolute setting reached through a symlink', async () => {
    const program = await programFile(await folderNamed('real-tools'), { executable: true });
    const link = join(await folderNamed('linked-tools'), PROGRAM_NAME);
    await symlink(program, link);

    const resolved = await resolveExecutable(link, '');

    assert.equal(resolved, await realpath(program));
  });

  it('throws sandbox-unavailable for an absolute setting that is not executable', async () => {
    const program = await programFile(await folderNamed('tools'), { executable: false });

    await assert.rejects(resolveExecutable(program, ''), isSandboxUnavailable);
  });

  it('throws sandbox-unavailable for an absolute setting that is a directory', async () => {
    const directory = await folderNamed(join('tools', PROGRAM_NAME));

    await assert.rejects(resolveExecutable(directory, ''), isSandboxUnavailable);
  });

  it('throws sandbox-unavailable for an absolute setting that does not exist', async () => {
    const missing = join(folder, 'tools', PROGRAM_NAME);

    await assert.rejects(resolveExecutable(missing, ''), isSandboxUnavailable);
  });
});

describe('resolveExecutable with a bare name (AC 88)', () => {
  it('returns the real path of the first executable regular file on the search path', async () => {
    const first = await folderNamed('first');
    const second = await folderNamed('second');
    const expected = await programFile(first, { executable: true });
    await programFile(second, { executable: true });

    const resolved = await resolveExecutable(PROGRAM_NAME, searchPathOf([first, second]));

    assert.equal(resolved, await realpath(expected));
  });

  it('skips a non-executable file of that name earlier on the search path', async () => {
    const earlier = await folderNamed('earlier');
    const later = await folderNamed('later');
    await programFile(earlier, { executable: false });
    const expected = await programFile(later, { executable: true });

    const resolved = await resolveExecutable(PROGRAM_NAME, searchPathOf([earlier, later]));

    assert.equal(resolved, await realpath(expected));
  });

  it('skips a directory of that name earlier on the search path', async () => {
    const earlier = await folderNamed('earlier');
    await mkdir(join(earlier, PROGRAM_NAME));
    const later = await folderNamed('later');
    const expected = await programFile(later, { executable: true });

    const resolved = await resolveExecutable(PROGRAM_NAME, searchPathOf([earlier, later]));

    assert.equal(resolved, await realpath(expected));
  });

  it('returns the real path of the target when the match on the search path is a symlink', async () => {
    const program = await programFile(await folderNamed('cellar'), { executable: true, name: 'tool-1.0' });
    const bin = await folderNamed('bin');
    await symlink(program, join(bin, PROGRAM_NAME));

    const resolved = await resolveExecutable(PROGRAM_NAME, searchPathOf([bin]));

    assert.equal(resolved, await realpath(program));
  });

  it('throws sandbox-unavailable when no folder on the search path holds an executable of that name', async () => {
    const empty = await folderNamed('empty');
    const other = await folderNamed('other');
    await programFile(other, { executable: true, name: 'another-tool' });

    await assert.rejects(resolveExecutable(PROGRAM_NAME, searchPathOf([empty, other])), isSandboxUnavailable);
  });

  it('throws sandbox-unavailable for an empty search path', async () => {
    await assert.rejects(resolveExecutable(PROGRAM_NAME, ''), isSandboxUnavailable);
  });

  it('ignores a relative folder on the search path even when it holds the program', async () => {
    const tools = await folderNamed('relative-tools');
    await programFile(tools, { executable: true });
    const relativeFolder = relative(process.cwd(), tools);

    await assert.rejects(resolveExecutable(PROGRAM_NAME, searchPathOf([relativeFolder])), isSandboxUnavailable);
  });

  it('throws sandbox-unavailable for a relative name with a folder part', async () => {
    const tools = await folderNamed('tools');
    await programFile(tools, { executable: true });

    await assert.rejects(resolveExecutable(`tools/${PROGRAM_NAME}`, searchPathOf([folder])), isSandboxUnavailable);
  });

  for (const refused of [
    { label: 'an empty name', value: '' },
    { label: 'a NUL in the name', value: `${PROGRAM_NAME}\0` },
    { label: 'a line break in the name', value: `${PROGRAM_NAME}\n` },
  ]) {
    it(`throws sandbox-unavailable for ${refused.label}`, async () => {
      const tools = await folderNamed('tools');
      await programFile(tools, { executable: true });

      await assert.rejects(resolveExecutable(refused.value, searchPathOf([tools])), isSandboxUnavailable);
    });
  }
});

describe('realPathOfExistingPrefix (AC 88, section 17.5 OWNER_HYPERFRAMES_DIR)', () => {
  it('returns the real path of an existing folder reached through a symlink', async () => {
    const real = await folderNamed('real-home');
    const link = join(folder, 'linked-home');
    await symlink(real, link);

    const resolved = await realPathOfExistingPrefix(link);

    assert.equal(resolved, await realpath(real));
  });

  it('appends the missing rest to the real path of the deepest existing ancestor', async () => {
    const real = await folderNamed('real-home');
    const link = join(folder, 'linked-home');
    await symlink(real, link);

    const resolved = await realPathOfExistingPrefix(join(link, '.hyperframes', 'nested'));

    assert.equal(resolved, join(await realpath(real), '.hyperframes', 'nested'));
  });

  for (const refused of [
    { label: 'a relative path', value: 'relative/.hyperframes' },
    { label: 'a NUL', value: '/fixture/owner\0home/.hyperframes' },
    { label: 'a line break', value: '/fixture/owner\nhome/.hyperframes' },
  ]) {
    it(`throws sandbox-unavailable for ${refused.label}`, async () => {
      await assert.rejects(realPathOfExistingPrefix(refused.value), isSandboxUnavailable);
    });
  }
});
