import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import {
  agentContracts,
  type AgentOutput,
  type AgentPacket,
  type AgentRunOptions,
  type AgentsPort,
  type ModelRoleName,
} from '@studio/shared/agents';
import { type LearningNoteId } from '@studio/shared/catalog';
import { newSessionId } from '@studio/shared/run-files';
import { JsonValueSchema, type ModelId, type SessionOutcome } from '@studio/shared/run-format';
import { CostLedgerService } from '../costs';
import { EgressLog, ProviderModeService } from '../providers';
import { RedactorService } from '../redaction';
import { type ClaudeAdapter, type RenderedPrompt } from './adapters/claude-adapter';
import { ClaudeCodeAdapter } from './adapters/claude-code.adapter';
import { LiveClaudeAdapter } from './adapters/live-claude.adapter';
import { MockClaudeAdapter } from './adapters/mock-claude.adapter';
import { MOCK_MODEL_ID, agentRoster } from './agent-roster';
import { AgentRunError, ProviderCallError, describeAgentFailure, type AgentFailure } from './agents.errors';
import { AgentCallContextResolver, type AgentCallContext } from './call/agent-call-context';
import { CallAccounting } from './call/call-accounting';
import { CallGuard, callSignals, effectiveBounds, stoppedBecause, type CallSignals } from './call/call-guard';
import { feedbackIssues, outputParsers, packetParsers } from './call/role-parsers';
import { rolePrompts, schemaFeedbackSection } from './prompts';
import { packetNoteIdsOf, packetRefsOf } from './packets/agent-packet-facts';
import { OutputScanner } from './safety/output-scanner';
import { renderRedactedPrompt } from './safety/untrusted-redaction';
import { SessionStream } from './sessions/session-stream';
import { AgentToolSetResolver, type AgentToolSet } from './tooling/agent-tool-set';
import { ZERO_USAGE, toUsageQuantity } from './usage/model-usage.mapper';

/** Topology section 7: one schema-feedback retry per call, then a typed failure. */
const SCHEMA_ATTEMPTS = 2;

/**
 * The API requires a per-request output cap; the session's `maxTokens` also counts input and
 * cache tokens, so one answer is capped well below it.
 */
const MAX_OUTPUT_TOKENS_PER_CALL = 16_000;

interface PreparedCall<Role extends ModelRoleName> {
  role: Role;
  packet: AgentPacket<Role>;
  modelId: ModelId;
  prompt: RenderedPrompt;
  tools: AgentToolSet;
  guard: CallGuard;
  signals: CallSignals;
  deadlineMs: number;
  accounting: CallAccounting;
  adapter: ClaudeAdapter;
}

/**
 * C7 `AgentsPort` on Mastra (R1-12): the only entry point to the five agents of topology v1,
 * called by the engine's `execute` and recovery steps. Mock by default (no key, no network, $0);
 * live only when the `claude` provider is switched to live, on the Claude API or, by setting, on
 * the installed Claude Code CLI (ADR 0011). One call is one session:
 * packet check, redacted session stream, bounded model loop with one schema-feedback retry,
 * output scan, cost per billed call, and an `end` line written in `finally`. The promise resolves
 * only with an output that passed the role's strict C7 schema and the output scan; every failure
 * is an `AgentRunError` the engine maps with `toAgentStageFailure` and `agentFailurePolicy`.
 */
