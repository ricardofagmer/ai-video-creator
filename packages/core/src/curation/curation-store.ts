import { Injectable, Logger } from '@nestjs/common';
import { type CurationFile, type CurationId, type CurationProposal } from '@studio/shared/curation';
import {
  createRequestedCuration,
  curationDirectory,
  listCurationIds,
  readCurationProposal,
  readCurationState,
  type CurationLocation,
} from '@studio/shared/curation/files';
import { RunFileError } from '@studio/shared/run-files';
import { DataHome } from '../paths/data-home';
import { CurationFileCorruptError } from './curation.errors';

/** Curation folders read per listing; the queue holds at most 3, so this bounds old history only. */
export const MAX_LISTED_CURATIONS = 5000;

/** One readable `curation.json`, as the queue and the list see it. */
export interface StoredCuration {
  curationId: CurationId;
  file: CurationFile;
}

/**
 * The `curations/` folders of the data home (SPEC 0005 section 4.6), through the shared file
 * helpers that refuse any path outside `curations/<ULID>/`. The files are the only source of truth
 * for a curation's status and the queue. Read-only, except `createRequested`, the api's one write.
 */
@Injectable()
export class CurationStore {
  private readonly logger = new Logger(CurationStore.name);

  constructor(private readonly dataHome: DataHome) {}

  location(curationId: CurationId): CurationLocation {
    return { curationsRoot: this.dataHome.curations, curationId };
  }

  /** Absolute `curations/<curationId>/`, the `curationDir` the two C6 curation ports receive. */
  directory(curationId: CurationId): string {
    return curationDirectory(this.location(curationId));
  }

  /** SPEC 0005 section 5.1 step 5: the folder is created exclusively and `curation.json` written once. */
  createRequested(file: CurationFile): Promise<void> {
    return createRequestedCuration(this.location(file.curationId), file);
  }

  /** `curation.json`, or null when the folder has none (yet). A corrupt file is a typed error. */
  async readState(curationId: CurationId): Promise<CurationFile | null> {
    try {
      const state = await readCurationState(this.location(curationId));
      return state.status === 'present' ? state.value : null;
    } catch (error) {
      if (error instanceof RunFileError) throw new CurationFileCorruptError(curationId, 'curation.json');
      throw error;
    }
  }

  /** `proposal.json`, or null when absent. A corrupt file is a typed error. */
  async readProposal(curationId: CurationId): Promise<CurationProposal | null> {
    try {
      const proposal = await readCurationProposal(this.location(curationId));
      return proposal.status === 'present' ? proposal.value : null;
    } catch (error) {
      if (error instanceof RunFileError) throw new CurationFileCorruptError(curationId, 'proposal.json');
      throw error;
    }
  }

  /**
   * Every readable `curation.json`, oldest first (ULID order). A folder whose file is absent or
   * corrupt is left out and logged by id, so one bad folder does not hide the others; reading it
   * by id still reports it.
   */
  async listAll(): Promise<StoredCuration[]> {
    const curationIds = (await listCurationIds(this.dataHome.curations)).slice(-MAX_LISTED_CURATIONS);
    const stored: StoredCuration[] = [];
    for (const curationId of curationIds) {
      try {
        const file = await this.readState(curationId);
        if (file !== null) stored.push({ curationId, file });
      } catch (error) {
        if (!(error instanceof CurationFileCorruptError)) throw error;
        this.logger.warn({ event: 'curation.list-skipped', curationId, errorName: error.name });
      }
    }
    return stored;
  }
}
