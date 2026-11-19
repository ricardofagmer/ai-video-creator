import { type AgentPacket, type ModelRoleName } from '@studio/shared/agents';
import { type ModelId } from '@studio/shared/run-format';
import { type z } from 'zod';
import { type AgentToolSet } from '../tooling/agent-tool-set';

/** Size of what one model call is about to send; counts only, never content. */
export interface OutgoingPromptMeasure {
  readonly characters: number;
  readonly fileParts: number;
  readonly fileBytes: number;
}

/** Per-call hooks the service gives an adapter; each runs once per billed model call. */
export interface ModelCallHooks {
  /**
   * Before any byte leaves: budget pre-check and, live, the egress record (SPEC 0002 rev 3).
   * A rejection means the call must not be sent.
   */
  beforeModelCall(measure: OutgoingPromptMeasure): Promise<void>;
  /** After the call returned; never throws (a problem is recorded on the call guard). */
  afterModelCall(step: unknown): void;
}

/** The prompt, rendered and already redacted by the service. */
export interface RenderedPrompt {
  /** Stable system instructions of the role; a cache breakpoint (ADR 0002 "Prompt caching"). */
  readonly instructions: string;
  /** Stable per-recipe text (bound prompt, skill, brand voice); a cache breakpoint when present. */
  readonly stablePrefix: string | null;
  /** The packet and, on the schema-feedback retry, the validation feedback. */
  readonly body: string;
}

export interface ModelCall<Role extends ModelRoleName> {
  readonly role: Role;
  readonly packet: AgentPacket<Role>;
  readonly modelId: ModelId;
  readonly prompt: RenderedPrompt;
  /** C7 output schema of the role; the service re-parses the answer with it either way. */
  readonly outputSchema: z.ZodTypeAny;
  readonly tools: AgentToolSet;
  readonly maxSteps: number;
  readonly maxOutputTokens: number;
  readonly signal: AbortSignal;
  /** Epoch ms after which no rate-limit wait is started. */
  readonly deadlineMs: number;
  readonly hooks: ModelCallHooks;
}

/**
 * The Claude provider behind the mock/live switch (ADR 0002). Returns the raw structured answer,
 * unvalidated (undefined when the model gave none). Provider failures reject with
 * `ProviderCallError`; an aborted signal rejects with whatever the abort raised.
 */
export interface ClaudeAdapter {
  generate<Role extends ModelRoleName>(call: ModelCall<Role>): Promise<unknown>;
}
