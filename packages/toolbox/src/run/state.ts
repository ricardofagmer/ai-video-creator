import {
  afterQaPassed,
  nextState,
  stageAuthors,
  type PipelineStage,
  type RunFile,
  type StateEvent,
  type Transition,
  type VideoState,
} from '@studio/shared/ace';

export type Actor = 'toolbox' | 'claude-code' | `reviewer:${string}`;

export interface ApplyEventOptions {
  event: StateEvent;
  actor: Actor;
  reason?: string | null;
  inputHash?: string | null;
  resumeState?: VideoState;
}

/** Claude-written stages are credited to claude-code once the toolbox validated them. */
export function stageActor(stage: PipelineStage): Actor {
  return stageAuthors[stage];
}

function eventStage(event: StateEvent): PipelineStage | null {
  return 'stage' in event ? event.stage : null;
}

function withTransition(run: RunFile, to: VideoState, transition: Omit<Transition, 'from' | 'to' | 'at'>): RunFile {
  const at = new Date().toISOString();
  return {
    ...run,
    state: to,
    transitions: [...run.transitions, { from: run.state, to, at, ...transition }],
    updatedAt: at,
  };
}

/** Every state change goes through the contracts' nextState and leaves a Transition. */
export function applyEvent(run: RunFile, options: ApplyEventOptions): RunFile {
  const { event, actor } = options;
  const to = nextState(run.state, event, options.resumeState);
  const reason = options.reason ?? null;
  const moved = withTransition(run, to, { stage: eventStage(event), actor, reason, inputHash: options.inputHash ?? null });
  switch (event.type) {
    case 'STAGE_FAILED':
      return { ...moved, failedStage: event.stage, stateReason: reason };
    case 'STAGE_BLOCKED':
      return { ...moved, stateReason: reason };
    case 'RETRY_REQUESTED':
    case 'STAGE_SUCCEEDED':
      return { ...moved, failedStage: null, stateReason: null };
    default:
      return { ...moved, stateReason: reason };
  }
}

/** QA_PASSED is a pass-through: recorded as its own transition, then moved to REVIEW. */
export function applyAfterQaPassed(run: RunFile, actor: Actor): RunFile {
  return withTransition(run, afterQaPassed(run.state), { stage: null, actor, reason: 'qa passed; awaiting human review', inputHash: null });
}
