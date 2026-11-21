import { z } from 'zod';
import { IsoDateTimeSchema, PublishAttemptIdSchema, Sha256Schema } from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { PlatformSchema } from '../metrics/enums';
import { publicationLineBounds, publishBounds } from '../platforms/constants';
import { PlatformModeSchema, PublishFailureReasonSchema, VisibilitySchema } from '../platforms/enums';

/**
 * One line of `runs/<runId>/publications.jsonl` (SPEC 0007 sections 4.3 and 5.4): what left the
 * machine after approval. Append-only, written by the watcher only for a run whose status is
 * `approved`: `upload-started` before the first byte, then one closing line. An optional file, so
 * `format` stays 1 and a missing file reads as empty. Sizes, hashes, the visibility and the
 * confirmed biometric refs only: no title, caption, tag, URL, path or account label.
 * Rules: `reasonId` is set exactly when `event` is `failed`; a `published` line names the
 * platform video id.
 */
export const RunPublicationLineSchema = z
  .object({
    at: IsoDateTimeSchema,
    attemptId: PublishAttemptIdSchema,
    platform: PlatformSchema,
    mode: PlatformModeSchema,
    event: z.enum(['upload-started', 'published', 'sent-to-inbox', 'failed', 'outcome-unknown']),
    sizeBytes: z.number().int().positive().max(publishBounds.maxArtifactBytes),
    artifactSha256: Sha256Schema,
    visibility: VisibilitySchema,
    biometricRefs: z.array(AssetRefSchema).max(publicationLineBounds.maxBiometricRefs),
    platformVideoId: z.string().max(40).nullable(),
    reasonId: PublishFailureReasonSchema.nullable(),
  })
  .strict()
  .superRefine((line, context) => {
    if ((line.event === 'failed') !== (line.reasonId !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonId'], message: 'reasonId is set exactly when event is failed' });
    }
    if (line.event === 'published' && line.platformVideoId === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['platformVideoId'], message: 'a published line names platformVideoId' });
    }
  });
export type RunPublicationLine = z.infer<typeof RunPublicationLineSchema>;
