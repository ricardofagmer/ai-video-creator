import { Module, type DynamicModule, type Provider } from '@nestjs/common';
import { NextBriefDrafter } from './brief/next-brief.drafter';
import { StageBriefComposer } from './brief/stage-brief.composer';
import { ControlFileChannel } from './control/control-file.channel';
import { RunControlService } from './control/run-control.service';
import { CostCeilingCheck } from './cost/cost-ceiling.check';
import { PREFLIGHT_CHECKS, RUN_CONTROL, STEP_FAILURE_POLICY } from './engine.tokens';
import { ExecutorRegistry } from './executor-registry';
import { RecoveryPolicy } from './failure/recovery.policy';
import { StepFailureHandler } from './failure/step-failure.handler';
import { GateKeeper } from './gates/gate-keeper';
import { PlanRecorder } from './gates/plan-recorder';
import { RunEngine } from './run-engine';
import { type PreflightCheck } from './seams';
import { StageRunner } from './stage-runner';
import { ArchiveStep } from './steps/archive.step';
import { BriefStep } from './steps/brief.step';
import { ExecuteStep } from './steps/execute.step';
import { PreflightStep } from './steps/preflight.step';
import { RecordStep } from './steps/record.step';
import { SnapshotStep } from './steps/snapshot.step';
import { StepHandlers } from './steps/step-handlers';
import { VerifyStep } from './steps/verify.step';

export interface EngineModuleOptions {
  /** Binds every token of `enginePortTokens` and exports them (the composition root's ports module). */
  ports: DynamicModule;
  /**
   * Seam bindings listed after the defaults; a later provider for the same token wins. The usual
   * use is extra `PREFLIGHT_CHECKS` (R1-06 asset re-hash); the built-in licence and cost guards run
   * whatever that binding holds.
   */
  seams?: readonly Provider[];
}

/**
 * The run engine. It depends on ports only through tokens, so the composition root decides mocks
 * or real adapters. PRD 7.3 behaviour is the default (R1-08): `STEP_FAILURE_POLICY` is the
 * Recovery policy, `RUN_CONTROL` the control.json channel, and `PREFLIGHT_CHECKS` starts empty.
 */
@Module({})
export class EngineModule {
  static register(options: EngineModuleOptions): DynamicModule {
    return {
      module: EngineModule,
      imports: [options.ports],
      providers: [
        RunEngine,
        StageRunner,
        ExecutorRegistry,
        GateKeeper,
        PlanRecorder,
        RunControlService,
        StepFailureHandler,
        CostCeilingCheck,
        StageBriefComposer,
        NextBriefDrafter,
        StepHandlers,
        BriefStep,
        PreflightStep,
        SnapshotStep,
        ExecuteStep,
        VerifyStep,
        ArchiveStep,
        RecordStep,
        { provide: STEP_FAILURE_POLICY, useClass: RecoveryPolicy },
        { provide: RUN_CONTROL, useClass: ControlFileChannel },
        { provide: PREFLIGHT_CHECKS, useFactory: (): readonly PreflightCheck[] => [] },
        ...(options.seams ?? []),
      ],
      exports: [RunEngine],
    };
  }
}
