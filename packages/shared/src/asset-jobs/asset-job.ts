import { z } from 'zod';
import { REFERENCE_ANALYST_PROMPT_VERSION, ReferenceStyleAnalysisSchema } from '../agents/reference-analysis';
import { AssetRefSchema } from '../catalog/asset-kind';
import { AssetPurposeSchema } from '../catalog/asset-version';
import { IsoDateTimeSchema } from '../common/ids';
import { LanguageSchema } from '../recipes/brief';

export const AssetJobKindSchema = z.enum(['voice-sample', 'reference-analysis', 'template-preview', 'asset-purpose']);
export type AssetJobKind = z.infer<typeof AssetJobKindSchema>;

/**
 * `requested` is written by the api, once per request; every later state is the watcher's. A
 * `failed` or `refused` job may be requested again, and so may a `done` one the owner replaces.
 */
export const AssetJobStatusSchema = z.enum(['requested', 'running', 'done', 'failed', 'refused']);
export type AssetJobStatus = z.infer<typeof AssetJobStatusSchema>;

export function isTerminalAssetJobStatus(status: AssetJobStatus): boolean {
  return status === 'done' || status === 'failed' || status === 'refused';
}

/**
 * Why a job did not finish. Ids only: no path, provider text, model text or stack reaches a job
 * file. `refused` codes are decided before anything is spent.
 */
export const AssetJobErrorCodeSchema = z.enum([
  // refused
  'month-ceiling',
  'month-spend-unavailable',
  'biometric-refused',
  'not-supported',
  // failed
  'asset-missing',
  'credential-refused',
  'provider-error',
  'rate-limited',
  'timed-out',
  'tool-missing',
  /** A link reference whose video could not be fetched: blocked, private, removed or too large. */
  'download-failed',
  'media-unreadable',
  'output-invalid',
  'claimant-gone',
]);
export type AssetJobErrorCode = z.infer<typeof AssetJobErrorCodeSchema>;

const jobBaseShape = {
  format: z.literal(1),
  ref: AssetRefSchema,
  status: AssetJobStatusSchema,
  requestedAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
  /** Set by the watcher at its claim. */
  claim: z.object({ pid: z.number().int().positive(), claimedAt: IsoDateTimeSchema }).strict().optional(),
  /** `mock` when the provider was not live: a stand-in result, $0, no connection. */
  mode: z.enum(['live', 'mock']).optional(),
  error: z.object({ code: AssetJobErrorCodeSchema, at: IsoDateTimeSchema }).strict().optional(),
  /** What the job billed; 0 in mock mode. */
  usd: z.number().nonnegative().optional(),
};

export const VoiceSampleEngineSchema = z.enum(['elevenlabs', 'local-voice', 'mock']);
export type VoiceSampleEngine = z.infer<typeof VoiceSampleEngineSchema>;

export const VoiceSampleAudioSchema = z.enum(['mp3', 'wav']);
export type VoiceSampleAudio = z.infer<typeof VoiceSampleAudioSchema>;

export const VoiceSampleJobFileSchema = z
  .object({
    ...jobBaseShape,
    kind: z.literal('voice-sample'),
    /** Picks the sentence of `VOICE_SAMPLE_TEXT`; the text itself is never stored or requested. */
    language: LanguageSchema,
    engine: VoiceSampleEngineSchema.optional(),
    audio: VoiceSampleAudioSchema.optional(),
  })
  .strict();
export type VoiceSampleJobFile = z.infer<typeof VoiceSampleJobFileSchema>;

export const ReferenceAnalysisJobFileSchema = z
  .object({
    ...jobBaseShape,
    kind: z.literal('reference-analysis'),
    promptVersion: z.literal(REFERENCE_ANALYST_PROMPT_VERSION).optional(),
    /** Frames actually sent to the model. */
    frames: z.number().int().min(0).max(32).optional(),
    analysis: ReferenceStyleAnalysisSchema.optional(),
  })
  .strict();
export type ReferenceAnalysisJobFile = z.infer<typeof ReferenceAnalysisJobFileSchema>;

