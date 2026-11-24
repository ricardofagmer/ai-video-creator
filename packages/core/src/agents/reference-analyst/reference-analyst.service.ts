import { Injectable, Logger } from '@nestjs/common';
import { REFERENCE_ANALYST_PROMPT_VERSION, ReferenceStyleAnalysisSchema, type ReferenceStyleAnalysis } from '@studio/shared/agents';
import { referenceAnalysisBounds } from '@studio/shared/asset-jobs';
import { type ReferenceAnalystPort, type ReferenceAnalystRequest, type ReferenceAnalystResult, type UsageQuantity } from '@studio/shared/ports';
import { newSessionId } from '@studio/shared/run-files';
import { JsonValueSchema, type ModelId, type SessionId } from '@studio/shared/run-format';
import { CostLedgerService } from '../../costs';
import { ProviderModeService, ProvidersError } from '../../providers';
import { RedactorService } from '../../redaction';
import { ProviderCallError } from '../agents.errors';
import { referenceAnalystPrompt, renderReferenceAnalystMessage } from '../prompts/reference-analyst.prompt';
import { OutputScanner } from '../safety/output-scanner';
import { ZERO_USAGE, toUsageQuantity } from '../usage/model-usage.mapper';
import { ReferenceAnalystClaudeCodeClient } from './reference-analyst-claude-code.client';
import { ReferenceAnalystModelClient } from './reference-analyst-model.client';
import { referenceAnalystDefinition } from './reference-analyst.definition';
import { ReferenceAnalystCallError, ReferenceAnalystMeterError } from './reference-analyst.errors';
import { ReferenceAnalystMeter } from './reference-analyst.meter';
import { mockReferenceStyleAnalysis } from './reference-analyst.mock';
import { worstCaseAnalystUsage } from './reference-analyst.usage';

type FailureReason = Extract<ReferenceAnalystResult, { status: 'failed' }>['reason'];

/** How one live exchange ended, before usage and price are attached. */
type Settlement = { kind: 'answer'; analysis: ReferenceStyleAnalysis } | { kind: 'failed'; reason: FailureReason } | { kind: 'cancelled' };

interface LiveCall {
  readonly request: ReferenceAnalystRequest;
  readonly modelId: ModelId;
  readonly sessionId: SessionId;
  readonly meter: ReferenceAnalystMeter;
  readonly timeout: AbortSignal;
  readonly signal: AbortSignal;
  readonly deadlineMs: number;
  /** The redacted text part of the user message. */
  readonly body: string;
}

/** JPEG start-of-image marker: anything else is not sent as `image/jpeg`. */
const JPEG_MAGIC = [0xff, 0xd8, 0xff] as const;

function isJpeg(frame: Uint8Array): boolean {
  return JPEG_MAGIC.every((byte, index) => frame[index] === byte);
}

/** The answer failed the strict schema or the output scan; never carries the answer itself. */
class OutputInvalidError extends Error {
  constructor() {
    super('Reference analyst answer rejected');
    this.name = 'OutputInvalidError';
  }
}

/**
 * `ReferenceAnalystPort` on Mastra (docs/specs/2026-11-23-guided-creation-design.md section 4).
 * Shaped like `CuratorAgentService` and, like it, not part of the run-bound `AgentsService`: one
 * `analyse` is exactly one model call, no tools, no schema-correction loop (an answer that fails
 * `ReferenceStyleAnalysisSchema` or the output scan is `output-invalid`), at most
 * `referenceAnalysisBounds.maxOutputTokens` output tokens and a `callTimeoutMs` timeout joined to
 * the caller's signal. It prices the call but records nothing: the watcher records the spend and
 * checks the month ceiling through `AssetJobCostPort`. Mock by default: a labelled stand-in, $0,
 * no connection. Live, the call goes to the Claude API or, under the Claude Code engine, to the
 * installed CLI (docs/specs/2026-11-24-link-reference-analysis-design.md). Logs carry ids, counts, amounts and outcome labels only, never name, notes,
 * frame or output text.
 */
