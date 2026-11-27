// Thin command line over the release modules (ticket 05), called by .github/workflows/release.yml.
// Every value arrives as an argument or an environment variable read here; the modules stay pure.
//
//   node scripts/release/cli.mjs release-tag --event <name> --ref-type <tag|branch> --ref-name <ref>
//   node scripts/release/cli.mjs node-sums-url
//   node scripts/release/cli.mjs check-node-sums --sums <verified SHASUMS256.txt>
//   node scripts/release/cli.mjs render --release-dir <dir> --ffmpeg-manifest <build-manifest.json>
//     --out-dir <dir> --base-url <url>
//   node scripts/release/cli.mjs verify --dir <staged dir> --tag <vX.Y.Z>
//   node scripts/release/cli.mjs publish-branch --manifest <latest.json> --repository <owner/repo>
//     (reads GITHUB_TOKEN and GITHUB_API_URL from the environment)
import { readFile } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';
import { assertNodePinSigned, nodeSignedSumsUrl, resolveReleaseTag } from './guards.mjs';
import { createGitHubClient, publishManifestBranch } from './manifest-branch.mjs';
import { ReleaseError, fail, isRecord } from './manifest.mjs';
import { stageRelease, verifyStagedRelease } from './release-files.mjs';

const DEFAULT_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SHELL_PACKAGE = join('apps', 'shell', 'package.json');
const PINS_MODULE = join('apps', 'shell', 'scripts', 'lib', 'pins.mjs');

const COMMANDS = Object.freeze({
  'release-tag': { options: ['event', 'ref-type', 'ref-name'], run: releaseTag },
  'node-sums-url': { options: [], run: nodeSumsUrl },
  'check-node-sums': { options: ['sums'], run: checkNodeSums },
  render: { options: ['release-dir', 'ffmpeg-manifest', 'out-dir', 'base-url'], run: render },
  verify: { options: ['dir', 'tag'], run: verify },
  'publish-branch': { options: ['manifest', 'repository'], run: publishBranch },
});

function parseCommand(argv) {
  const [name, ...rest] = argv;
  const command = typeof name === 'string' && Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
  if (command === undefined) fail(`unknown command; use one of ${Object.keys(COMMANDS).join(', ')}.`);
  let values;
  try {
    const options = Object.fromEntries(command.options.map((option) => [option, { type: 'string' }]));
    ({ values } = parseArgs({ args: rest, options, strict: true, allowPositionals: false }));
  } catch {
    fail(`invalid arguments for ${name}; expected ${command.options.map((option) => `--${option}`).join(' ') || 'none'}.`);
  }
  for (const option of command.options) {
    if (typeof values[option] !== 'string' || values[option].length === 0) fail(`${name} needs --${option}.`);
  }
  return { command, values };
}

function inRoot(root, path) {
  return isAbsolute(path) ? path : join(root, path);
}

async function readShellVersion(root) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(join(root, SHELL_PACKAGE), 'utf8'));
  } catch {
    fail(`${SHELL_PACKAGE} could not be read.`);
  }
  return isRecord(manifest) ? manifest.version : undefined;
}

async function loadNodePin(root) {
  const pins = await import(pathToFileURL(join(root, PINS_MODULE)).href);
  const tarball = pins.NODE_TARBALL;
  if (!isRecord(tarball) || typeof pins.NODE_VERSION !== 'string') fail(`${PINS_MODULE} exports no NODE_TARBALL / NODE_VERSION.`);
  return { version: pins.NODE_VERSION, fileName: tarball.fileName, sha256: tarball.sha256 };
}

async function releaseTag({ values, root, write }) {
  const packageVersion = await readShellVersion(root);
  write(resolveReleaseTag({ eventName: values.event, refType: values['ref-type'], refName: values['ref-name'], packageVersion }));
}

async function nodeSumsUrl({ root, write }) {
  write(nodeSignedSumsUrl((await loadNodePin(root)).version));
}

async function checkNodeSums({ values, root, write }) {
  const pin = await loadNodePin(root);
  const sumsText = await readFile(inRoot(root, values.sums), 'utf8').catch(() => fail('the verified SHASUMS256.txt could not be read.'));
  assertNodePinSigned({ sumsText, fileName: pin.fileName, sha256: pin.sha256 });
  write(`signed: ${pin.sha256}  ${pin.fileName}`);
}

async function render({ values, root, now, write }) {
  const manifest = await stageRelease({
    releaseDir: inRoot(root, values['release-dir']),
    ffmpegBuildManifest: inRoot(root, values['ffmpeg-manifest']),
    outDir: inRoot(root, values['out-dir']),
    baseUrl: values['base-url'],
    now,
  });
  write(`latest.json: version ${manifest.version}, published ${manifest.publishedAt}`);
  for (const asset of manifest.assets) write(`asset ${asset.platform}: ${asset.file} sha-256 ${asset.sha256} bytes ${asset.bytes}`);
  for (const source of manifest.sources) write(`source ${source.name} (${source.licence}): sha-256 ${source.sha256}`);
}

async function verify({ values, root, write }) {
  const manifest = await verifyStagedRelease({ outDir: inRoot(root, values.dir), tag: values.tag });
  write(`verified release v${manifest.version}: ${manifest.assets.length} asset(s), ${manifest.sources.length} source archive(s)`);
}

async function publishBranch({ values, root, env, fetchImpl, write }) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(inRoot(root, values.manifest), 'utf8'));
  } catch {
    fail('the manifest to publish could not be read as JSON.');
  }
  const request = createGitHubClient({ apiUrl: env.GITHUB_API_URL ?? 'https://api.github.com', token: env.GITHUB_TOKEN, repository: values.repository, fetchImpl });
  const result = await publishManifestBranch({ request, manifest });
  write(`${result.created ? 'created' : 'updated'} branch ${result.branch} at ${result.commit} for ${result.version}`);
}

/** Runs one command. Injected: arguments, file root, clock, environment, HTTP client and output. */
export async function runReleaseCli({ argv, root = DEFAULT_ROOT, now = new Date(), env = process.env, fetchImpl = fetch, write }) {
  const { command, values } = parseCommand(argv);
  await command.run({ values, root, now, env, fetchImpl, write });
}

function isEntryPoint() {
  return typeof process.argv[1] === 'string' && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isEntryPoint()) {
  try {
    await runReleaseCli({ argv: process.argv.slice(2), write: (line) => process.stdout.write(`${line}\n`) });
  } catch (error) {
    const reason = error instanceof ReleaseError ? error.message : `unexpected failure: ${error instanceof Error ? error.message : 'unknown error'}`;
    process.stderr.write(`ERROR (release): ${reason}\n`);
    process.exitCode = 1;
  }
}
