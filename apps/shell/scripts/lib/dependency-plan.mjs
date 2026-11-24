// Plans ONE shared production `node_modules/` for api, watcher and cli (C3 rev 3) from the tree pnpm
// already installed, so the payload holds exactly the lockfile versions the build used and no
// network install runs. Pure: the file system is injected as { realpath, isDirectory, readManifest }.
//
// Source side: each package's declared dependencies are resolved the way Node resolves them in the
// checkout (walk up from the package's real folder through `node_modules/`), so pnpm's virtual-store
// siblings and aliases are honoured. Target side: an npm-style hoisted tree; a name already taken
// by another version is nested under the dependent. A final pass re-resolves every edge in the
// planned tree and fails if any would load a different copy than the checkout does.
import { dirname, join, relative, sep } from 'node:path';
import { fail, isRecord } from './failure.mjs';

const TREE_MODULES = 'node_modules';

function namesFrom(field) {
  return isRecord(field) ? Object.keys(field) : [];
}

/** Declared runtime edges: dependencies, optional ones, and peers not marked optional. */
export function declaredEdges(manifest) {
  const optionalPeers = isRecord(manifest.peerDependenciesMeta)
    ? Object.keys(manifest.peerDependenciesMeta).filter((name) => isRecord(manifest.peerDependenciesMeta[name]) && manifest.peerDependenciesMeta[name].optional === true)
    : [];
  const edges = new Map();
  for (const name of namesFrom(manifest.dependencies)) edges.set(name, 'required');
  for (const name of namesFrom(manifest.optionalDependencies)) edges.set(name, 'optional');
  for (const name of namesFrom(manifest.peerDependencies)) {
    if (!edges.has(name) && !optionalPeers.includes(name)) edges.set(name, 'peer');
  }
  return edges;
}

/** Node's lookup from a real folder in the checkout; null when no candidate folder exists. */
function resolveInCheckout(fileSystem, fromRealDir, name, repoRoot) {
  let current = fromRealDir;
  for (;;) {
    if (!current.endsWith(`${sep}${TREE_MODULES}`)) {
      const candidate = join(current, TREE_MODULES, name);
      if (fileSystem.isDirectory(candidate)) return fileSystem.realpath(candidate);
    }
    if (current === repoRoot || dirname(current) === current) return null;
    current = dirname(current);
  }
}

/** Lookup chain inside the planned tree for `name` required from placement `from` ('' is the root). */
export function lookupChain(from, name) {
  const parts = from === '' ? [] : from.split('/');
  const chain = [];
  for (let index = parts.length; index >= 0; index -= 1) {
    if (index > 0 && parts[index - 1] === TREE_MODULES) continue;
    const folder = parts.slice(0, index).join('/');
    chain.push(folder === '' ? `${TREE_MODULES}/${name}` : `${folder}/${TREE_MODULES}/${name}`);
  }
  return chain;
}

function isWorkspaceFolder(repoRoot, realPath) {
  const inside = relative(repoRoot, realPath);
  return !inside.startsWith('..') && !inside.split(sep).includes(TREE_MODULES);
}

/**
 * roots: [{ label, sourceDir, only? }] whose dependencies land at the tree root; `only` restricts a
 * root to the named edges (the prisma tool tree takes `prisma` alone from packages/core).
 * forcedNesting: { [dependentName]: [dependencyName] } placed under the dependent no matter what,
 * for code that looks in its own `node_modules/` (the pinned hyperframes bin).
 * Returns { placements: Map<location, { name, realPath, version, workspace }>, edges }.
 */
export function planProductionTree({ roots, repoRoot, fileSystem, forcedNesting = {} }) {
  const placements = new Map();
  const edges = [];
  const queue = [];

  function assertInsideRepo(realPath, name) {
    if (relative(repoRoot, realPath).startsWith('..')) fail(`${name} resolves outside the repository (${realPath}); refused.`);
  }

  function place(from, fromName, name, realPath) {
    assertInsideRepo(realPath, name);
    edges.push({ from, name, realPath });
    const chain = lookupChain(from, name);
    const forced = (forcedNesting[fromName] ?? []).includes(name) && from !== '';
    const firstHit = chain.find((location) => placements.has(location));
    if (!forced && firstHit !== undefined && placements.get(firstHit).realPath === realPath) return;
    const location = forced || firstHit !== undefined ? chain[0] : chain[chain.length - 1];
    const existing = placements.get(location);
    if (existing !== undefined) {
      if (existing.realPath === realPath) return;
      fail(`two copies of ${name} need ${location} (${existing.version} and another); one shared tree cannot hold both.`);
    }
    const manifest = fileSystem.readManifest(realPath);
    placements.set(location, { name, realPath, version: String(manifest.version ?? '0.0.0'), workspace: isWorkspaceFolder(repoRoot, realPath) });
    queue.push(location);
  }

  function placeEdgesOf(from, fromName, sourceDir, edgeKinds) {
    for (const [name, kind] of edgeKinds) {
      const realPath = resolveInCheckout(fileSystem, sourceDir, name, repoRoot);
      if (realPath === null) {
        if (kind === 'required') fail(`${fromName} needs ${name}, which is not installed; run "pnpm install".`);
        continue;
      }
      place(from, fromName, name, realPath);
    }
  }

  for (const root of roots) {
    const realDir = fileSystem.realpath(root.sourceDir);
    // An explicit `only` list is installed as required, whatever section declares it (prisma is a
    // devDependency of packages/core, yet `migrate deploy` needs it, vetting 0006 correction 6).
    const rootEdges = Array.isArray(root.only)
      ? new Map(root.only.map((name) => [name, 'required']))
      : declaredEdges(fileSystem.readManifest(realDir));
    placeEdgesOf('', root.label, realDir, rootEdges);
  }
  while (queue.length > 0) {
    const location = queue.shift();
    const entry = placements.get(location);
    placeEdgesOf(location, entry.name, entry.realPath, declaredEdges(fileSystem.readManifest(entry.realPath)));
  }
  verifyPlan(placements, edges);
  return { placements, edges };
}

/** Every recorded edge must resolve, in the planned tree, to the copy the checkout loads. */
export function verifyPlan(placements, edges) {
  for (const edge of edges) {
    const hit = lookupChain(edge.from, edge.name).find((location) => placements.has(location));
    if (hit === undefined || placements.get(hit).realPath !== edge.realPath) {
      fail(`planned tree would load a different ${edge.name} from ${edge.from === '' ? 'the payload root' : edge.from}; refusing to stage.`);
    }
  }
}
