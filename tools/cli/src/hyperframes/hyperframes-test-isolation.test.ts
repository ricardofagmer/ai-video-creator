import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * SPEC 0008 K11, AC 82: the `studio hyperframes` tests run on the fake process port and a temp
 * data home only. This reads the source of every such test file and refuses the real adapters, a
 * child-process module, the commander wiring (which binds the real ports), the caller's environment
 * and home folder, and the two system tools the real ports run. Patterns are written so that this
 * file does not match itself.
 */

const HYPERFRAMES_FOLDER = fileURLToPath(new URL('.', import.meta.url));
const COMMANDS_FOLDER = fileURLToPath(new URL('../commands/', import.meta.url));

const LOG_TOOL = ['', 'usr', 'bin', 'log'].join('/');
const KEYCHAIN_TOOL = ['', 'usr', 'bin', 'security'].join('/');

const forbiddenPatterns: readonly { reason: string; pattern: RegExp }[] = [
  { reason: 'imports the real ports', pattern: /from\s+['"][^'"]*real-ports(?:\.js)?['"]/ },
  { reason: 'imports the real ports dynamically', pattern: /import\(\s*['"][^'"]*real-ports/ },
  { reason: 'names the spawning process adapter', pattern: /createSpawn\w*ProcessPort/ },
  { reason: 'imports a child-process module', pattern: /['"](?:node:)?child_process['"]/ },
  { reason: 'imports the commander wiring, which binds the real ports', pattern: /from\s+['"][^'"]*program\/hyperframes-commands/ },
  { reason: 'reads the caller environment', pattern: /process\.env\b/ },
  { reason: 'reads the real home folder', pattern: /\bhomedir\s*\(/ },
];

async function hyperframesTestFiles(): Promise<string[]> {
  const own = (await readdir(HYPERFRAMES_FOLDER)).filter((name) => name.endsWith('.test.ts')).map((name) => join(HYPERFRAMES_FOLDER, name));
  const commands = (await readdir(COMMANDS_FOLDER))
    .filter((name) => name.startsWith('hyperframes') && name.endsWith('.test.ts'))
    .map((name) => join(COMMANDS_FOLDER, name));
  return [...own, ...commands];
}

describe('hyperframes CLI test isolation (SPEC 0008 AC 82)', () => {
  it('finds the hyperframes command tests and their harness', async () => {
    const names = (await hyperframesTestFiles()).map((file) => file.split('/').at(-1));

    for (const expected of [
      'hyperframes-cli.harness.test.ts',
      'hyperframes-chrome.command.test.ts',
      'hyperframes-trace.command.test.ts',
      'hyperframes.command.test.ts',
    ]) {
      assert.ok(names.includes(expected), expected);
    }
  });

  it('never imports the real process adapter or a child-process module, nor reads the real environment or home', async () => {
    for (const file of await hyperframesTestFiles()) {
      const source = await readFile(file, 'utf8');
      for (const { reason, pattern } of forbiddenPatterns) {
        assert.doesNotMatch(source, pattern, `${file} ${reason}`);
      }
    }
  });

  it('never names the system log tool or the Keychain tool', async () => {
    for (const file of await hyperframesTestFiles()) {
      const source = await readFile(file, 'utf8');
      assert.equal(source.includes(LOG_TOOL), false, file);
      assert.equal(source.includes(KEYCHAIN_TOOL), false, file);
    }
  });
});
