import assert from 'node:assert/strict';
import { mkdir, mkdtemp, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';

/*
 * Isolation test of SPEC 2026-11-21-r1-r2-curator-coverage section 8.3 (rev 1), ticket 01 criterion 3
 * (CR13). It reads every `*.test.ts` file of @studio/core and fails when one reaches the real home,
 * the environment, the Keychain tool, a child process, the network, the owner's voice-clone folder,
 * or narrows the run with `.only`. This file holds the patterns as text, so it is allowlisted by
 * path. Planted files live in a temp folder, never under `src`. The walk never enters
 * `node_modules`, `dist` or a voice-clone folder and never follows a symbolic link.
 */

const PACKAGE_SOURCE = resolve(__dirname, '..');

interface ForbiddenPattern {
  id: string;
  pattern: RegExp;
  /** A line that holds the pattern, written into a planted file. */
  sample: string;
}

const FORBIDDEN_PATTERNS: readonly ForbiddenPattern[] = [
  { id: 'real-home', pattern: /\bhomedir\(/, sample: "const home = homedir();" },
  { id: 'environment', pattern: /\bprocess\.env\b/, sample: "const value = process.env['ENGINEOS_VIDEO_CREATOR_HOME'];" },
  { id: 'keychain-tool', pattern: /\/usr\/bin\/security\b|\bSECURITY_TOOL_PATH\b/, sample: "const tool = '/usr/bin/security';" },
  { id: 'child-process', pattern: /\bchild_process\b/, sample: "import { spawn } from 'node:child_process';" },
  { id: 'network', pattern: /\bfetch\(/, sample: "await fetch('https://example.invalid/');" },
  { id: 'voice-clone', pattern: /ricardo-clone/, sample: "const voice = 'assets/ricardo-clone/sample.wav';" },
  { id: 'only', pattern: /\.only\(|\bonly:\s*true\b/, sample: "it.only('narrows the run', () => undefined);" },
];

/** Folders the walk never enters. The voice-clone folder is never listed, read or stat'ed. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set(['node_modules', 'dist', 'ricardo-clone']);

/** Harness files that hold the patterns as data; every pattern is allowed there. */
const HARNESS_FILES: ReadonlySet<string> = new Set(['test-support/isolation.test.ts']);

/**
 * Test files written before this isolation test, each with the one pattern it already uses and the
 * reason. Only those patterns are tolerated there; any other pattern in the same file still fails.
 * They are reported as findings of the coverage run; changing them is outside its tickets.
 */
const GRANDFATHERED: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  // Comments only: "Never runs `/usr/bin/security`" above a fake Keychain reader.
  ['platforms/platform-graph.harness.test.ts', new Set(['keychain-tool'])],
  ['platforms/clients/redacting-platform-client.test.ts', new Set(['keychain-tool'])],
  ['agents/tools/tool-fixtures.harness.test.ts', new Set(['keychain-tool'])],
  // Replaces `node:child_process` with mocks and asserts the tool path; nothing is spawned.
  ['platforms/vault/keychain-token-vault.test.ts', new Set(['child-process', 'keychain-tool'])],
  // Spawns `node -e 0` through spawnSync to obtain the pid of an exited process (finding).
  ['platforms/commands/disconnect.test.ts', new Set(['child-process'])],
  // Points PATH at an empty folder for one case and restores it (finding: not through the harness).
  ['agents/tools/frame-sample.tool.test.ts', new Set(['environment'])],
]);

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

function isAllowed(file: string, patternId: string): boolean {
  return HARNESS_FILES.has(file) || (GRANDFATHERED.get(file)?.has(patternId) ?? false);
}

async function findViolations(root: string): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const file of await listTestFiles(root)) {
    const text = await readFile(join(root, file), 'utf8');
    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(text) && !isAllowed(file, forbidden.id)) violations.push({ file, pattern: forbidden.id });
    }
  }
  return violations;
}

describe('isolation of @studio/core tests (ticket 01 criterion 3)', () => {
  it('finds no forbidden pattern in any test file of the package', async () => {
    const violations = await findViolations(PACKAGE_SOURCE);

    assert.deepEqual(violations, []);
  });

  it('reads the real test tree, this harness included', async () => {
    const files = await listTestFiles(PACKAGE_SOURCE);

    assert.ok(files.includes('test-support/coverage-home.test.ts'), 'the walk missed the coverage home test');
    assert.ok(files.includes('platforms/commands/disconnect.test.ts'), 'the walk missed a nested test');
  });
});

describe('isolation scan on planted files (ticket 01 criterion 3)', () => {
  let plantRoot: string;

  beforeEach(async () => {
    plantRoot = await mkdtemp(join(await realpath(tmpdir()), 'core-isolation-'));
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

  it('fails on a node:test only option', async () => {
    await plant('planted.test.ts', "it('narrows the run', { only: true }, () => undefined);\n");

    assert.deepEqual(await findViolations(plantRoot), [{ file: 'planted.test.ts', pattern: 'only' }]);
  });

  it('passes a planted test file with none of the patterns', async () => {
    await plant('planted.test.ts', "it('adds', () => assert.equal(1 + 1, 2));\n");

    assert.deepEqual(await findViolations(plantRoot), []);
  });

  it('tolerates only the grandfathered pattern of a legacy file', async () => {
    await plant('platforms/commands/disconnect.test.ts', "import { spawnSync } from 'node:child_process';\nawait fetch('https://example.invalid/');\n");

    assert.deepEqual(await findViolations(plantRoot), [{ file: 'platforms/commands/disconnect.test.ts', pattern: 'network' }]);
  });
});
