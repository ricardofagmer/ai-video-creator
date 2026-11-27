import { execFile, spawn } from 'node:child_process';
import { Injectable } from '@nestjs/common';
import { KEYCHAIN_ACCOUNTS, KEYCHAIN_LABELS, KEYCHAIN_SERVICE, secretValuePattern, type SecretName } from './secret-names';
import { KeychainUnavailableError, KeychainWriteNeedsTerminalError, MalformedSecretError } from './secrets.errors';

/** Absolute path: never resolved through PATH, so a planted `security` binary is not run. */
export const SECURITY_TOOL_PATH = '/usr/bin/security';

/** `security` exit status for errSecItemNotFound. */
const ITEM_NOT_FOUND_EXIT_CODE = 44;

/**
 * Long enough for the owner to answer a Keychain access dialog the first time; a launchd watcher
 * with no one to answer it fails closed instead of hanging the start.
 */
export const KEYCHAIN_READ_TIMEOUT_MS = 20_000;
const KEYCHAIN_READ_MAX_BYTES = 4096;

export type KeychainLookup = { status: 'found'; value: string } | { status: 'not-found' };

function exitCodeOf(error: unknown): number | null {
  if (typeof error !== 'object' || error === null || !('code' in error)) return null;
  return typeof error.code === 'number' ? error.code : null;
}

function wasKilled(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'killed' in error && error.killed === true;
}

function exceededBuffer(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ERR_CHILD_PROCESS_STDIO_MAXBUFFER';
}

/**
 * argv is built from compile-time constants only: the account comes from `KEYCHAIN_ACCOUNTS`
 * keyed by a `SecretName`, never from caller text. No shell is involved (`execFile`).
 */
export function keychainReadArguments(name: SecretName): readonly string[] {
  return ['find-generic-password', '-s', KEYCHAIN_SERVICE, '-a', KEYCHAIN_ACCOUNTS[name], '-w'];
}

/**
 * The value is the LAST argument-less `-w`: `security` then prompts for it on the terminal
 * (security(1): "Put at end of command to be prompted (recommended)"), so the key never appears
 * in argv, in `ps`, in this process's memory or in shell history. `-U` replaces an existing item;
 * `-T` lets `/usr/bin/security` read it later without an access dialog.
 */
export function keychainWriteArguments(name: SecretName): readonly string[] {
  return [
    'add-generic-password',
    '-U',
    '-s',
    KEYCHAIN_SERVICE,
    '-a',
    KEYCHAIN_ACCOUNTS[name],
    '-l',
    KEYCHAIN_LABELS[name],
    '-T',
    SECURITY_TOOL_PATH,
    '-w',
  ];
}

/** Reads provider keys from the login Keychain through `/usr/bin/security` (D3, PRD 12). */
@Injectable()
export class KeychainReader {
  read(name: SecretName): Promise<KeychainLookup> {
    if (process.platform !== 'darwin') {
      return Promise.reject(new KeychainUnavailableError(name, 'unsupported-platform', null));
    }
    return new Promise<KeychainLookup>((resolve, reject) => {
      execFile(
        SECURITY_TOOL_PATH,
        [...keychainReadArguments(name)],
        { encoding: 'utf8', timeout: KEYCHAIN_READ_TIMEOUT_MS, maxBuffer: KEYCHAIN_READ_MAX_BYTES, shell: false, windowsHide: true },
        (error, stdout) => {
          // `error` is never attached to what we reject with: on a timeout or buffer overflow it
          // carries the partial stdout, which can hold the key.
          if (error === null) {
            resolve({ status: 'found', value: stdout.replace(/\r?\n$/, '') });
            return;
          }
          const exitCode = exitCodeOf(error);
          if (exitCode === ITEM_NOT_FOUND_EXIT_CODE) {
            resolve({ status: 'not-found' });
            return;
          }
          if (exceededBuffer(error)) reject(new KeychainUnavailableError(name, 'output-too-large', null));
          else if (wasKilled(error)) reject(new KeychainUnavailableError(name, 'timeout', null));
          else reject(new KeychainUnavailableError(name, 'command-failed', exitCode));
        },
      );
    });
  }
}

/**
 * Stores a provider key for `studio secrets set <name>` (R1-21). The owner types the value into
 * the `security` prompt on the inherited terminal; this process never receives, holds, logs or
 * passes it. Refuses to run without a terminal, where `security` could not prompt.
 */
@Injectable()
export class KeychainWriter {
  promptAndStore(name: SecretName): Promise<void> {
    if (process.platform !== 'darwin') {
      return Promise.reject(new KeychainUnavailableError(name, 'unsupported-platform', null));
    }
    if (process.stdin.isTTY !== true) return Promise.reject(new KeychainWriteNeedsTerminalError(name));
    return new Promise<void>((resolve, reject) => {
      const child = spawn(SECURITY_TOOL_PATH, [...keychainWriteArguments(name)], { stdio: 'inherit', shell: false });
      child.once('error', () => reject(new KeychainUnavailableError(name, 'command-failed', null)));
      child.once('exit', (code) => {
        if (code === 0) resolve();
        else reject(new KeychainUnavailableError(name, 'command-failed', code));
      });
    });
  }
}

/**
 * Reads the item `promptAndStore` just wrote and checks only its shape, with the same trim and
 * pattern the api and watcher apply at boot. Without it a short or empty value is accepted at
 * `secrets set` and only surfaces later as a boot failure. The value is held for this check alone:
 * it is never returned, printed or attached to the error, which names the secret only.
 */
export async function assertStoredSecretWellFormed(name: SecretName, reader: Pick<KeychainReader, 'read'> = new KeychainReader()): Promise<void> {
  const lookup = await reader.read(name);
  const wellFormed = lookup.status === 'found' && secretValuePattern(name).test(lookup.value.trim());
  if (!wellFormed) throw new MalformedSecretError(name, 'keychain');
}
