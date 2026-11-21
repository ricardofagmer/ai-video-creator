import assert from 'node:assert/strict';
import childProcess, { ChildProcess } from 'node:child_process';
import { createRequire, syncBuiltinESMExports } from 'node:module';
import { performance } from 'node:perf_hooks';
import { PassThrough } from 'node:stream';
import { afterEach, beforeEach, describe, it, mock } from 'node:test';
import { type Platform } from '@studio/shared/platforms';
import { SECURITY_TOOL_PATH } from '../../secrets/keychain';
import { TokenVaultUnavailableError } from '../platforms.errors';
import {
  MAX_ENCODED_TOKEN_BUNDLE_BYTES,
  MAX_TOKEN_TEXT_CHARS,
  SecretToken,
  TokenBundleInvalidError,
  encodeTokenBundle,
  type TokenBundle,
} from '../token-bundle';
import { ALL_SENTINELS, SENTINEL_ACCESS_TOKEN, sentinelTokenBundle } from '../token-fixtures.harness.test';
import { KILLED_CHILD_EXIT_WAIT_MS, KeychainPlatformTokenVault, MAX_INTERACTIVE_LINE_BYTES, platformTokenArguments } from './keychain-token-vault';

/*
 * The Keychain vault (SPEC 0007 section 5.2, K3, AC 41, findings S1 and S5): the token goes only to
 * the stdin of `security -i`, never to argv; a bundle over the 3,600-byte bound and a spent lock
 * budget are refused before any process is spawned. `node:child_process` is replaced by an
 * in-memory fake keychain before any vault call, and a preflight proves the replacement is live, so
 * the real Keychain is never touched. The vault has no injection point for its process runner; see the test report.
 *
 * What the preflight has to prove. The vault is loaded as CommonJS, so its
 * `import { execFile, spawn } from 'node:child_process'` is a property read, at call time, on the
 * object `require('node:child_process')` returns. `mock.method` does not install the function it is
 * given: it installs a Proxy that forwards to it, so the installed value is compared with the handle
 * `mock.method` returns, never with the fake itself. The preflight fails closed: any assertion below
 * that does not hold throws in `beforeEach`, before a test body can construct or call the vault.
 */

interface ExecError extends Error {
  code?: number;
}
type ExecCallback = (error: ExecError | null, stdout: string, stderr: string) => void;

interface RecordedCall {
  tool: string;
  args: readonly string[];
  stdin: string;
}

/** `hang`: `security -i` never exits by itself; only a kill can end it (finding F-2). */
type SpawnBehaviour = 'store' | 'exit-without-storing' | 'exit-failed' | 'hang';

const SERVICE = 'com.videostudio.platform-tokens';

/** Not the security tool and not an existing file: the probe can start no real program. */
const PREFLIGHT_PROBE_TOOL = '/nonexistent/keychain-vault-preflight-probe';

/** The same CommonJS `require` resolution the vault module gets for `node:child_process`. */
const requireLikeTheVault = createRequire(__filename);

function exportOf(moduleExports: unknown, name: string): unknown {
  if (typeof moduleExports !== 'object' || moduleExports === null) return undefined;
  const value: unknown = Reflect.get(moduleExports, name);
  return value;
}

class FakeKeychain {
  readonly items = new Map<string, string>();
  readonly calls: RecordedCall[] = [];
  spawnBehaviour: SpawnBehaviour = 'store';
  /** With `hang`: how long a killed child takes to exit; null when it never exits. */
  exitAfterKillMs: number | null = 0;
  /** `kill` and `exit` of `hang` children, in the order they happened. */
  readonly lifecycle: string[] = [];

  readonly execFile = (tool: string, args: readonly string[], _options: object, callback: ExecCallback): ChildProcess => {
    this.calls.push({ tool, args: [...args], stdin: '' });
    const account = args[args.indexOf('-a') + 1] ?? '';
    const stored = this.items.get(account);
    setImmediate(() => {
      if (stored === undefined) {
        callback(Object.assign(new Error('item not found'), { code: 44 }), '', '');
        return;
      }
      if (args[0] === 'delete-generic-password') this.items.delete(account);
      callback(null, args[0] === 'find-generic-password' ? `${stored}\n` : '', '');
    });
    return new ChildProcess();
  };

