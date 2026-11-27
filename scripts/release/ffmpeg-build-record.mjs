// Contract C4 rev 1 (plan rev 3 section 9.2): ffmpeg is built in CI and its output folder carries
// `build-manifest.json`. The release takes the ffmpeg corresponding-source asset from packaging's
// `sources.json`; this module checks that entry against the build record, so the archive named in
// `latest.json.sources` is the one the build produced (DI-AC-25). Pure functions only.
import { fail, isRecord, requireFileName, requireSha256 } from './manifest.mjs';

const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,31}$/;
const LICENCE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9.+_-]{0,63}$/;
const FFMPEG_SOURCE_NAME = 'ffmpeg';

/** The fields of `build-manifest.json` the release depends on: version, licence, source archive. */
export function parseFfmpegBuildRecord(raw) {
  const what = 'build-manifest.json';
  if (!isRecord(raw)) fail(`${what} is not a JSON object.`);
  if (typeof raw.ffmpegVersion !== 'string' || !VERSION_PATTERN.test(raw.ffmpegVersion)) fail(`${what} ffmpegVersion is missing or malformed.`);
  if (typeof raw.licence !== 'string' || !LICENCE_PATTERN.test(raw.licence)) fail(`${what} licence is missing or malformed.`);
  const archive = raw.sourceArchive;
  if (!isRecord(archive)) fail(`${what} sourceArchive is not an object.`);
  const file = requireFileName(archive.file, `${what} sourceArchive.file`);
  const expected = `ffmpeg-sources-${raw.ffmpegVersion}.tar.gz`;
  if (file !== expected) fail(`${what} sourceArchive.file is ${file}; contract C4 names it ${expected}.`);
  if (!Number.isSafeInteger(archive.bytes) || archive.bytes <= 0) fail(`${what} sourceArchive.bytes is not a positive integer.`);
  return {
    ffmpegVersion: raw.ffmpegVersion,
    licence: raw.licence,
    sourceArchive: { file, sha256: requireSha256(archive.sha256, `${what} sourceArchive.sha256`), bytes: archive.bytes },
  };
}

/** The `ffmpeg` entry of `sources.json` must be the built archive, byte for byte by record. */
export function assertSourcesMatchBuild({ sources, build }) {
  const source = sources.find((entry) => entry.name === FFMPEG_SOURCE_NAME);
  if (source === undefined) fail('sources.json names no ffmpeg source (DI-AC-25).');
  const archive = build.sourceArchive;
  const mismatched = ['file', 'sha256', 'bytes'].filter((field) => source[field] !== archive[field]);
  if (mismatched.length > 0) fail(`sources.json ffmpeg ${mismatched.join(', ')} differ from build-manifest.json sourceArchive; repackage from the same ffmpeg build.`);
  if (source.licence !== build.licence) fail(`sources.json ffmpeg licence ${source.licence} differs from build-manifest.json licence ${build.licence}.`);
}
