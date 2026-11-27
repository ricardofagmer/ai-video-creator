// Contract C2 rev 2 (.specs/features/desktop-installer/plan.md sections 3 and 9): renders and
// validates `latest.json` from the release records the .dmg packaging writes (ticket 03). Pure
// functions only: no file system, no clock, no network. Every malformed or missing field fails
// closed with a message naming the field, never with a partial manifest.

export class ReleaseError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ReleaseError';
  }
}

export function fail(message) {
  throw new ReleaseError(message);
}

/** C1 `InstallPlatformSchema` (packages/shared/src/api/install.ts): the only platform values. */
export const KNOWN_PLATFORMS = Object.freeze(['darwin-arm64', 'win32-x64']);
export const MANIFEST_FILE = 'latest.json';
/** Strict X.Y.Z: the .dmg name and the app version accept no pre-release suffix (disk-image.mjs). */
export const RELEASE_VERSION_PATTERN = /^(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
const LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/;
const MAX_ENTRIES = 16;
const MANIFEST_KEYS = ['version', 'publishedAt', 'assets', 'sources'];
const ASSET_KEYS = ['platform', 'file', 'url', 'sha256', 'bytes'];
const SOURCE_KEYS = ['name', 'licence', 'url', 'sha256'];
const PUBLISHED_AT_PATTERN = /^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$/;

export function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function requireRecord(value, what) {
  if (!isRecord(value)) fail(`${what} is not a JSON object.`);
  return value;
}

function requireArray(value, what) {
  if (!Array.isArray(value)) fail(`${what} is not an array.`);
  if (value.length > MAX_ENTRIES) fail(`${what} holds more than ${MAX_ENTRIES} entries.`);
  return value;
}

function requireExactKeys(record, keys, what) {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.join(',') !== expected.join(',')) fail(`${what} must hold exactly ${expected.join(', ')}; found ${actual.join(', ') || 'nothing'}.`);
}

export function requireSha256(value, what) {
  if (typeof value !== 'string' || !SHA256_PATTERN.test(value)) fail(`${what} is not 64 lower-case hex characters.`);
  return value;
}

function requireBytes(value, what) {
  if (!Number.isSafeInteger(value) || value <= 0) fail(`${what} is not a positive integer.`);
  return value;
}

export function requireFileName(value, what) {
  if (typeof value !== 'string' || !FILE_NAME_PATTERN.test(value) || value === MANIFEST_FILE) {
    fail(`${what} is not a plain file name (letters, digits, dot, dash, underscore).`);
  }
  return value;
}

function requireLabel(value, what) {
  if (typeof value !== 'string' || !LABEL_PATTERN.test(value)) fail(`${what} is not a short plain label.`);
  return value;
}

export function requireReleaseVersion(value, what) {
  if (typeof value !== 'string' || !RELEASE_VERSION_PATTERN.test(value)) fail(`${what} is not a X.Y.Z version.`);
  return value;
}

function requirePlatform(value, what) {
  if (typeof value !== 'string' || !KNOWN_PLATFORMS.includes(value)) fail(`${what} is not one of ${KNOWN_PLATFORMS.join(', ')}.`);
  return value;
}

/** A plain https URL: no credentials, no port, no query, no fragment. */
export function requireHttpsUrl(value, what) {
  if (typeof value !== 'string' || value.length > 2048) fail(`${what} is not a URL string of at most 2048 characters.`);
  let url;
  try {
    url = new URL(value);
  } catch {
    fail(`${what} is not a valid URL.`);
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '' || url.search !== '' || url.hash !== '') {
    fail(`${what} must be a plain https URL without credentials, port, query or fragment.`);
  }
  return url;
}

function assertUnique(values, what) {
  if (new Set(values).size !== values.length) fail(`${what} must be unique.`);
}

/** C2 names the macOS asset `EngineOS-Video-Creator-<version>-arm64.dmg` (disk-image.mjs). */
export function expectedDiskImageName(platform, version) {
  return platform === 'darwin-arm64' ? `EngineOS-Video-Creator-${version}-arm64.dmg` : undefined;
}

/** `<dmg>.json` of ticket 03: `{ platform, file, version, sha256, bytes }`. */
export function parseDiskImageRecord(raw) {
  const what = 'the .dmg release record';
  const record = requireRecord(raw, what);
  const platform = requirePlatform(record.platform, `${what} platform`);
  const version = requireReleaseVersion(record.version, `${what} version`);
  const file = requireFileName(record.file, `${what} file`);
  const expected = expectedDiskImageName(platform, version);
  if (expected !== undefined && file !== expected) fail(`${what} file is ${file}; contract C2 expects ${expected}.`);
  return { platform, file, version, sha256: requireSha256(record.sha256, `${what} sha256`), bytes: requireBytes(record.bytes, `${what} bytes`) };
}

/** `sources.json` of ticket 03: `{ sources: [{ name, licence, file, sha256, bytes, upstreamUrl }] }`. */
export function parseSourcesRecord(raw) {
  const what = 'sources.json';
  const record = requireRecord(raw, what);
  const entries = requireArray(record.sources, `${what} sources`);
  if (entries.length === 0) fail(`${what} sources is empty; DI-AC-25 needs the ffmpeg corresponding source.`);
  const sources = entries.map((entry, index) => {
    const at = `${what} sources[${index}]`;
    const source = requireRecord(entry, at);
    return {
      name: requireLabel(source.name, `${at}.name`),
      licence: requireLabel(source.licence, `${at}.licence`),
      file: requireFileName(source.file, `${at}.file`),
      sha256: requireSha256(source.sha256, `${at}.sha256`),
      bytes: requireBytes(source.bytes, `${at}.bytes`),
    };
  });
  assertUnique(sources.map((source) => source.name), `${what} source names`);
  assertUnique(sources.map((source) => source.file), `${what} source files`);
  if (!sources.some((source) => source.name === 'ffmpeg')) fail(`${what} names no ffmpeg source; DI-AC-25 needs it.`);
  return sources;
}

