import {
  CURATOR_INSTRUCTION_VERSION,
  CURATOR_ROLE,
  type CurationCallOutcome,
  type CurationId,
  type CurationSessionLine,
  type CurationUsage,
  type CuratorOutput,
} from '@studio/shared/curation';
import { appendCurationSessionLine, type CurationLocation } from '@studio/shared/curation/files';
import { type ModelId, type SessionId } from '@studio/shared/run-format';
import { type RedactorService } from '../../redaction';
import { CuratorCallError } from './curator-call.error';

export interface CuratorSessionStart {
  readonly curationId: CurationId;
  readonly attempt: number;
  readonly modelId: ModelId;
}

export interface CuratorSessionEnd {
  readonly outcome: CurationCallOutcome;
  /** Null when the call ended before the provider reported any usage. */
  readonly usage: CurationUsage | null;
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type CurationSessionLineInput = DistributiveOmit<CurationSessionLine, 'at' | 'sessionId'>;

/**
 * Writer of `curations/<curationId>/session.jsonl` (SPEC 0005 section 4.3, L4) through the shared
 * curation helper, which re-validates every line against its strict schema. Prompt and output
 * text is written only after the R1-11 redactor ran on it, and a redactor failure writes nothing
 * and fails the call. Lines are written in call order by the one caller.
 */
export class CuratorSessionTrace {
  constructor(
    private readonly redactor: RedactorService,
    private readonly location: CurationLocation,
    readonly sessionId: SessionId,
  ) {}

  start(start: CuratorSessionStart): Promise<void> {
    return this.append({
      type: 'start',
      curationId: start.curationId,
      attempt: start.attempt,
      role: CURATOR_ROLE,
      modelId: start.modelId,
      instructionVersion: CURATOR_INSTRUCTION_VERSION,
    });
  }

  /** `redactedText` is what left the machine, already redacted by the service before the call. */
  prompt(redactedText: string): Promise<void> {
    return this.append({ type: 'prompt', text: redactedText });
  }

  /** The output already passed `CuratorOutputSchema`; it is redacted before it is written. */
  async output(output: CuratorOutput): Promise<void> {
    const redacted = await this.redactor.redactText(JSON.stringify(output));
    if (redacted.status === 'failed') throw new CuratorCallError({ kind: 'redaction-failed' });
    await this.append({ type: 'output', text: redacted.value });
  }

  /** Written in the service's `finally`, failed calls included (C5-AC-21). */
  end(end: CuratorSessionEnd): Promise<void> {
    return this.append({
      type: 'end',
      outcome: end.outcome,
      instructionVersion: CURATOR_INSTRUCTION_VERSION,
      usage: end.usage,
    });
  }

  private async append(body: CurationSessionLineInput): Promise<void> {
    try {
      await appendCurationSessionLine(this.location, { ...body, sessionId: this.sessionId, at: new Date().toISOString() });
    } catch {
      // The helper's error can quote the line; only the target is reported.
      throw new CuratorCallError({ kind: 'trace-failed', target: 'session-stream' });
    }
  }
}
