// File side of the release (ticket 05): reads the records the .dmg packaging wrote into its release
// folder, checks every named file against its recorded size and SHA-256, and stages the exact set a
// GitHub release carries. Folders are passed in (injected root); the clock is passed in.
//
// Staged layout of `outDir`:
//   assets/<dmg>  assets/<dmg>.sha256  assets/latest.json  assets/<ffmpeg source archive>
//   release-notes.md
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, lstat, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { assertSourcesMatchBuild, parseFfmpegBuildRecord } from './ffmpeg-build-record.mjs';
import {
  MANIFEST_FILE,
  checksumFileContent,
  checksumFileName,
  fail,
  parseDiskImageRecord,
  parseSourcesRecord,
  renderManifest,
  requireFileName,
  serializeManifest,
  validateManifest,
} from './manifest.mjs';

export const ASSETS_FOLDER = 'assets';
export const NOTES_FILE = 'release-notes.md';
const SOURCES_RECORD = 'sources.json';
const DISK_IMAGE_RECORD_SUFFIX = '.dmg.json';

async function sha256OfFile(filePath) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return hash.digest('hex');
}

/** Size of a regular file; a missing file, a folder or a symlink fails closed. */
async function regularFileSize(filePath, what) {
  let stats;
  try {
    stats = await lstat(filePath);
  } catch {
    fail(`${what} is missing: ${filePath}.`);
  }
  if (!stats.isFile()) fail(`${what} is not a regular file: ${filePath}.`);
  return stats.size;
}

async function readJsonFile(filePath, what) {
  await regularFileSize(filePath, what);
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    fail(`${what} is not valid JSON: ${filePath}.`);
  }
}

async function assertFileMatches({ filePath, sha256, bytes, what }) {
  const size = await regularFileSize(filePath, what);
  if (bytes !== undefined && size !== bytes) fail(`${what} has ${size} bytes; its record says ${bytes}.`);
  const actual = await sha256OfFile(filePath);
  if (actual !== sha256) fail(`${what} has SHA-256 ${actual}; its record says ${sha256}.`);
}

/** The single `<dmg>.json`, `sources.json` and the files they name, each checked on disk. */
export async function loadReleaseRecords(releaseDir) {
  let names;
  try {
    names = await readdir(releaseDir);
  } catch {
    fail(`the release folder ${releaseDir} is missing; run "pnpm --filter @studio/shell run package:dmg" first.`);
  }
  const imageRecords = names.filter((name) => name.endsWith(DISK_IMAGE_RECORD_SUFFIX));
  if (imageRecords.length !== 1) fail(`the release folder holds ${imageRecords.length} .dmg records; expected exactly one.`);
  const diskImage = parseDiskImageRecord(await readJsonFile(join(releaseDir, imageRecords[0]), 'the .dmg release record'));
  if (imageRecords[0] !== `${diskImage.file}.json`) fail(`the .dmg record ${imageRecords[0]} does not name its own image ${diskImage.file}.`);
  const sources = parseSourcesRecord(await readJsonFile(join(releaseDir, SOURCES_RECORD), SOURCES_RECORD));
  await assertFileMatches({ filePath: join(releaseDir, diskImage.file), sha256: diskImage.sha256, bytes: diskImage.bytes, what: `the image ${diskImage.file}` });
  for (const source of sources) {
    await assertFileMatches({ filePath: join(releaseDir, source.file), sha256: source.sha256, bytes: source.bytes, what: `the ${source.name} source archive ${source.file}` });
  }
  return { diskImage, sources };
}

export function renderReleaseNotes({ manifest, diskImage, sources }) {
  const lines = [
    `EngineOS Video Creator ${manifest.version} for Apple Silicon Macs.`,
    '',
    `- Installer: \`${diskImage.file}\` (${diskImage.bytes} bytes)`,
    `- SHA-256: \`${diskImage.sha256}\` (also in \`${checksumFileName(diskImage.file)}\`)`,
    ...sources.map((source) => `- Corresponding source of the bundled ${source.name} (${source.licence}): \`${source.file}\`, SHA-256 \`${source.sha256}\``),
    '',
    'The app is not notarized: on first open use System Settings > Privacy & Security > Open Anyway.',
  ];
  return `${lines.join('\n')}\n`;
}

