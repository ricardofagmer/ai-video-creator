// Builds the self-contained `EngineOS Video Creator.app` and its `.dmg` (ticket 03, plan C3 rev 3,
// DI-AC-20, DI-AC-25 app half). Run from apps/shell after `pnpm install` and `pnpm exec turbo run build`:
//
//   pnpm --filter @studio/shell run package:dmg [-- --cache-dir <absolute folder>]
//
// Order: guards and every pin (nothing is downloaded while a pin is missing), the ffmpeg build folder
// of contract C4 checked against its build-manifest.json (no ffmpeg is downloaded), build outputs,
// pinned downloads verified by SHA-256, runtime/ staged at out/dmg/runtime through the runtime locator,
// payload, foreign-binary prune, licences, inside-out ad hoc signing of every nested Mach-O, the
// payload manifest, the shell app (packager, six fuses of ADR 0005; its asar holds main.js, the setup
// window files and portal-settings.json), runtime/ copied into
// Contents/Resources outside the asar, the bundle signature with strict deep verification and the
// fuses read back, then the release records and the image. Every child process gets an argument
// array and no shell; output carries paths, sizes and checksums only.
//
// The portal addresses are baked into the app (an app started from Finder or at login has no shell
// environment): ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN and ENGINEOS_VIDEO_CREATOR_RELEASE_MANIFEST_URL
// are read from this script's environment, https only. Unset leaves the matching menu entry off.
import { copyFile, mkdir, readdir, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve } from 'node:path';
import process from 'node:process';
import { parseArgs } from 'node:util';
import {
  APP_NAME,
  DIST_MAIN,
  OUT_DIR,
  PACKAGE_DIR,
  PackagingError,
  assertFuses,
  assertNoRedirectVariables,
  assertNotSymlink,
  assertRegularFile,
  assertSafeHost,
  packageApp,
  readAppVersion,
  readInstalledElectron,
  setFuses,
  signAdHoc,
} from './package-app.mjs';
import { buildDiskImage } from './lib/disk-image.mjs';
import { StagingError, fail, say } from './lib/failure.mjs';
import { collectThirdPartyNotices, stageFfmpegLicences } from './lib/licences.mjs';
import { verifyPayloadManifest, writePayloadManifest } from './lib/payload-manifest.mjs';
import { NODE_TARBALL, assertPinned } from './lib/pins.mjs';
import { ensurePinnedFile } from './lib/pinned-download.mjs';
import { createProcessRunner } from './lib/process-runner.mjs';
import { pruneForeignBinaries } from './lib/prune.mjs';
import { readFfmpegBuild, resolveFfmpegBuildDir, stageMediaTools, stageNode, stageStudioLauncher, writeReleaseSources } from './lib/runtime-tools.mjs';
import { signNestedCode, verifyNestedCode, verifyPrograms } from './lib/signing.mjs';
import { assertBuildOutputs, stagePayload } from './lib/stage-payload.mjs';

