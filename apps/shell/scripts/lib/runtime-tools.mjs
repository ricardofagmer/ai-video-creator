// Stages the programs of C3 rev 3 into `runtime/`: node/bin/node from its pinned tarball, and
// bin/ffmpeg, bin/ffprobe from the ffmpeg build folder of contract C4 rev 1 (plan 9.2), which
// scripts/ffmpeg-build/build-ffmpeg.sh produces from pinned sources. Nothing ffmpeg-related is
// downloaded here: the folder is checked against its build-manifest.json (sha256 and bytes of both
// programs and of the source archive) before anything is copied, and the copies are checked again.
// The release record `sources.json` (ticket 05, `latest.json.sources`, DI-AC-25) comes from the
// same manifest.
import { chmod, copyFile, lstat, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { basename, join, posix } from 'node:path';
import { fail, isRecord, say } from './failure.mjs';
import { sha256File } from './hashing.mjs';
import { FFMPEG_BUILD_DIR_VARIABLE, FFMPEG_SOURCE_LICENCE, NODE_MEMBERS, NODE_VERSION } from './pins.mjs';

const TAR = '/usr/bin/tar';
const OTOOL = '/usr/bin/otool';
const TOOL_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C' });
/** Load commands allowed in a bundled program: the OS only, so nothing resolves outside the app. */
const SYSTEM_LIBRARY_PREFIXES = ['/usr/lib/', '/System/Library/'];
const BUILD_MANIFEST = 'build-manifest.json';
const MEDIA_PROGRAMS = ['ffmpeg', 'ffprobe'];
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const COMMIT_PATTERN = /^[0-9a-f]{40}$/;
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
const FILE_NAME_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const BUILD_HINT = 'run scripts/ffmpeg-build/build-ffmpeg.sh first (plan 9.2, contract C4)';

async function assertRegularFile(filePath, message) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch {
    fail(message);
  }
  if (!stats.isFile()) fail(message);
}

async function freshFolder(parent, prefix) {
  await mkdir(parent, { recursive: true });
  return mkdtemp(join(parent, prefix));
}

function extractTar(run, archive, destination, members) {
  run(TAR, ['-x', '-f', archive, '-C', destination, ...members], { env: TOOL_ENV, what: `tar (${basename(archive)})` });
}

/** node/bin/node and licenses/node/LICENSE from the pinned tarball. */
export async function stageNode({ run, tarball, layout, workDir }) {
  const extractDir = await freshFolder(workDir, 'node-');
  extractTar(run, tarball, extractDir, [NODE_MEMBERS.binary, NODE_MEMBERS.licence]);
  const binary = join(extractDir, NODE_MEMBERS.binary);
  const licence = join(extractDir, NODE_MEMBERS.licence);
  await assertRegularFile(binary, `the Node tarball has no ${NODE_MEMBERS.binary}.`);
  await assertRegularFile(licence, `the Node tarball has no ${NODE_MEMBERS.licence}.`);
  await mkdir(join(layout.root, 'node', 'bin'), { recursive: true });
  await copyFile(binary, layout.nodeBinary);
  await chmod(layout.nodeBinary, 0o755);
  await mkdir(join(layout.licenses, 'node'), { recursive: true });
  await copyFile(licence, join(layout.licenses, 'node', 'LICENSE'));
  const reported = run(layout.nodeBinary, ['--version'], { capture: true, env: TOOL_ENV, what: 'bundled node --version' }).trim();
  if (reported !== `v${NODE_VERSION}`) fail(`the bundled node reports ${reported}, expected v${NODE_VERSION}.`);
  await rm(extractDir, { recursive: true, force: true });
  say(`staged node v${NODE_VERSION}`);
}

/** The C4 folder: ENGINEOS_FFMPEG_BUILD_DIR when set (absolute, normalized), else `defaultDir`. */
export function resolveFfmpegBuildDir({ environment, defaultDir }) {
  const raw = environment[FFMPEG_BUILD_DIR_VARIABLE];
  if (raw === undefined || raw === '') return defaultDir;
  if (!raw.startsWith('/') || /[\r\n\0]/.test(raw) || posix.normalize(raw) !== raw || raw.split('/').includes('..') || (raw.length > 1 && raw.endsWith('/'))) {
    fail(`${FFMPEG_BUILD_DIR_VARIABLE} must be an absolute, normalized path.`);
  }
  return raw;
}

function recordedFile(entry, what) {
  if (!isRecord(entry)) fail(`${BUILD_MANIFEST} ${what} is not an object.`);
  if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) fail(`${BUILD_MANIFEST} ${what}.sha256 is missing or malformed.`);
  if (!Number.isSafeInteger(entry.bytes) || entry.bytes <= 0) fail(`${BUILD_MANIFEST} ${what}.bytes is not a positive integer.`);
  return { sha256: entry.sha256, bytes: entry.bytes };
}

