import { z } from 'zod';
import { IsoDateTimeSchema, PublicationIdSchema, PublishAttemptIdSchema, RunIdSchema, Sha256Schema, UlidSchema } from '../common/ids';
import { AssetKindSchema, AssetRefSchema } from '../catalog/asset-kind';
import { PlatformSchema } from '../metrics/enums';
import { publicationLineBounds, publishBounds } from '../platforms/constants';
import { CapabilityStatusSchema, PlatformModeSchema, PublishFailureReasonSchema, PublishStateSchema, VisibilitySchema } from '../platforms/enums';
import { PublishMetadataSchema } from '../platforms/publish-files';
import { RunPublicationLineSchema } from '../run-format/publications';
import { ApiRev7ErrorReasonSchema } from './common';

/*
 * C10 rev 7 publish routes (SPEC 0007 sections 4.4 and 5.4). `requestedBy`, the biometric
 * confirmation time and `correlationId` come from the session, the server clock and
 * `x-request-id`. The api makes no platform call on these routes: the watcher uploads between runs.
 * No response carries a title, a caption, a tag, a URL or an asset path.
 */

/** `GET /runs/:runId/publish`. */
export const RunPublishParamsSchema = z.object({ runId: RunIdSchema }).strict();
export type RunPublishParams = z.infer<typeof RunPublishParamsSchema>;

/** `POST /runs/:runId/publish/:platform`; `:platform` is checked with `PlatformSchema`. */
export const PublishParamsSchema = z.object({ runId: RunIdSchema, platform: PlatformSchema }).strict();
export type PublishParams = z.infer<typeof PublishParamsSchema>;

/** `DELETE /runs/:runId/publish/attempts/:attemptId`; `:attemptId` is checked with `PublishAttemptIdSchema`. */
export const PublishAttemptParamsSchema = z.object({ runId: RunIdSchema, attemptId: PublishAttemptIdSchema }).strict();
export type PublishAttemptParams = z.infer<typeof PublishAttemptParamsSchema>;

/**
 * `POST /runs/:runId/publish/:platform` body (section 5.4). `idempotencyKey` is created when the
 * dialog opens, so a double click sends the same key. `biometricRefs` must equal the set the server
 * derives now (`publish-biometric-mismatch`); `artifactSha256` must equal the hash the dialog showed
 * and the manifest's (`publish-artifact-changed`); `metadata.visibility` must be in
 * `allowedVisibilities[platform]` (`publish-visibility-not-allowed`).
 */
export const PublishRequestSchema = z
  .object({
    idempotencyKey: UlidSchema,
    metadata: PublishMetadataSchema,
    biometricRefs: z.array(AssetRefSchema).max(publicationLineBounds.maxBiometricRefs),
    artifactSha256: Sha256Schema,
  })
  .strict();
export type PublishRequest = z.infer<typeof PublishRequestSchema>;

/**
 * One attempt as the dialog shows it; 202 on a new attempt, 200 when `idempotencyKey` repeats, and
 * the answer of a cancel (`cancelled`). No title, caption or tag is returned.
 */
export const PublishAttemptViewSchema = z
  .object({
    attemptId: PublishAttemptIdSchema,
    runId: RunIdSchema,
    platform: PlatformSchema,
    mode: PlatformModeSchema,
    state: PublishStateSchema,
    since: IsoDateTimeSchema,
    bytesSent: z.number().int().nonnegative(),
    bytesTotal: z.number().int().nonnegative(),
    reasonId: PublishFailureReasonSchema.nullable(),
    expiresAt: IsoDateTimeSchema,
    publicationId: PublicationIdSchema.nullable(),
    requestedAt: IsoDateTimeSchema,
  })
  .strict();
export type PublishAttemptView = z.infer<typeof PublishAttemptViewSchema>;

/** A biometric asset version of the run, named by title, kind and ref, never by path (OD4). */
export const PublishBiometricAssetViewSchema = z
  .object({ ref: AssetRefSchema, title: z.string().min(1).max(200), kind: AssetKindSchema })
  .strict();
export type PublishBiometricAssetView = z.infer<typeof PublishBiometricAssetViewSchema>;

/**
 * One platform tab of the dialog. `status` is the `publish` capability status. Rule: `refusal` is
 * set exactly when `eligible` is false; Instagram reads `unsupported` and refusal
 * `platform-publish-unsupported` (OD8).
 */
export const PublishPlatformViewSchema = z
  .object({
    platform: PlatformSchema,
    mode: PlatformModeSchema,
    status: CapabilityStatusSchema,
    eligible: z.boolean(),
    refusal: ApiRev7ErrorReasonSchema.nullable(),
    allowedVisibilities: z.array(VisibilitySchema).max(VisibilitySchema.options.length),
    publicationId: PublicationIdSchema.nullable(),
  })
  .strict()
  .superRefine((entry, context) => {
    if (entry.eligible === (entry.refusal !== null)) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ['refusal'], message: 'refusal is set exactly when eligible is false' });
    }
  });
export type PublishPlatformView = z.infer<typeof PublishPlatformViewSchema>;

/**
 * `GET /runs/:runId/publish` (200), after `PublishAttemptSync`. `artifact` is `final.mp4` with the
 * manifest's hash, null when it is missing. `attempts` are the newest 10, newest first;
 * `leftTheMachine` the newest `publications.jsonl` lines, oldest first, shown after
 * `manifest.json.egress` under "O que saiu da máquina".
 */
export const RunPublishViewSchema = z
  .object({
    runId: RunIdSchema,
    approved: z.boolean(),
    artifact: z.object({ sha256: Sha256Schema, sizeBytes: z.number().int().positive() }).strict().nullable(),
    biometricAssets: z.array(PublishBiometricAssetViewSchema).max(publicationLineBounds.maxBiometricRefs),
    platforms: z.array(PublishPlatformViewSchema).length(PlatformSchema.options.length),
    attempts: z.array(PublishAttemptViewSchema).max(publishBounds.attemptsShown),
    leftTheMachine: z.array(RunPublicationLineSchema).max(publicationLineBounds.linesShown),
  })
  .strict();
export type RunPublishView = z.infer<typeof RunPublishViewSchema>;
