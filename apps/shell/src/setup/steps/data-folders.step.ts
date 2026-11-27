import { dirname } from 'node:path';
import { type SetupContext } from '../setup-context';
import { type SetupStep, type StepRunResult } from '../setup-types';

/** D5: owner-only, as `DATA_HOME_DIRECTORY_MODE` of `@studio/core/paths` and install.sh step 6. */
export const DATA_FOLDER_MODE = 0o700;

function foldersOf(context: SetupContext): readonly string[] {
  const { root, db, assets, runs, logs } = context.paths.dataHome;
  return [root, db, assets, runs, logs];
}

type FolderState = 'ready' | 'absent' | 'wrong-mode' | 'not-a-folder';

async function folderState(context: SetupContext, folder: string): Promise<FolderState> {
  const entry = await context.files.inspect(folder);
  if (entry.kind === 'absent') return 'absent';
  // A symlink is refused, never followed, exactly as install.sh refuses it.
  if (entry.kind !== 'folder') return 'not-a-folder';
  return entry.mode === DATA_FOLDER_MODE ? 'ready' : 'wrong-mode';
}

/**
 * Step 2: the data home and its four folders, 700 (install.sh step 6). Creates what is missing and
 * narrows a wider mode; never deletes, moves or rewrites content, so an upgrade keeps everything.
 */
export function dataFoldersStep(context: SetupContext): SetupStep {
  return {
    id: 'data-folders',
    required: true,
    async check() {
      for (const folder of foldersOf(context)) {
        if ((await folderState(context, folder)) !== 'ready') return { kind: 'needed' };
      }
      return { kind: 'done' };
    },
    async run(): Promise<StepRunResult> {
      const parent = await context.files.inspect(dirname(context.paths.dataHome.root));
      if (parent.kind !== 'folder') return { kind: 'failed', reason: 'data-home-parent-missing' };
      for (const folder of foldersOf(context)) {
        const state = await folderState(context, folder);
        if (state === 'not-a-folder') return { kind: 'failed', reason: 'data-home-not-a-folder' };
        if (state === 'absent') await context.files.makeFolder(folder, DATA_FOLDER_MODE);
        if (state === 'wrong-mode') await context.files.setMode(folder, DATA_FOLDER_MODE);
      }
      // Answers held in memory by step 1, which ran before this folder existed.
      await context.record.flush();
      return { kind: 'done' };
    },
  };
}
