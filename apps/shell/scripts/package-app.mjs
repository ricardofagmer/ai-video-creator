// Builds the menu-bar shell as a local, ad-hoc signed macOS app (SPEC 0006 R3-08, ADR 0005
// decision 5 and section D, vetting 0002 sections 8, 9 and 12). scripts/install.sh runs it as:
//
//   pnpm --filter @studio/shell run package -- --node-bin <abs> --cli-main <abs> --data-home <abs>
//     --web-port <port> --api-port <port>
//
// Order: every guard (root, platform, download redirect variables, arguments, dist/main.js, the
// installed electron version and its checksum list), then a staging folder holding exactly
// package.json, main.js and shell-config.json, then the packager, the fuses, an explicit ad-hoc
// signature and its verification. The packager's framework download is the only network use; this
// script opens no connection of its own and starts every child process with an argument array and
// no shell. Output carries paths, versions and sizes, never a secret or an environment value.
import { spawnSync } from 'node:child_process';
import { lstat, mkdir, readdir, readFile, rm, copyFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join, posix } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { packager } from '@electron/packager';
import { flipFuses, getCurrentFuseWire, FuseState, FuseV1Options, FuseVersion } from '@electron/fuses';

const ELECTRON_VERSION = '45.4.1';
// vetting 0002 section 12, check 3: artifact-utils.js BASE_URL of @electron/get 5.1.0.
const DOWNLOAD_HOST = 'https://github.com/electron/electron/releases/download/';
const ELECTRON_CACHE = '~/Library/Caches/electron/';
const APP_NAME = 'Video Studio';
const BUNDLE_ID = 'com.videostudio.shell';
const TARGET_PLATFORM = 'darwin';
const TARGET_ARCH = 'arm64';
const FRAMEWORK_ZIP = `electron-v${ELECTRON_VERSION}-${TARGET_PLATFORM}-${TARGET_ARCH}.zip`;
const CODESIGN = '/usr/bin/codesign';

// The same limits as apps/shell/src/config/shell-config.ts, so the written file always parses there.
const MAX_PATH_CHARS = 4096;
const MIN_PORT = 1024;
const MAX_PORT = 65535;

const PACKAGE_DIR = dirname(dirname(fileURLToPath(import.meta.url)));
const DIST_MAIN = join(PACKAGE_DIR, 'dist', 'main.js');
const OUT_DIR = join(PACKAGE_DIR, 'out');
const STAGE_DIR = join(OUT_DIR, 'stage');
const STAGED_FILES = ['main.js', 'package.json', 'shell-config.json'];

// vetting 0002 section 12 "Download redirect variables". @electron/get lets the environment win
// over options passed in code, so refusing to run is the only reliable control. Names are compared
// lower-cased, without underscores and without the npm_config_ / npm_package_config_ prefixes, which
// covers the snake, camel and upper-case spellings. ELECTRON_SKIP_BINARY_DOWNLOAD no longer exists
// in 45.4.1 but stays on the list (ticket default list).
const REDIRECT_VARIABLES = new Set([
  'electronmirror',
  'electronnightlymirror',
  'electroncustomdir',
  'electroncustomfilename',
  'electroncustomversion',
  'electronconfigcache',
  'forcenocache',
  'electronuseremotechecksums',
  'electroninstallplatform',
  'electroninstallarch',
  'electronoverridedistpath',
  'electrongetuseproxy',
  'electronskipbinarydownload',
]);

// vetting 0002 section 8 rows 8 to 11; names confirmed in section 12, check 4.
const FUSE_SETTINGS = [
  { option: FuseV1Options.RunAsNode, name: 'RunAsNode', enabled: false },
  { option: FuseV1Options.EnableNodeOptionsEnvironmentVariable, name: 'EnableNodeOptionsEnvironmentVariable', enabled: false },
  { option: FuseV1Options.EnableNodeCliInspectArguments, name: 'EnableNodeCliInspectArguments', enabled: false },
  { option: FuseV1Options.EnableEmbeddedAsarIntegrityValidation, name: 'EnableEmbeddedAsarIntegrityValidation', enabled: true },
  { option: FuseV1Options.OnlyLoadAppFromAsar, name: 'OnlyLoadAppFromAsar', enabled: true },
  { option: FuseV1Options.GrantFileProtocolExtraPrivileges, name: 'GrantFileProtocolExtraPrivileges', enabled: false },
];

class PackagingError extends Error {}

function fail(message) {
  throw new PackagingError(message);
}

function say(line) {
  process.stdout.write(`${line}\n`);
}

function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertSafeHost() {
  if (typeof process.getuid === 'function' && process.getuid() === 0) {
    fail('não rode como root nem com sudo: o app é construído para o seu usuário.');
  }
  if (process.platform !== TARGET_PLATFORM) fail('o app do menu só é construído no macOS.');
}

function normalizedVariableName(name) {
  const compact = name.toLowerCase().replaceAll('_', '');
  for (const prefix of ['npmpackageconfig', 'npmconfig']) {
    if (compact.startsWith(prefix)) return compact.slice(prefix.length);
  }
  return compact;
}

