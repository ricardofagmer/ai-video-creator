import { Injectable, Logger } from '@nestjs/common';
import { ClaudeCodeAdapter } from '../adapters/claude-code.adapter';
import { withRateLimitRetry } from '../adapters/rate-limit-retry';
import { ProviderCallError } from '../agents.errors';
import { AssetPurposeAnswerSchema, type AssetPurposeWriterModelCall } from './asset-purpose-writer-model.client';

const CALLER = 'asset-purpose-writer';
const IMAGE_LABEL = 'The stored image:';

/**
 * The writer's live call under the Claude Code engine (ADR 0011): one tool-less `claude -p`
 * process on the owner's subscription, the image (JPEG only: the CLI path labels every image block
 * as JPEG) as an image block of the user message. Same contract as `AssetPurposeWriterModelClient`:
 * returns the raw structured answer, unvalidated; provider failures reject with
 * `ProviderCallError`; rate and usage limits follow the ADR 0002 ladder inside the call's signal.
 * The CLI has no output-token flag; the service bounds the answer to 280 characters.
 */
@Injectable()
export class AssetPurposeWriterClaudeCodeClient {
  private readonly logger = new Logger(AssetPurposeWriterClaudeCodeClient.name);

  constructor(private readonly adapter: ClaudeCodeAdapter) {}

  generate(call: AssetPurposeWriterModelCall): Promise<unknown> {
    return withRateLimitRetry({
      attempt: () => this.generateOnce(call),
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      onWait: (waitMs, retry) => this.logger.warn({ event: 'asset-purpose-writer.rate-limited', ref: call.ref, waitMs, retry, engine: 'claude-code' }),
    });
  }

  private async generateOnce(call: AssetPurposeWriterModelCall): Promise<unknown> {
    // The service withholds a PNG or WebP under this engine; one that still arrives is refused, never sent mislabelled.
    if (call.image !== null && call.image.mimeType !== 'image/jpeg') throw new ProviderCallError({ class: 'fatal', provider: 'claude', reason: 'unrecognized' });
    await call.hooks.beforeModelCall();
    const answer = await this.adapter.generateWithImages({
      caller: CALLER,
      instructions: call.instructions,
      modelId: call.modelId,
      outputSchema: AssetPurposeAnswerSchema,
      text: call.body,
      images: call.image === null ? [] : [{ label: IMAGE_LABEL, jpeg: call.image.bytes }],
      signal: call.signal,
      deadlineMs: call.deadlineMs,
    });
    call.hooks.afterModelCall(answer.step);
    return answer.structuredOutput;
  }
}
