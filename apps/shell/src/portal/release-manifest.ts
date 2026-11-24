/*
 * Contract C2 rev 2 (`.specs/features/desktop-installer/plan.md` sections 3 and 9): `latest.json`.
 * No shared schema exists (the portal keeps its own zod copy), so the shell parses it strictly
 * here: every field is checked, every URL must be https. Unknown fields are ignored rather than
 * refused, as the portal does, so an additive revision does not hide the update line.
 */

/** `InstallVersionSchema` of `@studio/shared/api`, rebuilt for the same reason as the pair code pattern. */
const VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z-]+(\.[0-9A-Za-z-]+)*)?$/;
const MAX_VERSION_CHARS = 64;
const MAX_URL_CHARS = 2048;
const MAX_LIST_ENTRIES = 16;
const SHA256_PATTERN = /^[0-9a-fA-F]{64}$/;
const PLATFORMS = ['darwin-arm64', 'win32-x64'] as const;

export type ReleasePlatform = (typeof PLATFORMS)[number];

/** The platform this shell ships for (phase 1 is macOS arm64 only). */
export const SHELL_PLATFORM: ReleasePlatform = 'darwin-arm64';

export interface ReleaseAsset {
  readonly platform: ReleasePlatform;
  readonly url: string;
}

export interface ReleaseManifest {
  readonly version: string;
  readonly assets: readonly ReleaseAsset[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isBoundedString(value: unknown, maxChars: number): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= maxChars;
}

export function isReleaseVersion(value: unknown): value is string {
  return isBoundedString(value, MAX_VERSION_CHARS) && VERSION_PATTERN.test(value);
}

function isHttpsUrl(value: unknown): value is string {
  if (!isBoundedString(value, MAX_URL_CHARS)) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.username === '' && url.password === '';
  } catch {
    return false;
  }
}

function isPlatform(value: unknown): value is ReleasePlatform {
  return PLATFORMS.some((platform) => platform === value);
}

function parseAsset(value: unknown): ReleaseAsset | null {
  if (!isRecord(value)) return null;
  const { platform, file, url, sha256, bytes } = value;
  if (!isPlatform(platform) || !isBoundedString(file, 256) || !isHttpsUrl(url)) return null;
  if (typeof sha256 !== 'string' || !SHA256_PATTERN.test(sha256)) return null;
  if (typeof bytes !== 'number' || !Number.isSafeInteger(bytes) || bytes < 0) return null;
  return { platform, url };
}

function isSource(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const { name, licence, url, sha256 } = value;
  return isBoundedString(name, 64) && isBoundedString(licence, 64) && isHttpsUrl(url) && typeof sha256 === 'string' && SHA256_PATTERN.test(sha256);
}

function isBoundedList(value: unknown): value is readonly unknown[] {
  return Array.isArray(value) && value.length <= MAX_LIST_ENTRIES;
}

/** The manifest, or null when any field breaks C2 rev 2. */
export function parseReleaseManifest(value: unknown): ReleaseManifest | null {
  if (!isRecord(value)) return null;
  const { version, publishedAt, assets, sources } = value;
  if (!isReleaseVersion(version)) return null;
  if (!isBoundedString(publishedAt, 64) || !Number.isFinite(Date.parse(publishedAt))) return null;
  if (!isBoundedList(assets) || !isBoundedList(sources) || !sources.every(isSource)) return null;
  const parsedAssets: ReleaseAsset[] = [];
  for (const entry of assets) {
    const asset = parseAsset(entry);
    if (asset === null) return null;
    parsedAssets.push(asset);
  }
  return { version, assets: parsedAssets };
}

interface SplitVersion {
  readonly core: readonly number[];
  readonly preRelease: readonly string[];
}

function splitVersion(version: string): SplitVersion {
  const dash = version.indexOf('-');
  const corePart = dash === -1 ? version : version.slice(0, dash);
  const prePart = dash === -1 ? '' : version.slice(dash + 1);
  return { core: corePart.split('.').map((part) => Number.parseInt(part, 10)), preRelease: prePart === '' ? [] : prePart.split('.') };
}

const NUMERIC = /^[0-9]+$/;

function compareIdentifier(left: string, right: string): number {
  const leftNumeric = NUMERIC.test(left);
  const rightNumeric = NUMERIC.test(right);
  if (leftNumeric && rightNumeric) return Number.parseInt(left, 10) - Number.parseInt(right, 10);
  // SemVer 11.4.3: numeric identifiers rank below alphanumeric ones.
  if (leftNumeric) return -1;
  if (rightNumeric) return 1;
  return left < right ? -1 : left > right ? 1 : 0;
}

function comparePreRelease(left: readonly string[], right: readonly string[]): number {
  // A release outranks any pre-release of the same core version.
  if (left.length === 0 || right.length === 0) return right.length - left.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1) {
    const a = left[index];
    const b = right[index];
    if (a === undefined) return -1;
    if (b === undefined) return 1;
    const difference = compareIdentifier(a, b);
    if (difference !== 0) return difference;
  }
  return 0;
}

/** SemVer 2.0.0 precedence: negative when `left` is older, zero when equal, positive when newer. */
export function compareVersions(left: string, right: string): number {
  const a = splitVersion(left);
  const b = splitVersion(right);
  for (let index = 0; index < 3; index += 1) {
    const difference = (a.core[index] ?? 0) - (b.core[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return comparePreRelease(a.preRelease, b.preRelease);
}

/** The download of this shell's platform when the manifest names a newer version (DI-AC-17). */
export function availableUpdate(manifest: ReleaseManifest, installedVersion: string): { version: string; downloadUrl: string } | null {
  if (!isReleaseVersion(installedVersion) || compareVersions(manifest.version, installedVersion) <= 0) return null;
  const asset = manifest.assets.find((entry) => entry.platform === SHELL_PLATFORM);
  return asset === undefined ? null : { version: manifest.version, downloadUrl: asset.url };
}
