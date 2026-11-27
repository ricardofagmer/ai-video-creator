import { lstat } from 'node:fs/promises';
import { dirname } from 'node:path';
import { templatePreviewBounds, type TemplatePreviewJobFile } from '@studio/shared/asset-jobs';
import { assetJobDirectory, assetJobFilePath, type AssetJobLocation } from '@studio/shared/asset-jobs/files';

/** The two files a done preview keeps in its job folder. */
export type TemplatePreviewFile = 'clip' | 'poster';

const fileKeyOf: Readonly<Record<TemplatePreviewFile, 'previewMp4' | 'previewPng'>> = { clip: 'previewMp4', poster: 'previewPng' };
const maxBytesOf: Readonly<Record<TemplatePreviewFile, number>> = {
  clip: templatePreviewBounds.clipMaxBytes,
  poster: templatePreviewBounds.posterMaxBytes,
};

export type TemplatePreviewFileCheck =
  | { status: 'ok'; absolutePath: string; sizeBytes: number }
  | { status: 'refused'; check: 'not-done' | 'outside-job-folder' | 'folder-not-a-directory' | 'not-a-regular-file' | 'unreadable' | 'size-out-of-bounds' };

/**
 * A done preview's file, when it is a regular, non-empty, in-bounds file directly inside a real job
 * folder. `lstat`, not `stat`: a symlink planted in the folder never leads the stream elsewhere.
 */
export async function checkTemplatePreviewFile(
  location: AssetJobLocation,
  job: TemplatePreviewJobFile,
  file: TemplatePreviewFile,
): Promise<TemplatePreviewFileCheck> {
  if (job.status !== 'done' || job.clip === undefined) return { status: 'refused', check: 'not-done' };
  const directory = assetJobDirectory(location);
  const absolutePath = assetJobFilePath(location, fileKeyOf[file]);
  if (dirname(absolutePath) !== directory) return { status: 'refused', check: 'outside-job-folder' };
  try {
    if (!(await lstat(directory)).isDirectory()) return { status: 'refused', check: 'folder-not-a-directory' };
    const stats = await lstat(absolutePath);
    if (!stats.isFile()) return { status: 'refused', check: 'not-a-regular-file' };
    if (stats.size === 0 || stats.size > maxBytesOf[file]) return { status: 'refused', check: 'size-out-of-bounds' };
    return { status: 'ok', absolutePath, sizeBytes: stats.size };
  } catch {
    return { status: 'refused', check: 'unreadable' };
  }
}

/** True when both the clip and its poster can be served. */
export async function isTemplatePreviewPresent(location: AssetJobLocation, job: TemplatePreviewJobFile): Promise<boolean> {
  const [clip, poster] = await Promise.all([
    checkTemplatePreviewFile(location, job, 'clip'),
    checkTemplatePreviewFile(location, job, 'poster'),
  ]);
  return clip.status === 'ok' && poster.status === 'ok';
}
