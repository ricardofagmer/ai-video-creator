import { appendEgressEntry, readEgressEntries } from '@studio/shared/run-files';
import {
  MAX_EGRESS_ENTRIES,
  type EgressEntry,
  type EgressMeasure,
  type ProviderName,
  type SessionId,
  type StepKey,
} from '@studio/shared/run-format';
import { leavesMachine } from './provider-credentials';
import { toEgressEntry } from './egress.mapper';

export { MAX_EGRESS_ENTRIES, type EgressMeasure };

/**
 * One live external call, as a provider adapter reports it (PRD 7.4 and 12, "what left the
 * machine"). Carries the purpose and the size of the payload, never the payload itself.
 */
export interface ExternalCall {
  provider: ProviderName;
  what: EgressEntry['what'];
  stepKey: StepKey;
  sessionId: SessionId | null;
  at: Date;
  measure: EgressMeasure;
}

export class EgressListFullError extends Error {
  readonly category = 'internal';

  constructor() {
    super(`The "what left the machine" list reached ${MAX_EGRESS_ENTRIES} entries; no further external call is allowed in this run`);
    this.name = 'EgressListFullError';
  }
}

export type EgressRecordOutcome = 'recorded' | 'local-provider';

/**
 * The run's "what left the machine" log. Each external call is appended to `egress.jsonl`
 * through the C5 helper as it is recorded (SPEC 0002 rev 3), so a watcher crash loses nothing;
 * `package` copies the file into `manifest.json.egress`. Adapters record before sending the
 * payload: a failed append rejects, and the call must not go out unlisted (fail closed). Local
 * providers (local voice, render) send nothing off the machine and are not listed. A full log
 * refuses the call instead of dropping the record.
 */
export class EgressLog {
  private constructor(
    private readonly runDir: string,
    private recordedCount: number,
  ) {}

  /** Opens the log of one run folder; lines from an earlier execution count toward the cap. */
  static async open(runDir: string): Promise<EgressLog> {
    const { entries } = await readEgressEntries(runDir);
    return new EgressLog(runDir, entries.length);
  }

  async record(call: ExternalCall): Promise<EgressRecordOutcome> {
    if (!leavesMachine(call.provider)) return 'local-provider';
    if (this.recordedCount >= MAX_EGRESS_ENTRIES) throw new EgressListFullError();
    const entry = toEgressEntry(call);
    // The slot is taken before the await so concurrent calls of one step cannot pass the cap together.
    this.recordedCount += 1;
    try {
      await appendEgressEntry(this.runDir, entry);
    } catch (error) {
      this.recordedCount -= 1;
      throw error;
    }
    return 'recorded';
  }
}
