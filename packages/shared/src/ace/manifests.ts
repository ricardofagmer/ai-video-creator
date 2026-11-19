import { z } from 'zod';
import { ContentPillarSchema, SceneKindSchema, TemplateIdSchema } from './templates';

const schemaVersion = z.literal(1);
const isoDate = z.string().datetime();
// Ids become file names (assets/<sceneId>.png), so they are file-name safe at the boundary.
export const SafeIdSchema = z.string().regex(/^[A-Za-z0-9_-]{1,40}$/);

export const SourceSchema = z.object({
  url: z.string().url(),
  title: z.string().min(1).max(500),
  publisher: z.string().max(200),
  retrievedAt: isoDate,
  excerpt: z.string().max(4000),
  primary: z.boolean().describe('Official docs, vendor page or reproducible test, not a news rewrite'),
});
export type Source = z.infer<typeof SourceSchema>;

export const ResearchManifestSchema = z.object({
  schemaVersion,
  topic: z.string().min(3).max(300),
  pillar: ContentPillarSchema,
  angle: z.string().max(500),
  sources: z.array(SourceSchema).min(2).max(20),
});
export type ResearchManifest = z.infer<typeof ResearchManifestSchema>;

export const EvidenceSchema = z.object({
  sourceUrl: z.string().url(),
  quote: z.string().min(1).max(1000),
});

export const ClaimSchema = z.object({
  id: SafeIdSchema,
  text: z.string().min(1).max(500),
  material: z.boolean(),
  status: z.enum(['supported', 'unsupported']),
  evidence: z.array(EvidenceSchema).max(5),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const ClaimManifestSchema = z.object({
  schemaVersion,
  claims: z.array(ClaimSchema).min(1).max(30),
});
export type ClaimManifest = z.infer<typeof ClaimManifestSchema>;

export const ScriptSceneSchema = z.object({
  id: SafeIdSchema,
  kind: SceneKindSchema,
  narration: z.string().min(1).max(1200),
  onScreenText: z.string().max(120),
  visual: z.string().max(500).describe('What the viewer sees: capture target, diagram or generated scene brief'),
  claimIds: z.array(SafeIdSchema).max(10),
  durationHintS: z.number().positive().max(60),
});
export type ScriptScene = z.infer<typeof ScriptSceneSchema>;

export const ScriptManifestSchema = z.object({
  schemaVersion,
  template: TemplateIdSchema,
  title: z.string().min(1).max(100),
  hook: z.string().min(1).max(200),
  narration: z.string().min(1).max(2000),
  wordCount: z.number().int().positive(),
  scenes: z.array(ScriptSceneSchema).min(3).max(20),
  cta: z.string().max(200),
});
export type ScriptManifest = z.infer<typeof ScriptManifestSchema>;

export const AssetKindSchema = z.enum(['capture', 'generated', 'stock', 'title-card']);

export const AssetSchema = z.object({
  id: z.string().min(1).max(40),
  sceneId: SafeIdSchema,
  kind: AssetKindSchema,
  storageKey: z.string().min(1),
  mimeType: z.string(),
  provenance: z.string().min(1).max(500).describe('Where it came from: URL captured, generator and prompt, stock source'),
  license: z.string().min(1).max(200),
  presentedAsProof: z.boolean().describe('Generated assets must be false: they cannot prove a product works'),
});
export type Asset = z.infer<typeof AssetSchema>;

export const AssetManifestSchema = z.object({
  schemaVersion,
  assets: z.array(AssetSchema).min(1).max(40),
});
export type AssetManifest = z.infer<typeof AssetManifestSchema>;

export const WordTimingSchema = z.object({
  text: z.string(),
  startS: z.number().nonnegative(),
  endS: z.number().nonnegative(),
});
export type WordTiming = z.infer<typeof WordTimingSchema>;

export const NarrationManifestSchema = z.object({
  schemaVersion,
  audioKey: z.string().min(1),
  durationS: z.number().positive(),
  voice: z.string(),
  words: z.array(WordTimingSchema).min(1),
  /** Start/end seconds per script scene, derived from word timings. */
  sceneTimings: z.array(z.object({ sceneId: SafeIdSchema, startS: z.number(), endS: z.number() })),
});
export type NarrationManifest = z.infer<typeof NarrationManifestSchema>;

export const RenderManifestSchema = z.object({
  schemaVersion,
  videoKey: z.string().min(1),
  thumbnailKey: z.string().min(1),
  durationS: z.number().positive(),
  width: z.number().int(),
  height: z.number().int(),
  fps: z.number(),
  renderSeconds: z.number().nonnegative(),
});
export type RenderManifest = z.infer<typeof RenderManifestSchema>;

export const QaCheckSchema = z.object({
  id: z.string(),
  passed: z.boolean(),
  blocking: z.boolean(),
  detail: z.string().max(1000),
});
export type QaCheck = z.infer<typeof QaCheckSchema>;

export const SeoPackageSchema = z.object({
  title: z.string().min(1).max(100),
  caption: z.string().min(1).max(2200),
  hashtags: z.array(z.string().regex(/^#[\p{L}\p{N}_]+$/u)).min(1).max(8),
  cta: z.string().max(200),
  disclosures: z.array(z.string()).min(1),
});
export type SeoPackage = z.infer<typeof SeoPackageSchema>;

export const QaResultSchema = z.object({
  schemaVersion,
  verdict: z.enum(['pass', 'fail']),
  checks: z.array(QaCheckSchema),
  seo: SeoPackageSchema.optional(),
});
export type QaResult = z.infer<typeof QaResultSchema>;

/** Schema per stage, used to validate every persisted manifest. */
export const stageManifestSchemas = {
  research: ResearchManifestSchema,
  verify: ClaimManifestSchema,
  script: ScriptManifestSchema,
  assets: AssetManifestSchema,
  narrate: NarrationManifestSchema,
  render: RenderManifestSchema,
  qa: QaResultSchema,
} as const;
