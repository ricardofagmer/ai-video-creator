import type { StageExecutionContext } from '@studio/shared/ports';
import { readJsonFile, resolveInsideRun } from '@studio/shared/run-files';
import { z } from 'zod';

/**
 * Mock-only artifacts that have no frozen schema yet (research, claims, captures, narration).
 * R1-14 owns their real shapes; these schemas only keep the mock stages consistent.
 */

const ClaimSchema = z.object({ claimId: z.string().min(1), text: z.string().min(1), evidenceRef: z.string().min(1) }).strict();

export const MockResearchSchema = z.object({ notes: z.array(z.string().min(1)).min(1), candidateClaims: z.array(ClaimSchema) }).strict();
export const MockClaimsSchema = z.object({ verified: z.array(ClaimSchema), rejected: z.array(z.string()) }).strict();
export const MockCapturesIndexSchema = z
  .object({
    sourceUrl: z.string().nullable(),
    captures: z.array(z.object({ captureId: z.string().min(1), label: z.string(), durationMs: z.number().int().positive() }).strict()).min(1),
  })
  .strict();
export const MockNarrationIndexSchema = z
  .object({
    voice: z.string().min(1),
    lines: z.array(z.object({ sceneId: z.string().min(1), characters: z.number().int().nonnegative() }).strict()).min(1),
  })
  .strict();
export const MockMediaReviewSchema = z.object({ status: z.enum(['passed', 'passed-with-warnings']), notes: z.array(z.string()) }).strict();

export class MissingMockInputError extends Error {
  constructor(
    readonly stageId: string,
    readonly inputName: string,
  ) {
    super(`Mock stage ${stageId} needs the earlier output "${inputName}", which its stage brief does not list`);
    this.name = 'MissingMockInputError';
  }
}

/** Reads an earlier stage's output listed in this stage's brief inputs, validated by its schema. */
export async function readStageInput<T>(
  context: StageExecutionContext,
  name: string,
  schema: z.ZodType<T, unknown>,
): Promise<T> {
  const input = context.stageBrief.inputs.find((candidate) => candidate.name === name);
  if (input === undefined) throw new MissingMockInputError(context.stage.stageId, name);
  return readJsonFile(resolveInsideRun(context.runDir, input.path), schema);
}
