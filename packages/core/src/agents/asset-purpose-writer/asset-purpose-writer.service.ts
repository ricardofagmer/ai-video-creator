import { Injectable, Logger } from '@nestjs/common';
import { ASSET_PURPOSE_PROMPT_VERSION, assetPurposeBounds } from '@studio/shared/asset-jobs';
import { ASSET_PURPOSE_MAX_CHARS } from '@studio/shared/catalog';
import { type AssetPurposeWriterPort, type AssetPurposeWriterRequest, type AssetPurposeWriterResult, type UsageQuantity } from '@studio/shared/ports';
import { newSessionId } from '@studio/shared/run-files';
import { JsonValueSchema, type ModelId, type SessionId } from '@studio/shared/run-format';
import { CostLedgerService } from '../../costs';
import { ProviderModeService, ProvidersError } from '../../providers';
import { RedactorService } from '../../redaction';
import { ProviderCallError } from '../agents.errors';
import { assetPurposePrompt, renderAssetPurposeMessage } from '../prompts/asset-purpose.prompt';
import { ReferenceAnalystMeterError } from '../reference-analyst/reference-analyst.errors';
import { ReferenceAnalystMeter } from '../reference-analyst/reference-analyst.meter';
import { OutputScanner } from '../safety/output-scanner';
import { ZERO_USAGE, toUsageQuantity } from '../usage/model-usage.mapper';
import { AssetPurposeWriterClaudeCodeClient } from './asset-purpose-writer-claude-code.client';
import { AssetPurposeAnswerSchema, AssetPurposeWriterModelClient } from './asset-purpose-writer-model.client';
import { assetPurposeWriterDefinition } from './asset-purpose-writer.definition';
import { AssetPurposeWriterCallError } from './asset-purpose-writer.errors';
import { assetPurposeImagePlan, type AssetPurposeImagePart } from './asset-purpose-writer.image';
import { mockAssetPurpose } from './asset-purpose-writer.mock';
import { worstCasePurposeUsage } from './asset-purpose-writer.usage';

type FailureReason = Extract<AssetPurposeWriterResult, { status: 'failed' }>['reason'];

/** How one live exchange ended, before usage and price are attached. */
type Settlement = { kind: 'answer'; purpose: string } | { kind: 'failed'; reason: FailureReason } | { kind: 'cancelled' };

interface LiveCall {
  readonly request: AssetPurposeWriterRequest;
  readonly modelId: ModelId;
  readonly sessionId: SessionId;
  readonly meter: ReferenceAnalystMeter;
  readonly timeout: AbortSignal;
  readonly signal: AbortSignal;
  readonly deadlineMs: number;
  /** The redacted user message. */
  readonly body: string;
  /** The checked image the call sends (AP-06), or null for a text-only call. */
  readonly image: AssetPurposeImagePart | null;
  readonly useClaudeCode: boolean;
}

/**
 * Markup and formatting the purpose may not carry (AP-04): HTML or tag brackets, code backticks,
 * Markdown emphasis, headings, list bullets, links and control characters. The purpose is shown
 * as an `alt` and a `title`, so plain text is the only safe shape.
 */
