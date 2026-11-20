import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { parseShellConfig, readShellConfig, ShellConfigError, type ShellConfigErrorReason } from './shell-config';

/* Configuration contract frozen for ticket 11: strict keys, absolute normalized paths, distinct ports. */

const valid = {
  format: 1,
  nodeBinary: '/opt/homebrew/bin/node',
  cliMain: '/Users/owner/video-studio/tools/cli/dist/main.js',
  dataHome: '/Users/owner/.video-studio',
  webPort: 4310,
  apiPort: 4311,
};

function rejects(document: unknown, reason: ShellConfigErrorReason): void {
  assert.throws(
    () => parseShellConfig(JSON.stringify(document)),
    (error: unknown) => error instanceof ShellConfigError && error.reason === reason,
  );
}

describe('shell configuration', () => {
  it('parses a valid file', () => {
    assert.deepEqual(parseShellConfig(JSON.stringify(valid)), valid);
  });

  it('refuses an unknown key', () => {
    rejects({ ...valid, nodeOptions: '--inspect' }, 'unknown-key');
  });

  it('refuses a relative path', () => {
    rejects({ ...valid, cliMain: 'tools/cli/dist/main.js' }, 'relative-path');
  });

  it('refuses a .. segment, a line break and a non-normalized path', () => {
    rejects({ ...valid, dataHome: '/Users/owner/../other' }, 'unsafe-path');
    rejects({ ...valid, nodeBinary: '/opt/homebrew/bin/node\n--inspect' }, 'unsafe-path');
    rejects({ ...valid, dataHome: '/Users/owner/./.video-studio' }, 'unsafe-path');
    rejects({ ...valid, dataHome: '/Users/owner/.video-studio/' }, 'unsafe-path');
  });

  it('refuses equal ports and ports out of range', () => {
    rejects({ ...valid, apiPort: valid.webPort }, 'equal-ports');
    rejects({ ...valid, webPort: 80 }, 'invalid-port');
    rejects({ ...valid, apiPort: '4311' }, 'invalid-port');
  });

  it('refuses a missing key, another format and text that is not JSON', () => {
    rejects({ format: 1, nodeBinary: valid.nodeBinary, cliMain: valid.cliMain, dataHome: valid.dataHome, webPort: valid.webPort }, 'missing-key');
    rejects({ ...valid, format: 2 }, 'invalid-format');
    assert.throws(
      () => parseShellConfig('{"format":1,'),
      (error: unknown) => error instanceof ShellConfigError && error.reason === 'invalid-json',
    );
  });

  it('reads a file, and a missing file is the typed error', async () => {
    const folder = await mkdtemp(join(tmpdir(), 'studio-shell-config-'));
    try {
      const filePath = join(folder, 'shell-config.json');
      await writeFile(filePath, JSON.stringify(valid), 'utf8');
      assert.deepEqual(await readShellConfig(filePath), valid);
      await assert.rejects(
        readShellConfig(join(folder, 'absent.json')),
        (error: unknown) => error instanceof ShellConfigError && error.reason === 'missing',
      );
    } finally {
      await rm(folder, { recursive: true, force: true });
    }
  });
});
