import { Injectable, Logger } from '@nestjs/common';
import { type AssetRef } from '@studio/shared/catalog';
import { type ModelId } from '@studio/shared/run-format';
import { z } from 'zod';
import { ProviderModeService, classifyProviderFailure } from '../../providers';
import { MastraAgentFactory } from '../adapters/mastra-agent.factory';
import { providerErrorSignal } from '../adapters/provider-error.mapper';
import { withRateLimitRetry } from '../adapters/rate-limit-retry';
import { ProviderCallError } from '../agents.errors';
import { ReferenceAnalystMeterError } from '../reference-analyst/reference-analyst.errors';
import { type ReferenceAnalystCallHooks } from '../reference-analyst/reference-analyst.meter';
import { type AssetPurposeImagePart } from './asset-purpose-writer.image';

/** One model request, no tool loop: the writer has no tools. */
const WRITER_MAX_STEPS = 1;

/**
 * The structured answer both engines ask for. Loose on length on purpose: the service enforces
 * the 1..280 plain-text rule (AP-04) and maps any miss to `provider-error`.
 */
export const AssetPurposeAnswerSchema = z.object({ purpose: z.string() }).strict();

export interface AssetPurposeWriterModelCall {
  readonly ref: AssetRef;
  readonly modelId: ModelId;
  /** The cached system block (`assetPurposePrompt`). */
  readonly instructions: string;
  /** The redacted user message. */
  readonly body: string;
  /** The checked image of an image asset (AP-06), or null when the call is text only. */
  readonly image: AssetPurposeImagePart | null;
  readonly maxOutputTokens: number;
  /** The call timeout, the caller's signal and the meter's stop, combined. */
  readonly signal: AbortSignal;
  /** Epoch ms of the call timeout: no rate-limit wait may end past it. */
  readonly deadlineMs: number;
  readonly hooks: ReferenceAnalystCallHooks;
}

type UserContentPart = { readonly type: 'text'; readonly text: string } | { readonly type: 'image'; readonly image: string; readonly mediaType: string };

/** The text, then the image as an image part, encoded like the reference analyst's frames. */
function userContent(call: AssetPurposeWriterModelCall): UserContentPart[] {
  const text: UserContentPart = { type: 'text', text: call.body };
  if (call.image === null) return [text];
  return [text, { type: 'image', image: Buffer.from(call.image.bytes).toString('base64'), mediaType: call.image.mimeType }];
}

/**
 * The writer's live model call (ADR 0002): a standalone, tool-less Mastra agent, the AI SDK's own
 * retries off and rate limits retried by the ADR 0002 ladder inside the call's signal. Returns the
 * raw structured answer, unvalidated; the service parses it strictly. Provider failures reject with
 * `ProviderCallError`; an aborted signal rejects with whatever the abort raised. The factory's
 * tool-less builder is the reference analyst's; only the instructions differ.
 */
@Injectable()
export class AssetPurposeWriterModelClient {
  private readonly logger = new Logger(AssetPurposeWriterModelClient.name);

  constructor(
    private readonly modes: ProviderModeService,
    private readonly agents: MastraAgentFactory,
  ) {}

  generate(call: AssetPurposeWriterModelCall): Promise<unknown> {
    return withRateLimitRetry({
      attempt: () => this.generateOnce(call),
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      onWait: (waitMs, retry) => this.logger.warn({ event: 'asset-purpose-writer.rate-limited', ref: call.ref, waitMs, retry }),
    });
  }

  private async generateOnce(call: AssetPurposeWriterModelCall): Promise<unknown> {
    const agent = this.agents.buildReferenceAnalyst({
      modelId: call.modelId,
      apiKey: this.modes.credentialFor('claude'),
      instructions: call.instructions,
      beforeModelCall: () => call.hooks.beforeModelCall(),
    });
    try {
      const result = await agent.generate([{ role: 'user', content: userContent(call) }], {
        structuredOutput: { schema: AssetPurposeAnswerSchema, errorStrategy: 'warn' },
        maxSteps: WRITER_MAX_STEPS,
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
