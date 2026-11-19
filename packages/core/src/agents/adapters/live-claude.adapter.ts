import { Injectable, Logger } from '@nestjs/common';
import { type ModelRoleName } from '@studio/shared/agents';
import { ProviderModeService, classifyProviderFailure } from '../../providers';
import { AgentRunError, ProviderCallError } from '../agents.errors';
import { type ClaudeAdapter, type ModelCall } from './claude-adapter';
import { ANTHROPIC_CACHE_BREAKPOINT, MastraAgentFactory } from './mastra-agent.factory';
import { measureOutgoingPrompt } from './outgoing-prompt';
import { providerErrorSignal } from './provider-error.mapper';
import { withRateLimitRetry } from './rate-limit-retry';

/**
 * Live Claude adapter: a Mastra agent on the Claude API (ADR 0002). Chosen only when the
 * `claude` provider is in live mode; the key comes from `ProviderModeService`, which already
 * failed the start when it is missing (never a literal, never a silent switch to mock).
 *
 * - The AI SDK's own retries are off (`maxRetries: 0`): retries follow the ADR 0002 ladder in
 *   `withRateLimitRetry`, rate limits only, inside the call's timeout and signal.
 * - Stable prefixes carry an Anthropic cache breakpoint: the role instructions (agent system
 *   message) and the per-recipe stable block of the user message.
 * - `structuredOutput` with the role's C7 schema; `errorStrategy: 'warn'` so a malformed answer
 *   comes back to the service, which owns the single schema-feedback retry.
 */
@Injectable()
export class LiveClaudeAdapter implements ClaudeAdapter {
  private readonly logger = new Logger(LiveClaudeAdapter.name);

  constructor(
    private readonly modes: ProviderModeService,
    private readonly agents: MastraAgentFactory,
  ) {}

  generate<Role extends ModelRoleName>(call: ModelCall<Role>): Promise<unknown> {
    return withRateLimitRetry({
      attempt: () => this.generateOnce(call),
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      onWait: (waitMs, retry) => this.logger.warn({ event: 'agents.rate-limited', role: call.role, waitMs, retry }),
    });
  }

  private async generateOnce<Role extends ModelRoleName>(call: ModelCall<Role>): Promise<unknown> {
    const agent = this.agents.build({
      role: call.role,
      modelId: call.modelId,
      apiKey: this.modes.credentialFor('claude'),
      instructions: call.prompt.instructions,
      tools: call.tools,
      beforeModelCall: (prompt) => call.hooks.beforeModelCall(measureOutgoingPrompt(prompt)),
    });
    try {
      const result = await agent.generate(
        [
          {
            role: 'user',
            content:
              call.prompt.stablePrefix === null
                ? [{ type: 'text', text: call.prompt.body }]
                : [
                    { type: 'text', text: call.prompt.stablePrefix, providerOptions: ANTHROPIC_CACHE_BREAKPOINT },
                    { type: 'text', text: call.prompt.body },
                  ],
          },
        ],
        {
          structuredOutput: { schema: call.outputSchema, errorStrategy: 'warn' },
          maxSteps: call.maxSteps,
          abortSignal: call.signal,
          modelSettings: { maxOutputTokens: call.maxOutputTokens, maxRetries: 0 },
          onStepFinish: (step: unknown) => call.hooks.afterModelCall(step),
        },
      );
      return result.object;
    } catch (error) {
      // Our own guard and abort errors keep their meaning; the service classifies them.
      if (error instanceof AgentRunError || call.signal.aborted) throw error;
      throw new ProviderCallError(classifyProviderFailure(providerErrorSignal(error, false), new Date()));
    }
  }
}
