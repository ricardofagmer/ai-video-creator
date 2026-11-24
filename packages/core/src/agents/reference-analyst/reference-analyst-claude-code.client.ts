import { Injectable, Logger } from '@nestjs/common';
import { ReferenceStyleAnalysisSchema } from '@studio/shared/agents';
import { ClaudeCodeAdapter } from '../adapters/claude-code.adapter';
import { withRateLimitRetry } from '../adapters/rate-limit-retry';
import { referenceFrameLabel } from '../prompts/reference-analyst.prompt';
import { type ReferenceAnalystModelCall } from './reference-analyst-model.client';

const CALLER = 'reference-analyst';

/**
 * The analyst's live call under the Claude Code engine (ADR 0011;
 * docs/specs/2026-11-24-link-reference-analysis-design.md): one tool-less `claude -p` process on the
 * owner's subscription, the frames as image blocks of the user message. Same contract as
 * `ReferenceAnalystModelClient`: returns the raw structured answer, unvalidated; provider failures
 * reject with `ProviderCallError`; rate and usage limits follow the ADR 0002 ladder inside the
 * call's signal. The CLI has no output-token flag, so `maxOutputTokens` is not passed: the answer is
 * bounded by `ReferenceStyleAnalysisSchema`, which the service enforces.
 */
@Injectable()
export class ReferenceAnalystClaudeCodeClient {
  private readonly logger = new Logger(ReferenceAnalystClaudeCodeClient.name);

  constructor(private readonly adapter: ClaudeCodeAdapter) {}

  generate(call: ReferenceAnalystModelCall): Promise<unknown> {
    return withRateLimitRetry({
      attempt: () => this.generateOnce(call),
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      onWait: (waitMs, retry) => this.logger.warn({ event: 'reference-analyst.rate-limited', ref: call.ref, waitMs, retry, engine: 'claude-code' }),
    });
  }

  private async generateOnce(call: ReferenceAnalystModelCall): Promise<unknown> {
    await call.hooks.beforeModelCall();
    const answer = await this.adapter.generateWithImages({
      caller: CALLER,
      instructions: call.instructions,
      modelId: call.modelId,
      outputSchema: ReferenceStyleAnalysisSchema,
      text: call.body,
      images: call.frames.map((jpeg, index) => ({ label: referenceFrameLabel(index, call.frames.length), jpeg })),
      signal: call.signal,
      deadlineMs: call.deadlineMs,
    });
    call.hooks.afterModelCall(answer.step);
    return answer.structuredOutput;
  }
}