@Injectable()
export class AgentsService implements AgentsPort, OnModuleInit {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    private readonly modes: ProviderModeService,
    private readonly contexts: AgentCallContextResolver,
    private readonly toolSets: AgentToolSetResolver,
    private readonly redactor: RedactorService,
    private readonly scanner: OutputScanner,
    private readonly ledger: CostLedgerService,
    private readonly mockAdapter: MockClaudeAdapter,
    private readonly liveAdapter: LiveClaudeAdapter,
    private readonly claudeCodeAdapter: ClaudeCodeAdapter,
  ) {}

  /**
   * Live mode fails the start, never the first call. API engine: the key must resolve (R1-11
   * throws its named error otherwise) and every default model must be priced (no call is ever
   * priced $0). Claude Code engine (ADR 0011): the CLI must run; it has no key and no price.
   */
  async onModuleInit(): Promise<void> {
    if (!this.modes.isLive('claude')) return;
    if (this.modes.usesClaudeCode()) {
      await this.claudeCodeAdapter.assertAvailable();
      return;
    }
    this.modes.credentialFor('claude');
    for (const definition of Object.values(agentRoster)) {
      this.ledger.priceUsd(toUsageQuantity(definition.defaultModelId, ZERO_USAGE));
    }
  }

  async run<Role extends ModelRoleName>(role: Role, packet: AgentPacket<Role>, options?: AgentRunOptions): Promise<AgentOutput<Role>> {
    if (options?.signal?.aborted === true) throw new AgentRunError(role, { kind: 'cancelled' });
    const parsedPacket = packetParsers[role](packet);
    if (!parsedPacket.success) throw new AgentRunError(role, { kind: 'invalid-packet' });
    const checkedPacket = parsedPacket.data;

    const live = this.modes.isLive('claude');
    const context = await this.resolveContext(role, checkedPacket);
    const modelId = live ? context.modelId : MOCK_MODEL_ID;
    if (live) this.assertPriced(role, modelId);

    const sessionId = newSessionId();
    const startedAtMs = Date.now();
    const stream = new SessionStream(this.redactor, context.runDir, sessionId);
    const guard = new CallGuard(role, effectiveBounds(role, checkedPacket.budget));
    const signals = callSignals(guard, options?.signal);
    let accounting: CallAccounting | null = null;
    let outcome: SessionOutcome = 'failed';
    let failure: AgentFailure | null = null;
    const promptVersion = rolePrompts[role].version;
    const noteIds = packetNoteIdsOf(checkedPacket);
    this.logger.log({ event: 'agents.session-started', role, sessionId, stepKey: context.stepKey, modelId, promptVersion, live });

    try {
      await stream.start({ role, modelId, stepKey: context.stepKey, packetType: agentContracts[role].packetType });
      await stream.packet(JsonValueSchema.parse(checkedPacket));
      accounting = new CallAccounting({
        role,
        runId: checkedPacket.runId,
        runDir: context.runDir,
        sessionId,
        stepKey: context.stepKey,
        modelId,
        guard,
        stream,
        ledger: this.ledger,
        egress: live ? await this.openEgress(role, context.runDir) : null,
      });
      const tools = await this.toolSets.resolve(
        {
          role,
          runId: checkedPacket.runId,
          runDir: context.runDir,
          stageId: checkedPacket.stageId,
          stepKey: context.stepKey,
          sessionId,
          packetRefs: packetRefsOf(checkedPacket),
          recipeBindingRefs: context.bindings.map((binding) => binding.ref),
          signal: signals.combined,
          gate: guard,
          trace: stream,
        },
        live,
      );
      const { output, schemaRetried } = await this.generateValidated({
        role,
        packet: checkedPacket,
        modelId,
        prompt: await this.renderPrompt(role, checkedPacket),
        tools,
        guard,
        signals,
        deadlineMs: startedAtMs + guard.bounds.timeoutMs,
        accounting,
        adapter: this.adapterFor(live),
      });
      const outputJson = JsonValueSchema.parse(output);
      const scan = await this.scanner.scan(outputJson);
      if (scan.status === 'rejected') throw new AgentRunError(role, { kind: 'output-rejected', reason: scan.reason });
      const traceFailed = await accounting.settle();
      if (traceFailed !== null) throw new AgentRunError(role, { kind: 'trace-failed', target: traceFailed });
      await stream.output(outputJson);
      outcome = schemaRetried ? 'schema-retry' : 'ok';
      return output;
    } catch (error) {
      failure = this.classify(error, guard, signals);
      outcome = failure.kind === 'provider' && failure.failure.class === 'rate-limit' ? 'rate-limited' : 'failed';
      throw new AgentRunError(role, failure);
    } finally {
      await accounting?.settle();
      await this.endSession({ role, stream, context, outcome, failure, guard, startedAtMs, promptVersion, modelId, noteIds });
    }
  }

  private adapterFor(live: boolean): ClaudeAdapter {
    if (!live) return this.mockAdapter;
    return this.modes.usesClaudeCode() ? this.claudeCodeAdapter : this.liveAdapter;
  }

  private async generateValidated<Role extends ModelRoleName>(
    call: PreparedCall<Role>,
  ): Promise<{ output: AgentOutput<Role>; schemaRetried: boolean }> {
    const contract = agentContracts[call.role];
    let body = call.prompt.body;
    let issueCount = 0;
    for (let attempt = 1; attempt <= SCHEMA_ATTEMPTS; attempt += 1) {
      call.accounting.outcome = attempt === 1 ? 'ok' : 'schema-retry';
      const raw = await call.adapter.generate({
        role: call.role,
        packet: call.packet,
        modelId: call.modelId,
        prompt: { ...call.prompt, body },
        outputSchema: contract.output,
        tools: call.tools,
        maxSteps: call.guard.bounds.maxSteps,
        maxOutputTokens: Math.min(call.guard.bounds.maxTokens, MAX_OUTPUT_TOKENS_PER_CALL),
        signal: call.signals.combined,
        deadlineMs: call.deadlineMs,
        hooks: call.accounting,
      });
      // A bound crossed on the last billed call does not abort a loop that already finished.
      const stopped = stoppedBecause(call.guard, call.signals);
      if (stopped !== null) throw new AgentRunError(call.role, stopped);
      const parsed = outputParsers[call.role](raw);
      if (parsed.success) return { output: parsed.data, schemaRetried: attempt > 1 };
      issueCount = parsed.error.issues.length;
      const feedback = schemaFeedbackSection(call.packet.outputContract, feedbackIssues(parsed.error));
      body = `${call.prompt.body}\n\n${await this.redactOrFail(call.role, feedback)}`;
    }
    throw new AgentRunError(call.role, { kind: 'invalid-output', issueCount });
  }

  private async resolveContext<Role extends ModelRoleName>(role: Role, packet: AgentPacket<Role>): Promise<AgentCallContext> {
    try {
      return await this.contexts.resolve(role, packet);
    } catch (error) {
      if (error instanceof AgentRunError) throw error;
      // run.json is the engine's own file; failing to read it is a wiring defect, named by kind.
      this.logger.error({ event: 'agents.context-unavailable', role, errorName: error instanceof Error ? error.name : 'unknown' });
      throw new AgentRunError(role, { kind: 'internal' });
    }
  }

  private assertPriced(role: ModelRoleName, modelId: ModelId): void {
    try {
      this.ledger.priceUsd(toUsageQuantity(modelId, ZERO_USAGE));
    } catch {
      throw new AgentRunError(role, { kind: 'configuration', reason: 'model-unpriced' });
    }
  }

  private async openEgress(role: ModelRoleName, runDir: string): Promise<EgressLog> {
    try {
      return await EgressLog.open(runDir);
    } catch {
      throw new AgentRunError(role, { kind: 'trace-failed', target: 'egress' });
    }
  }

  /** Static role instructions, plus the packet rendering redacted per untrusted block before it can leave (L2). */
  private async renderPrompt<Role extends ModelRoleName>(role: Role, packet: AgentPacket<Role>): Promise<RenderedPrompt> {
    return renderRedactedPrompt(role, packet, (text) => this.redactOrFail(role, text));
  }

  private async redactOrFail(role: ModelRoleName, text: string): Promise<string> {
    const result = await this.redactor.redactText(text);
    if (result.status === 'failed') throw new AgentRunError(role, { kind: 'redaction-failed' });
    return result.value;
  }

  private classify(error: unknown, guard: CallGuard, signals: CallSignals): AgentFailure {
    const stopped = stoppedBecause(guard, signals);
    if (stopped !== null) return stopped;
    if (error instanceof AgentRunError) return error.failure;
    if (error instanceof ProviderCallError) return { kind: 'provider', failure: error.failure };
    this.logger.error({ event: 'agents.unexpected-error', role: guard.role, errorName: error instanceof Error ? error.name : 'unknown' });
    return { kind: 'internal' };
  }

  /** Topology section 10: the end line and the prompt/skill versions, failed sessions included. */
  private async endSession(end: {
    role: ModelRoleName;
    stream: SessionStream;
    context: AgentCallContext;
    outcome: SessionOutcome;
    failure: AgentFailure | null;
    guard: CallGuard;
    startedAtMs: number;
    promptVersion: string;
    modelId: ModelId;
    noteIds: readonly LearningNoteId[] | undefined;
  }): Promise<void> {
    const failureLabel = end.failure === null ? null : describeAgentFailure(end.failure);
    try {
      await end.stream.end({
        outcome: end.outcome,
        error: failureLabel,
        promptRefs: end.context.promptRefs,
        skillRefs: end.context.skillRefs,
        ...(end.noteIds === undefined ? {} : { noteIds: end.noteIds }),
      });
    } catch {
      // The call's own result (output or typed failure) stands; the missing end line is reported here.
      this.logger.warn({ event: 'agents.session-end-unwritten', role: end.role, sessionId: end.stream.sessionId });
    }
    this.logger.log({
      event: 'agents.session-ended',
      role: end.role,
      sessionId: end.stream.sessionId,
      stepKey: end.context.stepKey,
      modelId: end.modelId,
      promptVersion: end.promptVersion,
      outcome: end.outcome,
      failure: failureLabel,
      tokens: end.guard.spentTokens,
      usd: end.guard.spentUsd,
      latencyMs: Date.now() - end.startedAtMs,
    });
  }
}
