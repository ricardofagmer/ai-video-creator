import { execFile, spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { Injectable } from '@nestjs/common';
import { type Platform } from '@studio/shared/platforms';
import { KEYCHAIN_READ_TIMEOUT_MS, SECURITY_TOOL_PATH } from '../../secrets/keychain';
import { TokenVaultUnavailableError, type TokenVaultFailure, type TokenVaultOperation } from '../platforms.errors';
import {
  MAX_ENCODED_TOKEN_BUNDLE_BYTES,
  SecretToken,
  TokenBundleInvalidError,
  decodeTokenBundle,
  encodeTokenBundle,
  type TokenBundle,
} from '../token-bundle';
import {
  PLATFORM_TOKEN_KEYCHAIN_SERVICE,
  platformTokenKeychainLabel,
  type PlatformTokenVault,
  type TokenVaultCallOptions,
  type TokenVaultLookup,
} from './token-vault.port';

/** `security` exit status for errSecItemNotFound. */
const ITEM_NOT_FOUND_EXIT_CODE = 44;

/** The read output is bounded to the largest encoded bundle, plus the trailing newline. */
const READ_MAX_BUFFER_BYTES = MAX_ENCODED_TOKEN_BUNDLE_BYTES + 2;

/**
 * Finding S5: `security -i` reads each command line into a 4 KiB buffer, so a longer line would be
 * cut and, with `-U`, the cut value would replace a good item. A longer line is refused before any
 * process is spawned; the bound is checked here, never by probing the Keychain.
 */
export const MAX_INTERACTIVE_LINE_BYTES = 3_800;

/**
 * Finding F-2: how long a killed `security -i` gets to exit before its timeout is reported anyway.
 * SIGKILL normally ends it at once; the bound covers a process the kernel is slow to reap, and stays
 * below the lease's own settle grace (`LATE_SETTLE_GRACE_MS`).
 */
export const KILLED_CHILD_EXIT_WAIT_MS = 300;

/** One Keychain command's timeout: its own bound, shortened to what is left of the lock budget. */
function commandTimeoutMs(options: TokenVaultCallOptions | undefined): number {
  return Math.min(KEYCHAIN_READ_TIMEOUT_MS, Math.floor(options?.timeoutMs ?? KEYCHAIN_READ_TIMEOUT_MS));
}

function exitCodeOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'number' ? error.code : null;
}

function failureOf(error: unknown): TokenVaultFailure {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER') {
    return 'output-too-large';
  }
  if (typeof error === 'object' && error !== null && 'killed' in error && error.killed === true) return 'timeout';
  return 'command-failed';
}

/** argv of a read or delete: compile-time constants and a `PlatformSchema` name only; never a value. */
export function platformTokenArguments(verb: 'find-generic-password' | 'delete-generic-password', platform: Platform): readonly string[] {
  const base = [verb, '-s', PLATFORM_TOKEN_KEYCHAIN_SERVICE, '-a', platform];
  return verb === 'find-generic-password' ? [...base, '-w'] : base;
}

/**
 * The one line written to the stdin of `/usr/bin/security -i` (Q5, OD9, B10). The value is base64url
 * (`[A-Za-z0-9_-]`), so it needs no quoting and cannot end or extend the command; the label is the
 * only quoted part and is a constant. It is never placed in argv or an environment variable.
 */
function interactiveWriteLine(platform: Platform, encoded: SecretToken): string {
  return [
    'add-generic-password',
    '-U',
    '-s',
    PLATFORM_TOKEN_KEYCHAIN_SERVICE,
    '-a',
    platform,
    '-l',
    `"${platformTokenKeychainLabel(platform)}"`,
    '-T',
    SECURITY_TOOL_PATH,
    '-w',
    encoded.revealForPlatformCall(),
  ].join(' ');
}

