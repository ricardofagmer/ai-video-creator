import { resolve } from 'node:path';

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
