import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

/*
 * Inspection evidence of SPEC 0007 section 12 for the CLI, read from source text and never run:
 * AC 57 with K2 (the CLI writes none of `health.json`, `claim`, `state.json`, `cursor.json`,
 * `publications.jsonl` or a metrics batch) and section 5.2 "Delete" (`scripts/uninstall.sh`
 * removes the `com.videostudio.platform-tokens` items of youtube, instagram and tiktok, and in
 * `--dry-run` routes each delete through `run`, which only prints). The script is read as text;
 * it is never executed.
 */

const cliSource = fileURLToPath(new URL('..', import.meta.url));
const uninstallScript = fileURLToPath(new URL('../../../../scripts/uninstall.sh', import.meta.url));
const commonScript = fileURLToPath(new URL('../../../../scripts/lib/common.sh', import.meta.url));

interface SourceFile {
  path: string;
  code: string;
}

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

async function productionSources(): Promise<SourceFile[]> {
  const names = await readdir(cliSource, { recursive: true });
  const files = names.filter((name) => /\.tsx?$/.test(name) && !name.endsWith('.test.ts') && !name.endsWith('.d.ts'));
  return Promise.all(files.map(async (name) => ({ path: name, code: stripComments(await readFile(join(cliSource, name), 'utf8')) })));
}

function offenders(files: readonly SourceFile[], patterns: readonly RegExp[]): string[] {
  return files.flatMap((file) => patterns.filter((pattern) => pattern.test(file.code)).map((pattern) => `${file.path}: ${pattern.source}`));
}

/** The body of one shell function, from its `name() {` line to the closing `}` at column 0. */
function shellFunction(script: string, name: string): string {
  const start = script.indexOf(`\n${name}() {`);
  assert.ok(start >= 0, `${name} is defined`);
  const end = script.indexOf('\n}\n', start);
  assert.ok(end > start, `${name} is closed`);
  return script.slice(start, end);
}

describe('CLI writer boundaries (AC 57, K2)', () => {
  it('finds the CLI source it scans, so an empty scan cannot pass', async () => {
    const files = await productionSources();
    assert.ok(files.some((file) => file.path.endsWith('runs-publish.command.ts')));
  });

  it('calls none of the watcher-only writers', async () => {
    const patterns = [/\bwriteHealthFile\b/, /\bclaimPublishAttempt\b/, /\bwritePublishState\b/, /\bwritePollCursor\b/, /\bappendRunPublicationLine\b/, /\bcreateMetricBatch\b/];
    assert.deepEqual(offenders(await productionSources(), patterns), []);
  });

  it('names none of the watcher-owned files in code', async () => {
    const patterns = [
      /['"`]health\.json['"`]/,
      /['"`]state\.json['"`]/,
      /['"`]cursor\.json['"`]/,
      /['"`]publications\.jsonl['"`]/,
      /['"`]claim['"`]/,
      /\bplatformFileNames\.(health|claim|state|pollCursor)\b/,
      /\brunFileNames\.publications\b/,
    ];
    assert.deepEqual(offenders(await productionSources(), patterns), []);
  });
});

describe('scripts/uninstall.sh platform tokens (SPEC 0007 section 5.2 "Delete", read only)', () => {
  it('targets the platform token service for youtube, instagram and tiktok', async () => {
    const script = await readFile(uninstallScript, 'utf8');

    assert.match(script, /^readonly PLATFORM_TOKEN_SERVICE='com\.videostudio\.platform-tokens'$/m);
    assert.match(script, /^PLATFORM_TOKEN_ACCOUNTS=\(youtube instagram tiktok\)$/m);
  });

  it('deletes each account of that service, one platform at a time', async () => {
    const body = shellFunction(await readFile(uninstallScript, 'utf8'), 'step_platform_tokens');

    assert.match(body, /for account in "\$\{PLATFORM_TOKEN_ACCOUNTS\[@\]\}"; do/);
    assert.match(body, /delete-generic-password -s "\$PLATFORM_TOKEN_SERVICE" -a "\$account"/);
    assert.doesNotMatch(body, /\s-w\b|\s-g\b/, 'no command prints a token value');
  });

  it('routes every delete through run in --dry-run and runs the real delete only otherwise', async () => {
    const body = shellFunction(await readFile(uninstallScript, 'utf8'), 'step_platform_tokens');
    const deletes = body.split('\n').filter((line) => line.includes('delete-generic-password'));

    assert.equal(deletes.length, 2);
    const dryRunBranch = body.match(/if \[ "\$DRY_RUN" -eq 1 \]; then\n\s+run \/usr\/bin\/security delete-generic-password[^\n]*\n\s+continue\n\s+fi/);
    assert.ok(dryRunBranch !== null, 'the dry-run branch prints the delete through run and skips the real one');
    const realDeletes = deletes.filter((line) => !/^\s+run /.test(line));
    assert.equal(realDeletes.length, 1);
    assert.ok(body.indexOf(dryRunBranch[0]) < body.indexOf(realDeletes[0] ?? ''), 'the real delete comes after the dry-run branch');
  });

  it('runs the token step on every uninstall, not only with --remove-keys', async () => {
    const main = shellFunction(await readFile(uninstallScript, 'utf8'), 'main');

    assert.match(main, /^\s+step_platform_tokens$/m);
  });

  it('relies on a run helper that only prints in --dry-run', async () => {
    const run = shellFunction(await readFile(commonScript, 'utf8'), 'run');

    assert.match(run, /if \[ "\$DRY_RUN" -eq 1 \]; then[\s\S]*?return 0\n\s+fi\n\s+"\$@"/);
  });
});
