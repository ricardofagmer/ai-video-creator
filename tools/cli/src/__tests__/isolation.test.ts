import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * SPEC 2026-11-21 section 8.3 (CR13, ticket 10 AC 4): every `*.test.ts` file of the CLI package
 * is read and refused when it reaches the real home folder, the caller's environment, the
 * Keychain helper, a child process, the network, the owner's voice-clone folder or a focused
 * test. Each pattern is written so that this file does not match itself, so no file needs an
 * allowlist entry; a planted sample proves each pattern can fail.
 */

const SOURCE_ROOT = fileURLToPath(new URL('..', import.meta.url));
const THIS_FILE = fileURLToPath(import.meta.url);

const VOICE_CLONE_FOLDER = ['ricardo', 'clone'].join('-');
const KEYCHAIN_TOOL = ['', 'usr', 'bin', 'security'].join('/');
const KEYCHAIN_TOOL_CONSTANT = ['SECURITY', 'TOOL', 'PATH'].join('_');

interface ForbiddenPattern {
  reason: string;
  pattern: RegExp;
  /** A line that must match, assembled from pieces so this file stays clean. */
  plantedSample: string;
}

const forbiddenPatterns: readonly ForbiddenPattern[] = [
  { reason: 'reads the real home folder', pattern: /\bhomedir\s*\(/, plantedSample: ['const home = home', 'dir();'].join('') },
  { reason: 'reads the caller environment', pattern: /\bprocess\.env\b/, plantedSample: ['const value = process', 'env.HOME;'].join('.') },
  {
    reason: 'names the Keychain tool path',
    pattern: new RegExp(`['"]${KEYCHAIN_TOOL.replaceAll('/', '\\/')}['"]`),
    plantedSample: `const tool = '${KEYCHAIN_TOOL}';`,
  },
  { reason: 'uses the Keychain tool constant', pattern: new RegExp(`\\b${KEYCHAIN_TOOL_CONSTANT}\\b`), plantedSample: `run(${KEYCHAIN_TOOL_CONSTANT});` },
  {
    reason: 'imports the Keychain helper module',
    pattern: /['"][^'"]*secrets\/keychain(?:\.js)?['"]/,
    plantedSample: ["import { KeychainReader } from '@studio/core/src/secrets", "keychain';"].join('/'),
  },
  { reason: 'builds a Keychain reader or writer', pattern: /\bnew\s+Keychain(?:Reader|Writer)\s*\(/, plantedSample: ['await new Keychain', 'Writer().promptAndStore(name);'].join('') },
  {
    reason: 'imports a child-process module',
    pattern: /['"](?:node:)?child_process['"]/,
    plantedSample: ["import { spawn } from 'node:child", "process';"].join('_'),
  },
  { reason: 'calls the network', pattern: /(?<![\w$])fetch\s*\(/, plantedSample: ['await fetch', "('https://example.com');"].join('') },
  { reason: 'names the voice-clone folder', pattern: new RegExp(VOICE_CLONE_FOLDER), plantedSample: `const folder = 'models/${VOICE_CLONE_FOLDER}';` },
  { reason: 'focuses a test', pattern: /\.only\s*\(/, plantedSample: ['it', "only('focused', () => {});"].join('.') },
];

async function testFilesUnder(root: string): Promise<string[]> {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.test.ts'))
    .map((entry) => join(entry.parentPath, entry.name))
    .sort();
}

describe('CLI test isolation (SPEC 2026-11-21 section 8.3)', () => {
  it('finds the CLI test files, this ticket and the existing ones', async () => {
    const names = (await testFilesUnder(SOURCE_ROOT)).map((file) => relative(SOURCE_ROOT, file));

    for (const expected of [
      '__tests__/commands.test.ts',
      '__tests__/isolation.test.ts',
      '__tests__/settings.test.ts',
      'program/platform-flags.test.ts',
      'commands/secrets-set.command.test.ts',
      'hyperframes/hyperframes-test-isolation.test.ts',
    ]) {
      assert.ok(names.includes(expected), expected);
    }
  });

  it('includes this file in the scan, with no allowlist', async () => {
    assert.ok((await testFilesUnder(SOURCE_ROOT)).includes(THIS_FILE));
  });

  for (const { reason, pattern, plantedSample } of forbiddenPatterns) {
    it(`recognizes a planted line that ${reason}`, () => {
      assert.match(plantedSample, pattern);
    });

    it(`no CLI test file ${reason}`, async () => {
      const offenders: string[] = [];
      for (const file of await testFilesUnder(SOURCE_ROOT)) {
        if (pattern.test(await readFile(file, 'utf8'))) offenders.push(relative(SOURCE_ROOT, file));
      }

      assert.deepEqual(offenders, []);
    });
  }
});
