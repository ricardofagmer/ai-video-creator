import { z } from 'zod';

export const TemplateIdSchema = z.enum(['TOOL_DEMO', 'AI_BATTLE', 'AUTOMATION_BLUEPRINT']);
export type TemplateId = z.infer<typeof TemplateIdSchema>;

export const ContentPillarSchema = z.enum([
  'TOOL_DEMO',
  'AUTOMATION_WORKFLOW',
  'AI_COMPARISON',
  'VERIFIED_NEWS',
  'PRODUCTIVITY_EXPERIMENT',
]);
export type ContentPillar = z.infer<typeof ContentPillarSchema>;

export const SceneKindSchema = z.enum(['hook', 'problem', 'rubric', 'overview', 'step', 'evidence', 'result', 'analysis', 'verdict', 'cta']);
export type SceneKind = z.infer<typeof SceneKindSchema>;

export interface TemplateSection {
  kind: SceneKind;
  fromS: number;
  toS: number;
}

/** Blueprint section 5 timelines, used as targets; real timing comes from narration. */
export const templateTimelines: Record<TemplateId, readonly TemplateSection[]> = {
  TOOL_DEMO: [
    { kind: 'hook', fromS: 0, toS: 3 },
    { kind: 'problem', fromS: 3, toS: 12 },
    { kind: 'step', fromS: 12, toS: 55 },
    { kind: 'result', fromS: 55, toS: 71 },
    { kind: 'cta', fromS: 71, toS: 80 },
  ],
  AI_BATTLE: [
    { kind: 'hook', fromS: 0, toS: 5 },
    { kind: 'rubric', fromS: 5, toS: 15 },
    { kind: 'evidence', fromS: 15, toS: 58 },
    { kind: 'analysis', fromS: 58, toS: 75 },
    { kind: 'verdict', fromS: 75, toS: 85 },
  ],
  AUTOMATION_BLUEPRINT: [
    { kind: 'hook', fromS: 0, toS: 5 },
    { kind: 'overview', fromS: 5, toS: 18 },
    { kind: 'step', fromS: 18, toS: 60 },
    { kind: 'result', fromS: 60, toS: 75 },
    { kind: 'cta', fromS: 75, toS: 85 },
  ],
};

export const videoSpec = {
  width: 1080,
  height: 1920,
  fps: 30,
  audioSampleRate: 48000,
  minDurationS: 70,
  maxDurationS: 90,
  narrationMinWords: 165,
  narrationMaxWords: 205,
  /** TikTok UI overlays; captions and key content stay out of these bands. */
  safeZone: { topPx: 180, bottomPx: 420, rightPx: 140, leftPx: 60 },
  brand: { background: '#0B1426', accent: '#2EC4B6', text: '#F4F7FB', muted: '#8EA0BC' },
} as const;
