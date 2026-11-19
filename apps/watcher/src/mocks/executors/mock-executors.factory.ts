import type { StageExecutorPort } from '@studio/shared/ports';
import { agentReviewBehaviour, qaBehaviour } from './delivery.behaviours';
import { MockStageExecutor, type MockExecutorDependencies } from './mock-stage-executor';
import { type MockStageBehaviour } from './mock-stage-behaviour';
import { packageBehaviour } from './package.behaviour';
import { captionsBehaviour, compositionBehaviour, fadesBehaviour, musicBehaviour } from './post.behaviours';
import { planBehaviour, researchBehaviour, scriptBehaviour, verifyBehaviour } from './pre-production.behaviours';
import { captureBehaviour, narrationBehaviour, scenesBehaviour } from './production.behaviours';

/** One behaviour per stage of SPEC 0002 A5, in canonical order. */
const mockBehaviours: readonly MockStageBehaviour[] = [
  planBehaviour,
  researchBehaviour,
  verifyBehaviour,
  scriptBehaviour,
  captureBehaviour,
  scenesBehaviour,
  narrationBehaviour,
  compositionBehaviour,
  captionsBehaviour,
  fadesBehaviour,
  musicBehaviour,
  qaBehaviour,
  agentReviewBehaviour,
  packageBehaviour,
];

/** The fourteen mock stage executors bound to `STAGE_EXECUTORS` in mock mode. */
export function createMockStageExecutors(dependencies: MockExecutorDependencies): StageExecutorPort[] {
  return mockBehaviours.map((behaviour) => new MockStageExecutor(behaviour, dependencies));
}
