import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const WORKSPACE_MARKER = 'pnpm-workspace.yaml';

function walkUpFor(marker: string, startDir: string): string | null {
  let current = resolve(startDir);
  for (;;) {
    if (existsSync(join(current, marker))) return current;
    const parent = dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

/**
 * The monorepo root holds .env and runs/. Searched from this module's location first
 * (works for src/ via tsx and dist/ via the bin), then from the working directory.
 */
export function findRepoRoot(): string {
  return walkUpFor(WORKSPACE_MARKER, __dirname) ?? walkUpFor(WORKSPACE_MARKER, process.cwd()) ?? process.cwd();
}
