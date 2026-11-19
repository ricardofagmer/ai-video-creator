import { z } from 'zod';
import { SafeIdSchema, WordTimingSchema } from './manifests';

/**
 * Hook videos (spec 0002): 20-45 s chamadas built from a beat-grid storyboard.
 * The toolbox computes a HookTimeline; the score and the Remotion compositions both read it,
 * so picture and sound share one grid.
 */

export const HookLangSchema = z.enum(['pt', 'en']);
export type HookLang = z.infer<typeof HookLangSchema>;

/** Energy curve of the score, one value per shot. */
export const HookSectionSchema = z.enum([
  'intro', // pad and motif pings, no drums
  'silence', // the one planned silence: music cut dry, nothing but room tone
  'drop', // re-entry after the silence: impact, full pad, kick
  'groove', // light half-time groove
  'full', // full groove with 16th arpeggio
  'tension', // no kick, low pulse, minor-second dissonance
  'warm', // warm groove
  'resolve', // motif rises and resolves with the logo, breath before
]);
export type HookSection = z.infer<typeof HookSectionSchema>;

export const HookVoiceModeSchema = z.enum(['draft', 'live']);
export type HookVoiceMode = z.infer<typeof HookVoiceModeSchema>;

export const hookSpec = {
  fps: 30,
  minDurationS: 20,
  maxDurationS: 45,
  targetLufs: -14,
  lufsTolerance: 1,
  maxTruePeakDb: -1.5,
  video: { width: 1080, height: 1920 },
  carousel: { width: 1080, height: 1350, slides: 6 },
} as const;

const MarkNameSchema = z.string().regex(/^[A-Za-z0-9_.-]{1,60}$/);

export const HookShotTimingSchema = z.object({
  id: SafeIdSchema,
  section: HookSectionSchema,
  startBeat: z.number().int().nonnegative(),
  beats: z.number().int().positive(),
  startS: z.number().nonnegative(),
  endS: z.number().positive(),
});
export type HookShotTiming = z.infer<typeof HookShotTimingSchema>;

export const HookLineSchema = z.object({
  shotId: SafeIdSchema,
  text: z.string().min(1).max(400),
  /** The one word shown in the accent colour, as spoken (case-insensitive match). */
  highlight: z.string().max(40).nullable(),
  startS: z.number().nonnegative(),
  endS: z.number().positive(),
  /** Absolute composition time. */
  words: z.array(WordTimingSchema).min(1),
});
export type HookLine = z.infer<typeof HookLineSchema>;

export const HookTimelineSchema = z.object({
  schemaVersion: z.literal(1),
  videoId: SafeIdSchema,
  lang: HookLangSchema,
  voice: HookVoiceModeSchema,
  bpm: z.number().min(60).max(180),
  fps: z.literal(hookSpec.fps),
  beatS: z.number().positive(),
  totalBeats: z.number().int().positive(),
  durationS: z.number().min(hookSpec.minDurationS).max(hookSpec.maxDurationS),
  shots: z.array(HookShotTimingSchema).min(1),
  /** Absolute beats (fractional allowed), keyed "<shotId>.<event>", e.g. "writes.pillPush". */
  marks: z.record(MarkNameSchema, z.number().nonnegative()),
  lines: z.array(HookLineSchema),
  /** Language-specific on-screen copy (hook text, CTA, carousel slides), keyed by name. */
  copy: z.record(MarkNameSchema, z.string().max(400)),
});
export type HookTimeline = z.infer<typeof HookTimelineSchema>;

/** Props for the hook compositions; audioUrl is null for silent previews and stills. */
export const HookRenderInputSchema = HookTimelineSchema.extend({
  audioUrl: z.string().url().nullable(),
  /** Carousel only: 1-based slide number. */
  slide: z.number().int().min(1).max(hookSpec.carousel.slides).default(1),
});
export type HookRenderInput = z.infer<typeof HookRenderInputSchema>;

/** Profile avatar still: square, for a social profile picture. */
export const hookAvatarSpec = { width: 1080, height: 1080 } as const;

/** Composition ids per hook; carousel and avatar stills are optional (null = not rendered). */
export const hookCompositionIds = {
  c01: { video: 'HookC01', cover: 'HookC01Cover', carousel: 'HookC01Carousel', avatar: null },
  intro: { video: 'HookIntro', cover: 'HookIntroCover', carousel: null, avatar: 'HookIntroAvatar' },
} as const;
export type HookVideoId = keyof typeof hookCompositionIds;
