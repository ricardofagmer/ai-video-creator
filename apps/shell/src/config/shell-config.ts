import { readFile, stat } from 'node:fs/promises';
import { posix } from 'node:path';
import { hasErrorCode } from '../platform/error-code';

/*
 * `shell-config.json`, bundled beside `main.js` inside `app.asar` by the packaging step, so the asar
 * integrity fuse covers it. Why a baked file: a login-item app starts with a minimal PATH, so `node`
 * and `studio` cannot be found by name, and fuse RunAsNode is off, so the app cannot be its own Node.
 * The values never come from an environment variable, an argument or a data-home file.
 */

export interface ShellConfig {
  readonly format: 1;
  /** Absolute Node binary the installer used (the same value the watcher plist gets). */
  readonly nodeBinary: string;
  /** Absolute path of `tools/cli/dist/main.js`. */
  readonly cliMain: string;
  /** Absolute, normalized data home root. */
  readonly dataHome: string;
  readonly webPort: number;
  readonly apiPort: number;
}

const CONFIG_FIELDS = ['format', 'nodeBinary', 'cliMain', 'dataHome', 'webPort', 'apiPort'] as const;
export type ShellConfigField = (typeof CONFIG_FIELDS)[number];

export type ShellConfigErrorReason =
  | 'missing'
  | 'unreadable'
  | 'too-large'
  | 'invalid-json'
  | 'not-an-object'
  | 'unknown-key'
  | 'missing-key'
  | 'invalid-format'
  | 'invalid-path'
  | 'relative-path'
  | 'unsafe-path'
  | 'invalid-port'
  | 'equal-ports';

/** The message names the reason and the field only, never a value or a path (K7). */
export class ShellConfigError extends Error {
  readonly reason: ShellConfigErrorReason;
  readonly field: ShellConfigField | null;

  constructor(reason: ShellConfigErrorReason, field: ShellConfigField | null = null) {
    super(field === null ? `Shell configuration is invalid: ${reason}` : `Shell configuration is invalid: ${reason} (${field})`);
    this.name = 'ShellConfigError';
    this.reason = reason;
    this.field = field;
  }
}

/** A valid file is a few hundred bytes; anything far larger is not ours. */
const MAX_CONFIG_BYTES = 16 * 1024;
const MAX_PATH_CHARS = 4096;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

function isConfigField(key: string): key is ShellConfigField {
  return CONFIG_FIELDS.some((field) => field === key);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function checkedPath(raw: unknown, field: ShellConfigField): string {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_PATH_CHARS) throw new ShellConfigError('invalid-path', field);
  if (/[\r\n\0]/.test(raw)) throw new ShellConfigError('unsafe-path', field);
  if (!raw.startsWith('/')) throw new ShellConfigError('relative-path', field);
  if (raw.split('/').includes('..')) throw new ShellConfigError('unsafe-path', field);
  // `.` segments, doubled or trailing separators: the path must already be in normal form.
  const normalForm = raw.length > 1 && raw.endsWith('/') ? null : posix.normalize(raw);
  if (normalForm !== raw) throw new ShellConfigError('unsafe-path', field);
  return raw;
}

function checkedPort(raw: unknown, field: ShellConfigField): number {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < MIN_PORT || raw > MAX_PORT) {
    throw new ShellConfigError('invalid-port', field);
  }
  return raw;
}

/** Strict parse of the file text: unknown keys, relative or unsafe paths and bad ports are typed errors. */
export function parseShellConfig(text: string): ShellConfig {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // The parser's message can quote file content; only the reason id leaves this function.
    throw new ShellConfigError('invalid-json');
  }
  if (!isRecord(parsed)) throw new ShellConfigError('not-an-object');
  for (const key of Object.keys(parsed)) {
    if (!isConfigField(key)) throw new ShellConfigError('unknown-key');
  }
  for (const field of CONFIG_FIELDS) {
    if (!(field in parsed)) throw new ShellConfigError('missing-key', field);
  }
  if (parsed['format'] !== 1) throw new ShellConfigError('invalid-format', 'format');
  const webPort = checkedPort(parsed['webPort'], 'webPort');
  const apiPort = checkedPort(parsed['apiPort'], 'apiPort');
  if (webPort === apiPort) throw new ShellConfigError('equal-ports', 'apiPort');
  return {
    format: 1,
    nodeBinary: checkedPath(parsed['nodeBinary'], 'nodeBinary'),
    cliMain: checkedPath(parsed['cliMain'], 'cliMain'),
    dataHome: checkedPath(parsed['dataHome'], 'dataHome'),
    webPort,
    apiPort,
  };
}

/**
 * Reads and parses the bundled file. Uses `stat` + `readFile` rather than a raw descriptor read
 * because the file lives inside `app.asar`, where Electron's archive support covers these calls.
 */
export async function readShellConfig(filePath: string): Promise<ShellConfig> {
  let size: number;
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) throw new ShellConfigError('unreadable');
    size = stats.size;
  } catch (error) {
    if (error instanceof ShellConfigError) throw error;
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) throw new ShellConfigError('missing');
    throw new ShellConfigError('unreadable');
  }
  if (size > MAX_CONFIG_BYTES) throw new ShellConfigError('too-large');
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    throw new ShellConfigError('unreadable');
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_CONFIG_BYTES) throw new ShellConfigError('too-large');
  return parseShellConfig(text);
}