// Names only: a proxy or mirror value may carry credentials, so it is never printed.
function assertNoRedirectVariables() {
  const found = Object.keys(process.env).filter(
    (name) => process.env[name] !== undefined && REDIRECT_VARIABLES.has(normalizedVariableName(name)),
  );
  if (found.length > 0) {
    fail(`variáveis que redirecionam o download do Electron estão definidas (${found.sort().join(', ')}); remova-as e rode de novo. Nenhum espelho é aceito.`);
  }
}

function checkedPath(raw, flag) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_PATH_CHARS) fail(`${flag} ausente ou inválido.`);
  if (/[\r\n\0]/.test(raw)) fail(`${flag} contém quebra de linha ou byte nulo.`);
  if (!raw.startsWith('/')) fail(`${flag} precisa ser um caminho absoluto.`);
  if (raw.split('/').includes('..')) fail(`${flag} não pode conter "..".`);
  const normalForm = raw.length > 1 && raw.endsWith('/') ? null : posix.normalize(raw);
  if (normalForm !== raw) fail(`${flag} precisa estar normalizado (sem "/.", "//" ou "/" no fim).`);
  return raw;
}

function checkedPort(raw, flag) {
  if (typeof raw !== 'string' || !/^[0-9]{1,5}$/.test(raw)) fail(`${flag} ausente ou não numérica.`);
  const port = Number.parseInt(raw, 10);
  if (port < MIN_PORT || port > MAX_PORT) fail(`${flag} fora do intervalo ${MIN_PORT}-${MAX_PORT}.`);
  return port;
}

function readArguments(rawArguments) {
  // pnpm forwards the `--` that separates its own options from the script's.
  const tokens = rawArguments[0] === '--' ? rawArguments.slice(1) : rawArguments;
  let values;
  try {
    ({ values } = parseArgs({
      args: tokens,
      strict: true,
      allowPositionals: false,
      options: {
        'node-bin': { type: 'string' },
        'cli-main': { type: 'string' },
        'data-home': { type: 'string' },
        'web-port': { type: 'string' },
        'api-port': { type: 'string' },
      },
    }));
  } catch {
    fail('argumentos inválidos; esperado --node-bin, --cli-main, --data-home, --web-port e --api-port.');
  }
  const webPort = checkedPort(values['web-port'], '--web-port');
  const apiPort = checkedPort(values['api-port'], '--api-port');
  if (webPort === apiPort) fail('--web-port e --api-port precisam ser diferentes.');
  return {
    format: 1,
    nodeBinary: checkedPath(values['node-bin'], '--node-bin'),
    cliMain: checkedPath(values['cli-main'], '--cli-main'),
    dataHome: checkedPath(values['data-home'], '--data-home'),
    webPort,
    apiPort,
  };
}

async function assertRegularFile(filePath, missingMessage) {
  try {
    if ((await lstat(filePath)).isFile()) return;
  } catch {
    fail(missingMessage);
  }
  fail(missingMessage);
}

async function readJsonFile(filePath) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fail(`não foi possível ler o JSON ${filePath}.`);
  }
}

// Reads electron's package.json and checksums.json as data; requiring `electron` would download it.
async function readInstalledElectron() {
  const resolveFromShell = createRequire(join(PACKAGE_DIR, 'package.json'));
  let manifestPath;
  try {
    manifestPath = resolveFromShell.resolve('electron/package.json');
  } catch {
    fail('o pacote electron não está instalado em apps/shell; rode "pnpm install".');
  }
  const manifest = await readJsonFile(manifestPath);
  if (!isRecord(manifest) || manifest.version !== ELECTRON_VERSION) {
    fail(`o electron instalado não é ${ELECTRON_VERSION}; o app só é construído com a versão aprovada.`);
  }
  const checksums = await readJsonFile(join(dirname(manifestPath), 'checksums.json'));
  const frameworkChecksum = isRecord(checksums) ? checksums[FRAMEWORK_ZIP] : undefined;
  if (typeof frameworkChecksum !== 'string' || !/^[0-9a-f]{64}$/.test(frameworkChecksum)) {
    fail(`o checksums.json do electron não tem um sha-256 para ${FRAMEWORK_ZIP}.`);
  }
  return frameworkChecksum;
}

async function readAppVersion() {
  const manifest = await readJsonFile(join(PACKAGE_DIR, 'package.json'));
  const version = isRecord(manifest) ? manifest.version : undefined;
  if (typeof version !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) fail('apps/shell/package.json sem versão X.Y.Z.');
  return version;
}

// A missing folder is fine (it is created next); a symlink could point the rm below elsewhere.
async function assertNotSymlink(folder) {
  let stats;
  try {
    stats = await lstat(folder);
  } catch (error) {
    if (isRecord(error) && error.code === 'ENOENT') return;
    throw error;
  }
  if (stats.isSymbolicLink()) fail(`${folder} é um link simbólico; recusado.`);
}

