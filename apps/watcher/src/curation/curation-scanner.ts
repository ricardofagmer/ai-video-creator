import { Inject, Injectable, Logger } from '@nestjs/common';
import { DataHome } from '@studio/core/paths';
import { isTerminalCurationStatus, type CurationFile, type CurationId } from '@studio/shared/curation';
import { listCurationIds, readCurationState, type CurationLocation } from '@studio/shared/curation/files';
import { RunFileError } from '@studio/shared/run-files';

/** A readable `curation.json` and where it lives. */
export interface ScannedCuration {
  location: CurationLocation;
  file: CurationFile;
}

/**
 * Reads `<data home>/curations/` for the curation step (SPEC 0005 section 5.2); it writes nothing.
 * The files are the queue's only source of truth: the api bounds it at 3 `requested` folders and
 * the step takes the oldest first (ULID order), one at a time. A terminal curation never changes
 * again (single writer, K3), so its id is remembered and its file is not read on later polls; an
 * idle tick then costs one `readdir` plus the few open curations.
 */
@Injectable()
export class CurationScanner {
  private readonly logger = new Logger(CurationScanner.name);
  private readonly terminal = new Set<CurationId>();
  /** Unreadable folders already logged; a condition logs once while it lasts. */
  private reported = new Set<string>();

  constructor(@Inject(DataHome) private readonly dataHome: DataHome) {}

  location(curationId: CurationId): CurationLocation {
    return { curationsRoot: this.dataHome.curations, curationId };
  }

  /** The `requested` curations, oldest first: the queue in the order it is served. */
  async listRequested(): Promise<ScannedCuration[]> {
    const open = await this.openCurations();
    return open.filter((scanned) => scanned.file.status === 'requested');
  }

  /** Every `collecting` curation: at start, each was claimed by a process that is gone (Q7). */
  async listCollecting(): Promise<ScannedCuration[]> {
    const open = await this.openCurations();
    return open.filter((scanned) => scanned.file.status === 'collecting');
  }

  /** Non-terminal readable curations, oldest first. */
  private async openCurations(): Promise<ScannedCuration[]> {
    const curationIds = await listCurationIds(this.dataHome.curations);
    const present = new Set<CurationId>(curationIds);
    for (const curationId of this.terminal) if (!present.has(curationId)) this.terminal.delete(curationId);
    const notices = new Set<string>();
    const open: ScannedCuration[] = [];
    for (const curationId of curationIds) {
      if (this.terminal.has(curationId)) continue;
      const location = this.location(curationId);
      const file = await this.readState(location, notices);
      if (file === null) continue;
      if (isTerminalCurationStatus(file.status)) this.terminal.add(curationId);
      else open.push({ location, file });
    }
    this.reported = notices;
    return open;
  }

  /** Null while the api is still creating the folder, or when the file does not parse. */
  private async readState(location: CurationLocation, notices: Set<string>): Promise<CurationFile | null> {
    try {
      const state = await readCurationState(location);
      return state.status === 'present' ? state.value : null;
    } catch (error) {
      if (!(error instanceof RunFileError)) throw error;
      // The C5 code only: the error message names the file path.
      const key = `${location.curationId}:${error.code}`;
      notices.add(key);
      if (!this.reported.has(key)) this.logger.warn({ event: 'curation.skipped', reason: 'unreadable', curationId: location.curationId, code: error.code });
      return null;
    }
  }
}