async function assertEmptyFolder(folder) {
  await mkdir(folder, { recursive: true });
  const existing = await readdir(folder);
  if (existing.length > 0) fail(`the output folder ${folder} must start empty.`);
}

/**
 * Renders `latest.json` and the `.sha256`, and copies the installer and source archives beside them.
 * `ffmpegBuildManifest` is C4's `build-manifest.json`; the ffmpeg source entry must match it.
 */
export async function stageRelease({ releaseDir, ffmpegBuildManifest, outDir, baseUrl, now }) {
  const { diskImage, sources } = await loadReleaseRecords(releaseDir);
  const build = parseFfmpegBuildRecord(await readJsonFile(ffmpegBuildManifest, 'build-manifest.json'));
  assertSourcesMatchBuild({ sources, build });
  const manifest = renderManifest({ diskImage, sources, baseUrl, now });
  const assetsDir = join(outDir, ASSETS_FOLDER);
  await assertEmptyFolder(outDir);
  await mkdir(assetsDir);
  await copyFile(join(releaseDir, diskImage.file), join(assetsDir, diskImage.file));
  for (const source of sources) await copyFile(join(releaseDir, source.file), join(assetsDir, source.file));
  await writeFile(join(assetsDir, checksumFileName(diskImage.file)), checksumFileContent(diskImage));
  await writeFile(join(assetsDir, MANIFEST_FILE), serializeManifest(manifest));
  await writeFile(join(outDir, NOTES_FILE), renderReleaseNotes({ manifest, diskImage, sources }));
  return manifest;
}

function fileNameOfUrl(url, tag, what) {
  const marker = `/releases/download/${tag}/`;
  const { pathname } = new URL(url);
  const at = pathname.lastIndexOf(marker);
  if (at < 0) fail(`${what} does not point at release ${tag}.`);
  let file;
  try {
    file = decodeURIComponent(pathname.slice(at + marker.length));
  } catch {
    fail(`${what} has a malformed file name.`);
  }
  return requireFileName(file, `the file name in ${what}`);
}

/**
 * Re-checks a staged release before it is published: `latest.json` is valid C2 for this tag, the
 * assets folder holds exactly the files it names plus the checksum, and every hash and size holds.
 */
export async function verifyStagedRelease({ outDir, tag }) {
  const assetsDir = join(outDir, ASSETS_FOLDER);
  const manifest = validateManifest(await readJsonFile(join(assetsDir, MANIFEST_FILE), MANIFEST_FILE));
  if (tag !== `v${manifest.version}`) fail(`${MANIFEST_FILE} names version ${manifest.version}; this release is not v${manifest.version}.`);
  await regularFileSize(join(outDir, NOTES_FILE), NOTES_FILE);
  const expected = [MANIFEST_FILE];
  for (const asset of manifest.assets) {
    const file = fileNameOfUrl(asset.url, tag, `the ${asset.platform} asset URL`);
    if (file !== asset.file) fail(`the ${asset.platform} asset URL names ${file}, not ${asset.file}.`);
    await assertFileMatches({ filePath: join(assetsDir, asset.file), sha256: asset.sha256, bytes: asset.bytes, what: `the asset ${asset.file}` });
    const checksumFile = checksumFileName(asset.file);
    const checksum = await readFile(join(assetsDir, checksumFile), 'utf8').catch(() => fail(`${checksumFile} is missing.`));
    if (checksum !== checksumFileContent(asset)) fail(`${checksumFile} does not hold the SHA-256 of ${asset.file}.`);
    expected.push(asset.file, checksumFile);
  }
  for (const source of manifest.sources) {
    const file = fileNameOfUrl(source.url, tag, `the ${source.name} source URL`);
    await assertFileMatches({ filePath: join(assetsDir, file), sha256: source.sha256, bytes: undefined, what: `the ${source.name} source archive ${file}` });
    expected.push(file);
  }
  const actual = (await readdir(assetsDir)).sort();
  if (actual.join('\n') !== [...expected].sort().join('\n')) fail(`the assets folder holds ${actual.join(', ')}; expected exactly ${[...expected].sort().join(', ')}.`);
  return manifest;
}
