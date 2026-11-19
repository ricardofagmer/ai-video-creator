import { setTimeout as delay } from 'node:timers/promises';
import { Injectable, Logger } from '@nestjs/common';
import { CuratorOutputSchema, type CuratorTaskPacket } from '@studio/shared/curation';
import { type ModelId } from '@studio/shared/run-format';
import { z } from 'zod';
import { ProviderModeService, classifyProviderFailure, mockFaultSignal } from '../../providers';
import { MastraAgentFactory } from '../adapters/mastra-agent.factory';
import { providerErrorSignal } from '../adapters/provider-error.mapper';
import { withRateLimitRetry } from '../adapters/rate-limit-retry';
import { ProviderCallError } from '../agents.errors';
import { CURATOR_ANSWER_FIELD } from '../prompts/curator.prompt';
import { CuratorCallError } from './curator-call.error';
import { type CuratorCallHooks } from './curator-call.meter';
import { curatorMockResponse } from './curator-mock.responder';

/** Same latency as the run agents' mock adapter: a stop can land mid-call. */
const MOCK_CALL_LATENCY_MS = 5;

/** What the mock reports as its one request: no tokens, so the ledger records $0. */
const MOCK_STEP = { usage: { inputTokens: 0, outputTokens: 0, cachedInputTokens: 0 } };

/** One model request, no tool loop (topology 0004 section 7: 0 tool calls). */
const CURATOR_MAX_STEPS = 1;

/**
 * Transport envelope of the live structured output. `CuratorOutput` is a discriminated union and
 * the Anthropic JSON tool needs an object at its root, so the answer travels in one field and is
 * unwrapped here; the service then parses the unwrapped value with the strict C5-01 schema.
 */
const CuratorAnswerEnvelopeSchema = z.object({ [CURATOR_ANSWER_FIELD]: CuratorOutputSchema }).strict();
const LooseEnvelopeSchema = z.object({ [CURATOR_ANSWER_FIELD]: z.unknown() }).strict();

export interface CuratorModelCall {
  readonly packet: CuratorTaskPacket;
  readonly live: boolean;
  readonly modelId: ModelId;
  /** The cached `curator@1` system block. */
  readonly instructions: string;
  /** The redacted correction of a second call, appended to the system message; null on the first. */
  readonly correction: string | null;
  /** The redacted packet rendering. */
  readonly body: string;
  readonly maxOutputTokens: number;
  /** The 120 s call timeout, the caller's signal and the meter's stop, combined. */
  readonly signal: AbortSignal;
  /** Epoch ms of the 120 s call timeout: no rate-limit wait may end past it. */
  readonly deadlineMs: number;
  readonly hooks: CuratorCallHooks;
}

/** The answer inside the envelope, or the raw value when it is not one (the parse names the issue). */
function unwrapAnswer(raw: unknown): unknown {
  const envelope = LooseEnvelopeSchema.safeParse(raw);
  return envelope.success ? envelope.data[CURATOR_ANSWER_FIELD] : raw;
}

/**
 * The Curator's model behind the mock/live switch (ADR 0002). Returns the raw answer, unvalidated
 * (undefined when the model gave none). Provider failures reject with `ProviderCallError`; an
 * aborted signal rejects with whatever the abort raised. Live: a standalone Mastra agent with an
 * empty tool set, the AI SDK's own retries off and rate limits retried by the ADR 0002 ladder
 * inside the call's 120 s signal (SPEC 0005 B6).
 */
@Injectable()
export class CuratorModelClient {
  private readonly logger = new Logger(CuratorModelClient.name);

  constructor(
    private readonly modes: ProviderModeService,
    private readonly agents: MastraAgentFactory,
  ) {}

  generate(call: CuratorModelCall): Promise<unknown> {
    if (!call.live) return this.generateMock(call);
    return withRateLimitRetry({
      attempt: () => this.generateLiveOnce(call),
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      onWait: (waitMs, retry) => this.logger.warn({ event: 'curator.rate-limited', curationId: call.packet.curationId, waitMs, retry }),
    });
  }

  /** The SPEC 0002 A12 fault scenario of the `claude` provider applies here too. */
  private async generateMock(call: CuratorModelCall): Promise<unknown> {
    const state = this.modes.modeOf('claude');
    const fault = state.mode === 'mock' ? state.fault : 'none';

    await call.hooks.beforeModelCall();
    await delay(MOCK_CALL_LATENCY_MS, undefined, { signal: call.signal });

    const signal = mockFaultSignal('claude', fault);
    if (signal !== null) throw new ProviderCallError(classifyProviderFailure(signal, new Date()));
    if (fault === 'step-failure') throw new ProviderCallError({ class: 'transient', provider: 'claude', reason: 'server-error' });

    call.hooks.afterModelCall(MOCK_STEP);
    if (fault === 'missing-output') return undefined;
    return curatorMockResponse(call.packet);
  }

  private async generateLiveOnce(call: CuratorModelCall): Promise<unknown> {
    const agent = this.agents.buildCurator({
      modelId: call.modelId,
      apiKey: this.modes.credentialFor('claude'),
      instructions: call.instructions,
      correction: call.correction,
      beforeModelCall: () => call.hooks.beforeModelCall(),
    });
    try {
      const result = await agent.generate([{ role: 'user', content: [{ type: 'text', text: call.body }] }], {
        structuredOutput: { schema: CuratorAnswerEnvelopeSchema, errorStrategy: 'warn' },
        maxSteps: CURATOR_MAX_STEPS,
        abortSignal: call.signal,
        modelSettings: { maxOutputTokens: call.maxOutputTokens, maxRetries: 0 },
        onStepFinish: (step: unknown) => call.hooks.afterModelCall(step),
      });
      return unwrapAnswer(result.object);
    } catch (error) {
      // Our own meter and abort errors keep their meaning; the service classifies them.
      if (error instanceof CuratorCallError || call.signal.aborted) throw error;
      throw new ProviderCallError(classifyProviderFailure(providerErrorSignal(error, false), new Date()));
    }
  }
}
