import { z } from 'zod';
import { StageIdSchema, StepNameSchema, type StageId, type StepName } from './vocabulary';

/** `stageId:step:attempt` (topology section 10). */
const stepKeyPattern = new RegExp(
  `^(${StageIdSchema.options.join('|')}):(${StepNameSchema.options.join('|')}):([1-9][0-9]{0,2})$`,
);

export const StepKeySchema = z.string().regex(stepKeyPattern, 'expected stageId:step:attempt');
export type StepKey = z.infer<typeof StepKeySchema>;

export interface StepCoordinates {
  stageId: StageId;
  step: StepName;
  attempt: number;
}

export class InvalidStepKeyError extends Error {
  constructor(readonly stepKey: string) {
    super(`Invalid step key "${stepKey}": expected stageId:step:attempt`);
    this.name = 'InvalidStepKeyError';
  }
}

export function formatStepKey(coordinates: StepCoordinates): StepKey {
  const stepKey = `${coordinates.stageId}:${coordinates.step}:${coordinates.attempt}`;
  if (!stepKeyPattern.test(stepKey)) throw new InvalidStepKeyError(stepKey);
  return stepKey;
}

export function parseStepKey(stepKey: string): StepCoordinates {
  const match = stepKeyPattern.exec(stepKey);
  const stageId = StageIdSchema.safeParse(match?.[1]);
  const step = StepNameSchema.safeParse(match?.[2]);
  const attempt = match?.[3];
  if (!stageId.success || !step.success || attempt === undefined) throw new InvalidStepKeyError(stepKey);
  return { stageId: stageId.data, step: step.data, attempt: Number.parseInt(attempt, 10) };
}
