import { z } from 'zod';
import {
  ConnectionIdSchema,
  CorrelationIdSchema,
  IsoDateTimeSchema,
  PublishAttemptIdSchema,
  RunIdSchema,
  Sha256Schema,
} from '../common/ids';
import { AssetRefSchema } from '../catalog/asset-kind';
import { metricsBounds } from '../metrics/constants';
import { PlatformSchema } from '../metrics/enums';
import { publicationLineBounds, publishBounds } from './constants';
import { PlatformModeSchema, PublishFailureReasonSchema, PublishStateSchema, VisibilitySchema } from './enums';

/*
 * Publish files under `<data home>/platform/publish/<attemptId>/` (SPEC 0007 sections 4.3 and 4.6).
 * The owner's title, caption and tags exist only in `request.json` (mode `0600`) and go to the
 * platform only: never to SQLite, a log, an event, a response or `publications.jsonl`.
 */

/**
 * What the owner typed in the dialog (B4: nothing generates it). Tags are letters, digits and `_`
 * only, so no URL, markup or separator reaches a platform field.
 */
export const PublishMetadataSchema = z
  .object({
    title: z.string().trim().min(1).max(publishBounds.titleChars),
    caption: z.string().max(publishBounds.captionChars),
    // 50 is `publishBounds.tagChars`, kept literal so the pattern reads as SPEC 0007 section 4.3.
    tags: z.array(z.string().regex(/^[\p{L}\p{N}_]{1,50}$/u)).max(publishBounds.maxTags),
    visibility: VisibilitySchema,
    aiDisclosure: z.boolean(),
  })
  .strict();
export type PublishMetadata = z.infer<typeof PublishMetadataSchema>;

/** OD4: the biometric asset versions the owner confirmed by the click, and when (server clock). */
export const BiometricConfirmationSchema = z
  .object({
    refs: z.array(AssetRefSchema).max(publicationLineBounds.maxBiometricRefs),
    confirmedAt: IsoDateTimeSchema,
  })
  .strict();
export type BiometricConfirmation = z.infer<typeof BiometricConfirmationSchema>;

/**
 * `publish/<attemptId>/request.json`; writer: `RequestPublish` (api or CLI), written once and never
 * edited. `artifact` is always the run's `final.mp4`, as hashed at the request.
 */
export const PublishRequestFileSchema = z
  .object({
    format: z.literal(1),
    attemptId: PublishAttemptIdSchema,
    runId: RunIdSchema,
    platform: PlatformSchema,
    connectionId: ConnectionIdSchema,
    mode: PlatformModeSchema,
    requestedAt: IsoDateTimeSchema,
    expiresAt: IsoDateTimeSchema,
    requestedBy: z.string().min(1).max(100),
    createdBy: z.enum(['api', 'cli']),
    correlationId: CorrelationIdSchema.nullable(),
    artifact: z
      .object({ sha256: Sha256Schema, sizeBytes: z.number().int().positive().max(publishBounds.maxArtifactBytes) })
      .strict(),
    approvalDecidedAt: IsoDateTimeSchema,
    metadata: PublishMetadataSchema,
    biometric: BiometricConfirmationSchema,
  })
  .strict();
export type PublishRequestFile = z.infer<typeof PublishRequestFileSchema>;

/**
 * `publish/<attemptId>/state.json`; writer: the watcher only (atomic rewrite). Rules: `bytesSent`
 * never exceeds `bytesTotal`; `reasonId` is set exactly when `state` is `failed`; a `published`
 * state names the platform video id and `publishedAt`; `sent-to-inbox` carries `followUntil`.
 */
export const PublishStateFileSchema = z
  .object({
    format: z.literal(1),
    attemptId: PublishAttemptIdSchema,
    state: PublishStateSchema,
    since: IsoDateTimeSchema,
    bytesSent: z.number().int().nonnegative(),
    bytesTotal: z.number().int().nonnegative(),
    reasonId: PublishFailureReasonSchema.nullable(),
    platformVideoId: z.string().max(40).nullable(),
    platformMediaId: z.string().max(64).nullable(),
    publishedAt: IsoDateTimeSchema.nullable(),
    followUntil: IsoDateTimeSchema.nullable(),
    // Optional so files written before wave 4 still parse: the link the platform reported for a
    // `published` attempt whose URL the client cannot rebuild (TikTok), already checked by the
    // watcher with `parsePublicationUrl`. Core checks it again before linking.
    publicationUrl: z.string().max(metricsBounds.urlChars).nullable().optional(),
  })
  .strict()
  .superRefine((file, context) => {
    if (file.bytesSent > file.bytesTotal) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['bytesSent'], message: 'bytesSent exceeds bytesTotal' });
    }
    if ((file.state === 'failed') !== (file.reasonId !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['reasonId'], message: 'reasonId is set exactly when state is failed' });
    }
    if (file.state === 'published' && (file.platformVideoId === null || file.publishedAt === null)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['platformVideoId'],
        message: 'a published state names platformVideoId and publishedAt',
      });
    }
    if (file.state === 'sent-to-inbox' && file.followUntil === null) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['followUntil'], message: 'sent-to-inbox carries followUntil' });
    }
  });
export type PublishStateFile = z.infer<typeof PublishStateFileSchema>;