function sameSecret(left: SecretToken, right: SecretToken): boolean {
  const leftBytes = Buffer.from(left.revealForPlatformCall(), 'utf8');
  const rightBytes = Buffer.from(right.revealForPlatformCall(), 'utf8');
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

/**
 * The Keychain vault over `/usr/bin/security` (SPEC 0007 section 5.2). Reads follow
 * `KeychainReader` (`execFile`, no shell, absolute tool path, bounded output, timeout); the write
 * sends its command on stdin of `security -i` and then reads the item back, because `security -i`
 * does not report a failed command in its exit status. stdout and stderr of every call are dropped
 * and no child-process error object is attached to what this class throws: they can carry output.
 */
@Injectable()
export class KeychainPlatformTokenVault implements PlatformTokenVault {
  async read(platform: Platform, options?: TokenVaultCallOptions): Promise<TokenVaultLookup> {
    const encoded = await this.readEncoded(platform, commandTimeoutMs(options));
    if (encoded === null) return { status: 'not-found' };
    try {
      return { status: 'found', bundle: decodeTokenBundle(encoded) };
    } catch (error) {
      if (error instanceof TokenBundleInvalidError) throw new TokenVaultUnavailableError(platform, 'read', 'bundle-corrupt');
      throw error;
    }
  }

  async write(bundle: TokenBundle, options?: TokenVaultCallOptions): Promise<void> {
    this.assertDarwin(bundle.platform, 'write');
    let encoded: SecretToken;
    try {
      encoded = encodeTokenBundle(bundle);
    } catch (error) {
      if (error instanceof TokenBundleInvalidError) throw new TokenVaultUnavailableError(bundle.platform, 'write', 'bundle-too-large');
      throw error;
    }
    const commandLine = `${interactiveWriteLine(bundle.platform, encoded)}\n`;
    if (Buffer.byteLength(commandLine, 'utf8') > MAX_INTERACTIVE_LINE_BYTES) {
      throw new TokenVaultUnavailableError(bundle.platform, 'write', 'command-too-long');
    }
    const startedAt = performance.now();
    await this.runInteractive(bundle.platform, commandLine, commandTimeoutMs(options));
    // The read-back shares the caller's budget with the write it confirms.
    const remaining = options?.timeoutMs === undefined ? undefined : { timeoutMs: options.timeoutMs - (performance.now() - startedAt) };
    const stored = await this.readEncoded(bundle.platform, commandTimeoutMs(remaining));
    if (stored === null || !sameSecret(stored, encoded)) {
      throw new TokenVaultUnavailableError(bundle.platform, 'write', 'write-not-confirmed');
    }
  }

  async delete(platform: Platform, options?: TokenVaultCallOptions): Promise<'deleted' | 'not-found'> {
    this.assertDarwin(platform, 'delete');
    const timeoutMs = commandTimeoutMs(options);
    this.assertTimeLeft(platform, 'delete', timeoutMs);
    return new Promise((resolve, reject) => {
      execFile(
        SECURITY_TOOL_PATH,
        [...platformTokenArguments('delete-generic-password', platform)],
        { encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: 4096, shell: false, windowsHide: true },
        (error) => {
          if (error === null) resolve('deleted');
          else if (exitCodeOf(error) === ITEM_NOT_FOUND_EXIT_CODE) resolve('not-found');
          else reject(new TokenVaultUnavailableError(platform, 'delete', failureOf(error), exitCodeOf(error)));
        },
      );
    });
  }

  private async readEncoded(platform: Platform, timeoutMs: number): Promise<SecretToken | null> {
    this.assertDarwin(platform, 'read');
    this.assertTimeLeft(platform, 'read', timeoutMs);
    return new Promise((resolve, reject) => {
      execFile(
        SECURITY_TOOL_PATH,
        [...platformTokenArguments('find-generic-password', platform)],
        { encoding: 'utf8', timeout: timeoutMs, killSignal: 'SIGKILL', maxBuffer: READ_MAX_BUFFER_BYTES, shell: false, windowsHide: true },
        (error, stdout) => {
          if (error === null) resolve(new SecretToken(stdout.replace(/\r?\n$/, '')));
          else if (exitCodeOf(error) === ITEM_NOT_FOUND_EXIT_CODE) resolve(null);
          else reject(new TokenVaultUnavailableError(platform, 'read', failureOf(error), exitCodeOf(error)));
        },
      );
    });
  }

  /**
   * `security -i` with one command line on stdin; stdout and stderr are ignored, never read. Finding
   * F-2: a command past its timeout is killed and its exit awaited, at most
   * `KILLED_CHILD_EXIT_WAIT_MS`, before the timeout is reported, so the caller does not release
   * `token.lock` while the tool may still write.
   */
  private runInteractive(platform: Platform, commandLine: string, timeoutMs: number): Promise<void> {
    this.assertTimeLeft(platform, 'write', timeoutMs);
    return new Promise((resolve, reject) => {
      const child = spawn(SECURITY_TOOL_PATH, ['-i'], { stdio: ['pipe', 'ignore', 'ignore'], shell: false, windowsHide: true });
      let killed = false;
      let exitWait: ReturnType<typeof setTimeout> | undefined;
      const rejectTimeout = (): void => reject(new TokenVaultUnavailableError(platform, 'write', 'timeout'));
      const timer = setTimeout(() => {
        killed = true;
        child.kill('SIGKILL');
        exitWait = setTimeout(rejectTimeout, KILLED_CHILD_EXIT_WAIT_MS);
      }, timeoutMs);
      const stopTimers = (): void => {
        clearTimeout(timer);
        clearTimeout(exitWait);
      };
      child.once('error', () => {
        stopTimers();
        if (killed) rejectTimeout();
        else reject(new TokenVaultUnavailableError(platform, 'write', 'command-failed'));
      });
      child.once('exit', (code) => {
        stopTimers();
        if (killed) rejectTimeout();
        else if (code === 0) resolve();
        else reject(new TokenVaultUnavailableError(platform, 'write', 'command-failed', code));
      });
      // A broken pipe (the tool exited early) surfaces as the exit status above.
      child.stdin.once('error', () => undefined);
      child.stdin.end(commandLine, 'utf8');
    });
  }

  private assertDarwin(platform: Platform, operation: TokenVaultOperation): void {
    if (process.platform !== 'darwin') throw new TokenVaultUnavailableError(platform, operation, 'unsupported-platform');
  }

  /** A spent lock budget refuses before any process is spawned. */
  private assertTimeLeft(platform: Platform, operation: TokenVaultOperation, timeoutMs: number): void {
    if (timeoutMs <= 0) throw new TokenVaultUnavailableError(platform, operation, 'timeout');
  }
}