@Injectable()
export class ReferenceAnalystService implements ReferenceAnalystPort {
  private readonly logger = new Logger(ReferenceAnalystService.name);

  constructor(
    private readonly modes: ProviderModeService,
    private readonly redactor: RedactorService,
    private readonly scanner: OutputScanner,
    private readonly ledger: CostLedgerService,
    private readonly client: ReferenceAnalystModelClient,
    private readonly claudeCodeClient: ReferenceAnalystClaudeCodeClient,
  ) {}

  isLive(): boolean {
    return this.modes.isLive('claude');
  }

  async analyse(request: ReferenceAnalystRequest): Promise<ReferenceAnalystResult> {
    const live = this.isLive();
    this.checkRequest(request, live);
    if (request.signal.aborted) throw new ReferenceAnalystCallError('cancelled');
    const sessionId = newSessionId();
    if (!live) {
      this.logger.log({ event: 'reference-analyst.mock-answered', ref: request.ref, sessionId, frameCount: request.frames.length });
      return { status: 'ok', mode: 'mock', analysis: mockReferenceStyleAnalysis(request.name), sessionId, usage: null, usd: 0 };
    }
    return this.analyseLive(request, sessionId);
  }

  private async analyseLive(request: ReferenceAnalystRequest, sessionId: SessionId): Promise<ReferenceAnalystResult> {
    const modelId = referenceAnalystDefinition.defaultModelId;
    this.assertPriced(modelId);
    const body = await this.redactedBody(request);
    const meter = new ReferenceAnalystMeter(modelId, this.ledger);
    const timeout = AbortSignal.timeout(referenceAnalysisBounds.callTimeoutMs);
    const startedAtMs = Date.now();
    const call: LiveCall = {
      request,
      modelId,
      sessionId,
      meter,
      timeout,
      signal: AbortSignal.any([request.signal, timeout, meter.signal]),
      deadlineMs: startedAtMs + referenceAnalysisBounds.callTimeoutMs,
      body,
    };
    const frameBytes = request.frames.reduce((total, frame) => total + frame.byteLength, 0);
    this.logger.log({
      event: 'reference-analyst.call-started',
      ref: request.ref,
      sessionId,
      modelId,
      promptVersion: REFERENCE_ANALYST_PROMPT_VERSION,
      frameCount: request.frames.length,
      frameBytes,
    });

    const settlement = await this.settle(call);
    const { usage, usd } = this.spendOf(call, settlement);
    const outcome = settlement.kind === 'answer' ? 'ok' : settlement.kind === 'failed' ? settlement.reason : 'cancelled';
    this.logger.log({
      event: 'reference-analyst.call-ended',
      ref: request.ref,
      sessionId,
      outcome,
      inputTokens: usage?.kind === 'model' ? usage.inputTokens : 0,
      outputTokens: usage?.kind === 'model' ? usage.outputTokens : 0,
      estimated: meter.billedRequest === null && usage !== null,
      usd,
      durationMs: Date.now() - startedAtMs,
    });
    if (settlement.kind === 'cancelled') throw new ReferenceAnalystCallError('cancelled', { sessionId, usage, usd });
    if (settlement.kind === 'failed') return { status: 'failed', reason: settlement.reason, sessionId, usage, usd };
    return { status: 'ok', mode: 'live', analysis: settlement.analysis, sessionId, usage, usd };
  }

  /** Frames and duration within `referenceAnalysisBounds`; a live call needs at least one frame. */
  private checkRequest(request: ReferenceAnalystRequest, live: boolean): void {
    const { frames, durationMs } = request;
    const frameCountValid = frames.length <= referenceAnalysisBounds.frames && (!live || frames.length > 0);
    const framesValid = frames.every((frame) => frame.byteLength <= referenceAnalysisBounds.frameMaxBytes && isJpeg(frame));
    if (!frameCountValid || !framesValid || !Number.isFinite(durationMs) || durationMs < 0) {
      throw new ReferenceAnalystCallError('invalid-request');
    }
  }

