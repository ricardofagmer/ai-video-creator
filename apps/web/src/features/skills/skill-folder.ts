import { type FolderUploadFile } from '@/lib/api';
import { folderRelativePath, selectionProblem, type FileProblem } from '@/features/catalog/upload-rules';
import { SKILL_ENTRY_FILE } from './skill-metadata';

/** A picked skill folder, ready for the folder upload. */
export interface SkillFolder {
  files: FolderUploadFile[];
  /** The SKILL.md file, read in the browser for its front matter. */
  entry: File;
  /** The picked folder's own name, used as the default id; empty when the files share no top folder. */
  folderName: string;
}

export type SkillFolderProblem = FileProblem | { type: 'entry-missing' };

export type SkillFolderResult = { status: 'ok'; folder: SkillFolder } | { status: 'problem'; problem: SkillFolderProblem };

/**
 * The top folder every path shares, or null. The api strips it the same way (`folder-staging.ts`
 * `importRoot`), so `details.entryFile` stays relative to the skill root, for example `SKILL.md`.
 */
function sharedTopFolder(paths: readonly string[]): string | null {
  const [first] = paths;
  const top = first?.split('/')[0];
  if (top === undefined || top === '') return null;
  return paths.every((path) => path.includes('/') && path.split('/')[0] === top) ? top : null;
}

/** Checks a picked folder with the catalog's upload rules and finds its SKILL.md. */
export function skillFolderOf(selection: readonly File[]): SkillFolderResult {
  const problem = selectionProblem('skill', 'folder', selection);
  if (problem !== null) return { status: 'problem', problem };
  const files = selection.flatMap((file): FolderUploadFile[] => {
    const relativePath = folderRelativePath(file);
    return relativePath === null ? [] : [{ file, relativePath }];
  });
  const top = sharedTopFolder(files.map((item) => item.relativePath));
  const rootPathOf = (path: string): string => (top === null ? path : path.slice(top.length + 1));
  const entry = files.find((item) => rootPathOf(item.relativePath) === SKILL_ENTRY_FILE);
  if (entry === undefined) return { status: 'problem', problem: { type: 'entry-missing' } };
  return { status: 'ok', folder: { files, entry: entry.file, folderName: top ?? '' } };
}

/** The one-file folder of a skill written in the browser. */
export function createdSkillFiles(markdown: string): FolderUploadFile[] {
  const file = new File([markdown], SKILL_ENTRY_FILE, { type: 'text/markdown' });
  return [{ file, relativePath: SKILL_ENTRY_FILE }];
}
