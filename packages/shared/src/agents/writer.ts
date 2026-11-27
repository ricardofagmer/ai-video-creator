import { z } from 'zod';
import { JsonObjectSchema } from '../common/json';
import { BriefSchema, LanguageSchema } from '../recipes/brief';
import { packetBaseShape } from './packet-base';
import { LearningNotesBlockSchema, UntrustedTextSchema } from './packet-parts';
import { OutputContractSchema, WRITE_SCRIPT_TASK } from './protocol';

/**
 * A scene id as the Scriptwriter names it ("s1", "intro", "scene-2"). Model output: bounded to one
 * token of letters, digits, `-` and `_` (64 at most, as `sceneTimings` downstream), so it can
 * never carry a path, whitespace or a control sequence into logs, file names or the terminal.
 */
export const SceneIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/, 'expected a scene id: a letter or digit, then letters, digits, - or _, at most 64');

/** Most bound skill texts one agent packet carries: each may be a full delimited block. */
export const WRITER_SKILLS_MAX = 5;

/** Scriptwriter answer (topology section 5). */
export const ScriptOutputSchema = z
  .object({
    title: z.string().max(120),
    hook: z.string().max(300),
    scenes: z
      .array(
        z
          .object({
            sceneId: SceneIdSchema,
            narration: z.string(),
            onScreenText: z.string().max(80).optional(),
            claimIds: z.array(z.string()),
            estDurationSec: z.number().positive(),
          })
          .strict(),
      )
      .min(1),
    totalEstDurationSec: z.number().positive(),
  })
  .strict();
export type ScriptOutput = z.infer<typeof ScriptOutputSchema>;

/**
 * The Scriptwriter's own last script, carried inline on a retry: the Scriptwriter has no tools
 * and no memory (topology sections 3.1 and 6), so a pointer it cannot read would be useless.
 */
export const ScriptOutputRefSchema = ScriptOutputSchema;
export type ScriptOutputRef = z.infer<typeof ScriptOutputRefSchema>;

/**
 * Scriptwriter packet (topology section 5). Absent by construction (never sees): cost ledger, other
 * stages' session streams, biometric assets, credentials; and, since topology 0004 section 2,
 * retired notes, notes after the run's cutoff and notes on biometric versions.
 */
export const WriterPacketSchema = z
  .object({
    ...packetBaseShape,
    task: z.literal(WRITE_SCRIPT_TASK),
    inputs: z
      .object({
        brief: BriefSchema,
        verifiedClaims: z.array(
          z.object({ claimId: z.string(), text: z.string(), evidenceRef: z.string() }).strict(),
        ),
        /** The bound template version's props schema. */
        templateInputSchema: JsonObjectSchema,
        /** Bound prompt asset version, delimited. */
        promptText: UntrustedTextSchema,
        /** Bound skill asset versions (`skill:writer`, else every skill of the recipe), one delimited block each; absent when none is bound. */
        skillTexts: z.array(UntrustedTextSchema).min(1).max(WRITER_SKILLS_MAX).optional(),
        /** Brand-kit tone section, delimited. */
        brandVoice: UntrustedTextSchema.optional(),
        /**
         * The research stage's SiteAnalysis as JSON, delimited (site analysis spec): third-party
         * page content, so data only; the owner's brief and instructions win over it.
         */
        siteAnalysis: UntrustedTextSchema.optional(),
        /**
         * The kept style analyses of the run's video references as JSON, delimited (guided-creation
         * spec): AI notes about third-party videos, so data only; the owner's brief and instructions win.
         */
        referenceAnalyses: UntrustedTextSchema.optional(),
        /**
         * Every reference the owner put on the run (any sub-kind) as JSON, delimited: name, sub-kind,
         * the owner's notes and the content of a text reference. Data only, and it must be used.
         */
        ownerReferences: UntrustedTextSchema.optional(),
        targetDurationSec: z.number().int().positive(),
        language: LanguageSchema,
        /** Attempt > 1 only, from ReviewVerdict. */
        retryInstruction: z.string().min(1).optional(),
        /** Attempt > 1 only. */
        previousOutput: ScriptOutputRefSchema.optional(),
        /** Topology 0004 section 5: notes from `StageBrief.learnings`, delimited; `[]` when none. */
        learnings: LearningNotesBlockSchema,
      })
      .strict(),
    constraints: z
      .object({
        /** Every factual line cites a claimId. */
        claimsOnly: z.literal(true),
        /** Narration rate, from the recipe. */
        maxWordsPerSecond: z.number(),
        sceneCount: z.object({ min: z.number().int(), max: z.number().int() }).strict(),
      })
      .strict(),
    outputContract: z.literal(OutputContractSchema.enum.ScriptOutput),
  })
  .strict()
  .readonly();
export type WriterPacket = z.infer<typeof WriterPacketSchema>;