const DITTO = '/usr/bin/ditto';
const REPO_ROOT = resolve(PACKAGE_DIR, '..', '..');
const DMG_DIR = join(OUT_DIR, 'dmg');
const FOLDERS = Object.freeze({
  runtime: join(DMG_DIR, 'runtime'),
  appStage: join(DMG_DIR, 'stage'),
  appOut: join(DMG_DIR, 'app'),
  volume: join(DMG_DIR, 'volume'),
  release: join(DMG_DIR, 'release'),
  work: join(DMG_DIR, 'work'),
});
const DEFAULT_CACHE_DIR = join(OUT_DIR, 'cache');
const DIST_DIR = dirname(DIST_MAIN);
/** Contract C4 rev 1 (plan 9.2): the ffmpeg build folder scripts/ffmpeg-build/build-ffmpeg.sh writes. */
const DEFAULT_FFMPEG_BUILD_DIR = join(OUT_DIR, 'ffmpeg');
/** `pnpm --filter @studio/shell run build` writes these beside main.js; packaged-mode.ts loads them from there. */
const SETUP_WINDOW_FILES = Object.freeze(['setup-preload.js', 'setup.html', 'setup.css']);
/** Read by apps/shell/src/portal/portal-settings-file.ts beside main.js. */
const PORTAL_SETTINGS_FILE = 'portal-settings.json';
/** The packaged shell takes its paths from the bundle (ticket 04), so no shell-config.json is baked in. */
const APP_STAGED_FILES = Object.freeze(['main.js', 'package.json', PORTAL_SETTINGS_FILE, ...SETUP_WINDOW_FILES].sort());
/** Environment name -> file key; the same names apps/shell/src/portal/portal-settings.ts reads. */
const ALLOW_LOCAL_PORTAL_VARIABLE = 'ENGINEOS_VIDEO_CREATOR_ALLOW_LOCAL_PORTAL';
const PORTAL_VARIABLES = Object.freeze([
  { name: 'ENGINEOS_VIDEO_CREATOR_PORTAL_ORIGIN', key: 'portalOrigin', kind: 'origin' },
  { name: 'ENGINEOS_VIDEO_CREATOR_RELEASE_MANIFEST_URL', key: 'releaseManifestUrl', kind: 'manifest' },
]);
const MAX_URL_CHARS = 2048;

function readCacheDir(rawArguments) {
  const tokens = rawArguments[0] === '--' ? rawArguments.slice(1) : rawArguments;
  let values;
  try {
    ({ values } = parseArgs({ args: tokens, strict: true, allowPositionals: false, options: { 'cache-dir': { type: 'string' } } }));
  } catch {
    fail('invalid arguments; the only option is --cache-dir <absolute folder>.');
  }
  const raw = values['cache-dir'];
  if (raw === undefined) return DEFAULT_CACHE_DIR;
  if (!raw.startsWith('/') || /[\r\n\0]/.test(raw) || posix.normalize(raw) !== raw || raw.split('/').includes('..')) {
    fail('--cache-dir must be an absolute, normalized path.');
  }
  return raw;
}

function assertBuildHost() {
  assertSafeHost();
  if (process.arch !== 'arm64') fail('the .dmg is built on Apple Silicon only (darwin-arm64 binaries are staged and verified here).');
  assertNoRedirectVariables();
}

/** Same rule as `isLocalPortalUrl` in apps/shell/src/portal/portal-settings.ts. */
function isLocalPortalUrl(url) {
  const loopback = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  return url.protocol === 'http:' && loopback && url.port !== '' && url.username === '' && url.password === '';
}

/**
 * Plan section 9.6: a local portal origin is baked only for a local test package. It needs the
 * explicit opt-in and is refused on GitHub Actions, so a published package never carries one.
 */
function checkedLocalPortalOrigin(url, variable) {
  const invalid = (rule) => fail(`${variable.name} is invalid: ${rule}.`);
  if (process.env.GITHUB_ACTIONS === 'true') invalid('a local portal origin is never packaged on GitHub Actions');
  if (process.env[ALLOW_LOCAL_PORTAL_VARIABLE] !== '1') invalid(`a local portal origin needs ${ALLOW_LOCAL_PORTAL_VARIABLE}=1`);
  if (url.pathname !== '/' || url.search !== '' || url.hash !== '') invalid('an origin only (http://localhost:<port>), no path, query or fragment');
  say(`LOCAL TEST PACKAGE: the app accepts the portal at ${url.origin}. Do not publish this package.`);
  return url.origin;
}

/**
 * The rules of apps/shell/src/portal/portal-settings.ts (parsePortalOrigin, parseReleaseManifestUrl),
 * so the shell accepts every value written here. Returns the normalized value, null when unset.
 */
