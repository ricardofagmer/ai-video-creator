import type {
  ProviderModePort,
  StageEventSink,
  StageExecutionContext,
  StageExecutionResult,
  StageExecutorPort,
  StagePlanningContext,
} from '@studio/shared/ports';
import { resolveInsideRun } from '@studio/shared/run-files';
import { type CheckId, type CheckResult, type DeclaredOutput, type ModelUse, type StageEstimate, type StageId } from '@studio/shared/run-format';
import { activeFault, type MockFaultPlan } from '../mock-fault';
import { type MockStageBehaviour, type MockStageTools } from './mock-stage-behaviour';

export interface MockExecutorDependencies {
  tools: MockStageTools;
  providerMode: ProviderModePort;
  faultPlan: MockFaultPlan;
}

/**
 * Checks `verify-check-failure` never fails: the engine computes the first two itself (executor
 * results are ignored), and a failed `claims-evidence` is never retried, so it could not pass later.
 */
const checksNotFaulted: ReadonlySet<CheckId> = new Set<CheckId>(['outputs-present', 'output-schema', 'claims-evidence']);

export class UndeclaredMockOutputError extends Error {
  constructor(
    readonly stageId: StageId,
    readonly outputName: string,
  ) {
    super(`Mock executor ${stageId} produced "${outputName}", which its stage brief does not declare`);
    this.name = 'UndeclaredMockOutputError';
  }
}

/**
 * One C6 stage executor for mock mode, driven by a stage behaviour. Faults (A12) come from the
 * provider mode, so they are inert in live mode: `step-failure` reports a retryable failure,
 * `authentication-error` an authentication failure, `missing-output` reports success while
 * leaving its first output unwritten, which the engine must catch (criterion 11), and
 * `verify-check-failure` fails one executor check on the first `verify` attempt only, so the
 * engine's verify repeat passes and the run reaches `review`.
 */
export class MockStageExecutor implements StageExecutorPort {
  readonly stageId: StageId;

  constructor(
    private readonly behaviour: MockStageBehaviour,
    private readonly dependencies: MockExecutorDependencies,
  ) {
    this.stageId = behaviour.stageId;
  }

  async estimate(): Promise<StageEstimate> {
    return this.behaviour.estimate;
  }

  declaredOutputs(context: StagePlanningContext): readonly DeclaredOutput[] {
    return this.behaviour.outputs(context.stage);
  }

  async execute(context: StageExecutionContext): Promise<StageExecutionResult> {
    context.signal.throwIfAborted();
    const { provider } = this.behaviour;
    const fault = activeFault(this.dependencies.faultPlan, this.stageId, this.dependencies.providerMode.modeOf(provider));
    if (fault === 'step-failure') {
      const message = `Falha simulada (step-failure) na etapa ${this.stageId}.`;
      return { status: 'failed', failure: { class: 'retryable', kind: 'tool', message }, models: [] };
    }
    if (fault === 'authentication-error') {
      const message = `Autenticação simulada recusada por ${provider}.`;
      return { status: 'failed', failure: { class: 'authentication', provider, message }, models: [] };
    }

    context.report({ kind: 'text', text: `Simulado: etapa ${this.stageId} em execução.` });
    const models: ModelUse[] = [];
    const observed: StageExecutionContext = { ...context, events: modelCollectingSink(context.events, models) };
    const writes = await this.behaviour.produce(observed, this.dependencies.tools);
    const omitted = fault === 'missing-output' ? writes[0]?.name : undefined;
    for (const output of writes) {
      context.signal.throwIfAborted();
      if (output.name === omitted) continue;
      const declared = context.stageBrief.declaredOutputs.find((candidate) => candidate.name === output.name);
      if (declared === undefined) throw new UndeclaredMockOutputError(this.stageId, output.name);
      await output.write(resolveInsideRun(context.runDir, declared.path));
    }
    return { status: 'reported-success', summary: this.behaviour.summary, models };
  }

  async verify(context: StageExecutionContext): Promise<readonly CheckResult[]> {
    const startedAtMs = this.dependencies.tools.clock.now().getTime();
    const failing = this.faultedCheck(context);
    return context.stageBrief.checks.map((checkId): CheckResult => {
      const base = { checkId, stageNumber: context.stage.stageNumber, stageId: this.stageId, attempt: context.attempt, startedAtMs };
      if (checkId === failing) {
        const detail = `Falha simulada (verify-check-failure) na tentativa ${context.attempt}.`;
        return { ...base, outcome: 'failed', expected: 'valor da receita', measured: 'simulado fora do limite', detail, durationMs: 0, rawOutputPath: null };
      }
      return {
        ...base,
        outcome: 'passed',
        expected: 'valor da receita',
        measured: this.behaviour.evidence?.[checkId] ?? 'simulado',
        detail: 'Resultado simulado do executor de teste.',
        durationMs: 0,
        rawOutputPath: null,
      };
    });
  }

  /** The check `verify-check-failure` fails: keyed to attempt 1, so a crash resume reproduces it the same way. */
  private faultedCheck(context: StageExecutionContext): CheckId | undefined {
    const fault = activeFault(this.dependencies.faultPlan, this.stageId, this.dependencies.providerMode.modeOf(this.behaviour.provider));
    if (fault !== 'verify-check-failure' || context.attempt !== 1) return undefined;
    return context.stageBrief.checks.find((checkId) => !checksNotFaulted.has(checkId));
  }
}

/** Forwards every event and notes each started session's model, so the result names what ran. */
function modelCollectingSink(sink: StageEventSink, models: ModelUse[]): StageEventSink {
  return {
    emit: async (event) => {
      if (event.type === 'session.started' && !models.some((use) => use.role === event.role && use.modelId === event.modelId)) {
        models.push({ role: event.role, modelId: event.modelId });
      }
      await sink.emit(event);
    },
  };
}
