import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Injectable, Logger } from '@nestjs/common';
import { type ModelRoleName } from '@studio/shared/agents';
import { z } from 'zod';
import { ClaudeCodeUnavailableError, ProviderModeService } from '../../providers';
import { ProviderCallError } from '../agents.errors';
import { type ClaudeAdapter, type ModelCall, type RenderedPrompt } from './claude-adapter';
import { ClaudeCodeNotFoundError, runClaudeCode } from './claude-code-cli';
import { readClaudeCodeResult } from './claude-code-envelope';
import { withRateLimitRetry } from './rate-limit-retry';

const DEFAULT_BINARY = 'claude';
const WORKING_DIRECTORY_PREFIX = 'engineos-video-creator-claude-code-';
const VERSION_CHECK_TIMEOUT_MS = 15_000;

/**
 * Every call runs with no built-in tool, no MCP server and none of the owner's settings, hooks,
 * skills or instructions (ADR 0011 decision 3), and leaves no session transcript on disk.
 */
const ISOLATION_ARGS: readonly string[] = ['--tools', '', '--strict-mcp-config', '--setting-sources', '', '--no-session-persistence'];

/** The CLI rejects a schema that still names its dialect (observed 2026-11-23, ADR 0011). */
function cliJsonSchema(schema: z.ZodTypeAny): string {
  const jsonSchema: Record<string, unknown> = { ...z.toJSONSchema(schema, { unrepresentable: 'any' }) };
  delete jsonSchema['$schema'];
  return JSON.stringify(jsonSchema);
}

/** One tool-less call whose user message carries JPEG images after their labels. */
export interface ClaudeCodeImageCall {
  /** A short name for log lines, such as the calling agent. */
  readonly caller: string;
  readonly instructions: string;
  readonly modelId: string;
  readonly outputSchema: z.ZodTypeAny;
  /** The text part of the user message, already redacted by the caller. */
  readonly text: string;
  readonly images: readonly { readonly label: string; readonly jpeg: Uint8Array }[];
  readonly signal: AbortSignal;
  readonly deadlineMs: number;
}

/** The structured answer, unvalidated, and a step in the usage shape the usage mapper reads. */
export interface ClaudeCodeImageAnswer {
  readonly structuredOutput: unknown;
  readonly step: unknown;
}

/** The one stream-json input line of an image call: text, then each image after its label. */
function imageMessageLine(call: ClaudeCodeImageCall): string {
  const imageParts = call.images.flatMap((image) => [
    { type: 'text', text: image.label },
    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: Buffer.from(image.jpeg).toString('base64') } },
  ]);
  const message = { type: 'user', message: { role: 'user', content: [{ type: 'text', text: call.text }, ...imageParts] } };
  return `${JSON.stringify(message)}\n`;
}

function promptText(prompt: RenderedPrompt): string {
  return prompt.stablePrefix === null ? prompt.body : `${prompt.stablePrefix}\n\n${prompt.body}`;
}

/**
 * Claude Code adapter (ADR 0011): one `claude -p` process per model call, on the subscription the
 * CLI is signed in with. Chosen only when the `claude` provider is live with the `claude-code`
 * engine. No API key exists in this path.
 *
 * - The role's C7 schema goes in `--json-schema`; the service re-parses the answer either way and
 *   owns the single schema-feedback retry.
 * - `call.tools` is not offered: the typed tools arrive in a later change (decision 8), so tool
 *   roles answer from their packet alone.
 * - Rate and usage limits follow the ADR 0002 ladder, inside the call's timeout and signal.
 */
@Injectable()
export class ClaudeCodeAdapter implements ClaudeAdapter {
  private readonly logger = new Logger(ClaudeCodeAdapter.name);
  private workingDirectory: Promise<string> | null = null;

  constructor(private readonly modes: ProviderModeService) {}

  /** Fails the start when the CLI cannot run (spec C2); signing in is checked by the first call. */
  async assertAvailable(): Promise<void> {
    try {
      const result = await runClaudeCode({
        binary: this.binary(),
        args: ['--version'],
        stdin: '',
        workingDirectory: await this.emptyWorkingDirectory(),
        signal: new AbortController().signal,
        deadlineMs: Date.now() + VERSION_CHECK_TIMEOUT_MS,
      });
      if (result.exitCode !== 0) throw new ClaudeCodeUnavailableError();
      this.logger.log({ event: 'agents.claude-code-available', version: result.stdout.trim().slice(0, 64) });
    } catch (error) {
      if (error instanceof ClaudeCodeNotFoundError) throw new ClaudeCodeUnavailableError();
      throw error;
    }
  }