  readonly spawn = (tool: string, args: readonly string[]): ChildProcess => {
    const call: RecordedCall = { tool, args: [...args], stdin: '' };
    this.calls.push(call);
    const child = new ChildProcess();
    const stdin = new PassThrough();
    child.stdin = stdin;
    child.kill = (): boolean => {
      this.lifecycle.push('kill');
      const exitAfterKillMs = this.exitAfterKillMs;
      if (exitAfterKillMs !== null) {
        setTimeout(() => {
          this.lifecycle.push('exit');
          child.emit('exit', null, 'SIGKILL');
        }, exitAfterKillMs);
      }
      return true;
    };
    stdin.on('data', (chunk: Buffer) => {
      call.stdin += chunk.toString('utf8');
    });
    stdin.on('finish', () => {
      if (this.spawnBehaviour === 'hang') return;
      setImmediate(() => {
        const words = call.stdin.trim().split(' ');
        if (this.spawnBehaviour === 'store') {
          this.items.set(words[words.indexOf('-a') + 1] ?? '', words[words.indexOf('-w') + 1] ?? '');
        }
        child.emit('exit', this.spawnBehaviour === 'exit-failed' ? 1 : 0);
      });
    });
    return child;
  };
}

/** Two tokens at the 1,024-character bound plus `scopeCount` scopes of `scopeLength` characters. */
function boundedBundle(platform: Platform, scopeCount: number, scopeLength: number): TokenBundle {
  return sentinelTokenBundle(platform, {
    accessToken: new SecretToken('a'.repeat(MAX_TOKEN_TEXT_CHARS)),
    refreshToken: new SecretToken('r'.repeat(MAX_TOKEN_TEXT_CHARS)),
    scopes: Array.from({ length: scopeCount }, () => 's'.repeat(scopeLength)),
  });
}

/** The largest bundle on `platform` whose encoded form still fits `MAX_ENCODED_TOKEN_BUNDLE_BYTES`. */
function largestEncodableBundle(platform: Platform): TokenBundle {
  let largest = boundedBundle(platform, 0, 0);
  for (let scopeCount = 1; scopeCount <= 12; scopeCount += 1) {
    for (let scopeLength = 1; scopeLength <= 120; scopeLength += 1) {
      const candidate = boundedBundle(platform, scopeCount, scopeLength);
      try {
        encodeTokenBundle(candidate);
      } catch (error) {
        if (error instanceof TokenBundleInvalidError && error.problem === 'too-large') return largest;
        throw error;
      }
      largest = candidate;
    }
  }
  return largest;
}

