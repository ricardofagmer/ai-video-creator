import { sep } from 'node:path';

/** Whether `candidate` is strictly inside `folder`. Both must already be real paths. */
export function isInsideFolder(folder: string, candidate: string): boolean {
  return candidate.startsWith(folder.endsWith(sep) ? folder : `${folder}${sep}`);
}