function recordedSource(entry, index) {
  const what = `${BUILD_MANIFEST} sources[${index}]`;
  if (!isRecord(entry)) fail(`${what} is not an object.`);
  for (const field of ['name', 'version', 'licence', 'url']) {
    if (typeof entry[field] !== 'string' || entry[field] === '') fail(`${what}.${field} is missing.`);
  }
  const pinned = (typeof entry.sha256 === 'string' && SHA256_PATTERN.test(entry.sha256)) || (typeof entry.commit === 'string' && COMMIT_PATTERN.test(entry.commit));
  if (!pinned) fail(`${what} (${entry.name}) carries neither a sha256 nor a commit; the build is not pinned.`);
  const source = { name: entry.name, version: entry.version, licence: entry.licence, url: entry.url };
  if (entry.sha256 !== undefined) source.sha256 = entry.sha256;
  if (entry.commit !== undefined) source.commit = entry.commit;
  return source;
}

/** Fails closed unless the file is a regular file (not a symlink) of the recorded size and SHA-256. */
async function assertMatchesRecord(filePath, record, label) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch {
    fail(`${label} is missing at ${filePath}; ${BUILD_HINT}.`);
  }
  if (!stats.isFile()) fail(`${label} at ${filePath} is not a regular file.`);
  if (stats.size !== record.bytes) fail(`${label} is ${stats.size} bytes; ${BUILD_MANIFEST} records ${record.bytes}. Rebuild ffmpeg.`);
  if ((await sha256File(filePath)) !== record.sha256) fail(`${label} SHA-256 differs from ${BUILD_MANIFEST}. Rebuild ffmpeg.`);
}

/** Reads and checks the C4 folder before anything is staged; returns the verified paths and records. */
export async function readFfmpegBuild(buildDir) {
  const manifestPath = join(buildDir, BUILD_MANIFEST);
  await assertRegularFile(manifestPath, `the ffmpeg build folder ${buildDir} has no ${BUILD_MANIFEST}; ${BUILD_HINT}.`);
  let raw;
  try {
    raw = JSON.parse(await readFile(manifestPath, 'utf8'));
  } catch {
    fail(`${manifestPath} is not JSON.`);
  }
  if (!isRecord(raw)) fail(`${BUILD_MANIFEST} is not a JSON object.`);
  if (typeof raw.ffmpegVersion !== 'string' || !VERSION_PATTERN.test(raw.ffmpegVersion)) fail(`${BUILD_MANIFEST} ffmpegVersion is missing or malformed.`);
  if (raw.licence !== FFMPEG_SOURCE_LICENCE) fail(`${BUILD_MANIFEST} licence is ${String(raw.licence)}; the release records ${FFMPEG_SOURCE_LICENCE}.`);
  const flags = Array.isArray(raw.configureFlags) ? raw.configureFlags : [];
  if (flags.includes('--enable-nonfree')) fail('the ffmpeg build is configured with --enable-nonfree and cannot be redistributed.');
  if (!flags.includes('--enable-gpl') || !flags.includes('--enable-version3')) fail(`${BUILD_MANIFEST} configureFlags lack --enable-gpl --enable-version3; the recorded licence would be wrong.`);
  if (!Array.isArray(raw.binaries)) fail(`${BUILD_MANIFEST} binaries is not a list.`);
  const binaries = {};
  for (const name of MEDIA_PROGRAMS) {
    const entries = raw.binaries.filter((entry) => isRecord(entry) && entry.name === name);
    if (entries.length !== 1) fail(`${BUILD_MANIFEST} must record exactly one ${name}.`);
    const record = recordedFile(entries[0], `binaries[${name}]`);
    const path = join(buildDir, 'bin', name);
    await assertMatchesRecord(path, record, `bin/${name}`);
    binaries[name] = { path, ...record };
  }
  const archive = recordedFile(raw.sourceArchive, 'sourceArchive');
  const archiveFile = isRecord(raw.sourceArchive) ? raw.sourceArchive.file : undefined;
  if (archiveFile !== `ffmpeg-sources-${raw.ffmpegVersion}.tar.gz` || !FILE_NAME_PATTERN.test(archiveFile)) fail(`${BUILD_MANIFEST} sourceArchive.file must be ffmpeg-sources-${raw.ffmpegVersion}.tar.gz.`);
  const archivePath = join(buildDir, archiveFile);
  await assertMatchesRecord(archivePath, archive, archiveFile);
  if (!Array.isArray(raw.sources) || raw.sources.length === 0) fail(`${BUILD_MANIFEST} lists no sources.`);
  say(`verified ffmpeg ${raw.ffmpegVersion} build at ${buildDir} against ${BUILD_MANIFEST}`);
  return {
    dir: buildDir,
    version: raw.ffmpegVersion,
    licence: raw.licence,
    binaries,
    sourceArchive: { path: archivePath, file: archiveFile, ...archive },
    sources: raw.sources.map(recordedSource),
    licencesDir: join(buildDir, 'licenses'),
  };
}

