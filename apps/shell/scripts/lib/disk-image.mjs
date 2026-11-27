// The `.dmg` of ticket 03: a compressed read-only image holding the signed app and an Applications
// shortcut, named as C2 expects (`EngineOS-Video-Creator-<version>-arm64.dmg`). Its SHA-256 and size
// are printed and written beside it as `<file>.json`, which ticket 05 reads for `latest.json.assets`.
import { lstat, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { fail, hasErrorCode, say } from './failure.mjs';
import { sha256File } from './hashing.mjs';

const DITTO = '/usr/bin/ditto';
const HDIUTIL = '/usr/bin/hdiutil';
const TOOL_ENV = Object.freeze({ PATH: '/usr/bin:/bin', LANG: 'C' });
export const PLATFORM = 'darwin-arm64';

export function diskImageName(version) {
  if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) fail(`version ${version} is not X.Y.Z.`);
  return `EngineOS-Video-Creator-${version}-arm64.dmg`;
}

async function assertAbsent(path) {
  try {
    await lstat(path);
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return;
    throw error;
  }
  fail(`${path} already exists; the output folder must start empty.`);
}

/**
 * Builds the image from `appPath` into `releaseDir`. `volumeDir` is a scratch folder; ditto keeps
 * the app's symlinks, modes and signatures byte for byte.
 */
export async function buildDiskImage({ run, appPath, appName, version, volumeDir, releaseDir }) {
  await assertAbsent(volumeDir);
  await mkdir(volumeDir, { recursive: true });
  await mkdir(releaseDir, { recursive: true });
  run(DITTO, [appPath, join(volumeDir, `${appName}.app`)], { env: TOOL_ENV, what: 'ditto of the app into the image folder' });
  await symlink('/Applications', join(volumeDir, 'Applications'));
  const file = diskImageName(version);
  const imagePath = join(releaseDir, file);
  await assertAbsent(imagePath);
  run(HDIUTIL, ['create', '-volname', appName, '-srcfolder', volumeDir, '-fs', 'HFS+', '-format', 'UDZO', imagePath], {
    env: TOOL_ENV,
    what: 'hdiutil create',
  });
  run(HDIUTIL, ['verify', imagePath], { env: TOOL_ENV, what: 'hdiutil verify' });
  await rm(volumeDir, { recursive: true, force: true });
  const sha256 = await sha256File(imagePath);
  const { size: bytes } = await lstat(imagePath);
  const record = { platform: PLATFORM, file, version, sha256, bytes };
  await writeFile(`${imagePath}.json`, `${JSON.stringify(record, null, 2)}\n`);
  say(`dmg: ${imagePath}`);
  say(`dmg sha-256: ${sha256}`);
  say(`dmg bytes: ${bytes}`);
  say(`release record: ${basename(imagePath)}.json`);
  return { imagePath, ...record };
}
