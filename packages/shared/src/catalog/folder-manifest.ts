import { z } from 'zod';
import { RelativePathSchema, Sha256Schema } from '../common/ids';

/**
 * Canonical file list of a folder asset (ADR 0003 decision 1, Assumption there). The version's
 * `contentHash` is the sha-256 of the canonical serialization below, so the same tree always
 * yields the same hash.
 *
 * Canonical serialization: entries sorted by `path` in byte (UTF-8 code unit) order, then
 * `JSON.stringify({ files })` with keys in the order `path`, `sizeBytes`, `contentHash`, no
 * whitespace, no trailing newline.
 */
export const FolderEntrySchema = z
  .object({
    path: RelativePathSchema,
    sizeBytes: z.number().int().nonnegative(),
    contentHash: Sha256Schema,
  })
  .strict();
export type FolderEntry = z.infer<typeof FolderEntrySchema>;

export const FolderManifestSchema = z
  .object({ files: z.array(FolderEntrySchema).min(1).max(10000) })
  .strict()
  .refine(
    (manifest) =>
      manifest.files.every((entry, index) => {
        const previous = manifest.files[index - 1];
        return previous === undefined || previous.path < entry.path;
      }),
    { message: 'folder manifest entries must be sorted by path and unique' },
  );
export type FolderManifest = z.infer<typeof FolderManifestSchema>;

/** The exact string whose sha-256 is a folder asset's `contentHash`. */
export function serializeFolderManifest(files: readonly FolderEntry[]): string {
  const sorted = [...files].sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  return JSON.stringify({
    files: sorted.map((entry) => ({ path: entry.path, sizeBytes: entry.sizeBytes, contentHash: entry.contentHash })),
  });
}
