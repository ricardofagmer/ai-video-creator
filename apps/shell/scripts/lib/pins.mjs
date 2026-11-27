// Every downloaded input of the .dmg, pinned by URL, byte size and SHA-256 (ticket 03, plan C3 rev 3,
// docs/vetting/0006-installer-and-portal.md). A value the vetting did not record is `null`, never a
// guess: `assertPinned` then stops the build and names the constant and where its value comes from.
// Changing a pin is a supply-chain review (rules/security.md), not a convenience edit.
import { fail } from './failure.mjs';

/**
 * Only these hosts are ever contacted, named in vetting 0006 section 4. ffmpeg is no longer
 * downloaded by packaging (plan 9.2), so its hosts are gone; the ffmpeg build pins its own.
 */
export const ALLOWED_DOWNLOAD_HOSTS = Object.freeze(['nodejs.org']);

/** Vetting 0006 section 4 and correction 11: Node v24.22.3 LTS "Krypton", darwin-arm64 tarball. */
export const NODE_VERSION = '24.22.3';
export const NODE_TARBALL = Object.freeze({
  constant: 'NODE_TARBALL',
  label: `Node v${NODE_VERSION} darwin-arm64`,
  url: `https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-darwin-arm64.tar.xz`,
  fileName: `node-v${NODE_VERSION}-darwin-arm64.tar.xz`,
  bytes: 27519132,
  sha256: '1d64136c8a43d648d1b3bad10797a4c995b1ca032d2bde8799de43b37f058fe5',
  source: 'docs/vetting/0006 section 4 (SHASUMS256.txt of v24.22.3)',
});
/** Members of the tarball that are staged: the binary and the licence (MIT plus bundled notices). */
export const NODE_MEMBERS = Object.freeze({
  binary: `node-v${NODE_VERSION}-darwin-arm64/bin/node`,
  licence: `node-v${NODE_VERSION}-darwin-arm64/LICENSE`,
});

/**
 * Plan 9.2, contract C4 rev 1: ffmpeg and ffprobe are built by scripts/ffmpeg-build/build-ffmpeg.sh
 * from pinned sources, never downloaded here. Packaging reads that build folder and checks it
 * against its build-manifest.json (runtime-tools.mjs). The variable holds a path, never a secret.
 */
export const FFMPEG_BUILD_DIR_VARIABLE = 'ENGINEOS_FFMPEG_BUILD_DIR';
/** C2 rev 2 `latest.json.sources[].licence` for ffmpeg; the build manifest must state the same. */
export const FFMPEG_SOURCE_LICENCE = 'GPL-3.0-or-later';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;

/** Fails closed, naming the constant and its source, unless the pin is complete and well formed. */
export function assertPinned(pin) {
  const missing = ['url', 'fileName', 'bytes', 'sha256'].filter((field) => pin[field] === null || pin[field] === undefined);
  if (missing.length > 0) {
    fail(`${pin.constant} in apps/shell/scripts/lib/pins.mjs is not pinned (${missing.join(', ')}); source: ${pin.source}. Nothing was downloaded.`);
  }
  if (!SHA256_PATTERN.test(pin.sha256)) fail(`${pin.constant}.sha256 is not 64 lower-case hex characters.`);
  if (!Number.isInteger(pin.bytes) || pin.bytes <= 0) fail(`${pin.constant}.bytes is not a positive integer.`);
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(pin.fileName)) fail(`${pin.constant}.fileName is not a plain file name.`);
  const url = new URL(pin.url);
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '' || url.search !== '') {
    fail(`${pin.constant}.url must be a plain https URL without credentials, port or query.`);
  }
  if (!ALLOWED_DOWNLOAD_HOSTS.includes(url.hostname)) fail(`${pin.constant}.url host ${url.hostname} is not named in vetting 0006.`);
  return pin;
}
