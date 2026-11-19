import { Inject, Injectable } from '@nestjs/common';
import { type StepName } from '@studio/shared/run-format';
import { ArchiveStep } from './archive.step';
import { BriefStep } from './brief.step';
import { ExecuteStep } from './execute.step';
import { PreflightStep } from './preflight.step';
import { RecordStep } from './record.step';
import { SnapshotStep } from './snapshot.step';
import { type StepHandler } from './step-handler';
import { VerifyStep } from './verify.step';

/**
 * The seven step handlers keyed by step name. A `Record` over `StepName` makes a missing handler
 * a compile error instead of a runtime gap.
 */
@Injectable()
export class StepHandlers {
  private readonly byStep: Readonly<Record<StepName, StepHandler>>;

  constructor(
    @Inject(BriefStep) brief: BriefStep,
    @Inject(PreflightStep) preflight: PreflightStep,
    @Inject(SnapshotStep) snapshot: SnapshotStep,
    @Inject(ExecuteStep) execute: ExecuteStep,
    @Inject(VerifyStep) verify: VerifyStep,
    @Inject(ArchiveStep) archive: ArchiveStep,
    @Inject(RecordStep) record: RecordStep,
  ) {
    this.byStep = { brief, preflight, snapshot, execute, verify, archive, record };
  }

  forStep(step: StepName): StepHandler {
    return this.byStep[step];
  }
}
