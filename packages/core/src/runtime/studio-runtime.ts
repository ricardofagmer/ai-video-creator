import { isAbsolute, join, normalize } from 'node:path';

/**
 * Plan C3 rev 2: the shell sets this to the absolute `runtime/` folder of the installed app for
 * every process it spawns. Set means packaged mode; unset means development mode. It holds a path,
 * never a secret.
 */
export const RUNTIME_DIR_ENV_VAR = 'ENGINEOS_VIDEO_CREATOR_RUNTIME_DIR';

/**
 * The four built outputs C3 stages under `payload/`. Rev 3: api, watcher and cli hold built output
 * only and share `payload/node_modules/`; web is the unflattened Next standalone tree.
 */
export type PayloadName = 'api' | 'web' | 'watcher' | 'cli';

/**
 * C3 rev 3 `payload/tools/prisma/`: the prisma CLI and its schema engine, used only by the shell's
 * `migrate deploy` step. The locator names the files; it never runs them. The inner layout is an
 * installed package tree, so the CLI finds `@prisma/engines` beside it as it does in the checkout.
 */
export interface PrismaToolLocation {
  root: string;
  /** Run with the bundled node: `node <cliEntry> migrate deploy --schema <file>`. */
  cliEntry: string;
  /** darwin-arm64 only (C3 rev 3 prunes other native binaries). */
  schemaEngine: string;
}

/**
 * Packaged mode: every program and built output lives under `root` (C3 rev 3 layout). Nothing here is
 * looked up on PATH or in a repository checkout.
 */
export interface PackagedRuntime {
  mode: 'packaged';
  root: string;
  nodeBinary: string;
  ffmpeg: string;
  ffprobe: string;
  payloadRoot: string;
  payload: Readonly<Record<PayloadName, string>>;
  /** C3 rev 3: the ONE production `node_modules/` tree shared by api, watcher and cli. */
  sharedNodeModules: string;
  prisma: PrismaToolLocation;
  manifestFile: string;
  /**
   * `payload/resources/`: the checkout files a packaged process reads at run time (model manifest
   * and fetch script, seed templates), staged with the same relative paths they have in the repository.
   */
  resources: string;
}

/**
 * Development mode: the source checkout. It carries no paths on purpose; each call site keeps the
 * resolution it had before the locator existed (PATH lookup, the running node, repository build
 * output), so development behaviour cannot drift.
 */
export interface DevelopmentRuntime {
  mode: 'development';
}

export type StudioRuntime = PackagedRuntime | DevelopmentRuntime;

export const DEVELOPMENT_RUNTIME: DevelopmentRuntime = { mode: 'development' };

export type InvalidRuntimeDirectoryReason = 'not-absolute' | 'not-normalized' | 'contains-nul' | 'not-a-directory';

/** The value is never part of the message, as for the data home: only the variable and the reason. */
export class InvalidRuntimeDirectoryError extends Error {
  readonly category = 'validation';

  constructor(readonly reason: InvalidRuntimeDirectoryReason) {
    super(`Invalid runtime folder (${RUNTIME_DIR_ENV_VAR}): ${reason}`);
    this.name = 'InvalidRuntimeDirectoryError';
  }
}

/** Injected so the locator stays pure and tests need no real folder. */
export interface RuntimeFileSystem {
  isDirectory(path: string): boolean;
}

export interface RuntimeSource {
  /** Value of `ENGINEOS_VIDEO_CREATOR_RUNTIME_DIR`; undefined means development mode. */
  override: string | undefined;
  fileSystem: RuntimeFileSystem;
}

function assertUsableRuntimeRoot(root: string, fileSystem: RuntimeFileSystem): void {
  if (root.includes('\u0000')) throw new InvalidRuntimeDirectoryError('contains-nul');
  if (!isAbsolute(root)) throw new InvalidRuntimeDirectoryError('not-absolute');
  const hasTrailingSlash = root.length > 1 && root.endsWith('/');
  if (normalize(root) !== root || hasTrailingSlash) throw new InvalidRuntimeDirectoryError('not-normalized');
  if (!fileSystem.isDirectory(root)) throw new InvalidRuntimeDirectoryError('not-a-directory');
}

function prismaToolLocation(payloadRoot: string): PrismaToolLocation {
  const prismaRoot = join(payloadRoot, 'tools', 'prisma');
  const modules = join(prismaRoot, 'node_modules');
  return {
    root: prismaRoot,
    cliEntry: join(modules, 'prisma', 'build', 'index.js'),
    schemaEngine: join(modules, '@prisma', 'engines', 'schema-engine-darwin-arm64'),
  };
}

function packagedRuntime(root: string): PackagedRuntime {
  const payloadRoot = join(root, 'payload');
  return {
    mode: 'packaged',
    root,
    nodeBinary: join(root, 'node', 'bin', 'node'),
    ffmpeg: join(root, 'bin', 'ffmpeg'),
    ffprobe: join(root, 'bin', 'ffprobe'),
    payloadRoot,
    payload: {
      api: join(payloadRoot, 'api'),
      web: join(payloadRoot, 'web'),
      watcher: join(payloadRoot, 'watcher'),
      cli: join(payloadRoot, 'cli'),
    },
    sharedNodeModules: join(payloadRoot, 'node_modules'),
    prisma: prismaToolLocation(payloadRoot),
    manifestFile: join(payloadRoot, 'manifest.json'),
    resources: join(payloadRoot, 'resources'),
  };
}

/**
 * The one runtime locator (plan C3 rev 2). Any set value, an empty one included, selects packaged
 * mode and must be an absolute, normalized, existing folder: a bad value is a typed error, never a
 * silent fall back to PATH or the checkout, which would break DI-AC-03 without anyone noticing.
 */
export function resolveStudioRuntime(source: RuntimeSource): StudioRuntime {
  if (source.override === undefined) return DEVELOPMENT_RUNTIME;
  assertUsableRuntimeRoot(source.override, source.fileSystem);
  return packagedRuntime(source.override);
}