/** Vetting 0006 section 5.1: linkage is checked on the binary that is actually staged. */
function assertSystemLinkageOnly(run, program) {
  const output = run(OTOOL, ['-L', program], { capture: true, env: TOOL_ENV, what: `otool -L ${basename(program)}` });
  const dependencies = output.split('\n').slice(1).map((line) => line.trim().split(' ')[0]).filter((path) => path !== '');
  const foreign = dependencies.filter((path) => !SYSTEM_LIBRARY_PREFIXES.some((prefix) => path.startsWith(prefix)));
  if (foreign.length > 0) fail(`${basename(program)} links libraries outside the OS (${foreign.join(', ')}); it would resolve paths outside the app (DI-AC-03).`);
}

/** The binary itself must agree with the manifest: a nonfree build is not redistributable. */
function assertRedistributableBuild(run, ffmpeg) {
  const buildconf = run(ffmpeg, ['-hide_banner', '-buildconf'], { capture: true, env: TOOL_ENV, what: 'ffmpeg -buildconf' });
  if (buildconf.includes('--enable-nonfree')) fail('the staged ffmpeg is configured with --enable-nonfree and cannot be redistributed.');
  if (!buildconf.includes('--enable-gpl')) fail('the staged ffmpeg is not configured with --enable-gpl; its recorded licence would be wrong.');
}

/**
 * bin/ffmpeg and bin/ffprobe from the verified build. The copies are checked against the manifest
 * before signing; the ad hoc signature added later (signing.mjs) changes their bytes by design.
 */
export async function stageMediaTools({ run, build, layout }) {
  await mkdir(join(layout.root, 'bin'), { recursive: true });
  for (const [name, target] of [['ffmpeg', layout.ffmpeg], ['ffprobe', layout.ffprobe]]) {
    const record = build.binaries[name];
    await copyFile(record.path, target);
    await assertMatchesRecord(target, record, `staged ${name}`);
    await chmod(target, 0o755);
    assertSystemLinkageOnly(run, target);
  }
  assertRedistributableBuild(run, layout.ffmpeg);
  say(`staged ffmpeg and ffprobe ${build.version} from ${build.dir}`);
}

// The installed app puts nothing on PATH, so `runtime/bin/studio` is the one command a person can
// run by hand (setup text and the README name it). It finds the runtime from its own location, so
// it keeps working wherever the app is moved, and it passes no inherited PATH to the CLI.
const STUDIO_LAUNCHER = `#!/bin/sh
set -eu
runtime=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd -P)
ENGINEOS_VIDEO_CREATOR_RUNTIME_DIR="$runtime" PATH="$runtime/bin:$runtime/node/bin:/usr/bin:/bin" \\
  exec "$runtime/node/bin/node" "$runtime/payload/cli/dist/main.js" "$@"
`;

/** Writes the hand-run CLI launcher beside ffmpeg (plan 9.4). */
export async function stageStudioLauncher({ layout }) {
  const target = join(layout.root, 'bin', 'studio');
  await mkdir(join(layout.root, 'bin'), { recursive: true });
  await writeFile(target, STUDIO_LAUNCHER);
  await chmod(target, 0o755);
  say('staged the studio launcher');
}

/**
 * Copies the source archive beside the .dmg and writes `sources.json`, which ticket 05 turns into
 * `latest.json.sources` (C2 rev 2): the asset URL is known only to the release, so it is not here.
 * `components` lists every pinned source inside the archive, from the build manifest.
 */
export async function writeReleaseSources({ releaseDir, build }) {
  await mkdir(releaseDir, { recursive: true });
  const { file, sha256, bytes, path } = build.sourceArchive;
  const target = join(releaseDir, file);
  await copyFile(path, target);
  await assertMatchesRecord(target, { sha256, bytes }, `release copy of ${file}`);
  const record = { sources: [{ name: 'ffmpeg', licence: build.licence, file, sha256, bytes, components: build.sources }] };
  await writeFile(join(releaseDir, 'sources.json'), `${JSON.stringify(record, null, 2)}\n`);
}