  private assertPriced(modelId: ModelId): void {
    try {
      this.ledger.priceUsd(toUsageQuantity(modelId, ZERO_USAGE));
    } catch {
      throw new ReferenceAnalystCallError('model-unpriced');
    }
  }

  /** The text part of the user message, redacted; nothing is sent when redaction fails. */
  private async redactedBody(request: ReferenceAnalystRequest): Promise<string> {
    const redacted = await this.redactor.redactText(
      renderReferenceAnalystMessage({ name: request.name, ownerNotes: request.ownerNotes, durationMs: request.durationMs, frameCount: request.frames.length }),
    );
    if (redacted.status === 'failed') throw new ReferenceAnalystCallError('redaction-failed');
    return redacted.value;
  }

  /** The exchange as a value: the parsed answer, a port failure reason, or a cancellation. */
  private async settle(call: LiveCall): Promise<Settlement> {
    try {
      return { kind: 'answer', analysis: await this.exchange(call) };
    } catch (error) {
      return this.classify(error, call);
    }
  }

  private async exchange(call: LiveCall): Promise<ReferenceStyleAnalysis> {
    const { request } = call;
    // ADR 0011: under the Claude Code engine the frames go to the installed CLI, never to the API key.
    const client = this.modes.usesClaudeCode() ? this.claudeCodeClient : this.client;
    const raw = await client.generate({
      ref: request.ref,
      modelId: call.modelId,
      instructions: referenceAnalystPrompt.system,
      body: call.body,
      frames: request.frames,
      maxOutputTokens: referenceAnalysisBounds.maxOutputTokens,
      signal: call.signal,
      deadlineMs: call.deadlineMs,
      hooks: call.meter,
    });
    // A request whose usage or price could not be read was still billed: it ends as a failure.
    if (call.meter.failure !== null || call.meter.billedRequest === null) {
      throw new ReferenceAnalystMeterError(call.meter.failure ?? 'usage-unreadable');
    }
    const parsed = ReferenceStyleAnalysisSchema.safeParse(raw);
    if (!parsed.success) throw new OutputInvalidError();
    // The analysis reaches the writer and director: no protocol tag, secret or biometric path may ride along.
    const scan = await this.scanner.scan(JsonValueSchema.parse(parsed.data));
    if (scan.status === 'rejected') throw new OutputInvalidError();
    return parsed.data;
  }

  /**
   * Which signal fired first decides the meaning: the call timeout is `timed-out`, the meter's stop
   * is a `provider-error`, the caller's own signal (watcher stop) is a cancellation.
   */
  private classify(error: unknown, call: LiveCall): Settlement {
    if (error instanceof OutputInvalidError) return { kind: 'failed', reason: 'output-invalid' };
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
    this.logger.error({ event: 'reference-analyst.unexpected-error', ref: call.request.ref, sessionId: call.sessionId, errorName: error instanceof Error ? error.name : 'unknown' });
    return { kind: 'failed', reason: 'provider-error' };
  }

  /**
   * The billed usage and price; for a request that left but whose usage never came back (timeout,
   * stop, unreadable usage) the worst case, so the watcher never undercounts the month spend. A 429
   * is refused before it is billed, so a rate-limited call with no usage costs nothing.
   */
  private spendOf(call: LiveCall, settlement: Settlement): { usage: UsageQuantity | null; usd: number } {
    const billed = call.meter.billedRequest;
    if (billed !== null) return { usage: billed.usage, usd: billed.usd };
    const rateLimited = settlement.kind === 'failed' && settlement.reason === 'rate-limited';
    if (!call.meter.sentWithoutUsage || rateLimited) return { usage: null, usd: 0 };
    const usage = worstCaseAnalystUsage({
      modelId: call.modelId,
      promptChars: referenceAnalystPrompt.system.length + call.body.length,
      frameCount: call.request.frames.length,
    });
    try {
      return { usage, usd: this.ledger.priceUsd(usage) };
    } catch {
      // Priced before the call; a table that lost the model is reported as the worst-case bound.
      return { usage, usd: referenceAnalysisBounds.worstCaseUsd };
    }
  }
}