const MARKUP_PATTERN = /[<>`*_#[\]|]|^\s*[-+]\s|\p{Cc}/mu;

/** The answer is not a 1..280 plain-text purpose; never carries the answer itself. */
class OutputInvalidError extends Error {
  constructor() {
    super('Asset purpose answer rejected');
    this.name = 'OutputInvalidError';
  }
}

/** Single spaces, no surrounding blanks; a line break inside the answer is a markup miss. */
function normalised(text: string): string {
  return text.replace(/[ \t]+/g, ' ').trim();
}

/**
 * `AssetPurposeWriterPort` on Mastra (ADR 0012). Shaped like `ReferenceAnalystService`: one `write`
 * is exactly one model call, no tools, no schema-correction loop, at most
 * `assetPurposeBounds.maxOutputTokens` output tokens and a `callTimeoutMs` timeout joined to the
 * caller's signal. An answer that is not 1..280 characters of plain text, holds markup, fails the
 * output redaction or the output scan ends as `provider-error` (AP-04). It prices the call but
 * records nothing: the watcher records the spend and checks the month ceiling (AP-07). An image
 * asset's picture goes as one image part after its check (AP-06); one the engine cannot take is
 * withheld with a typed reason and the call goes ahead on the metadata. Mock by
 * default: a labelled stand-in, $0, no connection. Logs carry ids, counts, amounts and outcome
 * labels only, never catalog or output text.
 */
@Injectable()
export class AssetPurposeWriterService implements AssetPurposeWriterPort {
  private readonly logger = new Logger(AssetPurposeWriterService.name);

  constructor(
    private readonly modes: ProviderModeService,
    private readonly redactor: RedactorService,
    private readonly scanner: OutputScanner,
    private readonly ledger: CostLedgerService,
    private readonly client: AssetPurposeWriterModelClient,
    private readonly claudeCodeClient: AssetPurposeWriterClaudeCodeClient,
  ) {}

  isLive(): boolean {
    return this.modes.isLive('claude');
  }

  async write(request: AssetPurposeWriterRequest): Promise<AssetPurposeWriterResult> {
    if (request.signal.aborted) throw new AssetPurposeWriterCallError('cancelled');
    const sessionId = newSessionId();
    if (!this.isLive()) {
      this.logger.log({ event: 'asset-purpose-writer.mock-answered', ref: request.ref, sessionId, scope: request.input.scope });
      return { status: 'ok', mode: 'mock', purpose: mockAssetPurpose(request.input.name), sessionId, usage: null, usd: 0 };
    }
    return this.writeLive(request, sessionId);
  }

  private async writeLive(request: AssetPurposeWriterRequest, sessionId: SessionId): Promise<AssetPurposeWriterResult> {
    const modelId = assetPurposeWriterDefinition.defaultModelId;
    this.assertPriced(modelId);
    const body = await this.redactedBody(request);
    const useClaudeCode = this.modes.usesClaudeCode();
    const image = this.imageOf(request, sessionId, useClaudeCode);
    const meter = new ReferenceAnalystMeter(modelId, this.ledger);
    const timeout = AbortSignal.timeout(assetPurposeBounds.callTimeoutMs);
    const startedAtMs = Date.now();
    const call: LiveCall = {
      request,
      modelId,
      sessionId,
      meter,
      timeout,
      signal: AbortSignal.any([request.signal, timeout, meter.signal]),
      deadlineMs: startedAtMs + assetPurposeBounds.callTimeoutMs,
      body,
      image,
      useClaudeCode,
    };
    this.logger.log({
      event: 'asset-purpose-writer.call-started',
      ref: request.ref,
      sessionId,
      modelId,
      promptVersion: ASSET_PURPOSE_PROMPT_VERSION,
      scope: request.input.scope,
      bodyChars: body.length,
      imageBytes: image === null ? 0 : image.bytes.byteLength,
    });

    const settlement = await this.settle(call);
    const { usage, usd } = this.spendOf(call, settlement);
    const outcome = settlement.kind === 'answer' ? 'ok' : settlement.kind === 'failed' ? settlement.reason : 'cancelled';
    this.logger.log({
      event: 'asset-purpose-writer.call-ended',
      ref: request.ref,
      sessionId,
      outcome,
      inputTokens: usage?.kind === 'model' ? usage.inputTokens : 0,
      outputTokens: usage?.kind === 'model' ? usage.outputTokens : 0,
      estimated: meter.billedRequest === null && usage !== null,
      usd,
      durationMs: Date.now() - startedAtMs,
    });
    if (settlement.kind === 'cancelled') throw new AssetPurposeWriterCallError('cancelled', { sessionId, usage, usd });
    if (settlement.kind === 'failed') return { status: 'failed', reason: settlement.reason, sessionId, usage, usd };
    return { status: 'ok', mode: 'live', purpose: settlement.purpose, sessionId, usage, usd };
  }

  private assertPriced(modelId: ModelId): void {
    try {
      this.ledger.priceUsd(toUsageQuantity(modelId, ZERO_USAGE));
    } catch {
      throw new AssetPurposeWriterCallError('model-unpriced');
    }
  }

  /** The user message, redacted; nothing is sent when redaction fails. */
  private async redactedBody(request: AssetPurposeWriterRequest): Promise<string> {
    const redacted = await this.redactor.redactText(renderAssetPurposeMessage(request.input));
    if (redacted.status === 'failed') throw new AssetPurposeWriterCallError('redaction-failed');
    return redacted.value;
  }

  /**
   * The image part, or null. An image the engine cannot take or that fails its check is withheld:
   * the call goes ahead with the metadata only and the log names the typed reason (the prompt tells
   * the model to write from the metadata when no picture follows).
   */
  private imageOf(request: AssetPurposeWriterRequest, sessionId: SessionId, useClaudeCode: boolean): AssetPurposeImagePart | null {
    const plan = assetPurposeImagePlan(request.input, useClaudeCode ? 'claude-code' : 'api');
    if (plan.status === 'attached') return plan.image;
    if (plan.status === 'withheld') {
      this.logger.warn({ event: 'asset-purpose-writer.image-withheld', ref: request.ref, sessionId, reason: plan.reason });
    }
    return null;
  }

  private async settle(call: LiveCall): Promise<Settlement> {
    try {
      return { kind: 'answer', purpose: await this.exchange(call) };
    } catch (error) {
      return this.classify(error, call);
    }
  }

  private async exchange(call: LiveCall): Promise<string> {
    // ADR 0011: under the Claude Code engine the call goes to the installed CLI, never to the API key.
    const client = call.useClaudeCode ? this.claudeCodeClient : this.client;
    const raw = await client.generate({
      ref: call.request.ref,
      modelId: call.modelId,
      instructions: assetPurposePrompt.system,
      body: call.body,
      image: call.image,
      maxOutputTokens: assetPurposeBounds.maxOutputTokens,
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      hooks: call.meter,
    });
    // A request whose usage or price could not be read was still billed: it ends as a failure.
    if (call.meter.failure !== null || call.meter.billedRequest === null) {
      throw new ReferenceAnalystMeterError(call.meter.failure ?? 'usage-unreadable');
    }
    return this.validPurpose(raw);
  }

  /** AP-04: 1..280 characters of plain text that redaction leaves unchanged and the scan accepts. */
  private async validPurpose(raw: unknown): Promise<string> {
    const parsed = AssetPurposeAnswerSchema.safeParse(raw);
    if (!parsed.success) throw new OutputInvalidError();
    const purpose = normalised(parsed.data.purpose);
    if (purpose.length === 0 || purpose.length > ASSET_PURPOSE_MAX_CHARS || MARKUP_PATTERN.test(purpose)) throw new OutputInvalidError();
    const redacted = await this.redactor.redactText(purpose);
    // A purpose that held a secret or a biometric path is rejected, not stored with a marker in it.
    if (redacted.status === 'failed' || redacted.value !== purpose) throw new OutputInvalidError();
    const scan = await this.scanner.scan(JsonValueSchema.parse({ purpose }));
    if (scan.status === 'rejected') throw new OutputInvalidError();
    return purpose;
  }

  /**
   * Which signal fired first decides the meaning: the call timeout is `timed-out`, the meter's stop
   * is a `provider-error`, the caller's own signal (watcher stop) is a cancellation.
   */
  private classify(error: unknown, call: LiveCall): Settlement {
    if (error instanceof OutputInvalidError) return { kind: 'failed', reason: 'provider-error' };
    if (call.signal.aborted) {
      const reason: unknown = call.signal.reason;
      if (reason === call.timeout.reason) return { kind: 'failed', reason: 'timed-out' };
      if (reason === call.meter.signal.reason) return { kind: 'failed', reason: 'provider-error' };
      return { kind: 'cancelled' };
    }
    if (call.meter.failure !== null || error instanceof ReferenceAnalystMeterError) return { kind: 'failed', reason: 'provider-error' };
    if (error instanceof ProvidersError) return { kind: 'failed', reason: 'credential-refused' };
    if (error instanceof ProviderCallError) {
      if (error.failure.class === 'authentication') return { kind: 'failed', reason: 'credential-refused' };
      if (error.failure.class === 'rate-limit') return { kind: 'failed', reason: 'rate-limited' };
      return { kind: 'failed', reason: 'provider-error' };
    }
    this.logger.error({ event: 'asset-purpose-writer.unexpected-error', ref: call.request.ref, sessionId: call.sessionId, errorName: error instanceof Error ? error.name : 'unknown' });
    return { kind: 'failed', reason: 'provider-error' };
  }

  /**
   * The billed usage and price; for a request that left but whose usage never came back the worst
   * case, so the watcher never undercounts the month spend. A 429 is refused before it is billed.
   */
  private spendOf(call: LiveCall, settlement: Settlement): { usage: UsageQuantity | null; usd: number } {
    const billed = call.meter.billedRequest;
    if (billed !== null) return { usage: billed.usage, usd: billed.usd };
    const rateLimited = settlement.kind === 'failed' && settlement.reason === 'rate-limited';
    if (!call.meter.sentWithoutUsage || rateLimited) return { usage: null, usd: 0 };
    const usage = worstCasePurposeUsage(call.modelId, assetPurposePrompt.system.length + call.body.length, call.image === null ? 0 : 1);
    try {
      return { usage, usd: this.ledger.priceUsd(usage) };
    } catch {
      // Priced before the call; a table that lost the model is reported as the worst-case bound.
      return { usage, usd: assetPurposeBounds.worstCaseUsd };
    }
  }
}
