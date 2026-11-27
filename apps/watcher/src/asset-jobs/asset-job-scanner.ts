import { stat } from 'node:fs/promises';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { AssetJobKindSchema, isTerminalAssetJobStatus, type AssetJobFile, type AssetJobKind } from '@studio/shared/asset-jobs';
import { assetJobFilePath, listAssetJobRefs, readAssetJobState, type AssetJobLocation } from '@studio/shared/asset-jobs/files';
import { type AssetRef } from '@studio/shared/catalog';
import { RunFileError } from '@studio/shared/run-files';

/** A readable `job.json` and where it lives. */
export interface ScannedAssetJob {
  location: AssetJobLocation;
  file: AssetJobFile;
}

/** `<kind>/<ref>`: one key per job folder across both kinds. */
export function assetJobKey(location: Pick<AssetJobLocation, 'kind' | 'ref'>): string {
  return `${location.kind}/${location.ref}`;
}

/**
 * Reads `<data home>/asset-jobs/` for the asset-job step; it writes nothing. The files are the
 * queue's only source of truth. Unlike a curation, a terminal job can be requested again (the api
 * replaces it with `requested`), so a terminal job is not forgotten: its `job.json` inode and
 * modification time are remembered and the file is read again only once they changed. Every write
 * is an atomic rename (a new inode), so a new request always changes the stamp. An idle tick then
 * costs one `readdir` per kind, one `stat` per folder and a read of the few open or changed jobs.
 */
@Injectable()
export class AssetJobScanner {
  private readonly logger = new Logger(AssetJobScanner.name);
  /** Terminal jobs and the stamp (inode, mtime) of the `job.json` that was read. */
  private readonly terminal = new Map<string, string>();
  /** Unreadable folders already logged; a condition logs once while it lasts. */
  private reported = new Set<string>();

  constructor(@Inject(DataHome) private readonly dataHome: DataHome) {}

  location(kind: AssetJobKind, ref: AssetRef): AssetJobLocation {
    return { assetJobsRoot: this.dataHome.assetJobs, kind, ref };
  }

  /**
   * The `requested` jobs of both kinds, oldest request first: the one queue the step serves.
   * `listAssetJobRefs` sorts by ref, not by age, hence the sort here; ties keep kind then ref order.
   */
  async listRequested(): Promise<ScannedAssetJob[]> {
    const open = await this.openJobs();
    return open
      .filter((scanned) => scanned.file.status === 'requested')
      .sort((left, right) => Date.parse(left.file.requestedAt) - Date.parse(right.file.requestedAt));
  }

  /** Every `running` job; the step's sweep ends those whose claimant is gone. */
  async listRunning(): Promise<ScannedAssetJob[]> {
    const open = await this.openJobs();
    return open.filter((scanned) => scanned.file.status === 'running');
  }

  private async openJobs(): Promise<ScannedAssetJob[]> {
    const notices = new Set<string>();
    const present = new Set<string>();
    const open: ScannedAssetJob[] = [];
    for (const kind of AssetJobKindSchema.options) {
      for (const ref of await listAssetJobRefs(this.dataHome.assetJobs, kind)) {
        const location = this.location(kind, ref);
        const key = assetJobKey(location);
        present.add(key);
        const scanned = await this.readOpen(location, notices);
        if (scanned !== null) open.push(scanned);
      }
    }
    for (const key of [...this.terminal.keys()]) if (!present.has(key)) this.terminal.delete(key);
    this.reported = notices;
    return open;
  }

  /** Null for a terminal job, a folder the api is still creating, or a file that does not parse. */
  private async readOpen(location: AssetJobLocation, notices: Set<string>): Promise<ScannedAssetJob | null> {
    const key = assetJobKey(location);
    const stamp = await this.fileStamp(location);
    if (stamp === null) return null;
    if (this.terminal.get(key) === stamp) return null;
    let file: AssetJobFile | null;
    try {
      const state = await readAssetJobState(location);
      file = state.status === 'present' ? state.value : null;
    } catch (error) {
      if (!(error instanceof RunFileError)) throw error;
      // The C5 code only: the error message names the file path.
      const notice = `${key}:${error.code}`;
      notices.add(notice);
      if (!this.reported.has(notice)) this.logger.warn({ event: 'asset-job.skipped', reason: 'unreadable', kind: location.kind, ref: location.ref, code: error.code });
      return null;
    }
    if (file === null) return null;
    if (isTerminalAssetJobStatus(file.status)) {
      this.terminal.set(key, stamp);
      return null;
    }
    this.terminal.delete(key);
    return { location, file };
  }

  /** Null while `job.json` does not exist yet; any other stat failure is the scan's error. */
  private async fileStamp(location: AssetJobLocation): Promise<string | null> {
    try {
      const stats = await stat(assetJobFilePath(location, 'job'));
      return `${stats.ino}:${stats.mtimeMs}`;
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') return null;
      throw error;
    }
  }
}
