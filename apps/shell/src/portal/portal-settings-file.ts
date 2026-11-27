import { readFile, stat } from 'node:fs/promises';
import { type ShellConfigErrorReason } from '../config/shell-config';
import { hasErrorCode } from '../platform/error-code';
import { parsePortalOrigin, parseReleaseManifestUrl, PORTAL_ORIGIN_ENV_VAR, RELEASE_MANIFEST_URL_ENV_VAR, type HttpsSetting } from './portal-settings';

/*
 * `portal-settings.json`, written by the dmg packaging beside `main.js` inside `app.asar` (so the
 * asar integrity fuse covers it). An app started from Finder or at login has no shell environment,
 * so the two portal addresses are baked at packaging time. Packaged mode only: development keeps
 * reading the process environment alone. Both values are public addresses, never secrets.
 */

export const PORTAL_SETTINGS_FILE_NAME = 'portal-settings.json';

/** Two short URLs; anything larger is not a file the packaging wrote. */
const MAX_FILE_BYTES = 8192;

/** File key -> the environment name it stands in for. */
const FILE_KEYS = {
  portalOrigin: PORTAL_ORIGIN_ENV_VAR,
  releaseManifestUrl: RELEASE_MANIFEST_URL_ENV_VAR,
} as const;

type FileKey = keyof typeof FILE_KEYS;

const FILE_PARSERS: Readonly<Record<FileKey, (raw: string) => HttpsSetting>> = {
  portalOrigin: parsePortalOrigin,
  releaseManifestUrl: parseReleaseManifestUrl,
};

export type PortalSettingsFileProblem =
  | Extract<ShellConfigErrorReason, 'unreadable' | 'too-large' | 'invalid-json' | 'not-an-object' | 'unknown-key'>
  | 'invalid-value';

/** Environment name -> normalized value, for the keys the file sets. */
export type PortalSettingsValues = Readonly<Partial<Record<(typeof FILE_KEYS)[FileKey], string>>>;

export type PortalSettingsFile =
  | { readonly kind: 'absent' }
  | { readonly kind: 'read'; readonly values: PortalSettingsValues }
  | { readonly kind: 'invalid'; readonly problem: PortalSettingsFileProblem };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFileKey(key: string): key is FileKey {
  return Object.hasOwn(FILE_KEYS, key);
}

/** Strict parse: only the two keys, each a valid https value; a key that is absent stays unset. */
export function parsePortalSettingsFile(text: string): PortalSettingsFile {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { kind: 'invalid', problem: 'invalid-json' };
  }
  if (!isRecord(parsed)) return { kind: 'invalid', problem: 'not-an-object' };
  const values: Partial<Record<(typeof FILE_KEYS)[FileKey], string>> = {};
  for (const [key, raw] of Object.entries(parsed)) {
    if (!isFileKey(key)) return { kind: 'invalid', problem: 'unknown-key' };
    if (typeof raw !== 'string') return { kind: 'invalid', problem: 'invalid-value' };
    const setting = FILE_PARSERS[key](raw);
    if (setting.kind !== 'configured') return { kind: 'invalid', problem: 'invalid-value' };
    values[FILE_KEYS[key]] = setting.url;
  }
  return { kind: 'read', values };
}

/**
 * Reads the bundled file. `stat` + `readFile` rather than a descriptor read because the file lives
 * inside `app.asar`, where Electron's archive support covers these calls (as `shell-config.ts`).
 */
export async function readPortalSettingsFile(filePath: string): Promise<PortalSettingsFile> {
  try {
    const stats = await stat(filePath);
    if (!stats.isFile()) return { kind: 'invalid', problem: 'unreadable' };
    if (stats.size > MAX_FILE_BYTES) return { kind: 'invalid', problem: 'too-large' };
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) return { kind: 'absent' };
    return { kind: 'invalid', problem: 'unreadable' };
  }
  let text: string;
  try {
    text = await readFile(filePath, 'utf8');
  } catch {
    return { kind: 'invalid', problem: 'unreadable' };
  }
  if (Buffer.byteLength(text, 'utf8') > MAX_FILE_BYTES) return { kind: 'invalid', problem: 'too-large' };
  return parsePortalSettingsFile(text);
}

/**
 * The packaged shell's effective environment: a non-blank value already in the process environment
 * wins (an owner can point a copy at another portal from a terminal); otherwise the file's value.
 */
export function withPortalSettingsFile(
  environment: Readonly<Record<string, string | undefined>>,
  file: PortalSettingsFile,
): Readonly<Record<string, string | undefined>> {
  if (file.kind !== 'read') return environment;
  const effective: Record<string, string | undefined> = { ...environment };
  for (const [name, value] of Object.entries(file.values)) {
    const present = environment[name]?.trim() ?? '';
    if (value !== undefined && present === '') effective[name] = value;
  }
  return effective;
}
