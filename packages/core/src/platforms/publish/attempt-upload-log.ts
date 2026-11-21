import { readRunPublicationLines } from '@studio/shared/run-files';

/** Page size when looking for an attempt's `upload-started` line; the file holds two lines per attempt. */
const PUBLICATION_PAGE_BYTES = 262_144;

/**
 * Whether the run's `publications.jsonl` holds an `upload-started` line for the attempt. The watcher
 * appends it before the first byte leaves (SPEC 0007 section 5.5, AC 48), so its absence proves no
 * byte was sent. A file that cannot be read throws; each caller decides what that proves.
 */
export async function hasUploadStartedLine(runDir: string, attemptId: string): Promise<boolean> {
  let fromByte = 0;
  for (;;) {
    const page = await readRunPublicationLines(runDir, fromByte, PUBLICATION_PAGE_BYTES);
    if (page.entries.some((line) => line.attemptId === attemptId && line.event === 'upload-started')) return true;
    if (page.nextByte === fromByte) return false;
    fromByte = page.nextByte;
  }
}

/** An operating system error from a file read (EACCES and the like), narrowed without trusting its shape. */
export function isFileSystemError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && typeof error.code === 'string';
}
