import { Injectable, Logger } from '@nestjs/common';
import { ReferenceStyleAnalysisSchema } from '@studio/shared/agents';
import { type AssetRef } from '@studio/shared/catalog';
import { type ModelId } from '@studio/shared/run-format';
import { ProviderModeService, classifyProviderFailure } from '../../providers';
import { MastraAgentFactory } from '../adapters/mastra-agent.factory';
import { providerErrorSignal } from '../adapters/provider-error.mapper';
import { withRateLimitRetry } from '../adapters/rate-limit-retry';
import { ProviderCallError } from '../agents.errors';
import { referenceFrameLabel } from '../prompts/reference-analyst.prompt';
import { JPEG_MEDIA_TYPE } from '../tools/tool-results';
import { ReferenceAnalystMeterError } from './reference-analyst.errors';
import { type ReferenceAnalystCallHooks } from './reference-analyst.meter';

/** One model request, no tool loop: the analyst has no tools. */
const ANALYST_MAX_STEPS = 1;

export interface ReferenceAnalystModelCall {
  readonly ref: AssetRef;
  readonly modelId: ModelId;
  /** The cached `reference-analyst@1` system block. */
  readonly instructions: string;
  /** The redacted text part of the user message. */
  readonly body: string;
  /** JPEG frames in video order, already checked against `referenceAnalysisBounds`. */
  readonly frames: readonly Uint8Array[];
  readonly maxOutputTokens: number;
  /** The call timeout, the caller's signal and the meter's stop, combined. */
  readonly signal: AbortSignal;
  /** Epoch ms of the call timeout: no rate-limit wait may end past it. */
  readonly deadlineMs: number;
  readonly hooks: ReferenceAnalystCallHooks;
}

type UserContentPart = { readonly type: 'text'; readonly text: string } | { readonly type: 'image'; readonly image: string; readonly mediaType: string };

/**
 * The user message: the text, then each frame as an image part after its label. Frames travel in
 * the user message (not as tool results, as FrameSampleTool frames do) because the analyst has no
 * tools; the encoding is the same base64 JPEG the tool path sends.
 */
function userContent(call: ReferenceAnalystModelCall): UserContentPart[] {
  const frameParts = call.frames.flatMap((frame, index): UserContentPart[] => [
    { type: 'text', text: referenceFrameLabel(index, call.frames.length) },
    { type: 'image', image: Buffer.from(frame).toString('base64'), mediaType: JPEG_MEDIA_TYPE },
  ]);
  return [{ type: 'text', text: call.body }, ...frameParts];
}

/**
 * The analyst's live model call (ADR 0002): a standalone, tool-less Mastra agent, the AI SDK's own
 * retries off and rate limits retried by the ADR 0002 ladder inside the call's signal. Returns the
 * raw structured answer, unvalidated (undefined when the model gave none); the service parses it
 * strictly. Provider failures reject with `ProviderCallError`; an aborted signal rejects with
 * whatever the abort raised. Mock mode never reaches this class.
 */
@Injectable()
export class ReferenceAnalystModelClient {
  private readonly logger = new Logger(ReferenceAnalystModelClient.name);

  constructor(
    private readonly modes: ProviderModeService,
    private readonly agents: MastraAgentFactory,
  ) {}

  generate(call: ReferenceAnalystModelCall): Promise<unknown> {
    return withRateLimitRetry({
      attempt: () => this.generateOnce(call),
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      onWait: (waitMs, retry) => this.logger.warn({ event: 'reference-analyst.rate-limited', ref: call.ref, waitMs, retry }),
    });
  }

  private async generateOnce(call: ReferenceAnalystModelCall): Promise<unknown> {
    const agent = this.agents.buildReferenceAnalyst({
      modelId: call.modelId,
      apiKey: this.modes.credentialFor('claude'),
      instructions: call.instructions,
      beforeModelCall: () => call.hooks.beforeModelCall(),
    });
    try {
      const result = await agent.generate([{ role: 'user', content: userContent(call) }], {
        structuredOutput: { schema: ReferenceStyleAnalysisSchema, errorStrategy: 'warn' },
        maxSteps: ANALYST_MAX_STEPS,
        abortSignal: call.signal,
        modelSettings: { maxOutputTokens: call.maxOutputTokens, maxRetries: 0 },
        onStepFinish: (step: unknown) => call.hooks.afterModelCall(step),
      });
      return result.object;
    } catch (error) {
      // Our own meter and abort errors keep their meaning; the service classifies them.
      if (error instanceof ReferenceAnalystMeterError || call.signal.aborted) throw error;
      throw new ProviderCallError(classifyProviderFailure(providerErrorSignal(error, false), new Date()));
    }
  }
}
