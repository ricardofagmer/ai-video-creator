import { z } from 'zod';
import { PipelineStageSchema, VideoStateSchema } from './states';
import { ContentPillarSchema, TemplateIdSchema } from './templates';
import { QaCheckSchema, SeoPackageSchema } from './manifests';

/**
 * A production run is one folder on disk: runs/<runId>/. Claude Code writes the
 * research, claims, script and editorial files; the `ace` toolbox writes the rest
 * and owns run.json (state, transitions, costs, approval).
 */
export const runFiles = {
  run: 'run.json',
  research: 'research.json',
  verify: 'claims.json',
  script: 'script.json',
  assets: 'assets.json',
  assetsDir: 'assets',
  narrate: 'narration.json',
  narrationAudio: 'narration.mp3',
  render: 'render.json',
  video: 'video.mp4',
  thumbnail: 'thumbnail.png',
  preview: 'preview.mp4',
  editorial: 'editorial.json',
  qa: 'qa.json',
} as const;

/** Who writes each stage's manifest. */
export const stageAuthors: Record<z.infer<typeof PipelineStageSchema>, 'claude-code' | 'toolbox'> = {
  research: 'claude-code',
  verify: 'claude-code',
  script: 'claude-code',
  assets: 'toolbox',
  narrate: 'toolbox',
  render: 'toolbox',
  qa: 'toolbox',
};

export const RunIdSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}-s[1-4]-[a-z0-9-]{1,40}$/, 'runId must look like 2026-11-16-s1-meeting-notes');

export const TransitionSchema = z.object({
  from: VideoStateSchema.nullable(),
  to: VideoStateSchema,
  stage: PipelineStageSchema.nullable(),
  actor: z.string(),
  reason: z.string().nullable(),
  inputHash: z.string().nullable(),
  at: z.string().datetime(),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const CostRowSchema = z.object({
  stage: PipelineStageSchema,
  provider: z.string(),
  unit: z.string(),
  quantity: z.number(),
  usdEstimate: z.number(),
  requestId: z.string().optional(),
});
export type CostRow = z.infer<typeof CostRowSchema>;

/** The 8 publish-review items from fagmer-video-producer references/quality-checklist.md. */
export const publishChecklistItems = [
  'claimsVerified',
  'toolFactsCurrent',
  'mediaLicensesDocumented',
  'noPersonalOrConfidentialData',
  'technicalSpecOk',
  'metadataAndDisclosuresAccurate',
  'previewWatchedFully',
  'accountAndPermissionConfirmed',
] as const;
export type PublishChecklistItem = (typeof publishChecklistItems)[number];

export const publishChecklistLabels: Record<PublishChecklistItem, string> = {
  claimsVerified: 'Claims verified from sources or reproducible test',
  toolFactsCurrent: 'Tool name, UI, pricing and availability current on review date',
  mediaLicensesDocumented: 'All media licenses and voice rights documented',
  noPersonalOrConfidentialData: 'No personal information, keys, client accounts or confidential screens',
  technicalSpecOk: '70-90 s, vertical 1080x1920, intelligible narration, captions in safe region',
  metadataAndDisclosuresAccurate: 'Thumbnail, title, hashtags, affiliation and AI disclosures accurate',
  previewWatchedFully: 'Video preview watched beginning to end',
  accountAndPermissionConfirmed: 'Correct creator account, visibility settings and explicit permission recorded',
};

export const ApprovalSchema = z
  .object({
    decision: z.enum(['APPROVED', 'REJECTED']),
    reviewer: z.string().min(1).max(100),
    reason: z.string().max(1000).nullable(),
    checklist: z.record(z.enum(publishChecklistItems), z.boolean()),
    decidedAt: z.string().datetime(),
  })
  .superRefine((value, context) => {
    if (value.decision === 'APPROVED') {
      const missing = publishChecklistItems.filter((item) => value.checklist[item] !== true);
      if (missing.length > 0) context.addIssue({ code: z.ZodIssueCode.custom, message: `Checklist incomplete: ${missing.join(', ')}` });
    }
    if (value.decision === 'REJECTED' && !value.reason) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: 'A rejection needs a reason' });
    }
  });
export type Approval = z.infer<typeof ApprovalSchema>;

export const RunFileSchema = z.object({
  schemaVersion: z.literal(1),
  runId: RunIdSchema,
  channelId: z.string().min(1).max(64),
  productionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  slot: z.number().int().min(1).max(4),
  topicSeed: z.string().min(3).max(300),
  pillar: ContentPillarSchema,
  template: TemplateIdSchema,
  state: VideoStateSchema,
  failedStage: PipelineStageSchema.nullable(),
  stateReason: z.string().nullable(),
  /** sha256 of each stage's validated manifest; a changed upstream hash invalidates downstream stages. */
  manifestHashes: z.record(PipelineStageSchema, z.string()),
  transitions: z.array(TransitionSchema),
  costs: z.array(CostRowSchema),
  approval: ApprovalSchema.nullable(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type RunFile = z.infer<typeof RunFileSchema>;

/** Written by Claude Code (fagmer-video-quality-gate) before `ace qa`; merged into qa.json. */
export const EditorialReviewSchema = z.object({
  schemaVersion: z.literal(1),
  checks: z.array(QaCheckSchema).min(1),
  seo: SeoPackageSchema,
});
export type EditorialReview = z.infer<typeof EditorialReviewSchema>;
