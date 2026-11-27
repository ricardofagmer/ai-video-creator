import { z } from 'zod';
import { AssetRefSchema } from '../catalog/asset-kind';

/**
 * Video reference analysis contracts (docs/specs/2026-11-23-guided-creation-design.md section 4).
 * One model call looks at frames sampled from a saved video reference; its answer is kept with the
 * reference and reaches the writer and the director as delimited data, never as instructions.
 */

/** Instruction version of the reference analyst; recorded in every job it answers. */
export const REFERENCE_ANALYST_PROMPT_VERSION = 'reference-analyst@1';

/** Most analyses one run carries to the writer and director, in run reference order. */
export const REFERENCE_ANALYSES_MAX = 5;

/** `script` stage output name of `reference-analyses.json`; `scenes` reads it as an optional input. */
export const REFERENCE_ANALYSES_OUTPUT = 'reference-analyses';
export const REFERENCE_ANALYSES_FILE_NAME = 'reference-analyses.json';

/** Analyst answer: bounded so a hostile video can never grow the writer and director packets. */
export const ReferenceStyleAnalysisSchema = z
  .object({
    summary: z.string().min(1).max(600),
    /** How the first seconds grab attention. */
    hook: z.string().max(300),
    /** Cut rhythm and scene length. */
    pacing: z.string().max(300),
    shots: z.array(z.string().min(1).max(200)).max(8),
    /** Caption and title style. */
    onScreenText: z.string().max(300),
    /** Colours, framing and motion. */
    visualStyle: z.string().max(400),
    /** Directions a writer or director can follow. */
    promptNotes: z.array(z.string().min(1).max(300)).min(1).max(6),
    cautions: z.array(z.string().min(1).max(200)).max(4),
  })
  .strict();
export type ReferenceStyleAnalysis = z.infer<typeof ReferenceStyleAnalysisSchema>;

/** One analysed reference as a run uses it; `mode: 'mock'` marks a simulated analysis. */
export const ReferenceAnalysisEntrySchema = z
  .object({
    ref: AssetRefSchema,
    mode: z.enum(['live', 'mock']),
    analysis: ReferenceStyleAnalysisSchema,
  })
  .strict();
export type ReferenceAnalysisEntry = z.infer<typeof ReferenceAnalysisEntrySchema>;

/** `reference-analyses.json`: exactly what the run's writer and director were given. */
export const ReferenceAnalysesArtifactSchema = z
  .object({
    format: z.literal(1),
    entries: z.array(ReferenceAnalysisEntrySchema).min(1).max(REFERENCE_ANALYSES_MAX),
  })
  .strict();
export type ReferenceAnalysesArtifact = z.infer<typeof ReferenceAnalysesArtifactSchema>;
