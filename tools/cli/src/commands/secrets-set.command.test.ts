import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ALL_SECRET_NAMES, isSecretName } from '@studio/core/secrets';
import { CliUsageError } from '../errors/cli.errors.js';
import { createTempStudio, type TempStudio } from '../platforms/platform-cli.harness.test.js';
import { secretsSetCommand } from './secrets-set.command.js';

/*
 * `studio secrets set <name>` (SPEC 0007 section 5.2, K3): it accepts the two provider keys and the
 * six platform app credentials, and the value never reaches argv, output or logs. A valid name
 * would run `/usr/bin/security` against the real Keychain (the command builds `KeychainWriter`
 * itself), so only the refusal path runs here; the rest is read from source.
 */

const COMMAND_SOURCE = fileURLToPath(new URL('./secrets-set.command.ts', import.meta.url));

/** Section 5.2 plus the two R1 provider keys, typed out. */
const expectedNames = [
  'anthropic-api-key',
  'elevenlabs-api-key',
  'youtube-oauth-client-id',
  'youtube-oauth-client-secret',
  'instagram-app-id',
  'instagram-app-secret',
  'tiktok-client-key',
  'tiktok-client-secret',
];

async function refusalOf(promise: Promise<number>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  return assert.fail('the command accepted the name');
}

describe('studio secrets set (SPEC 0007 section 5.2)', () => {
  let studio: TempStudio;

  beforeEach(async () => {
    studio = await createTempStudio();
  });

  afterEach(async () => {
    await studio.remove();
  });

  it('accepts exactly the eight secret names', () => {
    assert.deepEqual([...ALL_SECRET_NAMES].sort(), [...expectedNames].sort());
    for (const name of expectedNames) assert.equal(isSecretName(name), true, name);
  });

  it('refuses an unknown name before the Keychain and lists the eight names', async () => {
    const error = await refusalOf(secretsSetCommand('github-token', studio.dependencies));

    assert.ok(error instanceof CliUsageError);
    for (const name of expectedNames) assert.match(error.message, new RegExp(name));
    assert.deepEqual(studio.printer.lines, []);
  });

  it('never echoes a value typed where the name goes', async () => {
    const pastedValue = 'sk-sentinel-secret-value-0c41d7';

    const error = await refusalOf(secretsSetCommand(pastedValue, studio.dependencies));

    assert.ok(error instanceof CliUsageError);
    assert.equal(error.message.includes(pastedValue), false);
    assert.equal(studio.printer.text().includes(pastedValue), false);
  });

  it('takes no value parameter: only the name and the dependencies', () => {
    assert.equal(secretsSetCommand.length, 2);
  });

  it('hands the Keychain only the name, so the value is prompted by /usr/bin/security and never passes argv', async () => {
    const source = await readFile(COMMAND_SOURCE, 'utf8');

    assert.match(source, /\.promptAndStore\(name\)/);
    assert.doesNotMatch(source, /process\.argv/);
    // A process launch is a child_process import or a bare call; `.exec(` is RegExp.prototype.exec.
    assert.doesNotMatch(source, /['"](node:)?child_process['"]/, 'the command imports child_process');
    assert.doesNotMatch(source, /(?<![.\w])(spawn|spawnSync|execFile|execFileSync|execSync|exec|fork)\s*\(/, 'the command starts a process itself');
  });
});
