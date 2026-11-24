// C3 rev 3 `licenses/`. Third-party notices of every package staged in the payload (shared tree, web
// standalone tree, prisma tool). Each package's own licence files are copied verbatim to
// `licenses/third-party/<name>@<version>/`, and INDEX.json lists every package with its declared
// licence, including those that ship no licence file.
//
// `licenses/ffmpeg/` holds the ffmpeg build's own `licenses/**` (contract C4 rev 1, plan 9.2):
// the FFmpeg, x264 and LAME licence texts, the build configuration and the source notice.
import { readdir, copyFile, lstat, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fail, isRecord, say } from './failure.mjs';
import { walkTree } from './hashing.mjs';

/** DI-AC-25: the GPL text must ship inside the app; its absence stops packaging. */
const FFMPEG_GPL_TEXT = 'COPYING.GPLv3';

const LICENCE_FILE_PATTERN = /^(licen[cs]e|copying|notice|copyright)([._-].*)?$/i;
const PACKAGE_MANIFEST_PATTERN = /(^|\/)node_modules\/(@[^/]+\/)?[^/]+\/package\.json$/;

function declaredLicence(manifest) {
  if (typeof manifest.license === 'string') return manifest.license;
  if (isRecord(manifest.license) && typeof manifest.license.type === 'string') return manifest.license.type;
  return 'UNDECLARED';
}

function folderName(name, version) {
  return `${name.replaceAll('/', '__')}@${version}`;
}

/** Packages found under `roots`, deduplicated by name@version. */
async function stagedPackages(roots) {
  const packages = new Map();
  for (const root of roots) {
    for await (const entry of walkTree(root)) {
      if (entry.kind !== 'file' || !PACKAGE_MANIFEST_PATTERN.test(entry.relative)) continue;
      let manifest;
      try {
        manifest = JSON.parse(await readFile(entry.path, 'utf8'));
      } catch {
        continue;
      }
      if (!isRecord(manifest) || typeof manifest.name !== 'string' || typeof manifest.version !== 'string') continue;
      const key = `${manifest.name}@${manifest.version}`;
      if (!packages.has(key)) packages.set(key, { name: manifest.name, version: manifest.version, licence: declaredLicence(manifest), folder: dirname(entry.path) });
    }
  }
  return [...packages.values()].sort((left, right) => left.name.localeCompare(right.name) || left.version.localeCompare(right.version));
}

/** Copies the build's `licenses/**` verbatim to `licenses/ffmpeg/`; a symlink or a missing GPL text fails. */
export async function stageFfmpegLicences({ build, licensesDir }) {
  const source = build.licencesDir;
  let stats;
  try {
    stats = await lstat(source);
  } catch {
    fail(`the ffmpeg build at ${build.dir} has no licenses/ folder; rebuild it with scripts/ffmpeg-build/build-ffmpeg.sh.`);
  }
  if (!stats.isDirectory()) fail(`${source} is not a folder.`);
  const target = join(licensesDir, 'ffmpeg');
  await mkdir(target, { recursive: true });
  let copied = 0;
  let hasGplText = false;
  for await (const entry of walkTree(source)) {
    if (entry.kind === 'symlink') fail(`the ffmpeg licences hold a symlink (${entry.relative}); refusing to stage it.`);
    if (entry.kind === 'directory') {
      await mkdir(join(target, entry.relative), { recursive: true });
    } else {
      await copyFile(entry.path, join(target, entry.relative));
      copied += 1;
      hasGplText ||= entry.relative.split('/').pop() === FFMPEG_GPL_TEXT;
    }
  }
  if (!hasGplText) fail(`the ffmpeg build's licenses/ has no ${FFMPEG_GPL_TEXT}; the GPL text must ship in the app (DI-AC-25).`);
  say(`staged ${copied} ffmpeg licence file(s)`);
}

export async function collectThirdPartyNotices({ roots, licensesDir }) {
  const target = join(licensesDir, 'third-party');
  await mkdir(target, { recursive: true });
  const index = [];
  for (const staged of await stagedPackages(roots)) {
    const files = (await readdir(staged.folder, { withFileTypes: true }))
      .filter((entry) => entry.isFile() && LICENCE_FILE_PATTERN.test(entry.name))
      .map((entry) => entry.name)
      .sort();
    if (files.length > 0) {
      const packageFolder = join(target, folderName(staged.name, staged.version));
      await mkdir(packageFolder, { recursive: true });
      for (const file of files) await copyFile(join(staged.folder, file), join(packageFolder, file));
    }
    index.push({ name: staged.name, version: staged.version, licence: staged.licence, files });
  }
  await writeFile(join(target, 'INDEX.json'), `${JSON.stringify(index, null, 2)}\n`);
  say(`collected notices of ${index.length} third-party packages (${index.filter((entry) => entry.files.length === 0).length} ship no licence file)`);
}
