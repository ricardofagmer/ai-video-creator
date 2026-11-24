import assert from 'node:assert/strict';
import { mkdtemp, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { InvalidDataHomeError } from '@studio/core/paths';
import { SECRET_ENVIRONMENT_VARIABLES } from '@studio/core/secrets';
import { CliConfigurationError } from '../errors/cli.errors.js';
import { readCliSettings, type CliSettings } from '../settings/cli-settings.js';

/*
 * CR12 (ticket 10, AC 1): the environment parsing `main` hands every command. The environment is a
 * plain object built here, never the caller's; the home folder is a realpath'd temp folder
 * (SPEC 2026-11-21 section 8.1), and the fixed fake key must never surface in the settings.
 */

const SENTINEL_KEY = 'sk-ant-sentinel-cli-settings-2b8e6d10';
const KEY_VARIABLES = Object.values(SECRET_ENVIRONMENT_VARIABLES);

type Environment = Readonly<Record<string, string | undefined>>;

function refusalOf(read: () => CliSettings): unknown {
  try {
    read();
  } catch (error) {
    return error;
  }
  return assert.fail('the settings were accepted');
}

describe('studio CLI settings (CR12, ticket 10 AC 1)', () => {
  let root: string;
  let homeDirectory: string;

  function settingsFrom(environment: Environment): CliSettings {
    return readCliSettings({ environment, homeDirectory, cliDirectory: join(root, 'tools', 'cli', 'dist') }, KEY_VARIABLES);
  }

  beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'studio-cli-settings-')));
    homeDirectory = join(root, 'home');
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it('places the data home under the given home folder when no override is set', () => {
    const settings = settingsFrom({});

    assert.equal(settings.dataHome.root, join(homeDirectory, 'Library', 'Application Support', 'VideoStudio'));
  });

  it('uses ENGINEOS_VIDEO_CREATOR_HOME as the data home when it is set', () => {
    const override = join(root, 'data');

    const settings = settingsFrom({ ENGINEOS_VIDEO_CREATOR_HOME: override });

    assert.equal(settings.dataHome.root, override);
  });

  it('refuses a relative ENGINEOS_VIDEO_CREATOR_HOME', () => {
    assert.ok(refusalOf(() => settingsFrom({ ENGINEOS_VIDEO_CREATOR_HOME: 'relative/data' })) instanceof InvalidDataHomeError);
  });

  it('resolves the studio root three levels above the CLI folder', () => {
    assert.equal(settingsFrom({}).studioRoot, root);
  });

  it('defaults the web and api ports to 4310 and 4311', () => {
    const settings = settingsFrom({});

    assert.deepEqual(settings.ports, { web: 4310, api: 4311 });
  });

  it('reads the web and api ports from their variables', () => {
    const settings = settingsFrom({ ENGINEOS_VIDEO_CREATOR_WEB_PORT: '5310', ENGINEOS_VIDEO_CREATOR_API_PORT: '5311' });

    assert.deepEqual(settings.ports, { web: 5310, api: 5311 });
  });

  for (const value of ['80', '1023', '65536', 'abc', '43 10', '-4310']) {
    it(`refuses ENGINEOS_VIDEO_CREATOR_WEB_PORT=${JSON.stringify(value)} naming the variable, never the value`, () => {
      const error = refusalOf(() => settingsFrom({ ENGINEOS_VIDEO_CREATOR_WEB_PORT: value }));

      assert.ok(error instanceof CliConfigurationError);
      assert.equal(error.variable, 'ENGINEOS_VIDEO_CREATOR_WEB_PORT');
      assert.equal(error.message.includes(value), false);
    });
  }

  it('accepts the port boundaries 1024 and 65535', () => {
    const settings = settingsFrom({ ENGINEOS_VIDEO_CREATOR_WEB_PORT: '1024', ENGINEOS_VIDEO_CREATOR_API_PORT: '65535' });

    assert.deepEqual(settings.ports, { web: 1024, api: 65535 });
  });

  it('refuses the same port for web and api', () => {
    const error = refusalOf(() => settingsFrom({ ENGINEOS_VIDEO_CREATOR_WEB_PORT: '5000', ENGINEOS_VIDEO_CREATOR_API_PORT: '5000' }));

    assert.ok(error instanceof CliConfigurationError);
  });

  it('records the names of the key variables that are set, never their values', () => {
    const settings = settingsFrom({ ANTHROPIC_API_KEY: SENTINEL_KEY, ELEVENLABS_API_KEY: '   ' });

    assert.deepEqual(settings.keyVariablesSet, ['ANTHROPIC_API_KEY']);
    assert.equal(JSON.stringify(settings).includes(SENTINEL_KEY), false);
  });

  it('hands children only PATH and the allowlisted variables, never a key or an unrelated variable', () => {
    const settings = settingsFrom({
      PATH: '/usr/bin:/bin',
      HOME: homeDirectory,
      LANG: 'pt_BR.UTF-8',
      ENGINEOS_VIDEO_CREATOR_HOME: join(root, 'data'),
      TIKTOK_CLIENT_SECRET: SENTINEL_KEY,
      UNRELATED_VARIABLE: 'unrelated',
    });

    assert.deepEqual(settings.childEnvironment, { PATH: '/usr/bin:/bin', HOME: homeDirectory, LANG: 'pt_BR.UTF-8', ENGINEOS_VIDEO_CREATOR_HOME: join(root, 'data') });
  });

  it('gives children a fallback PATH when the caller has none', () => {
    const path = settingsFrom({}).childEnvironment['PATH'] ?? '';

    assert.match(path, /^\/opt\/homebrew\/bin:/);
  });
});
