import { posix } from 'node:path';

/*
 * C3 `payload/manifest.json`: `{ version, builtAt, files }`, where `files` maps each staged file's
 * path, relative to `payload/` in POSIX form, to its hex SHA-256. Written by the staging script
 * (ticket 03); read here only.
 */

export interface PayloadManifest {
  readonly version: string;
  readonly builtAt: string;
  readonly files: ReadonlyMap<string, string>;
}

export type ManifestParse = { readonly status: 'valid'; readonly manifest: PayloadManifest } | { readonly status: 'invalid' };

const SHA256_HEX = /^[0-9a-f]{64}$/;
const MAX_FIELD_CHARS = 64;
const MAX_RELATIVE_PATH_CHARS = 1024;

function isRecordObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isShortText(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_FIELD_CHARS;
}

/** Relative, normalized, inside `payload/`: no leading slash, no `..`, no NUL or line break. */
export function isSafeRelativePath(path: string): boolean {
  if (path.length === 0 || path.length > MAX_RELATIVE_PATH_CHARS) return false;
  if (path.startsWith('/') || /[\0\r\n\\]/.test(path)) return false;
  if (path.split('/').includes('..')) return false;
  return posix.normalize(path) === path;
}

export function parsePayloadManifest(text: string): ManifestParse {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { status: 'invalid' };
  }
  if (!isRecordObject(parsed)) return { status: 'invalid' };
  const { version, builtAt, files } = parsed;
  if (!isShortText(version) || !isShortText(builtAt) || !isRecordObject(files)) return { status: 'invalid' };
  const entries = new Map<string, string>();
  for (const [path, hash] of Object.entries(files)) {
    if (!isSafeRelativePath(path) || typeof hash !== 'string' || !SHA256_HEX.test(hash)) return { status: 'invalid' };
    entries.set(path, hash);
  }
  if (entries.size === 0) return { status: 'invalid' };
  return { status: 'valid', manifest: { version, builtAt, files: entries } };
}

export type PayloadVerification = { readonly status: 'intact' } | { readonly status: 'damaged' };

/** Bounded parallel hashing: fast on an SSD without opening thousands of files at once. */
const HASH_CONCURRENCY = 8;

/** Re-hashes every listed file; one missing or different file makes the payload damaged. */
export async function verifyPayloadFiles(
  manifest: PayloadManifest,
  payloadRoot: string,
  sha256: (path: string) => Promise<string | null>,
): Promise<PayloadVerification> {
  const queue = [...manifest.files.entries()];
  let damaged = false;
  const worker = async (): Promise<void> => {
    for (let entry = queue.shift(); entry !== undefined && !damaged; entry = queue.shift()) {
      const [relativePath, expected] = entry;
      const actual = await sha256(posix.join(payloadRoot, relativePath));
      if (actual !== expected) damaged = true;
    }
  };
  await Promise.all(Array.from({ length: HASH_CONCURRENCY }, () => worker()));
  return damaged ? { status: 'damaged' } : { status: 'intact' };
}
