import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { HYPERFRAMES_CHROME_VERSION, HYPERFRAMES_FORMAT_VERSION, HYPERFRAMES_PIN } from './constants';
import { type HyperframesChromeFile, type HyperframesEngineFile, type HyperframesTraceFile } from './engine-files';
import { engineState, type HyperframesEngineFiles, type HyperframesFileRead } from './engine-state';
import { HyperframesPathError, hyperframesPaths, isPathInsideFolder } from './paths';

/*
 * Whether the HyperFrames engine may render (SPEC 0008 section 4.5, AC 70, pure part), and the
 * paths under `<data home>/hyperframes/`. The file reads are built in memory; nothing here
 * touches a disk or starts a process.
 */

const CURRENT_PROFILE_SHA = 'a'.repeat(64);
const CHROME_SHA = 'c'.repeat(64);
const TEMPLATE_SHA = 'd'.repeat(64);
const OTHER_SHA = 'e'.repeat(64);
const AT = '2026-11-21T10:00:00.000Z';

function engineFile(state: HyperframesEngineFile['state']): HyperframesEngineFile {
  return { format: HYPERFRAMES_FORMAT_VERSION, state, updatedAt: AT, updatedBy: 'owner' };
}

function chromeFile(): HyperframesChromeFile {
  return {
    format: HYPERFRAMES_FORMAT_VERSION,
    version: HYPERFRAMES_CHROME_VERSION,
    executablePath: '/data/home/hyperframes/cache/browser/fake-browser',
    sha256: CHROME_SHA,
    sizeBytes: 1024,
    installedAt: AT,
    installedBy: 'owner',
  };
}

function traceFile(overrides: Partial<HyperframesTraceFile> = {}): HyperframesTraceFile {
  return {
    format: HYPERFRAMES_FORMAT_VERSION,
    result: 'pass',
    at: AT,
    by: 'owner',
    pin: HYPERFRAMES_PIN,
    chromeSha256: CHROME_SHA,
    profileSha256: CURRENT_PROFILE_SHA,
    templateContentHash: TEMPLATE_SHA,
    controlDenied: true,
    renderExitCode: 0,
    outputOk: true,
    deniedNetwork: 0,
    ownerConfigDirDenied: 0,
    findings: [],
    ...overrides,
  };
}

function present<T>(value: T): HyperframesFileRead<T> {
  return { status: 'present', value };
}

const absent: { status: 'absent' } = { status: 'absent' };
const invalid: { status: 'invalid' } = { status: 'invalid' };

/** Every gate file present and matching: the one combination that is `ready`. */
function readyFiles(overrides: Partial<HyperframesEngineFiles> = {}): HyperframesEngineFiles {
  return {
    engine: present(engineFile('enabled')),
    chrome: present(chromeFile()),
    chromeBinaryPresent: true,
    configSeeded: true,
    trace: present(traceFile()),
    ...overrides,
  };
}

function stateOf(files: HyperframesEngineFiles): string {
  return engineState(files, { profileSha256: CURRENT_PROFILE_SHA });
}

