import { basename, join, resolve } from 'node:path';

/*
 * Where this package and its workspace sit on disk. Every source file lives directly in `src/`
 * and compiles directly into `dist/`, so one level up is the package root in both cases.
 */

export function packageRoot(): string {
  return resolve(__dirname, '..');
}

/** The monorepo root: `packages/hyperframes` is two levels below it. */
export function workspaceRoot(): string {
  return resolve(packageRoot(), '..', '..');
}

/**
 * The `node_modules` tree the pinned dependency must sit inside. In a checkout it is the
 * workspace's. In the installed app (ADR 0010, plan C3 rev 3) this package is itself staged at
 * `payload/node_modules/@studio/hyperframes`, so two levels up already is that shared tree.
 */
export function dependencyTreeRoot(): string {
  const twoLevelsUp = workspaceRoot();
  return basename(twoLevelsUp) === 'node_modules' ? twoLevelsUp : join(twoLevelsUp, 'node_modules');
}
