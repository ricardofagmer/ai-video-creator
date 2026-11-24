// Writes a tree planned by dependency-plan.mjs as real files: every symlink of pnpm's layout is
// dereferenced, so nothing in the payload points back into the checkout (DI-AC-03). Workspace
// packages ship their manifest and built output only, never sources or tests.
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { cp, lstat, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fail, hasErrorCode, isRecord, say } from './failure.mjs';
import { planProductionTree } from './dependency-plan.mjs';

/**
 * Folders that live beside a package in pnpm's virtual store and that the package requires by a
 * bare name: Prisma's generated client is `.prisma/client`, next to `@prisma/client`.
 */
const COMPANION_FOLDERS = Object.freeze({ '@prisma/client': ['.prisma'] });

/** Workspace folders read by path at run time, beyond `files` / `dist` (plan section 9.1). */
const WORKSPACE_EXTRAS = Object.freeze({ '@studio/hyperframes': ['sandbox'] });

/** The checkout as seen by the planner; reads only. */
export const checkoutFileSystem = Object.freeze({
  realpath: (path) => realpathSync(path),
  isDirectory: (path) => {
    try {
      return statSync(path).isDirectory();
    } catch (error) {
      if (hasErrorCode(error, 'ENOENT') || hasErrorCode(error, 'ENOTDIR')) return false;
      throw error;
    }
  },
  readManifest: (folder) => {
    let manifest;
    try {
      manifest = JSON.parse(readFileSync(join(folder, 'package.json'), 'utf8'));
    } catch {
      fail(`cannot read ${join(folder, 'package.json')}.`);
    }
    if (!isRecord(manifest)) fail(`${join(folder, 'package.json')} is not an object.`);
    return manifest;
  },
});

async function exists(path) {
  try {
    await lstat(path);
    return true;
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return false;
    throw error;
  }
}

async function copyFresh(source, destination) {
  if (await exists(destination)) fail(`${destination} already exists; the staged tree would mix two copies.`);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, dereference: true, errorOnExist: true, force: false });
}

/** Entries of a workspace package to ship: `files` when declared (plain names only), else dist. */
function workspaceEntries(name, manifest) {
  const declared = Array.isArray(manifest.files) ? manifest.files : ['dist'];
  for (const entry of declared) {
    if (typeof entry !== 'string' || /[*?[\]{}!]/.test(entry) || entry.split('/').includes('..')) {
      fail(`${name} "files" entry ${JSON.stringify(entry)} is not a plain relative path; staging supports plain names only.`);
    }
  }
  return [...new Set([...declared, ...(WORKSPACE_EXTRAS[name] ?? [])])];
}

async function copyWorkspacePackage(entry, destination) {
  const manifest = checkoutFileSystem.readManifest(entry.realPath);
  await mkdir(destination, { recursive: true });
  await cp(join(entry.realPath, 'package.json'), join(destination, 'package.json'));
  for (const relativeEntry of workspaceEntries(entry.name, manifest)) {
    const source = join(entry.realPath, relativeEntry);
    if (!(await exists(source))) fail(`${entry.name} has no ${relativeEntry}; run "pnpm exec turbo run build" first.`);
    await copyFresh(source, join(destination, relativeEntry));
  }
}

/** The pnpm folder that holds `realPath` as `<modules>/<name>`, for companion lookups. */
function containingModules(realPath, name) {
  let folder = realPath;
  for (let depth = 0; depth < name.split('/').length; depth += 1) folder = dirname(folder);
  return folder;
}

async function copyCompanions(entry, destination) {
  for (const companion of COMPANION_FOLDERS[entry.name] ?? []) {
    const source = join(containingModules(entry.realPath, entry.name), companion);
    if (!(await exists(source))) fail(`${entry.name} has no ${companion} beside it; run the package's generate step (prisma generate) first.`);
    await copyFresh(source, join(containingModules(destination, entry.name), companion));
  }
}

/**
 * Plans and writes the tree under `targetRoot` (its `node_modules/` is created). Returns the plan's
 * placements so licences and prune rules can walk the same packages.
 */
export async function writeProductionTree({ roots, repoRoot, targetRoot, forcedNesting }) {
  const { placements } = planProductionTree({ roots, repoRoot, fileSystem: checkoutFileSystem, forcedNesting });
  const locations = [...placements.keys()].sort((left, right) => left.length - right.length || left.localeCompare(right));
  for (const location of locations) {
    const entry = placements.get(location);
    const destination = join(targetRoot, ...location.split('/'));
    if (entry.workspace) await copyWorkspacePackage(entry, destination);
    else await copyFresh(entry.realPath, destination);
    await copyCompanions(entry, destination);
  }
  const workspaceCount = locations.filter((location) => placements.get(location).workspace).length;
  say(`staged ${locations.length} packages (${workspaceCount} workspace) under ${targetRoot}/node_modules`);
  return placements;
}
