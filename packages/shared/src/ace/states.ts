import { z } from 'zod';

export const videoStates = [
  'RESEARCH',
  'VERIFIED',
  'SCRIPTED',
  'ASSETS_READY',
  'NARRATED',
  'RENDERED',
  'QA_PASSED',
  'REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'ANALYZED',
  'FAILED',
  'BLOCKED',
] as const;

export const VideoStateSchema = z.enum(videoStates);
export type VideoState = z.infer<typeof VideoStateSchema>;

/** Pipeline stages that run as queue jobs, in order. */
export const pipelineStages = ['research', 'verify', 'script', 'assets', 'narrate', 'render', 'qa'] as const;
export const PipelineStageSchema = z.enum(pipelineStages);
export type PipelineStage = z.infer<typeof PipelineStageSchema>;

/** State a video is in while (or before) the given stage runs, and the state reached when it succeeds. */
export const stageStates: Record<PipelineStage, { runningIn: VideoState; succeedsTo: VideoState }> = {
  research: { runningIn: 'RESEARCH', succeedsTo: 'RESEARCH' },
  verify: { runningIn: 'RESEARCH', succeedsTo: 'VERIFIED' },
  script: { runningIn: 'VERIFIED', succeedsTo: 'SCRIPTED' },
  assets: { runningIn: 'SCRIPTED', succeedsTo: 'ASSETS_READY' },
  narrate: { runningIn: 'ASSETS_READY', succeedsTo: 'NARRATED' },
  render: { runningIn: 'NARRATED', succeedsTo: 'RENDERED' },
  qa: { runningIn: 'RENDERED', succeedsTo: 'QA_PASSED' },
};

export function nextStage(stage: PipelineStage): PipelineStage | null {
  const index = pipelineStages.indexOf(stage);
  return pipelineStages[index + 1] ?? null;
}

export type StateEvent =
  | { type: 'STAGE_SUCCEEDED'; stage: PipelineStage }
  | { type: 'STAGE_FAILED'; stage: PipelineStage; reason: string }
  | { type: 'STAGE_BLOCKED'; stage: PipelineStage; reason: string }
  | { type: 'RETRY_REQUESTED' }
  | { type: 'REVIEW_DECIDED'; decision: 'APPROVED' | 'REJECTED' }
  | { type: 'PUBLISHED' }
  | { type: 'ANALYZED' };

export class IllegalTransitionError extends Error {
  constructor(
    readonly from: VideoState,
    readonly event: StateEvent['type'],
  ) {
    super(`Illegal transition from ${from} on ${event}`);
    this.name = 'IllegalTransitionError';
  }
}

const terminalForStages: readonly VideoState[] = ['APPROVED', 'REJECTED', 'PUBLISHED', 'ANALYZED', 'BLOCKED'];

/**
 * Pure state machine. `research` and `verify` both run in RESEARCH; only `verify`
 * moves the video to VERIFIED. `qa` success reaches QA_PASSED, which callers
 * record as its own transition before `afterQaPassed` moves it to REVIEW.
 */
export function nextState(current: VideoState, event: StateEvent, resumeState?: VideoState): VideoState {
  switch (event.type) {
    case 'STAGE_SUCCEEDED': {
      const { runningIn, succeedsTo } = stageStates[event.stage];
      if (current !== runningIn) throw new IllegalTransitionError(current, event.type);
      return succeedsTo;
    }
    case 'STAGE_FAILED':
      if (terminalForStages.includes(current) || current === 'FAILED') throw new IllegalTransitionError(current, event.type);
      return 'FAILED';
    case 'STAGE_BLOCKED':
      if (terminalForStages.includes(current)) throw new IllegalTransitionError(current, event.type);
      return 'BLOCKED';
    case 'RETRY_REQUESTED':
      if (current !== 'FAILED' || !resumeState) throw new IllegalTransitionError(current, event.type);
      return resumeState;
    case 'REVIEW_DECIDED':
      if (current !== 'REVIEW') throw new IllegalTransitionError(current, event.type);
      return event.decision;
    case 'PUBLISHED':
      if (current !== 'APPROVED') throw new IllegalTransitionError(current, event.type);
      return 'PUBLISHED';
    case 'ANALYZED':
      if (current !== 'PUBLISHED') throw new IllegalTransitionError(current, event.type);
      return 'ANALYZED';
  }
}

/** QA_PASSED is a pass-through state: the qa processor records it, then moves to REVIEW. */
export function afterQaPassed(current: VideoState): VideoState {
  if (current !== 'QA_PASSED') throw new IllegalTransitionError(current, 'STAGE_SUCCEEDED');
  return 'REVIEW';
}
