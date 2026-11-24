// JSON side of build-ffmpeg.sh (plan 9.2, contract C4 rev 1). Bash cannot parse JSON safely, so
// this helper validates sources.lock.json before anything is downloaded and writes
// build-manifest.json at the end. Every field is checked against an allowlist pattern, so the
// tab-separated lines it prints can be read by the shell without quoting surprises.
//
//   node lock-tool.mjs check <lock>
//   node lock-tool.mjs manifest <lock> <output folder> <resolved.tsv> <configure-flags.txt>
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, rename, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';

const SHA256 = /^[0-9a-f]{64}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const MD5 = /^[0-9a-f]{32}$/;
const FINGERPRINT = /^[0-9A-F]{40}$/;
const PLAIN_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const SOURCE_NAME = /^[a-z0-9][a-z0-9-]*$/;
const VERSION = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;
const LICENCE = /^[A-Za-z0-9.+-]+( (AND|OR|WITH) [A-Za-z0-9.+-]+)*$/;
const HOST = /^\.?[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/;
const DEPLOYMENT_TARGET = /^[0-9]{2}\.[0-9]$/;
const BINARIES = ['ffmpeg', 'ffprobe'];

class LockError extends Error {}

function fail(message) {
  throw new LockError(message);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hostAllowed(hostname, hosts) {
  return hosts.some((allowed) => (allowed.startsWith('.') ? hostname.endsWith(allowed) && hostname.length > allowed.length : hostname === allowed));
}

/** A plain https URL on one of the source's hosts: no credentials, port, query or fragment. */
function checkedUrl(raw, hosts, where) {
  if (typeof raw !== 'string') fail(`${where} is not a string.`);
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail(`${where} is not a URL.`);
  }
  if (url.protocol !== 'https:' || url.username !== '' || url.password !== '' || url.port !== '' || url.search !== '' || url.hash !== '') {
    fail(`${where} must be a plain https URL without credentials, port, query or fragment.`);
  }
  if (url.href !== raw) fail(`${where} is not in normalized form.`);
  if (!hostAllowed(url.hostname, hosts)) fail(`${where} host ${url.hostname} is not in the source's hosts.`);
  return url;
}

function match(value, pattern, where) {
  if (typeof value !== 'string' || !pattern.test(value)) fail(`${where} is missing or malformed.`);
  return value;
}

/** C4: a source with neither a checksum nor a commit stops the build before any download. */
function checkedSource(source, index) {
  if (!isRecord(source)) fail(`sources[${index}] is not an object.`);
  const name = match(source.name, SOURCE_NAME, `sources[${index}].name`);
  const where = `source "${name}"`;
  match(source.version, VERSION, `${where} version`);
  match(source.licence, LICENCE, `${where} licence`);
  match(source.directory, PLAIN_NAME, `${where} directory`);
  if (!Array.isArray(source.hosts) || source.hosts.length === 0) fail(`${where} names no hosts.`);
  source.hosts.forEach((host, position) => match(host, HOST, `${where} hosts[${position}]`));
  const url = checkedUrl(source.url, source.hosts, `${where} url`);
  if (!Array.isArray(source.licenceFiles) || source.licenceFiles.length === 0) fail(`${where} names no licence files.`);
  source.licenceFiles.forEach((file, position) => match(file, PLAIN_NAME, `${where} licenceFiles[${position}]`));
  const sha256 = source.sha256 ?? null;
  const commit = source.commit ?? null;
  if (sha256 !== null) match(sha256, SHA256, `${where} sha256`);
  if (commit !== null) match(commit, COMMIT, `${where} commit`);
  if (source.md5 !== undefined) match(source.md5, MD5, `${where} md5`);
  let signature = null;
  if (source.signature !== undefined) {
    if (!isRecord(source.signature)) fail(`${where} signature is not an object.`);
    signature = {
      url: checkedUrl(source.signature.url, source.hosts, `${where} signature.url`).href,
      keyUrl: checkedUrl(source.signature.keyUrl, source.hosts, `${where} signature.keyUrl`).href,
      fingerprint: match(source.signature.fingerprint, FINGERPRINT, `${where} signature.fingerprint`),
    };
  }
  // C4 rev 1: a checksum or a commit, always. A signature is an additional check, never a substitute.
  if (sha256 === null && commit === null) {
    fail(`${where} has neither sha256 nor commit; nothing was downloaded.`);
  }
  const kind = commit !== null ? 'git' : 'tarball';
  const file = kind === 'git' ? '-' : match(url.pathname.split('/').pop(), PLAIN_NAME, `${where} url file name`);
  return { name, version: source.version, licence: source.licence, url: url.href, directory: source.directory, hosts: source.hosts, licenceFiles: source.licenceFiles, sha256, commit, md5: source.md5 ?? null, signature, kind, file };
}

async function readLock(lockPath) {
  let lock;
  try {
    lock = JSON.parse(await readFile(lockPath, 'utf8'));
  } catch {
    fail(`${lockPath} is missing or is not JSON.`);
  }
  if (!isRecord(lock) || lock.schema !== 1) fail('the lock file schema is not 1.');
  match(lock.macosDeploymentTarget, DEPLOYMENT_TARGET, 'macosDeploymentTarget');
  if (!Array.isArray(lock.sources) || lock.sources.length === 0) fail('the lock file lists no sources.');
  const sources = lock.sources.map(checkedSource);
  const names = new Set(sources.map((source) => source.name));
  if (names.size !== sources.length) fail('two sources share a name.');
  const ffmpeg = sources.find((source) => source.name === 'ffmpeg');
  if (ffmpeg === undefined || ffmpeg.kind !== 'tarball' || ffmpeg.signature === null) fail('the ffmpeg source must be a signed tarball.');
  if (ffmpeg.licence !== 'GPL-3.0-or-later') fail('the ffmpeg licence must be GPL-3.0-or-later (--enable-gpl --enable-version3).');
  return { target: lock.macosDeploymentTarget, sources };
}

function dash(value) {
  return value === null ? '-' : value;
}

/** One `target` line, then one tab-separated line per source, in lock order. */
async function check(lockPath) {
  const { target, sources } = await readLock(lockPath);
  const lines = [`target\t${target}`];
  for (const source of sources) {
    lines.push(
      [
        'source', source.name, source.version, source.kind, source.url, source.file, source.directory,
        dash(source.sha256), dash(source.commit), dash(source.md5), source.hosts.join(','),
        dash(source.signature?.url ?? null), dash(source.signature?.keyUrl ?? null), dash(source.signature?.fingerprint ?? null),
        source.licenceFiles.join(','),
      ].join('\t'),
    );
  }
  process.stdout.write(`${lines.join('\n')}\n`);
}

async function describeFile(filePath) {
  const stats = await stat(filePath);
  if (!stats.isFile()) fail(`${filePath} is not a regular file.`);
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  return { sha256: hash.digest('hex'), bytes: stats.size };
}

/** resolved.tsv: `<name>\t<sha256 or ->\t<commit or ->` for every source, as verified by the build. */
async function readResolved(resolvedPath, sources) {
  const resolved = new Map();
  for (const line of (await readFile(resolvedPath, 'utf8')).split('\n').filter((entry) => entry !== '')) {
    const [name, sha256, commit] = line.split('\t');
    resolved.set(name, { sha256: sha256 === '-' ? null : match(sha256, SHA256, `resolved ${name} sha256`), commit: commit === '-' ? null : match(commit, COMMIT, `resolved ${name} commit`) });
  }
  return sources.map((source) => {
    const entry = resolved.get(source.name);
    if (entry === undefined) fail(`the build did not resolve source "${source.name}".`);
    if (source.sha256 !== null && entry.sha256 !== source.sha256) fail(`source "${source.name}" resolved to a different sha256 than its pin.`);
    if (source.commit !== null && entry.commit !== source.commit) fail(`source "${source.name}" resolved to a different commit than its pin.`);
    if (entry.sha256 === null && entry.commit === null) fail(`source "${source.name}" resolved to neither sha256 nor commit.`);
    const record = { name: source.name, version: source.version, licence: source.licence, url: source.url };
    if (entry.sha256 !== null) record.sha256 = entry.sha256;
    if (entry.commit !== null) record.commit = entry.commit;
    return record;
  });
}

/** build-manifest.json exactly as plan 9.2 states, written atomically. */
async function manifest(lockPath, outDir, resolvedPath, flagsPath) {
  const { sources } = await readLock(lockPath);
  const ffmpeg = sources.find((source) => source.name === 'ffmpeg');
  const configureFlags = (await readFile(flagsPath, 'utf8')).split('\n').filter((flag) => flag !== '');
  if (configureFlags.includes('--enable-nonfree') || !configureFlags.includes('--enable-gpl') || !configureFlags.includes('--enable-version3')) {
    fail('configure flags must hold --enable-gpl and --enable-version3 and never --enable-nonfree.');
  }
  const binaries = [];
  for (const name of BINARIES) binaries.push({ name, ...(await describeFile(join(outDir, 'bin', name))) });
  const archiveFile = `ffmpeg-sources-${ffmpeg.version}.tar.gz`;
  const record = {
    ffmpegVersion: ffmpeg.version,
    licence: ffmpeg.licence,
    configureFlags,
    binaries,
    sourceArchive: { file: archiveFile, ...(await describeFile(join(outDir, archiveFile))) },
    sources: await readResolved(resolvedPath, sources),
  };
  const target = join(outDir, 'build-manifest.json');
  await writeFile(`${target}.partial`, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  await rename(`${target}.partial`, target);
}

async function main(argv) {
  const [command, ...rest] = argv;
  if (command === 'check' && rest.length === 1) return check(rest[0]);
  if (command === 'manifest' && rest.length === 4) return manifest(rest[0], rest[1], rest[2], rest[3]);
  return fail('usage: lock-tool.mjs check <lock> | manifest <lock> <out> <resolved.tsv> <flags.txt>');
}

try {
  await main(process.argv.slice(2));
} catch (error) {
  process.stderr.write(`ERROR (ffmpeg lock): ${error instanceof LockError ? error.message : `unexpected failure: ${error instanceof Error ? error.message : 'unknown error'}`}\n`);
  process.exitCode = 1;
}
