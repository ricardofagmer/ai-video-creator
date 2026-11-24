import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

/*
 * Isolation test of SPEC 2026-11-21-r1-r2-curator-coverage section 8.3 (rev 1), ticket 09 criterion 6
 * (CR13), for @studio/api. It reads every `*.test.ts` file of the package and fails when one reaches
 * the real home, the environment, the Keychain tool, a child process, the network, the owner's
 * voice-clone folder, or narrows the run with `.only`. This file holds the patterns as text, so it
 * is allowlisted by path; the route-test harness (`__tests__/api-test-home.ts`) is not a test file,
 * so it is outside the scan. Planted files live in a temp folder, never under `src`. The walk never
 * enters `node_modules`, `dist` or a voice-clone folder and never follows a symbolic link. Same
 * shape as the core and watcher isolation tests (ticket 01).
 */

const PACKAGE_SOURCE = resolve(__dirname, '..');

interface ForbiddenPattern {
  id: string;
  pattern: RegExp;
  /** A line that holds the pattern, written into a planted file. */
  sample: string;
}

const FORBIDDEN_PATTERNS: readonly ForbiddenPattern[] = [
  { id: 'real-home', pattern: /\bhomedir\(/, sample: 'const home = homedir();' },
  { id: 'environment', pattern: /\bprocess\.env\b/, sample: "const value = process.env['ENGINEOS_VIDEO_CREATOR_API_PORT'];" },
  { id: 'keychain-tool', pattern: /\/usr\/bin\/security\b|\bSECURITY_TOOL_PATH\b|secrets\/keychain\b/, sample: "import { KeychainReader } from '@studio/core/secrets/keychain';" },
  { id: 'child-process', pattern: /\bchild_process\b/, sample: "import { spawn } from 'node:child_process';" },
  { id: 'network', pattern: /\bfetch\(/, sample: "await fetch('https://example.invalid/');" },
  { id: 'voice-clone', pattern: /ricardo-clone/, sample: "const voice = 'assets/ricardo-clone/sample.wav';" },
  { id: 'only', pattern: /\.only\(|\bonly:\s*true\b/, sample: "it.only('narrows the run', () => undefined);" },
];

/** Folders the walk never enters. The voice-clone folder is never listed, read or stat'ed. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', 'dist', 'ricardo-clone']);

/** Harness files that hold the patterns as data; every pattern is allowed there. */
const HARNESS_FILES: ReadonlySet<string> = new Set(['__tests__/isolation.test.ts']);

interface Violation {
  file: string;
  pattern: string;
}

/** Every `*.test.ts` file under `root`, as a `/`-separated path relative to it. */
async function listTestFiles(root: string, directory: string = root): Promise<string[]> {
  const files: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...(await listTestFiles(root, path)));
    } else if (entry.isFile() && entry.name.endsWith('.test.ts')) {
      files.push(relative(root, path).split(sep).join('/'));
    }
  }
  return files.sort();
}

async function findViolations(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const file of await listTestFiles(root)) {
    const text = await readFile(join(root, file), 'utf8');
    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(text) && !HARNESS_FILES.has(file)) violations.push({ file, pattern: forbidden.id });
    }
  }
  return violations;
}

describe('isolation of @studio/api tests (ticket 09 criterion 6)', () => {
  it('finds no forbidden pattern in any test file of the package', async () => {
    const violations = await findViolations(PACKAGE_SOURCE);

    assert.deepEqual(violations, []);
  });

  it('reads the real test tree: the route tests and the tests beside the source', async () => {
    const files = await listTestFiles(PACKAGE_SOURCE);

    for (const expected of [
      '__tests__/session.test.ts',
      '__tests__/authorization.test.ts',
      '__tests__/validation.test.ts',
      '__tests__/run-control.test.ts',
      '__tests__/by-reference.test.ts',
      'auth/rev7-routes.guard.test.ts',
    ]) {
      assert.ok(files.includes(expected), `the walk missed ${expected}`);
    }
    assert.equal(files.includes('__tests__/api-test-home.ts'), false, 'the harness is not a test file');
  });
});

describe('isolation scan on planted files (ticket 09 criterion 6)', () => {
  let plantRoot: string;

  beforeEach(async () => {
    plantRoot = await mkdtemp(join(await realpath(tmpdir()), 'api-isolation-'));
  });

  afterEach(async () => {
    await rm(plantRoot, { recursive: true, force: true });
  });

  async function plant(file: string, text: string): Promise<void> {
    const path = join(plantRoot, file);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, text, 'utf8');
  }

  for (const forbidden of FORBIDDEN_PATTERNS) {
    it(`fails on a planted test file that contains the ${forbidden.id} pattern`, async () => {
      await plant('area/__tests__/planted.test.ts', `${forbidden.sample}\n`);

      const violations = await findViolations(plantRoot);

      assert.deepEqual(violations, [{ file: 'area/__tests__/planted.test.ts', pattern: forbidden.id }]);
    });
  }

  it('fails on the Keychain tool path written out', async () => {
    await plant('planted.test.ts', "const tool = '/usr/bin/security';\n");

    assert.deepEqual(await findViolations(plantRoot), [{ file: 'planted.test.ts', pattern: 'keychain-tool' }]);
  });

  it('fails on a node:test only option', async () => {
    await plant('planted.test.ts', "it('narrows the run', { only: true }, () => undefined);\n");

    assert.deepEqual(await findViolations(plantRoot), [{ file: 'planted.test.ts', pattern: 'only' }]);
  });

  it('passes a planted test file with none of the patterns', async () => {
    await plant('planted.test.ts', "it('adds', () => assert.equal(1 + 1, 2));\n");

    assert.deepEqual(await findViolations(plantRoot), []);
  });

  it('ignores a file that is not a test file, as the harness is', async () => {
    await plant('__tests__/api-test-home.ts', "const folder = 'ricardo-clone';\n");

    assert.deepEqual(await findViolations(plantRoot), []);
  });
});
