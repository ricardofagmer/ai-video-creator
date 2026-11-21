import assert from 'node:assert/strict';
import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, it } from 'node:test';
import { HYPERFRAMES_CHROME_VERSION, HYPERFRAMES_FORMAT_VERSION, HYPERFRAMES_PIN } from '../constants';
import { type HyperframesEngineFile } from '../engine-files';
import { engineState } from '../engine-state';
import { hyperframesPaths, type HyperframesPaths } from '../paths';
import {
  ensureHyperframesFolders,
  readHyperframesEngineFiles,
  writeChromeFile,
  writeEngineFile,
  writeTraceFile,
} from './engine-file-io';

/*
 * The gate files as the watcher reads them (SPEC 0008 section 4.5, AC 70): an unreadable or
 * invalid file never reads as present, so the engine is never `ready` on it. Every data home is a
 * fresh temporary folder; the "browser binary" is an empty placeholder file that nothing runs.
 */

const PROFILE_SHA = 'a'.repeat(64);
const CHROME_SHA = 'c'.repeat(64);
const AT = '2026-11-21T10:00:00.000Z';

function engineJson(state: HyperframesEngineFile['state']): HyperframesEngineFile {
  return { format: HYPERFRAMES_FORMAT_VERSION, state, updatedAt: AT, updatedBy: 'owner' };
}