/**
 * A short muted clip of a template rendered from its sample input, so the catalog card shows what the
 * template does. Requested when the template version is registered; rendered on this machine, $0.
 */
export const TemplatePreviewJobFileSchema = z
  .object({
    ...jobBaseShape,
    kind: z.literal('template-preview'),
    /** Set when the clip and its poster are in the job folder. */
    clip: z.literal('mp4').optional(),
    durationS: z.number().positive().max(60).optional(),
  })
  .strict();
export type TemplatePreviewJobFile = z.infer<typeof TemplatePreviewJobFileSchema>;

/**
 * Version of the asset purpose writer's prompt (ADR 0012); the watcher records it in every `done`
 * job. Bump it on any change to `asset-purpose.prompt.ts`.
 */
export const ASSET_PURPOSE_PROMPT_VERSION = 'asset-purpose@2';

/** Every version a stored `done` job may carry, so job files written by an older prompt still parse. */
const ASSET_PURPOSE_PROMPT_VERSIONS = ['asset-purpose@1', ASSET_PURPOSE_PROMPT_VERSION] as const;

/**
 * ADR 0012 (C-P3): the purpose text of one catalog version, written by the tool-less purpose writer
 * from the version's metadata (name, kind and tags only for a biometric row). The api copies a
 * `done` text into the row on its next read unless the owner wrote the purpose.
 */
export const AssetPurposeJobFileSchema = z
  .object({
    ...jobBaseShape,
    kind: z.literal('asset-purpose'),
    promptVersion: z.enum(ASSET_PURPOSE_PROMPT_VERSIONS).optional(),
    /** C-P1 `purpose`, never empty once the job is `done`. */
    purpose: AssetPurposeSchema.min(1).optional(),
  })
  .strict();
export type AssetPurposeJobFile = z.infer<typeof AssetPurposeJobFileSchema>;

/** `job.json`. A `done` job always carries its result; a `failed` or `refused` one its error. */
export const AssetJobFileSchema = z
  .discriminatedUnion('kind', [VoiceSampleJobFileSchema, ReferenceAnalysisJobFileSchema, TemplatePreviewJobFileSchema, AssetPurposeJobFileSchema])
  .superRefine((job, context) => {
    const issue = (path: string, message: string): void => context.addIssue({ code: 'custom', path: [path], message });
    if ((job.status === 'failed' || job.status === 'refused') && job.error === undefined) issue('error', 'an ended job without a result needs its error');
    if (job.status !== 'done') return;
    if (job.mode === undefined) issue('mode', 'a done job records its mode');
    if (job.kind === 'voice-sample' && (job.engine === undefined || job.audio === undefined)) issue('audio', 'a done voice sample records its engine and audio');
    if (job.kind === 'reference-analysis' && job.analysis === undefined) issue('analysis', 'a done analysis carries its result');
    if (job.kind === 'template-preview' && (job.clip === undefined || job.durationS === undefined)) issue('clip', 'a done template preview records its clip');
    if (job.kind === 'asset-purpose' && (job.purpose === undefined || job.promptVersion === undefined)) issue('purpose', 'a done purpose job carries its text and prompt version');
  });
export type AssetJobFile = z.infer<typeof AssetJobFileSchema>;

/** One `egress.jsonl` line of a job: what left the machine, in counts only. */
export const AssetJobEgressLineSchema = z
  .object({
    at: IsoDateTimeSchema,
    /** A platform name means one request for that platform's own post (a link reference's video). */
    provider: z.enum(['claude', 'elevenlabs', 'instagram', 'youtube', 'tiktok', 'vimeo', 'dailymotion', 'facebook', 'x', 'twitch']),
    /** `purpose-text`: the purpose writer's message (ADR 0012), counted in characters. */
    what: z.enum(['reference-frames', 'tts-text', 'video-download', 'purpose-text']),
    /** Frames or characters sent; 1 for a video download. */
    amount: z.number().int().nonnegative(),
    bytes: z.number().int().nonnegative().optional(),
  })
  .strict();
export type AssetJobEgressLine = z.infer<typeof AssetJobEgressLineSchema>;
