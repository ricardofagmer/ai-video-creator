import { type Language } from '../recipes/brief';

/**
 * Asset jobs (docs/specs/2026-11-23-guided-creation-design.md): work on one catalog version outside
 * any run. A job is the folder `<data home>/asset-jobs/<jobKind>/<assetId>@<version>/`.
 */
export const ASSET_JOBS_FOLDER_NAME = 'asset-jobs';

/** Most `requested` jobs of one kind; the api refuses the next request with `asset-job-queue-full`. */
export const ASSET_JOB_QUEUE_MAX = 10;

/** The only file names a job folder may hold. */
export const assetJobFileNames = {
  job: 'job.json',
  egress: 'egress.jsonl',
  sampleMp3: 'sample.mp3',
  sampleWav: 'sample.wav',
  /** Billed calls of this job, written by the watcher and indexed by the api (spec Amendment 3). */
  cost: 'cost.json',
} as const;
export type AssetJobFileKey = keyof typeof assetJobFileNames;

/**
 * The one sentence every voice speaks, per recipe language, so voices compare fairly. A constant on
 * purpose: no request field ever reaches a voice engine (spec AC2).
 */
export const VOICE_SAMPLE_TEXT: Readonly<Record<Language, string>> = {
  'pt-BR': 'Olá! Esta é uma amostra desta voz para você decidir se ela combina com o seu vídeo.',
  'en-US': 'Hi! This is a sample of this voice so you can decide if it fits your video.',
};

/** Bounds of one reference analysis (spec section 4). */
export const referenceAnalysisBounds = Object.freeze({
  /** Frames sampled evenly across the video. */
  frames: 8,
  frameMaxWidthPx: 1280,
  /** One JPEG frame; a larger frame is dropped, not sent. */
  frameMaxBytes: 1_500_000,
  maxOutputTokens: 2000,
  callTimeoutMs: 120_000,
  /** Checked before the call against the month ceiling; a call that could cost more is refused. */
  worstCaseUsd: 0.25,
});

/**
 * Bounds of the temporary download of a link reference's video
 * (docs/specs/2026-11-24-link-reference-analysis-design.md). The file is sampled and deleted.
 */
export const referenceDownloadBounds = Object.freeze({
  timeoutMs: 120_000,
  maxFileBytes: 200 * 1024 * 1024,
  /** A longer video is not a short-form style reference; it is refused before it is fetched. */
  maxDurationSeconds: 600,
  maxHeightPx: 720,
});

/**
 * Most billed calls one job folder's cost.json may hold. Each request bills at most one call and a
 * re-request keeps the file, so this is the lifetime count of replacements of one version; the
 * next record past it is refused (fails closed) rather than dropping spend.
 */
export const ASSET_JOB_COST_SESSIONS_MAX = 1000;

/** Bounds of one voice sample job. */
export const voiceSampleBounds = Object.freeze({
  jobTimeoutMs: 120_000,
  /** A sample is one sentence; a larger clip is not a sample. */
  audioMaxBytes: 5 * 1024 * 1024,
});