describe('readHyperframesEngineFiles with engineState', () => {
  let dataHome: string;
  let paths: HyperframesPaths;

  beforeEach(async () => {
    dataHome = await realpath(await mkdtemp(join(tmpdir(), 'studio-hyperframes-files-')));
    paths = hyperframesPaths(dataHome);
  });

  afterEach(async () => {
    await rm(dataHome, { recursive: true, force: true });
  });

  /** Writes every gate file so the engine is `ready`; returns the placeholder binary path. */
  async function writeReadyFiles(): Promise<string> {
    await ensureHyperframesFolders(dataHome);
    const binaryPath = join(paths.cacheDir, 'browser', 'fake-browser');
    await mkdir(dirname(binaryPath), { recursive: true });
    await writeFile(binaryPath, '');
    await writeFile(paths.configFile, '{}\n');
    await writeEngineFile(dataHome, engineJson('enabled'));
    await writeChromeFile(dataHome, {
      format: HYPERFRAMES_FORMAT_VERSION,
      version: HYPERFRAMES_CHROME_VERSION,
      executablePath: binaryPath,
      sha256: CHROME_SHA,
      sizeBytes: 1,
      installedAt: AT,
      installedBy: 'owner',
    });
    await writeTraceFile(dataHome, {
      format: HYPERFRAMES_FORMAT_VERSION,
      result: 'pass',
      at: AT,
      by: 'owner',
      pin: HYPERFRAMES_PIN,
      chromeSha256: CHROME_SHA,
      profileSha256: PROFILE_SHA,
      templateContentHash: 'd'.repeat(64),
      controlDenied: true,
      renderExitCode: 0,
      outputOk: true,
      deniedNetwork: 0,
      ownerConfigDirDenied: 0,
      findings: [],
    });
    return binaryPath;
  }

  async function stateNow(): Promise<string> {
    return engineState(await readHyperframesEngineFiles(dataHome), { profileSha256: PROFILE_SHA });
  }

  it('reads every file as absent and the engine as disabled when there is no hyperframes folder', async () => {
    const files = await readHyperframesEngineFiles(dataHome);

    assert.deepEqual(files, {
      engine: { status: 'absent' },
      chrome: { status: 'absent' },
      chromeBinaryPresent: false,
      configSeeded: false,
      trace: { status: 'absent' },
    });
    assert.equal(engineState(files, { profileSha256: PROFILE_SHA }), 'engine-disabled');
  });

  it('is ready when every gate file is in place and matches', async () => {
    await writeReadyFiles();

    assert.equal(await stateNow(), 'ready');
  });

  it('reads an engine.json that is not JSON as invalid, so the engine stays disabled', async () => {
    await writeReadyFiles();
    await writeFile(paths.engineFile, '{"state": "enabled"');

    const files = await readHyperframesEngineFiles(dataHome);

    assert.deepEqual(files.engine, { status: 'invalid' });
    assert.equal(engineState(files, { profileSha256: PROFILE_SHA }), 'engine-disabled');
  });

  it('reads an engine.json that fails its schema as invalid, so the engine stays disabled', async () => {
    await writeReadyFiles();
    await writeFile(paths.engineFile, JSON.stringify({ ...engineJson('enabled'), state: 'on' }));

    assert.equal(await stateNow(), 'engine-disabled');
  });

  it('reads an engine.json that carries an unknown key as invalid', async () => {
    await writeReadyFiles();
    await writeFile(paths.engineFile, JSON.stringify({ ...engineJson('enabled'), force: true }));

    assert.equal(await stateNow(), 'engine-disabled');
  });

  it('does not follow an engine.json symlink, so a linked enabled file never enables the engine', async () => {
    await writeReadyFiles();
    const elsewhere = join(dataHome, 'elsewhere-engine.json');
    await writeFile(elsewhere, JSON.stringify(engineJson('enabled')));
    await rm(paths.engineFile);
    await symlink(elsewhere, paths.engineFile);

    const files = await readHyperframesEngineFiles(dataHome);

    assert.deepEqual(files.engine, { status: 'invalid' });
    assert.equal(engineState(files, { profileSha256: PROFILE_SHA }), 'engine-disabled');
  });

  it('reads an engine.json that is a folder as invalid', async () => {
    await writeReadyFiles();
    await rm(paths.engineFile);
    await mkdir(paths.engineFile);

    assert.equal(await stateNow(), 'engine-disabled');
  });

  it('treats a Chrome binary path outside cache/ as a missing binary', async () => {
    await writeReadyFiles();
    const outside = join(dataHome, 'outside-browser');
    await writeFile(outside, '');
    await writeFile(
      paths.chromeFile,
      JSON.stringify({
        format: HYPERFRAMES_FORMAT_VERSION,
        version: HYPERFRAMES_CHROME_VERSION,
        executablePath: outside,
        sha256: CHROME_SHA,
        sizeBytes: 1,
        installedAt: AT,
        installedBy: 'owner',
      }),
    );

    const files = await readHyperframesEngineFiles(dataHome);

    assert.equal(files.chrome.status, 'present');
    assert.equal(files.chromeBinaryPresent, false);
    assert.equal(engineState(files, { profileSha256: PROFILE_SHA }), 'chrome-missing');
  });

  it('is chrome-missing when the binary chrome.json names was removed', async () => {
    const binaryPath = await writeReadyFiles();
    await rm(binaryPath);

    assert.equal(await stateNow(), 'chrome-missing');
  });

  it('is runtime-not-prepared when config/config.json is a folder instead of a file', async () => {
    await writeReadyFiles();
    await rm(paths.configFile);
    await mkdir(paths.configFile);

    assert.equal(await stateNow(), 'runtime-not-prepared');
  });

  it('reads an oversize trace.json as invalid, so the engine is not ready', async () => {
    await writeReadyFiles();
    await writeFile(paths.traceFile, ' '.repeat(65_537));

    const files = await readHyperframesEngineFiles(dataHome);

    assert.deepEqual(files.trace, { status: 'invalid' });
    assert.equal(engineState(files, { profileSha256: PROFILE_SHA }), 'trace-missing');
  });

  it('is trace-stale when the sandbox profile changed after the trace', async () => {
    await writeReadyFiles();

    assert.equal(engineState(await readHyperframesEngineFiles(dataHome), { profileSha256: 'f'.repeat(64) }), 'trace-stale');
  });
});
