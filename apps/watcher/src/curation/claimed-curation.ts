import { Logger } from '@nestjs/common';
import {
  type CurationEvent,
  type CurationFile,
  type CurationId,
  type CurationProposal,
  type CurationUsage,
} from '@studio/shared/curation';
import {
  curationDirectory,
  readCurationCost,
  writeCurationProposal,
  writeCurationState,
  type CurationLocation,
} from '@studio/shared/curation/files';
import { RunFileError } from '@studio/shared/run-files';
import { type SessionId } from '@studio/shared/run-format';
import { type Clock } from '../engine/clock';
import { CurationEventRecorder } from './curation-event.recorder';
import {
  afterCallFileOf,
  endedFileOf,
  endingReasonId,
  withSpentAtLeast,
  type CurationEnding,
  type RecordedCall,
} from './curation-file.mapper';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

/** An event without the two fields this class fills in. */
type EventBody = DistributiveOmit<CurationEvent, 'at' | 'curationId'>;

export interface ClaimedCurationOptions {
  location: CurationLocation;
  file: CurationFile;
  events: CurationEventRecorder;
  clock: Clock;
  /** The claim instant, for `curation.ended` `durationMs`. */
  claimedAtMs: number;
}

/**
 * One curation this process holds after its claim (or adopts in the start sweep), and the only
 * way the watcher writes curation files (ADR 0003, K3, C5-AC-11): every write goes through the
 * shared helpers with this curation's location, which refuse any path outside
 * `curations/<curationId>/`, and none of them can write status `requested`. It keeps the latest
 * `curation.json` state in memory, so the step never re-reads its own state.
 */
export class ClaimedCuration {
  private readonly logger = new Logger(ClaimedCuration.name);
  private current: CurationFile;
  private ended = false;

  constructor(private readonly options: ClaimedCurationOptions) {
    this.current = options.file;
  }

  get curationId(): CurationId {
    return this.current.curationId;
  }

  get file(): CurationFile {
    return this.current;
  }

  get spentUsd(): number {
    return this.current.spentUsd;
  }

  /** Absolute `curations/<curationId>/`, the `curationDir` both C6 curation ports receive. */
  get directory(): string {
    return curationDirectory(this.options.location);
  }

  async event(body: EventBody): Promise<void> {
    // The spread of a union is a union of spreads, so each member is rebuilt whole; the shared schema checks it again on append.
    const event: CurationEvent = { ...body, at: this.options.clock.now().toISOString(), curationId: this.curationId };
    await this.options.events.record(this.options.location, event);
  }

  /**
   * Progress write after a call, so a crash still leaves the attempts and the spend on disk. The
   * progress is kept in memory before the write: when the write fails after a billed call, the
   * final write still carries that spend, attempt and session.
   */
  async recordCall(call: RecordedCall): Promise<void> {
    this.assertOpen();
    this.current = afterCallFileOf(this.current, call, this.options.clock.now().toISOString());
    await writeCurationState(this.options.location, this.current);
  }

  /** Token counts of one session from `cost.json`; null when the ledger has none (yet). */
  async usageOf(sessionId: SessionId): Promise<CurationUsage | null> {
    try {
      const cost = await readCurationCost(this.options.location);
      if (cost.status !== 'present') return null;
      const session = cost.value.sessions.find((entry) => entry.sessionId === sessionId);
      if (session === undefined) return null;
      const { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens } = session;
      return { inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens };
    } catch (error) {
      if (!(error instanceof RunFileError)) throw error;
      // The event then carries null tokens; the C5 code only, because the message names the file path.
      this.logger.warn({ event: 'curation.cost-unread', curationId: this.curationId, code: error.code });
      return null;
    }
  }

  /** Raises `spentUsd` to the ledger total when a crash lost the progress write (start sweep). */
  async reconcileSpend(): Promise<void> {
    const cost = await readCurationCost(this.options.location);
    if (cost.status === 'present') this.current = withSpentAtLeast(this.current, cost.value.totalUsd);
  }

  /** `proposal.json`, once (the helper refuses a second write). */
  async writeProposal(proposal: CurationProposal): Promise<void> {
    this.assertOpen();
    await writeCurationProposal(this.options.location, proposal);
  }

  /** The final `curation.json`, then `curation.ended`; nothing is written afterwards. */
  async end(ending: CurationEnding): Promise<void> {
    this.assertOpen();
    const now = this.options.clock.now();
    const ended = endedFileOf(this.current, ending, now.toISOString());
    await writeCurationState(this.options.location, ended);
    this.current = ended;
    this.ended = true;
    await this.event({
      type: 'curation.ended',
      status: ending.status,
      reasonId: endingReasonId(ending),
      spentUsd: ended.spentUsd,
      durationMs: Math.max(0, now.getTime() - this.options.claimedAtMs),
    });
  }

  private assertOpen(): void {
    if (this.ended) throw new CurationAlreadyEndedError(this.curationId);
  }
}

/** A write after the final status: a step bug, refused so a terminal file never changes. */
export class CurationAlreadyEndedError extends Error {
  constructor(curationId: CurationId) {
    super(`Curation ${curationId} has already ended`);
    this.name = 'CurationAlreadyEndedError';
  }
}
