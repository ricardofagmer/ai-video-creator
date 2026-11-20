import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { dataHomePaths, type DataHomePaths } from '../state/data-home-paths';

/*
 * Test-only: a throwaway data home under the OS temp folder. Fixture writes happen here and only
 * here; production modules never write in a data home. Not imported by `main.ts`, so never bundled.
 */

export interface TempDataHome {
  readonly root: string;
  readonly dataHome: string;
  readonly paths: DataHomePaths;
  write(relativePath: string, content: string): Promise<void>;
  cleanup(): Promise<void>;
}

export async function createTempDataHome(): Promise<TempDataHome> {
  const root = await mkdtemp(join(tmpdir(), 'studio-shell-test-'));
  const dataHome = join(root, 'data');
  const paths = dataHomePaths(dataHome);
  await Promise.all([paths.logs, paths.schedules, paths.runs].map((folder) => mkdir(folder, { recursive: true })));
  return {
    root,
    dataHome,
    paths,
    async write(relativePath, content) {
      const target = join(dataHome, relativePath);
      await mkdir(dirname(target), { recursive: true });
      await writeFile(target, content, 'utf8');
    },
    async cleanup() {
      await rm(root, { recursive: true, force: true });
    },
  };
}
