import { type Dirent } from 'node:fs';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { RunFileSchema, RunIdSchema } from '@studio/shared/run-format';
import { hasErrorCode } from '../platform/error-code';
import { readBoundedText, type FileFingerprint } from './bounded-file';

/*
 * `@studio/shared/run-files` has no lister and its `readRunFile` reads without a size bound, so this
 * is a bounded directory read that parses each `run.json` with the shared `RunFileSchema`.
 */

export type ReviewSummary = { status: 'ok'; count: number; skipped: number; truncated: boolean } | { status: 'unavailable' };

/** At most this many run folders per scan; the newest (ULID order) are kept. */
export const RUN_SCAN_LIMIT = 2000;
/** The shared contract has no run.json size limit; a real one is tens of KiB, so 2 MiB is generous. */
export const MAX_RUN_FILE_BYTES = 2 * 1024 * 1024;

type RunVerdict = 'review' | 'other' | 'unreadable';

interface CachedVerdict {
  readonly fingerprint: FileFingerprint;
  readonly verdict: RunVerdict;
}

function verdictOf(text: string): RunVerdict {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return 'unreadable';
  }
  const checked = RunFileSchema.safeParse(parsed);
  if (!checked.success) return 'unreadable';
  return checked.data.state.status === 'review' ? 'review' : 'other';
}

async function runFolderIds(runsRoot: string): Promise<string[] | 'absent'> {
  let entries: Dirent[];
  try {
    entries = await readdir(runsRoot, { withFileTypes: true });
  } catch (error) {
    if (hasErrorCode(error, 'ENOENT')) return 'absent';
    throw error;
  }
  // Links and files are not run folders; names must be ULIDs, so no entry can steer the join.
  return entries
    .filter((entry) => entry.isDirectory() && RunIdSchema.safeParse(entry.name).success)
    .map((entry) => entry.name)
    .sort();
}

/**
 * Counts runs at `review`. A long-lived menu re-reads every minute, so each file's verdict is kept
 * by fingerprint and a run.json is parsed again only after it changes.
 */
export class ReviewCounter {
  private readonly verdicts = new Map<string, CachedVerdict>();

  constructor(private readonly runsRoot: string) {}

  async count(): Promise<ReviewSummary> {
    let runIds: string[] | 'absent';
    try {
      runIds = await runFolderIds(this.runsRoot);
    } catch {
      return { status: 'unavailable' };
    }
    if (runIds === 'absent') {
      this.verdicts.clear();
      return { status: 'ok', count: 0, skipped: 0, truncated: false };
    }
    const scanned = runIds.slice(-RUN_SCAN_LIMIT);
    let count = 0;
    let skipped = 0;
    for (const runId of scanned) {
      const verdict = await this.verdictFor(runId);
      if (verdict === 'review') count += 1;
      if (verdict === 'unreadable') skipped += 1;
    }
    this.forgetMissing(new Set(scanned));
    return { status: 'ok', count, skipped, truncated: runIds.length > scanned.length };
  }

  private async verdictFor(runId: string): Promise<RunVerdict | 'absent'> {
    const cached = this.verdicts.get(runId);
    try {
      const read = await readBoundedText(join(this.runsRoot, runId, 'run.json'), {
        maxBytes: MAX_RUN_FILE_BYTES,
        ...(cached === undefined ? {} : { previous: cached.fingerprint }),
      });
      switch (read.status) {
        case 'absent':
          // A folder whose run.json is not written yet is being created, not broken.
          this.verdicts.delete(runId);
          return 'absent';
        case 'unchanged':
          return cached === undefined ? 'unreadable' : cached.verdict;
        case 'rejected':
          this.verdicts.delete(runId);
          return 'unreadable';
        case 'read': {
          const verdict = verdictOf(read.text);
          this.verdicts.set(runId, { fingerprint: read.fingerprint, verdict });
          return verdict;
        }
      }
    } catch {
      this.verdicts.delete(runId);
      return 'unreadable';
    }
  }

  private forgetMissing(present: ReadonlySet<string>): void {
    for (const runId of this.verdicts.keys()) {
      if (!present.has(runId)) this.verdicts.delete(runId);
    }
  }
}