  generate<Role extends ModelRoleName>(call: ModelCall<Role>): Promise<unknown> {
    return withRateLimitRetry({
      attempt: () => this.generateOnce(call),
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      onWait: (waitMs, retry) => this.logger.warn({ event: 'agents.rate-limited', role: call.role, waitMs, retry, engine: 'claude-code' }),
    });
  }

  /**
   * One call with images in the user message (proof call of 2026-11-24): the CLI takes image blocks
   * only as stream-json input, which in turn requires stream-json output. Same isolation as every
   * other call: no tool, so the model sees the images in the message and nothing on the disk.
   * Rejects with `ProviderCallError`; the caller owns retries, metering and the answer's schema.
   */
  async generateWithImages(call: ClaudeCodeImageCall): Promise<ClaudeCodeImageAnswer> {
    let result: Awaited<ReturnType<typeof runClaudeCode>>;
    try {
      result = await runClaudeCode({
        binary: this.binary(),
        args: [
          '-p',
          '--input-format',
          'stream-json',
          '--output-format',
          'stream-json',
          '--verbose',
          '--json-schema',
          cliJsonSchema(call.outputSchema),
          '--system-prompt',
          call.instructions,
          '--model',
          call.modelId,
          ...ISOLATION_ARGS,
        ],
        stdin: imageMessageLine(call),
        workingDirectory: await this.emptyWorkingDirectory(),
        signal: call.signal,
        deadlineMs: call.deadlineMs,
      });
    } catch (error) {
      if (error instanceof ClaudeCodeNotFoundError) throw new ProviderCallError({ class: 'fatal', provider: 'claude', reason: 'unrecognized' });
      throw error;
    }
    const outcome = readClaudeCodeResult(result, 'stream-json');
    if (outcome.status === 'failed') {
      this.logger.warn({ event: 'agents.claude-code-failed', role: call.caller, class: outcome.failure.class, exitCode: result.exitCode });
      throw new ProviderCallError(outcome.failure);
    }
    return { structuredOutput: outcome.structuredOutput, step: outcome.step };
  }

  private async generateOnce<Role extends ModelRoleName>(call: ModelCall<Role>): Promise<unknown> {
    const stdin = promptText(call.prompt);
    await call.hooks.beforeModelCall({ characters: call.prompt.instructions.length + stdin.length, fileParts: 0, fileBytes: 0 });

    const result = await this.run(call, stdin);
    const outcome = readClaudeCodeResult(result);
    if (outcome.status === 'failed') {
      this.logger.warn({ event: 'agents.claude-code-failed', role: call.role, class: outcome.failure.class, exitCode: result.exitCode });
      throw new ProviderCallError(outcome.failure);
    }
    call.hooks.afterModelCall(outcome.step);
    return outcome.structuredOutput;
  }

  private async run<Role extends ModelRoleName>(call: ModelCall<Role>, stdin: string): ReturnType<typeof runClaudeCode> {
    try {
      return await runClaudeCode({
        binary: this.binary(),
        args: [
          '-p',
          '--output-format',
          'json',
          '--json-schema',
          cliJsonSchema(call.outputSchema),
          '--system-prompt',
          call.prompt.instructions,
          '--model',
          call.modelId,
          ...ISOLATION_ARGS,
        ],
        stdin,
        workingDirectory: await this.emptyWorkingDirectory(),
        signal: call.signal,
        deadlineMs: call.deadlineMs,
      });
    } catch (error) {
      if (error instanceof ClaudeCodeNotFoundError) throw new ProviderCallError({ class: 'fatal', provider: 'claude', reason: 'unrecognized' });
      throw error;
    }
  }

  private binary(): string {
    return this.modes.claudeCodeBinary() ?? DEFAULT_BINARY;
  }

  /** One empty folder per process lifetime; the CLI reads nothing from it and writes nothing to it. */
  private emptyWorkingDirectory(): Promise<string> {
    this.workingDirectory ??= mkdtemp(join(tmpdir(), WORKING_DIRECTORY_PREFIX));
    return this.workingDirectory;
  }
}