// The app folder gets only these three files: no node_modules, no sources, no maps.
async function stageApp(config, appVersion) {
  await assertNotSymlink(OUT_DIR);
  await assertNotSymlink(STAGE_DIR);
  await rm(STAGE_DIR, { recursive: true, force: true });
  await mkdir(STAGE_DIR, { recursive: true });
  const minimalManifest = { name: 'video-studio-shell', version: appVersion, main: 'main.js' };
  await writeFile(join(STAGE_DIR, 'package.json'), `${JSON.stringify(minimalManifest, null, 2)}\n`);
  await copyFile(DIST_MAIN, join(STAGE_DIR, 'main.js'));
  await writeFile(join(STAGE_DIR, 'shell-config.json'), `${JSON.stringify(config, null, 2)}\n`);
  const staged = (await readdir(STAGE_DIR)).sort();
  if (staged.join(',') !== STAGED_FILES.join(',')) fail(`a pasta de preparo tem arquivos inesperados: ${staged.join(', ')}.`);
}

async function packageApp(appVersion, frameworkChecksum) {
  say(
    `Download do framework: Electron ${ELECTRON_VERSION} (${FRAMEWORK_ZIP}) de ${DOWNLOAD_HOST} ` +
      `(releases do GitHub de electron/electron), conferido com o checksums.json do pacote npm electron. ` +
      `O zip fica em cache em ${ELECTRON_CACHE} e é reaproveitado.`,
  );
  const outputFolders = await packager({
    dir: STAGE_DIR,
    out: OUT_DIR,
    name: APP_NAME,
    appBundleId: BUNDLE_ID,
    appVersion,
    buildVersion: appVersion,
    platform: TARGET_PLATFORM,
    arch: TARGET_ARCH,
    electronVersion: ELECTRON_VERSION,
    asar: true,
    asarIntegrityDigest: true,
    prune: false,
    overwrite: true,
    // Tray only: no Dock icon and no application menu bar entry.
    extendInfo: { LSUIElement: true },
    // Only the embedded, registry-covered checksum; no mirror, cache root or checksum bypass.
    download: { checksums: { [FRAMEWORK_ZIP]: frameworkChecksum } },
  });
  if (outputFolders.length !== 1) fail(`o packager gerou ${outputFolders.length} saídas; esperado 1.`);
  const appPath = join(outputFolders[0], `${APP_NAME}.app`);
  await assertRegularFile(join(appPath, 'Contents', 'Resources', 'app.asar'), `o packager não gerou ${appPath}/Contents/Resources/app.asar.`);
  return appPath;
}

async function setFuses(appPath) {
  const config = { version: FuseVersion.V1, resetAdHocDarwinSignature: false };
  for (const fuse of FUSE_SETTINGS) config[fuse.option] = fuse.enabled;
  await flipFuses(appPath, config);
  const wire = await getCurrentFuseWire(appPath);
  for (const fuse of FUSE_SETTINGS) {
    const expected = fuse.enabled ? FuseState.ENABLE : FuseState.DISABLE;
    if (wire[fuse.option] !== expected) fail(`o fuse ${fuse.name} não ficou ${fuse.enabled ? 'ligado' : 'desligado'}.`);
    say(`fuse ${fuse.name}: ${fuse.enabled ? 'ligado' : 'desligado'}`);
  }
}

function runCodesign(codesignArguments, failureMessage) {
  const result = spawnSync(CODESIGN, codesignArguments, { stdio: 'inherit', shell: false });
  if (result.error !== undefined || result.status !== 0) fail(`${failureMessage} (código ${result.status ?? 'sem código'}).`);
}

// After the fuse flip, which changes the framework binary and so invalidates its signature.
function signAdHoc(appPath) {
  runCodesign(['--sign', '-', '--force', '--deep', appPath], 'a assinatura ad hoc falhou');
  runCodesign(['--verify', '--deep', '--strict', '--verbose=2', appPath], 'a verificação da assinatura falhou');
}

async function sizeInBytes(entryPath) {
  const stats = await lstat(entryPath);
  if (!stats.isDirectory()) return stats.size;
  let total = 0;
  for (const child of await readdir(entryPath)) total += await sizeInBytes(join(entryPath, child));
  return total;
}

async function main() {
  assertSafeHost();
  assertNoRedirectVariables();
  const config = readArguments(process.argv.slice(2));
  await assertRegularFile(DIST_MAIN, `${DIST_MAIN} não existe; rode "pnpm --filter @studio/shell run build" antes.`);
  const frameworkChecksum = await readInstalledElectron();
  const appVersion = await readAppVersion();
  await stageApp(config, appVersion);
  const appPath = await packageApp(appVersion, frameworkChecksum);
  await setFuses(appPath);
  signAdHoc(appPath);
  say(`app: ${appPath}`);
  say(`tamanho: ${await sizeInBytes(appPath)} bytes`);
}

try {
  await main();
} catch (error) {
  const reason = error instanceof PackagingError ? error.message : `falha inesperada: ${error instanceof Error ? error.message : 'erro desconhecido'}`;
  process.stderr.write(`ERRO (empacotamento do app do menu): ${reason}\n`);
  process.exitCode = 1;
}
