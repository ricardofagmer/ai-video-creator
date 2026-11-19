import { Inject, Injectable } from '@nestjs/common';
import type { StageExecutorPort } from '@studio/shared/ports';
import { type StageId } from '@studio/shared/run-format';
import { DuplicateStageExecutorError, MissingStageExecutorError } from './engine.errors';
import { STAGE_EXECUTORS } from './engine.tokens';

/** One executor per stage id (C6); a duplicate binding fails at boot, a missing one at first use. */
@Injectable()
export class ExecutorRegistry {
  private readonly byStage = new Map<StageId, StageExecutorPort>();

  constructor(@Inject(STAGE_EXECUTORS) executors: readonly StageExecutorPort[]) {
    for (const executor of executors) {
      if (this.byStage.has(executor.stageId)) throw new DuplicateStageExecutorError(executor.stageId);
      this.byStage.set(executor.stageId, executor);
    }
  }

  forStage(stageId: StageId): StageExecutorPort {
    const executor = this.byStage.get(stageId);
    if (executor === undefined) throw new MissingStageExecutorError(stageId);
    return executor;
  }
}