/** The release download folder: `https://<host>/<owner>/<repo>/releases/download/v<version>/`. */
export function parseReleaseBaseUrl(value, version) {
  const url = requireHttpsUrl(value, 'the release base URL');
  const segments = url.pathname.split('/');
  const shaped = segments.length === 7 && segments[0] === '' && segments[3] === 'releases' && segments[4] === 'download' && segments[6] === '';
  if (!shaped || segments[1] === '' || segments[2] === '') fail('the release base URL must be https://<host>/<owner>/<repo>/releases/download/<tag>/.');
  if (segments[5] !== `v${version}`) fail(`the release base URL names tag ${segments[5]}; the .dmg reports version ${version} (tag v${version}).`);
  return url.href;
}

/** RFC 3339 UTC to the second, as the C2 example writes it. */
export function formatPublishedAt(now) {
  if (!(now instanceof Date) || Number.isNaN(now.getTime())) fail('the clock gave no valid date.');
  return now.toISOString().replace(/\.[0-9]{3}Z$/, 'Z');
}

export function checksumFileName(file) {
  return `${file}.sha256`;
}

/** `shasum -a 256 --check` format: `<hex>  <file>`. */
export function checksumFileContent({ sha256, file }) {
  return `${requireSha256(sha256, 'checksum sha256')}  ${requireFileName(file, 'checksum file')}\n`;
}

function assetUrl(baseUrl, file) {
  return new URL(encodeURIComponent(file), baseUrl).href;
}

/** `latest.json` in C2 rev 2 shape, key order as the contract writes it. */
export function renderManifest({ diskImage, sources, baseUrl, now }) {
  const base = parseReleaseBaseUrl(baseUrl, diskImage.version);
  const releaseFiles = [diskImage.file, checksumFileName(diskImage.file), MANIFEST_FILE, ...sources.map((source) => source.file)];
  assertUnique(releaseFiles, 'release asset file names');
  const manifest = {
    version: diskImage.version,
    publishedAt: formatPublishedAt(now),
    assets: [{ platform: diskImage.platform, file: diskImage.file, url: assetUrl(base, diskImage.file), sha256: diskImage.sha256, bytes: diskImage.bytes }],
    sources: sources.map((source) => ({ name: source.name, licence: source.licence, url: assetUrl(base, source.file), sha256: source.sha256 })),
  };
  return validateManifest(manifest);
}

/** Full C2 rev 2 check of a manifest: exact keys, X.Y.Z version, https URLs, hex sha256, bytes. */
export function validateManifest(raw) {
  const record = requireRecord(raw, MANIFEST_FILE);
  requireExactKeys(record, MANIFEST_KEYS, MANIFEST_FILE);
  const version = requireReleaseVersion(record.version, `${MANIFEST_FILE} version`);
  if (typeof record.publishedAt !== 'string' || !PUBLISHED_AT_PATTERN.test(record.publishedAt) || Number.isNaN(Date.parse(record.publishedAt))) {
    fail(`${MANIFEST_FILE} publishedAt is not an RFC 3339 UTC time (YYYY-MM-DDTHH:MM:SSZ).`);
  }
  const assets = requireArray(record.assets, `${MANIFEST_FILE} assets`).map((entry, index) => {
    const at = `${MANIFEST_FILE} assets[${index}]`;
    const asset = requireRecord(entry, at);
    requireExactKeys(asset, ASSET_KEYS, at);
    requireHttpsUrl(asset.url, `${at}.url`);
    return {
      platform: requirePlatform(asset.platform, `${at}.platform`),
      file: requireFileName(asset.file, `${at}.file`),
      url: asset.url,
      sha256: requireSha256(asset.sha256, `${at}.sha256`),
      bytes: requireBytes(asset.bytes, `${at}.bytes`),
    };
  });
  if (assets.length === 0) fail(`${MANIFEST_FILE} assets is empty.`);
  assertUnique(assets.map((asset) => asset.platform), `${MANIFEST_FILE} asset platforms`);
  const sources = requireArray(record.sources, `${MANIFEST_FILE} sources`).map((entry, index) => {
    const at = `${MANIFEST_FILE} sources[${index}]`;
    const source = requireRecord(entry, at);
    requireExactKeys(source, SOURCE_KEYS, at);
    requireHttpsUrl(source.url, `${at}.url`);
    return { name: requireLabel(source.name, `${at}.name`), licence: requireLabel(source.licence, `${at}.licence`), url: source.url, sha256: requireSha256(source.sha256, `${at}.sha256`) };
  });
  if (!sources.some((source) => source.name === 'ffmpeg')) fail(`${MANIFEST_FILE} sources names no ffmpeg archive (DI-AC-25).`);
  return { version, publishedAt: record.publishedAt, assets, sources };
}

export function serializeManifest(manifest) {
  return `${JSON.stringify(manifest, null, 2)}\n`;
}

/** Negative, zero or positive as `left` is older than, equal to or newer than `right`. */
export function compareReleaseVersions(left, right) {
  const leftParts = requireReleaseVersion(left, 'version').split('.').map((part) => Number.parseInt(part, 10));
  const rightParts = requireReleaseVersion(right, 'version').split('.').map((part) => Number.parseInt(part, 10));
  for (let index = 0; index < 3; index += 1) {
    if (leftParts[index] !== rightParts[index]) return leftParts[index] - rightParts[index];
  }
  return 0;
}
