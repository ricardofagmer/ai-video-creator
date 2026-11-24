import { z } from 'zod';
import { ReferenceStyleAnalysisSchema } from '../agents/reference-analysis';
import { AssetJobErrorCodeSchema, AssetJobStatusSchema, VoiceSampleAudioSchema, VoiceSampleEngineSchema } from '../asset-jobs/asset-job';
import { AssetRefSchema } from '../catalog/asset-kind';
import { IsoDateTimeSchema } from '../common/ids';
import { LanguageSchema } from '../recipes/brief';

/**
 * Asset job routes (docs/specs/2026-11-23-guided-creation-design.md sections 2 and 4), all
 * additive, all behind the session guard, the two POSTs behind the `Origin` allowlist:
 *
 * | Method | Path | Body | Success |
 * |---|---|---|---|
 * | POST | /catalog/assets/:assetId/versions/:version/voice-sample | RequestVoiceSampleRequest | 202 VoiceSampleView |
 * | GET | /catalog/assets/:assetId/versions/:version/voice-sample | - | 200 VoiceSampleView |
 * | GET | /catalog/assets/:assetId/versions/:version/voice-sample/audio | - | 200 audio bytes, `Cache-Control: no-store` |
 * | POST | /catalog/assets/:assetId/versions/:version/reference-analysis | - | 202 ReferenceAnalysisView |
 * | GET | /catalog/assets/:assetId/versions/:version/reference-analysis | - | 200 ReferenceAnalysisView |
 *
 * No view carries a file path, a provider's text or the sample sentence's source; a refusal
 * writes nothing.
 */

/** `status: 'none'`: the version never had this job. */
export const AssetJobViewStatusSchema = z.enum(['none', ...AssetJobStatusSchema.options]);
export type AssetJobViewStatus = z.infer<typeof AssetJobViewStatusSchema>;

const jobViewShape = {
  ref: AssetRefSchema,
  status: AssetJobViewStatusSchema,
  mode: z.enum(['live', 'mock']).nullable(),
  errorCode: AssetJobErrorCodeSchema.nullable(),
  updatedAt: IsoDateTimeSchema.nullable(),
};

export const RequestVoiceSampleRequestSchema = z
  .object({
    /** Picks the fixed sentence; never free text. */
    language: LanguageSchema,
    /** True replaces a kept sample; a failed, refused or mock-while-live sample is replaced without it. */
    replace: z.boolean().optional(),
  })
  .strict();
export type RequestVoiceSampleRequest = z.infer<typeof RequestVoiceSampleRequestSchema>;

export const VoiceSampleViewSchema = z
  .object({
    ...jobViewShape,
    language: LanguageSchema.nullable(),
    engine: VoiceSampleEngineSchema.nullable(),
    audio: VoiceSampleAudioSchema.nullable(),
  })
  .strict();
export type VoiceSampleView = z.infer<typeof VoiceSampleViewSchema>;

/** Why a version that could have an analysis has no job, so the page can say it. */
export const ReferenceAnalysisUnavailableSchema = z.enum(['not-a-video-reference', 'link-only', 'biometric']);
export type ReferenceAnalysisUnavailable = z.infer<typeof ReferenceAnalysisUnavailableSchema>;

export const ReferenceAnalysisViewSchema = z
  .object({
    ...jobViewShape,
    /** Null when the version can be analysed. */
    unavailable: ReferenceAnalysisUnavailableSchema.nullable(),
    frames: z.number().int().min(0).max(32).nullable(),
    analysis: ReferenceStyleAnalysisSchema.nullable(),
  })
  .strict();
export type ReferenceAnalysisView = z.infer<typeof ReferenceAnalysisViewSchema>;

/**
 * The `ApiError.reason` values the guided-creation spec adds, with their status codes.
 * `composition-conflict` carries `details.conflicts`. `month-spend-unavailable` (503) is reused.
 */
export const apiGuidedCreationErrorReasons = Object.freeze({
  'composition-conflict': 422,
  'asset-job-not-a-voice': 422,
  'asset-job-not-a-video-reference': 422,
  'asset-job-link-only': 422,
  'asset-job-biometric-refused': 422,
  'asset-job-queue-full': 409,
  'asset-job-sample-not-ready': 404,
});
export type ApiGuidedCreationErrorReason = keyof typeof apiGuidedCreationErrorReasons;
