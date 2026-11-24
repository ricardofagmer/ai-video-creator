import type {
  MockFaultScenario,
  StageExecutionContext,
  StageExecutionResult,
  StageExecutorPort,
  StagePlanningContext,
} from '@studio/shared/ports';
import {
  type CheckId,
  type CheckResult,
  type DeclaredOutput,
  type ProviderName,
  type StageEstimate,
  type StageId,
} from '@studio/shared/run-format';
import { type StageDependencies } from './stage-dependencies';
import { StageOutputSink } from './stage-io';
import { checkResult, stageFailed, type CheckEvidence, type CheckEvidenceMap } from './stage-results';
import { stageTexts } from './stage-texts';

export const zeroEstimate: StageEstimate = { tokens: 0, ttsChars: 0, renderSec: 0, usd: 0 };

/** Checks the engine computes itself; an executor result for them is ignored (R1-14). */
const engineOwnedChecks: ReadonlySet<CheckId> = new Set<CheckId>(['outputs-present', 'output-schema']);

/**
 * Shared shape of the fourteen R1-14 executors. It applies the A12 mock faults of the stage's
 * provider (inert in live mode), hands `run` an output sink bound to the stage brief, and turns
 * the stage's check evidence into C3 check results. A check the recipe puts on a stage that does
 * not measure it is reported `skipped` with the reason, never silently passed.
 */
export abstract class BaseStageExecutor implements StageExecutorPort {
  abstract readonly stageId: StageId;
  /** Provider whose mock mode carries this stage's fault (SPEC 0002 A12). */
  protected abstract readonly faultProvider: ProviderName;
  /**
   * False for agent stages: core `AgentsService` already reproduces the claude faults inside each
   * call, so applying them here would fail the stage twice.
   */
  protected readonly appliesCallFaults: boolean = true;

  constructor(protected readonly dependencies: StageDependencies) {}

  /** Preflight estimate: no side effects, no paid call, never throws (the engine calls it every preflight). */
  abstract estimate(context: StagePlanningContext): Promise<StageEstimate>;

  abstract declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[];

  async execute(context: StageExecutionContext): Promise<StageExecutionResult> {
    context.signal.throwIfAborted();
    const fault = this.activeFault();
    if (this.appliesCallFaults && fault === 'step-failure') {
      return stageFailed({ class: 'retryable', kind: 'tool', message: stageTexts.mockFault(this.stageId) });
    }
    if (this.appliesCallFaults && fault === 'authentication-error') {
      return stageFailed({ class: 'authentication', provider: this.faultProvider, message: stageTexts.mockAuthentication(this.faultProvider) });
    }
    const omitted = fault === 'missing-output' ? (context.stageBrief.declaredOutputs[0]?.name ?? null) : null;
    return this.run(context, new StageOutputSink(context, omitted));
  }

  async verify(context: StageExecutionContext): Promise<readonly CheckResult[]> {
    const startedAtMs = this.dependencies.clock.now().getTime();
    const wanted = context.stageBrief.checks.filter((checkId) => !engineOwnedChecks.has(checkId));
    const evidence = wanted.length === 0 ? new Map<CheckId, CheckEvidence>() : await this.checkEvidence(context, wanted);
    const durationMs = Math.max(0, this.dependencies.clock.now().getTime() - startedAtMs);
    return wanted.map((checkId) =>
      checkResult(context, checkId, evidence.get(checkId) ?? notApplicable(this.stageId), startedAtMs, durationMs),
    );
  }

  protected abstract run(context: StageExecutionContext, outputs: StageOutputSink): Promise<StageExecutionResult>;

  /** Evidence for the requested checks; a check the stage does not measure is left out. */
  protected abstract checkEvidence(context: StageExecutionContext, checks: readonly CheckId[]): Promise<CheckEvidenceMap>;

  protected activeFault(): MockFaultScenario {
    const state = this.dependencies.providerModes.modeOf(this.faultProvider);
    return state.mode === 'mock' ? state.fault : 'none';
  }

  protected isLive(provider: ProviderName): boolean {
    return this.dependencies.providerModes.isLive(provider);
  }

  /** ADR 0011: agent calls on the Claude Code engine are not billed, so they estimate at USD 0. */
  protected agentCallsBilled(): boolean {
    const modes = this.dependencies.providerModes;
    return modes.isLive('claude') && modes.usesClaudeCode?.() !== true;
  }
}

function notApplicable(stageId: StageId): CheckEvidence {
  return { outcome: 'skipped', expected: 'verificação aplicável', measured: 'não medida', detail: stageTexts.notApplicable(stageId) };
}
