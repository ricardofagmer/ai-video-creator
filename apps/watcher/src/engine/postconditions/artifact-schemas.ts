import { PlanOutputSchema, ReviewVerdictSchema, ScenesOutputSchema, ScriptOutputSchema } from '@studio/shared/agents';
import { RunFileError, RunFileSchemaError, readJsonFile, resolveInsideRunReal } from '@studio/shared/run-files';
import { CostFileSchema, QaMetricsSchema, QaSummarySchema, RunManifestSchema } from '@studio/shared/run-format';
import { type z } from 'zod';

/**
 * Stage outputs whose content has a frozen schema (C3, C7), keyed by output name. The `verify`
 * check `output-schema` parses each declared output found here; names are the C7 artifact ids
 * where one exists (`plan`, `script`, `scenes`, `qa-metrics`) and `review-<subject>` for the
 * Reviewer verdicts kept in `qa/`.
 */
const artifactSchemas: Readonly<Record<string, z.ZodTypeAny>> = {
  plan: PlanOutputSchema,
  script: ScriptOutputSchema,
  scenes: ScenesOutputSchema,
  'review-script': ReviewVerdictSchema,
  'review-scenes': ReviewVerdictSchema,
  'review-render': ReviewVerdictSchema,
  'qa-metrics': QaMetricsSchema,
  manifest: RunManifestSchema,
  cost: CostFileSchema,
  'qa-summary': QaSummarySchema,
};

export type ArtifactValidation = { status: 'valid' } | { status: 'invalid'; problem: string } | { status: 'no-schema' };

/** Parses one declared output with its schema; a contract error becomes an `invalid` verdict. */
export async function validateArtifact(runDir: string, output: { name: string; path: string }): Promise<ArtifactValidation> {
  const schema = artifactSchemas[output.name];
  if (schema === undefined) return { status: 'no-schema' };
  try {
    await readJsonFile(await resolveInsideRunReal(runDir, output.path), schema);
    return { status: 'valid' };
  } catch (error) {
    if (error instanceof RunFileSchemaError) {
      return { status: 'invalid', problem: `${output.name}: ${error.problems.slice(0, 3).join('; ')}` };
    }
    if (error instanceof RunFileError) return { status: 'invalid', problem: `${output.name}: ${error.code}` };
    throw error;
  }
}