describe('KeychainPlatformTokenVault with a fake security tool', () => {
  let keychain: FakeKeychain;
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');

  beforeEach(async () => {
    keychain = new FakeKeychain();
    const execFileMock = mock.method(childProcess, 'execFile', keychain.execFile);
    const spawnMock = mock.method(childProcess, 'spawn', keychain.spawn);
    syncBuiltinESMExports();
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true });

    // Safety preflight 1: the object the vault reads `execFile` and `spawn` from at call time,
    // the CommonJS exports of `node:child_process`, now holds the installed mocks.
    const required: unknown = requireLikeTheVault('node:child_process');
    assert.equal(exportOf(required, 'execFile'), execFileMock, 'CommonJS child_process.execFile is not the fake');
    assert.equal(exportOf(required, 'spawn'), spawnMock, 'CommonJS child_process.spawn is not the fake');
    assert.equal(childProcess.execFile, execFileMock);
    assert.equal(childProcess.spawn, spawnMock);

    // Safety preflight 2: the ES module bindings answer with the same mocks, so the fake also holds
    // if a loader ever hands the vault the ESM view of the module.
    const live = await import('node:child_process');
    assert.equal(live.execFile, execFileMock, 'ESM child_process.execFile is not the fake');
    assert.equal(live.spawn, spawnMock, 'ESM child_process.spawn is not the fake');

    // Safety preflight 3, behavioural: a call through the patched module lands in the fake keychain.
    // The probe names a path that does not exist, never the security tool.
    childProcess.execFile(PREFLIGHT_PROBE_TOOL, ['-a', 'preflight-probe'], {}, () => undefined);
    childProcess.spawn(PREFLIGHT_PROBE_TOOL, ['preflight-probe']);
    assert.deepEqual(keychain.calls, [
      { tool: PREFLIGHT_PROBE_TOOL, args: ['-a', 'preflight-probe'], stdin: '' },
      { tool: PREFLIGHT_PROBE_TOOL, args: ['preflight-probe'], stdin: '' },
    ]);
    assert.equal(execFileMock.mock.callCount(), 1);
    assert.equal(spawnMock.mock.callCount(), 1);
    // The test bodies index `keychain.calls` from zero.
    keychain.calls.length = 0;
  });

  afterEach(() => {
    mock.restoreAll();
    syncBuiltinESMExports();
    if (originalPlatform !== undefined) Object.defineProperty(process, 'platform', originalPlatform);
  });

  it('writes through stdin of security -i, reads the item back, and puts no token in argv', async () => {
    const vault = new KeychainPlatformTokenVault();
    const bundle = sentinelTokenBundle('youtube');
    const encoded = encodeTokenBundle(bundle).revealForPlatformCall();

    await vault.write(bundle);

    const [spawnCall, readBack] = keychain.calls;
    assert.equal(spawnCall?.tool, SECURITY_TOOL_PATH);
    assert.deepEqual(spawnCall?.args, ['-i']);
    assert.equal(
      spawnCall?.stdin,
      `add-generic-password -U -s ${SERVICE} -a youtube -l "Video Studio - YouTube account tokens" -T ${SECURITY_TOOL_PATH} -w ${encoded}\n`,
    );
    assert.deepEqual(readBack?.args, ['find-generic-password', '-s', SERVICE, '-a', 'youtube', '-w']);
    for (const call of keychain.calls) {
      const argv = call.args.join(' ');
      assert.equal(argv.includes(encoded), false);
      for (const sentinel of ALL_SENTINELS) assert.equal(argv.includes(sentinel), false);
    }
  });

  it('reads back the stored bundle and answers not-found for a platform with no item', async () => {
    const vault = new KeychainPlatformTokenVault();
    await vault.write(sentinelTokenBundle('tiktok'));

    const found = await vault.read('tiktok');
    assert.equal(found.status === 'found' ? found.bundle.accessToken.revealForPlatformCall() : null, SENTINEL_ACCESS_TOKEN);
    assert.deepEqual(await vault.read('youtube'), { status: 'not-found' });
  });

  it('deletes the item and answers not-found the second time', async () => {
    const vault = new KeychainPlatformTokenVault();
    await vault.write(sentinelTokenBundle('youtube'));

    assert.equal(await vault.delete('youtube'), 'deleted');
    assert.equal(keychain.items.has('youtube'), false);
    assert.equal(await vault.delete('youtube'), 'not-found');
    assert.deepEqual(keychain.calls.at(-1)?.args, ['delete-generic-password', '-s', SERVICE, '-a', 'youtube']);
  });

  it('reports write-not-confirmed when security -i exits 0 but no item can be read back', async () => {
    keychain.spawnBehaviour = 'exit-without-storing';
    await assert.rejects(
      new KeychainPlatformTokenVault().write(sentinelTokenBundle('youtube')),
      (error: unknown) => error instanceof TokenVaultUnavailableError && error.failure === 'write-not-confirmed',
    );
  });

  it('reports command-failed with the exit code when security -i fails, quoting no token', async () => {
    keychain.spawnBehaviour = 'exit-failed';
    await assert.rejects(new KeychainPlatformTokenVault().write(sentinelTokenBundle('youtube')), (error: unknown) => {
      if (!(error instanceof TokenVaultUnavailableError)) return false;
      const text = `${error.message}\n${JSON.stringify(error)}`;
      return error.failure === 'command-failed' && error.exitCode === 1 && ALL_SENTINELS.every((sentinel) => !text.includes(sentinel));
    });
  });

  it('reports a corrupt item as bundle-corrupt without quoting it', async () => {
    keychain.items.set('youtube', `not-a-bundle-${SENTINEL_ACCESS_TOKEN}`);
    await assert.rejects(
      new KeychainPlatformTokenVault().read('youtube'),
      (error: unknown) =>
        error instanceof TokenVaultUnavailableError && error.failure === 'bundle-corrupt' && !error.message.includes(SENTINEL_ACCESS_TOKEN),
    );
  });

  it('writes the largest bundle the 3,600-byte bound admits on a line within the 3,800-byte cap (S5)', async () => {
    // Instagram has the longest account name and label, so its fixed part of the line is the longest.
    const bundle = largestEncodableBundle('instagram');
    const encodedLength = encodeTokenBundle(bundle).length;
    assert.ok(encodedLength <= MAX_ENCODED_TOKEN_BUNDLE_BYTES);
    assert.ok(encodedLength > MAX_ENCODED_TOKEN_BUNDLE_BYTES - 200, 'the probe really reached the bound');

    await new KeychainPlatformTokenVault().write(bundle);

    const [spawnCall] = keychain.calls;
    assert.ok(spawnCall);
    assert.ok(Buffer.byteLength(spawnCall.stdin, 'utf8') <= MAX_INTERACTIVE_LINE_BYTES);
    assert.equal(MAX_INTERACTIVE_LINE_BYTES, 3_800);
  });

  it('refuses a bundle over the encoded bound as bundle-too-large and spawns nothing (S5)', async () => {
    const bundle = boundedBundle('youtube', 12, 120);

    await assert.rejects(
      new KeychainPlatformTokenVault().write(bundle),
      (error: unknown) => error instanceof TokenVaultUnavailableError && error.failure === 'bundle-too-large' && error.operation === 'write',
    );
    assert.equal(keychain.calls.length, 0);
    assert.equal(keychain.items.has('youtube'), false);
  });

  it('refuses a token over 1,024 characters before running any tool, quoting nothing (S5)', async () => {
    const bundle = sentinelTokenBundle('youtube', { accessToken: new SecretToken(`${SENTINEL_ACCESS_TOKEN}${'x'.repeat(MAX_TOKEN_TEXT_CHARS)}`) });

    await assert.rejects(new KeychainPlatformTokenVault().write(bundle), (error: unknown) => {
      if (!(error instanceof TokenVaultUnavailableError)) return false;
      return error.failure === 'bundle-too-large' && ALL_SENTINELS.every((sentinel) => !error.message.includes(sentinel));
    });
    assert.equal(keychain.calls.length, 0);
  });

  it('refuses a read, write or delete with no lock budget left before spawning anything (S1, C5)', async () => {
    const vault = new KeychainPlatformTokenVault();
    const timedOut = (error: unknown): boolean => error instanceof TokenVaultUnavailableError && error.failure === 'timeout';

    await assert.rejects(vault.read('youtube', { timeoutMs: 0 }), timedOut);
    await assert.rejects(vault.write(sentinelTokenBundle('youtube'), { timeoutMs: 0 }), timedOut);
    await assert.rejects(vault.delete('youtube', { timeoutMs: -5 }), timedOut);
    assert.equal(keychain.calls.length, 0);
  });

  it('waits for a killed security -i to exit before reporting the write timeout (F-2)', async () => {
    keychain.spawnBehaviour = 'hang';
    keychain.exitAfterKillMs = 100;
    const timedOut = (error: unknown): boolean =>
      error instanceof TokenVaultUnavailableError && error.operation === 'write' && error.failure === 'timeout';

    await assert.rejects(new KeychainPlatformTokenVault().write(sentinelTokenBundle('youtube'), { timeoutMs: 30 }), timedOut);

    assert.deepEqual(keychain.lifecycle, ['kill', 'exit'], 'the timeout is reported only after the killed child exited');
    assert.equal(keychain.calls.length, 1, 'no read-back after a timed-out write');
    assert.equal(keychain.items.has('youtube'), false);
  });

  it('reports the write timeout after a bounded wait when the killed security -i never exits (F-2)', async () => {
    keychain.spawnBehaviour = 'hang';
    keychain.exitAfterKillMs = null;
    const startedAt = performance.now();

    await assert.rejects(
      new KeychainPlatformTokenVault().write(sentinelTokenBundle('youtube'), { timeoutMs: 30 }),
      (error: unknown) => error instanceof TokenVaultUnavailableError && error.failure === 'timeout',
    );

    const elapsedMs = performance.now() - startedAt;
    assert.deepEqual(keychain.lifecycle, ['kill']);
    // Timer granularity: allow a few milliseconds under the nominal bound.
    assert.ok(elapsedMs >= 30 + KILLED_CHILD_EXIT_WAIT_MS - 10, `waited ${elapsedMs} ms for the exit`);
    assert.ok(elapsedMs < 30 + KILLED_CHILD_EXIT_WAIT_MS + 2_000, 'the wait is bounded');
  });

  it('refuses every operation off macOS before running any tool', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
    const vault = new KeychainPlatformTokenVault();
    const unsupported = (error: unknown): boolean => error instanceof TokenVaultUnavailableError && error.failure === 'unsupported-platform';

    await assert.rejects(vault.read('youtube'), unsupported);
    await assert.rejects(vault.write(sentinelTokenBundle('youtube')), unsupported);
    await assert.rejects(vault.delete('youtube'), unsupported);
    assert.equal(keychain.calls.length, 0);
  });
});

describe('platformTokenArguments', () => {
  it('builds read and delete argv from constants and the platform name only', () => {
    const platforms: readonly Platform[] = ['youtube', 'instagram', 'tiktok'];
    for (const platform of platforms) {
      assert.deepEqual(platformTokenArguments('find-generic-password', platform), ['find-generic-password', '-s', SERVICE, '-a', platform, '-w']);
      assert.deepEqual(platformTokenArguments('delete-generic-password', platform), ['delete-generic-password', '-s', SERVICE, '-a', platform]);
    }
  });
});