function checkedPortalValue(raw, variable) {
  const trimmed = raw?.trim() ?? '';
  if (trimmed === '') return null;
  const invalid = (rule) => fail(`${variable.name} is invalid: ${rule}.`);
  if (trimmed.length > MAX_URL_CHARS) invalid(`longer than ${MAX_URL_CHARS} characters`);
  if (!URL.canParse(trimmed)) invalid('not an absolute URL');
  const url = new URL(trimmed);
  if (variable.kind === 'origin' && isLocalPortalUrl(url)) return checkedLocalPortalOrigin(url, variable);
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.hostname === '') invalid('https only, with a host and no user information');
  if (url.hash !== '') invalid('no fragment');
  if (variable.kind === 'manifest') return url.toString();
  if (url.pathname !== '/' || url.search !== '') invalid('an origin only (https://host[:port]), no path or query');
  return url.origin;
}

/** `{ portalOrigin?, releaseManifestUrl? }`; keys are omitted when unset, never defaulted or guessed. */
function readPortalSettings(environment) {
  const settings = {};
  for (const variable of PORTAL_VARIABLES) {
    const value = checkedPortalValue(environment[variable.name], variable);
    if (value === null) say(`${variable.name} is not set; the app's matching portal entry stays off.`);
    else settings[variable.key] = value;
  }
  return settings;
}

/** Every pin before any work: a missing value stops the build before the first download. */
function assertAllPinned() {
  assertPinned(NODE_TARBALL);
}

async function loadLocator() {
  // CommonJS build output: the namespace's default export is the module object.
  const imported = await import('@studio/core/runtime');
  const locator = imported.default ?? imported;
  for (const name of ['resolveStudioRuntime', 'locateServiceLaunch', 'nodeRuntimeFileSystem']) {
    if (locator[name] === undefined) fail(`@studio/core/runtime has no ${name}; rebuild packages/core.`);
  }
  return locator;
}

function packagedRuntimeAt(locator, root) {
  const runtime = locator.resolveStudioRuntime({ override: root, fileSystem: locator.nodeRuntimeFileSystem });
  if (runtime.mode !== 'packaged') fail(`the locator did not resolve ${root} as a packaged runtime.`);
  return runtime;
}

async function cleanOutput() {
  await assertNotSymlink(OUT_DIR);
  await assertNotSymlink(DMG_DIR);
  await rm(DMG_DIR, { recursive: true, force: true });
  await mkdir(DMG_DIR, { recursive: true });
}

async function fetchPinnedInputs(cacheDir) {
  return {
    nodeTarball: await ensurePinnedFile(NODE_TARBALL, { cacheDir }),
  };
}

async function stageRuntime({ run, locator, inputs, ffmpegBuild, version }) {
  await mkdir(FOLDERS.runtime, { recursive: true });
  const runtime = packagedRuntimeAt(locator, FOLDERS.runtime);
  const layout = { root: runtime.root, nodeBinary: runtime.nodeBinary, ffmpeg: runtime.ffmpeg, ffprobe: runtime.ffprobe, licenses: join(runtime.root, 'licenses') };
  await stageNode({ run, tarball: inputs.nodeTarball, layout, workDir: FOLDERS.work });
  await stageMediaTools({ run, build: ffmpegBuild, layout });
  await stageStudioLauncher({ layout });
  await stageFfmpegLicences({ build: ffmpegBuild, licensesDir: layout.licenses });
  const webLaunch = locator.locateServiceLaunch(runtime, { service: 'web', studioRoot: REPO_ROOT, runningNode: runtime.nodeBinary, hostname: '127.0.0.1', port: 1024 });
  await stagePayload({ repoRoot: REPO_ROOT, runtime, webServerEntry: webLaunch.entryPath });
  await pruneForeignBinaries(runtime.payloadRoot);
  await collectThirdPartyNotices({ roots: [runtime.payloadRoot], licensesDir: layout.licenses });
  await signNestedCode({ run, root: runtime.root });
  verifyPrograms({ run, programs: [runtime.nodeBinary, runtime.ffmpeg, runtime.ffprobe], root: runtime.root });
  await writePayloadManifest({ payloadRoot: runtime.payloadRoot, manifestFile: runtime.manifestFile, version });
  await rm(FOLDERS.work, { recursive: true, force: true });
}

