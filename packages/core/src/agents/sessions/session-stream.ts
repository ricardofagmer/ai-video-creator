import { type AssetRef, type LearningNoteId } from '@studio/shared/catalog';
import { appendSessionLine } from '@studio/shared/run-files';
import {
  type JsonValue,
  type ModelId,
  type ModelRole,
  type SessionId,
  type SessionLine,
  type SessionOutcome,
  type StepKey,
} from '@studio/shared/run-format';
import { type RedactorService } from '../../redaction';
import { AgentRunError } from '../agents.errors';
import { type ModelCallUsage } from '../usage/model-usage.mapper';

/** Session-line caps of C3 `SessionLineSchema`. */
const PREVIEW_MAX_CHARS = 6000;
const END_ERROR_MAX_CHARS = 2000;
const MAX_REFS = 10;
const MAX_NOTE_IDS = 64;

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type SessionLineBody = DistributiveOmit<SessionLine, 'atMs' | 'sessionId'>;

export interface SessionStart {
  role: ModelRole;
  modelId: ModelId;
  stepKey: StepKey;
  packetType: string;
}

export interface SessionEnd {
  outcome: SessionOutcome;
  /** English failure label; redacted again before it is written. */
  error: string | null;
  promptRefs: readonly AssetRef[];
  skillRefs: readonly AssetRef[];
  /** Writer and director only: the learning notes the packet carried (SPEC 0005 section 5.6). */
  noteIds?: readonly LearningNoteId[];
}

/** What the R1-13 tool wrapper writes for each tool call (topology section 10 spans). */
export interface ToolCallTrace {
  toolCall(tool: string, callIndex: number, input: JsonValue): Promise<void>;
  toolResult(result: {
    tool: string;
    callIndex: number;
    outcome: 'ok' | 'error';
    errorCode: string | null;
    preview: string;
  }): Promise<void>;
}

/**
 * Writer of `runs/<id>/sessions/<sessionId>.jsonl` through the C5 helper (topology section 10).
 * Every free-text or JSON field goes through the R1-11 redactor first and fails closed: a line
 * whose redaction fails is not written and the call fails, except the `end` line, which records
 * `<redaction-failed>` in place of the error so a failed session still has its end. Lines are
 * appended one at a time, in call order.
 */
export class SessionStream implements ToolCallTrace {
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly redactor: RedactorService,
    private readonly runDir: string,
    readonly sessionId: SessionId,
  ) {}

  start(start: SessionStart): Promise<void> {
    return this.append({ type: 'start', ...start });
  }

  async packet(packet: JsonValue): Promise<void> {
    await this.append({ type: 'packet', packet: await this.redactJson(packet) });
  }

  usage(callIndex: number, usage: ModelCallUsage): Promise<void> {
    return this.append({ type: 'usage', callIndex, ...usage });
  }

  /** The output must already have passed the output scan; it is redacted once more anyway. */
  async output(output: JsonValue): Promise<void> {
    await this.append({ type: 'output', output: await this.redactJson(output) });
  }

  async toolCall(tool: string, callIndex: number, input: JsonValue): Promise<void> {
    await this.append({ type: 'tool-call', tool, callIndex, input: await this.redactJson(input) });
  }

  async toolResult(result: {
    tool: string;
    callIndex: number;
    outcome: 'ok' | 'error';
    errorCode: string | null;
    preview: string;
  }): Promise<void> {
    const preview = await this.redactText(result.preview.slice(0, PREVIEW_MAX_CHARS));
    await this.append({ type: 'tool-result', ...result, preview });
  }

  async end(end: SessionEnd): Promise<void> {
    const error = end.error === null ? null : await this.redactor.redactTextOrPlaceholder(end.error.slice(0, END_ERROR_MAX_CHARS));
    await this.append({
      type: 'end',
      outcome: end.outcome,
      error: error === null ? null : error.slice(0, END_ERROR_MAX_CHARS),
      promptRefs: end.promptRefs.slice(0, MAX_REFS),
      skillRefs: end.skillRefs.slice(0, MAX_REFS),
      ...(end.noteIds === undefined ? {} : { noteIds: end.noteIds.slice(0, MAX_NOTE_IDS) }),
    });
  }

  private async redactJson(value: JsonValue): Promise<JsonValue> {
    const result = await this.redactor.redactJson(value);
    if (result.status === 'failed') throw new AgentRunError(null, { kind: 'redaction-failed' });
    return result.value;
  }

  private async redactText(text: string): Promise<string> {
    const result = await this.redactor.redactText(text);
    if (result.status === 'failed') throw new AgentRunError(null, { kind: 'redaction-failed' });
    return result.value;
  }

  private append(body: SessionLineBody): Promise<void> {
    const line: SessionLine = { ...body, atMs: Date.now(), sessionId: this.sessionId };
    const next = this.queue.then(async () => {
      try {
        await appendSessionLine(this.runDir, line);
      } catch {
        // The C5 error can quote the line; only the target is reported.
        throw new AgentRunError(null, { kind: 'trace-failed', target: 'session-stream' });
      }
    });
    // A failed line is reported to its own caller; later lines still get their turn.
    this.queue = next.catch(() => undefined);
    return next;
  }
}
