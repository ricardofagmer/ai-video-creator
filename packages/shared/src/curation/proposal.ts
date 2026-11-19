import { z } from 'zod';
import { CurationIdSchema, IsoDateTimeSchema, RunIdSchema, Sha256Schema } from '../common/ids';
import { curationBounds } from './constants';
import { CURATION_FORMAT_VERSION } from './curation-file';
import { CurationCheckIdSchema } from './enums';
import { CurationSubjectSchema } from './subject';

/** Line counts of the unified diff the ground check computed. */
export const CurationDiffStatsSchema = z
  .object({
    addedLines: z.number().int().min(0),
    removedLines: z.number().int().min(0),
  })
  .strict();
export type CurationDiffStats = z.infer<typeof CurationDiffStatsSchema>;

/**
 * `curations/<curationId>/proposal.json` (SPEC 0005 section 4.3): written once by the watcher, only
 * when the status becomes `proposed`. The diff is computed by the ground check from the subject
 * body and `newBody`; the model never writes it (AC 33). The api only reads this file.
 */
export const CurationProposalSchema = z
  .object({
    format: z.literal(CURATION_FORMAT_VERSION),
    curationId: CurationIdSchema,
    subject: CurationSubjectSchema,
    baseBodySha256: Sha256Schema,
    newBody: z.string().min(1).max(curationBounds.maxBodyChars),
    /** Unified line diff, computed by the ground check. */
    diff: z.string().max(curationBounds.diffChars),
    diffStats: CurationDiffStatsSchema,
    changeSummary: z.string().max(600),
    reason: z.string().max(1000),
    evidenceRunIds: z.array(RunIdSchema).min(1).max(curationBounds.maxEvidence),
    expectedEffect: z.string().max(300),
    suggestComparison: z.boolean(),
    checks: z
      .array(z.object({ id: CurationCheckIdSchema, passed: z.literal(true) }).strict())
      .max(CurationCheckIdSchema.options.length),
    attempt: z.number().int().min(1).max(curationBounds.maxCalls),
    modelId: z.string().max(100),
    instructionVersion: z.string().max(40),
    createdAt: IsoDateTimeSchema,
  })
  .strict();
export type CurationProposal = z.infer<typeof CurationProposalSchema>;
