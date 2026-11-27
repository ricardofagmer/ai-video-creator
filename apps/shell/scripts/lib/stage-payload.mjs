// Stages `runtime/payload/` of C3 rev 3 and plan section 9.1 from already-built workspace output:
// api, watcher and cli built output with ONE shared production node_modules, the unflattened Next
// standalone web, the prisma tool tree, and the resources read by path. Every destination comes
// from the runtime locator (`@studio/core/runtime`), the single source of these names.
import { cp, lstat, mkdir, readFile, readlink, writeFile } from 'node:fs/promises';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { fail, hasErrorCode, isRecord, say } from './failure.mjs';
import { walkTree } from './hashing.mjs';
import { writeProductionTree } from './production-tree.mjs';

/** Payload folders with built output only; their dependencies live in the shared tree. */
const NODE_APPS = Object.freeze([
  { payload: 'api', sourceDir: 'apps/api' },
  { payload: 'watcher', sourceDir: 'apps/watcher' },
  { payload: 'cli', sourceDir: 'tools/cli' },
]);

/** Plan 9.1: `@studio/hyperframes` finds its pinned bin in its own `node_modules/hyperframes`. */
const FORCED_NESTING = Object.freeze({ '@studio/hyperframes': ['hyperframes'] });

/** Plan 9.1 `payload/resources/`, repository-relative. */
export const RESOURCE_PATHS = Object.freeze([
  'scripts/models/embedding-model.manifest.json',
  'scripts/models/embedding-model.source.json',
  'scripts/models/fetch-embedding-model.sh',
  'scripts/lib/common.sh',
  'seeds/templates/hyperframes/title-card',
  'packages/core/prisma',
]);

/** Build outputs the payload is made from; `turbo run build` produces all of them. */
export const REQUIRED_BUILD_OUTPUTS = Object.freeze([
  'apps/api/dist/main.js',
  'apps/watcher/dist/main.js',
  'tools/cli/dist/main.js',
  'packages/core/dist/runtime/index.js',
  'apps/web/.next/standalone/apps/web/server.js',
  'apps/web/.next/static',
  'packages/core/prisma/schema.prisma',
]);

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

export async function assertBuildOutputs(repoRoot) {
  const missing = [];
  for (const path of REQUIRED_BUILD_OUTPUTS) if (!(await exists(join(repoRoot, path)))) missing.push(path);
  if (missing.length > 0) {
    fail(`build output missing: ${missing.join(', ')}. Run "pnpm exec turbo run build" (apps/web needs output "standalone").`);
  }
}

/** A minimal manifest beside each app's dist, so ESM (`type: module`) and the app name still apply. */
async function writeAppManifest(sourceDir, targetDir) {
  const manifest = JSON.parse(await readFile(join(sourceDir, 'package.json'), 'utf8'));
  if (!isRecord(manifest)) fail(`${sourceDir}/package.json is not an object.`);
  const minimal = { name: manifest.name, version: manifest.version, private: true };
  if (typeof manifest.type === 'string') minimal.type = manifest.type;
  await writeFile(join(targetDir, 'package.json'), `${JSON.stringify(minimal, null, 2)}\n`);
}

async function stageNodeApps({ repoRoot, runtime }) {
  for (const app of NODE_APPS) {
    const target = runtime.payload[app.payload];
    await mkdir(target, { recursive: true });
    await cp(join(repoRoot, app.sourceDir, 'dist'), join(target, 'dist'), { recursive: true, dereference: true, errorOnExist: true, force: false });
    await writeAppManifest(join(repoRoot, app.sourceDir), target);
  }
  if (join(runtime.payloadRoot, 'node_modules') !== runtime.sharedNodeModules) fail('the locator moved the shared node_modules; staging must follow it.');
  return writeProductionTree({
    roots: NODE_APPS.map((app) => ({ label: app.sourceDir, sourceDir: join(repoRoot, app.sourceDir) })),
    repoRoot,
    targetRoot: runtime.payloadRoot,
    forcedNesting: FORCED_NESTING,
  });
}

/** Plan 9.1: `payload/tools/prisma/node_modules/{prisma,@prisma/engines}` as an installed tree. */
async function stagePrismaTool({ repoRoot, runtime }) {
  await writeProductionTree({
    roots: [{ label: 'prisma tool', sourceDir: join(repoRoot, 'packages', 'core'), only: ['prisma'] }],
    repoRoot,
    targetRoot: runtime.prisma.root,
  });
  for (const path of [runtime.prisma.cliEntry, runtime.prisma.schemaEngine]) {
    if (!(await exists(path))) fail(`the prisma tool tree has no ${relative(runtime.root, path)}.`);
  }
}

/** Next standalone tree, unflattened, symlinks kept verbatim; `.env*` files never ship (vetting 6.1). */
async function stageWeb({ repoRoot, runtime, webServerEntry }) {
  const webSource = join(repoRoot, 'apps', 'web');
  let skippedEnvironmentFiles = 0;
  await cp(join(webSource, '.next', 'standalone'), runtime.payload.web, {
    recursive: true,
    verbatimSymlinks: true,
    errorOnExist: true,
    force: false,
    filter: (source) => {
      const isEnvironmentFile = basename(source).startsWith('.env');
      if (isEnvironmentFile) skippedEnvironmentFiles += 1;
      return !isEnvironmentFile;
    },
  });
  const webApp = dirname(webServerEntry);
  await cp(join(webSource, '.next', 'static'), join(webApp, '.next', 'static'), { recursive: true, dereference: true, errorOnExist: true, force: false });
  if (await exists(join(webSource, 'public'))) {
    await cp(join(webSource, 'public'), join(webApp, 'public'), { recursive: true, dereference: true, errorOnExist: true, force: false });
  }
  if (!(await exists(webServerEntry))) fail(`the web server is not at ${relative(runtime.root, webServerEntry)}, where the launcher starts it.`);
  say(`staged web standalone tree${skippedEnvironmentFiles > 0 ? ` (left out ${skippedEnvironmentFiles} .env file(s))` : ''}`);
}

async function stageResources({ repoRoot, runtime }) {
  for (const path of RESOURCE_PATHS) {
    const source = join(repoRoot, ...path.split('/'));
    if (!(await exists(source))) fail(`resource ${path} is missing from the checkout.`);
    await cp(source, join(runtime.resources, ...path.split('/')), { recursive: true, dereference: true, errorOnExist: true, force: false });
  }
}

/**
 * Every symlink under `root` must be relative and land inside `root`: codesign --strict rejects
 * links that leave the bundle, and an absolute link would point back into the build machine.
 */
export async function assertContainedSymlinks(root) {
  let count = 0;
  for await (const entry of walkTree(root)) {
    if (entry.kind !== 'symlink') continue;
    count += 1;
    const target = await readlink(entry.path);
    const landing = resolve(dirname(entry.path), target);
    if (target.startsWith('/') || relative(root, landing).startsWith('..')) {
      fail(`symlink ${relative(root, entry.path)} points outside the staged tree (${target}).`);
    }
  }
  return count;
}

/** Stages the whole payload except manifest.json, which is written after signing. */
export async function stagePayload({ repoRoot, runtime, webServerEntry }) {
  await mkdir(runtime.payloadRoot, { recursive: true });
  await stageNodeApps({ repoRoot, runtime });
  await stagePrismaTool({ repoRoot, runtime });
  await stageWeb({ repoRoot, runtime, webServerEntry });
  await stageResources({ repoRoot, runtime });
  const links = await assertContainedSymlinks(runtime.root);
  say(`payload staged; ${links} relative symlink(s), all inside runtime/`);
}