/**
 * The shell's asar holds main.js, package.json, the setup window (preload, html, css) and the portal
 * settings, all beside main.js where the packaged shell reads them; no shell-config.json.
 */
async function stageShellApp({ version, portalSettings }) {
  await mkdir(FOLDERS.appStage, { recursive: true });
  const minimalManifest = { name: 'engineos-video-creator-shell', version, main: 'main.js' };
  await writeFile(join(FOLDERS.appStage, 'package.json'), `${JSON.stringify(minimalManifest, null, 2)}\n`);
  await copyFile(DIST_MAIN, join(FOLDERS.appStage, 'main.js'));
  for (const file of SETUP_WINDOW_FILES) await copyFile(join(DIST_DIR, file), join(FOLDERS.appStage, file));
  await writeFile(join(FOLDERS.appStage, PORTAL_SETTINGS_FILE), `${JSON.stringify(portalSettings, null, 2)}\n`);
  const staged = (await readdir(FOLDERS.appStage)).sort();
  if (staged.join(',') !== APP_STAGED_FILES.join(',')) fail(`the app staging folder holds unexpected files: ${staged.join(', ')}.`);
}

async function buildSignedApp({ run, locator, version, portalSettings }) {
  await stageShellApp({ version, portalSettings });
  const frameworkChecksum = await readInstalledElectron();
  const appPath = await packageApp(version, frameworkChecksum, { stageDir: FOLDERS.appStage, outDir: FOLDERS.appOut });
  await setFuses(appPath);
  const inAppRuntime = join(appPath, 'Contents', 'Resources', 'runtime');
  // ditto keeps relative symlinks and the nested signatures byte for byte.
  run(DITTO, [FOLDERS.runtime, inAppRuntime], { env: { PATH: '/usr/bin:/bin', LANG: 'C' }, what: 'ditto of runtime/ into the app' });
  signAdHoc(appPath);
  await assertFuses(appPath);
  await verifyNestedCode({ run, root: inAppRuntime });
  const shipped = packagedRuntimeAt(locator, inAppRuntime);
  await verifyPayloadManifest({ payloadRoot: shipped.payloadRoot, manifestFile: shipped.manifestFile });
  return appPath;
}

async function main() {
  assertBuildHost();
  const cacheDir = readCacheDir(process.argv.slice(2));
  const portalSettings = readPortalSettings(process.env);
  assertAllPinned();
  // The ffmpeg build is checked against its manifest before any download or output is touched.
  const ffmpegBuild = await readFfmpegBuild(resolveFfmpegBuildDir({ environment: process.env, defaultDir: DEFAULT_FFMPEG_BUILD_DIR }));
  const version = await readAppVersion();
  for (const file of [DIST_MAIN, ...SETUP_WINDOW_FILES.map((name) => join(DIST_DIR, name))]) {
    await assertRegularFile(file, `${file} is missing; run "pnpm exec turbo run build" first.`);
  }
  await assertBuildOutputs(REPO_ROOT);
  const locator = await loadLocator();
  await cleanOutput();
  const run = createProcessRunner();
  const inputs = await fetchPinnedInputs(cacheDir);
  await stageRuntime({ run, locator, inputs, ffmpegBuild, version });
  const appPath = await buildSignedApp({ run, locator, version, portalSettings });
  await writeReleaseSources({ releaseDir: FOLDERS.release, build: ffmpegBuild });
  await buildDiskImage({ run, appPath, appName: APP_NAME, version, volumeDir: FOLDERS.volume, releaseDir: FOLDERS.release });
  say(`release folder: ${FOLDERS.release}`);
}

try {
  await main();
} catch (error) {
  const known = error instanceof StagingError || error instanceof PackagingError;
  const reason = known ? error.message : `unexpected failure: ${error instanceof Error ? error.message : 'unknown error'}`;
  process.stderr.write(`ERROR (dmg packaging): ${reason}\n`);
  process.exitCode = 1;
}
