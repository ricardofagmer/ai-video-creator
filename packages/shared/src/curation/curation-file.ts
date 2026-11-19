import { z } from 'zod';
import { CorrelationIdSchema, CurationIdSchema, IsoDateTimeSchema, SessionIdSchema } from '../common/ids';
import { curationBounds } from './constants';
import {
  CurationCheckIdSchema,
  CurationReasonIdSchema,
  CurationStatusSchema,
  isTerminalCurationStatus,
} from './enums';
import { CurationSubjectSchema } from './subject';

/** Version of the on-disk curation files; a reader refuses a higher number (ADR 0003 decision 5). */
export const CURATION_FORMAT_VERSION = 1;

/**
 * `curations/<curationId>/curation.json` (SPEC 0005 section 4.3). The api writes it once with
 * status `requested`; the watcher claims it and is its single writer after the claim.
 * `ownerFocus` is plain owner text here; it is delimited only when it enters the packet.
 * Rules: `requested` has no claim, 0 attempts and $0 spent; a terminal status has `endedAt`;
 * `proposed` has no `reasonId`; `noChangeReason` is present exactly when the status is `no-change`.
 */
export const CurationFileSchema = z
  .object({
    format: z.literal(CURATION_FORMAT_VERSION),
    curationId: CurationIdSchema,
    status: CurationStatusSchema,
    subject: CurationSubjectSchema,
    ownerFocus: z.string().min(1).max(curationBounds.focusChars).optional(),
    correlationId: CorrelationIdSchema,
    requestedAt: IsoDateTimeSchema,
    claim: z.object({ pid: z.number().int().positive(), claimedAt: IsoDateTimeSchema }).strict().optional(),
    attempts: z.number().int().min(0).max(curationBounds.maxCalls),
    spentUsd: z.number().nonnegative(),
    modelId: z.string().max(100).optional(),
    instructionVersion: z.string().max(40).optional(),
    sessionIds: z.array(SessionIdSchema).max(curationBounds.maxCalls),
    /** Set for `refused`, `failed` and `no-proposal`. */
    reasonId: CurationReasonIdSchema.optional(),
    failedChecks: z.array(CurationCheckIdSchema).max(CurationCheckIdSchema.options.length).optional(),
    /** The Curator's reason, status `no-change` only. */
    noChangeReason: z.string().max(1000).optional(),
    updatedAt: IsoDateTimeSchema,
    endedAt: IsoDateTimeSchema.optional(),
  })
  .strict()
  .superRefine((file, context) => {
    if (file.status === 'requested') {
      if (file.claim !== undefined) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['claim'], message: 'a requested curation has no claim' });
      }
      if (file.attempts !== 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['attempts'], message: 'a requested curation has 0 attempts' });
      }
      if (file.spentUsd !== 0) {
        context.addIssue({ code: z.ZodIssueCode.custom, path: ['spentUsd'], message: 'a requested curation has spent nothing' });
      }
    }
    if (isTerminalCurationStatus(file.status) && file.endedAt === undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['endedAt'], message: 'a terminal curation has endedAt' });
    }
    if (file.status === 'proposed' && file.reasonId !== undefined) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonId'], message: 'a proposed curation has no reasonId' });
    }
    if ((file.status === 'no-change') !== (file.noChangeReason !== undefined)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['noChangeReason'],
        message: 'noChangeReason is present exactly when the status is no-change',
      });
    }
  });
export type CurationFile = z.infer<typeof CurationFileSchema>;