describe('engineState (AC 70)', () => {
  it('is ready when the engine is enabled, Chrome is installed, the runtime is prepared and the trace matches', () => {
    assert.equal(stateOf(readyFiles()), 'ready');
  });

  it('is engine-disabled when there is no hyperframes folder at all', () => {
    const noFolder: HyperframesEngineFiles = {
      engine: absent,
      chrome: absent,
      chromeBinaryPresent: false,
      configSeeded: false,
      trace: absent,
    };

    assert.equal(stateOf(noFolder), 'engine-disabled');
  });

  it('is engine-disabled when engine.json is absent, even with every other file in place', () => {
    assert.equal(stateOf(readyFiles({ engine: absent })), 'engine-disabled');
  });

  it('is engine-disabled when engine.json says disabled', () => {
    assert.equal(stateOf(readyFiles({ engine: present(engineFile('disabled')) })), 'engine-disabled');
  });

  it('is engine-disabled, never enabled, when engine.json is unreadable or invalid', () => {
    assert.equal(stateOf(readyFiles({ engine: invalid })), 'engine-disabled');
  });

  it('is chrome-missing when chrome.json is absent', () => {
    assert.equal(stateOf(readyFiles({ chrome: absent })), 'chrome-missing');
  });

  it('is chrome-missing when chrome.json is unreadable or invalid', () => {
    assert.equal(stateOf(readyFiles({ chrome: invalid })), 'chrome-missing');
  });

  it('is chrome-missing when the binary chrome.json names is missing', () => {
    assert.equal(stateOf(readyFiles({ chromeBinaryPresent: false })), 'chrome-missing');
  });

  it('is runtime-not-prepared when config/config.json is not seeded', () => {
    assert.equal(stateOf(readyFiles({ configSeeded: false })), 'runtime-not-prepared');
  });

  it('is trace-missing when trace.json is absent', () => {
    assert.equal(stateOf(readyFiles({ trace: absent })), 'trace-missing');
  });

  it('is trace-missing, never ready, when trace.json is unreadable or invalid', () => {
    assert.equal(stateOf(readyFiles({ trace: invalid })), 'trace-missing');
  });

  it('is trace-stale when the trace failed', () => {
    assert.equal(stateOf(readyFiles({ trace: present(traceFile({ result: 'fail' })) })), 'trace-stale');
  });

  it('is trace-stale when the trace pin differs from the current pin', () => {
    assert.equal(stateOf(readyFiles({ trace: present(traceFile({ pin: '0.9.71' })) })), 'trace-stale');
  });

  it('is trace-stale when the trace Chrome hash differs from the installed Chrome', () => {
    assert.equal(stateOf(readyFiles({ trace: present(traceFile({ chromeSha256: OTHER_SHA })) })), 'trace-stale');
  });

  it('is trace-stale when the trace profile hash differs from the current sandbox profile', () => {
    assert.equal(stateOf(readyFiles({ trace: present(traceFile({ profileSha256: OTHER_SHA })) })), 'trace-stale');
  });

  it('is trace-stale when the sandbox profile changed after a passing trace', () => {
    assert.equal(engineState(readyFiles(), { profileSha256: OTHER_SHA }), 'trace-stale');
  });

  it('reports the first failing gate in section 4.5 order', () => {
    const everythingWrong = readyFiles({ engine: present(engineFile('disabled')), chrome: absent, configSeeded: false, trace: absent });

    assert.equal(stateOf(everythingWrong), 'engine-disabled');
    assert.equal(stateOf(readyFiles({ chrome: absent, configSeeded: false, trace: absent })), 'chrome-missing');
    assert.equal(stateOf(readyFiles({ configSeeded: false, trace: absent })), 'runtime-not-prepared');
  });
});

describe('hyperframesPaths', () => {
  it('builds every path under <data home>/hyperframes/', () => {
    assert.deepEqual(hyperframesPaths('/data/home'), {
      root: '/data/home/hyperframes',
      engineFile: '/data/home/hyperframes/engine.json',
      chromeFile: '/data/home/hyperframes/chrome.json',
      traceFile: '/data/home/hyperframes/trace.json',
      configDir: '/data/home/hyperframes/config',
      configFile: '/data/home/hyperframes/config/config.json',
      cacheDir: '/data/home/hyperframes/cache',
      homeDir: '/data/home/hyperframes/home',
    });
  });

  it('keeps every path absolute and inside the hyperframes folder', () => {
    const paths = hyperframesPaths('/Users/someone/Library/Application Support/VideoStudio');

    for (const [name, value] of Object.entries(paths)) {
      if (name === 'root') continue;
      const path = String(value);
      assert.ok(path.startsWith(`${paths.root}/`), `${name} must sit under the hyperframes folder`);
      assert.ok(!path.split('/').some((segment) => segment === '..' || segment === '.'), `${name} must hold no dot segment`);
    }
    assert.equal(paths.root, '/Users/someone/Library/Application Support/VideoStudio/hyperframes');
  });

  it('drops a trailing slash of the data home root', () => {
    assert.equal(hyperframesPaths('/data/home/').root, '/data/home/hyperframes');
  });

  it('refuses a relative data home root', () => {
    assert.throws(() => hyperframesPaths('data/home'), HyperframesPathError);
  });

  it('refuses a data home root with a .. segment', () => {
    assert.throws(() => hyperframesPaths('/data/../etc'), HyperframesPathError);
  });

  it('refuses the file system root', () => {
    assert.throws(() => hyperframesPaths('/'), HyperframesPathError);
    assert.throws(() => hyperframesPaths('//'), HyperframesPathError);
  });
});

describe('isPathInsideFolder', () => {
  it('accepts a path strictly inside the folder', () => {
    assert.equal(isPathInsideFolder('/data/home/hyperframes/cache', '/data/home/hyperframes/cache/browser/fake-browser'), true);
  });

  it('refuses the folder itself, a sibling, a .. escape and a doubled slash', () => {
    const cache = '/data/home/hyperframes/cache';

    assert.equal(isPathInsideFolder(cache, cache), false);
    assert.equal(isPathInsideFolder(cache, '/data/home/hyperframes/cache-other/fake-browser'), false);
    assert.equal(isPathInsideFolder(cache, '/data/home/hyperframes/cache/../trace.json'), false);
    assert.equal(isPathInsideFolder(cache, '/data/home/hyperframes/cache//fake-browser'), false);
  });
});
