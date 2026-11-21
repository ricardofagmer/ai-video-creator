import { z } from 'zod';
import { SceneKindSchema, TemplateIdSchema } from './templates';
import { WordTimingSchema } from './manifests';

/**
 * Templates a render can select: the authoring templates plus the 16:9 product tour (SPEC 0002
 * R1-15). The tour is render-only: the `ace` run pipeline (script manifest, run.json,
 * `templateTimelines`) stays on `TemplateIdSchema`, which is 9:16.
 */
export const RenderTemplateIdSchema = z.enum([...TemplateIdSchema.options, 'PRODUCT_TOUR_16X9']);
export type RenderTemplateId = z.infer<typeof RenderTemplateIdSchema>;

/*
 * Bounds sized well above real use: scripts carry at most 20 scenes with 120-character on-screen
 * text and 100-character titles, the watcher's render request allows 100 scenes, 200-character
 * text and 20 000 caption words, and a render never runs past 10 hours.
 */
const renderInputLimits = {
  maxSceneIdLength: 64,
  maxTextLength: 200,
  maxScenes: 100,
  maxCaptionWords: 20_000,
  maxSeconds: 36_000,
  maxUrlLength: 4096,
} as const;

/** Hosts the toolbox static server is reached on: it binds 127.0.0.1 only. */
const LOOPBACK_HOSTS: ReadonlySet<string> = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * True for an http(s) URL on a loopback origin with no credentials: the shape of the URLs the
 * toolbox static server hands the renderer (`http://127.0.0.1:<port>/<token>/<file>`).
 */
function isLoopbackMediaUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  if (url.username !== '' || url.password !== '') return false;
  return LOOPBACK_HOSTS.has(url.hostname.toLowerCase());
}

function isHttpUrl(value: string): boolean {
  if (!URL.canParse(value)) return false;
  const protocol = new URL(value).protocol;
  return protocol === 'http:' || protocol === 'https:';
}

const renderSeconds = z.number().nonnegative().max(renderInputLimits.maxSeconds);
const renderText = z.string().max(renderInputLimits.maxTextLength);
const loopbackMediaUrl = z
  .string()
  .max(renderInputLimits.maxUrlLength)
  .refine(isLoopbackMediaUrl, 'media URLs must point at the local static server (http://127.0.0.1)');

const RenderCaptionWordSchema = WordTimingSchema.extend({ text: renderText, startS: renderSeconds, endS: renderSeconds }).strict();

/** Props handed to the Remotion compositions in packages/video. URLs must be fetchable by the renderer. */
export const RenderSceneSchema = z
  .object({
    id: z.string().max(renderInputLimits.maxSceneIdLength),
    kind: SceneKindSchema,
    startS: renderSeconds,
    endS: z.number().positive().max(renderInputLimits.maxSeconds),
    onScreenText: renderText,
    asset: z
      .object({
        url: loopbackMediaUrl,
        kind: z.enum(['image', 'video']),
      })
      .strict()
      .nullable(),
  })
  .strict();
export type RenderScene = z.infer<typeof RenderSceneSchema>;

/**
 * The composition props schema Remotion validates (`Root.tsx`, Studio previews). Its top level stays
 * open because the 16:9 tour validates `RenderInputSchema.omit({ template })` against props that
 * still carry `template`, and Studio previews use an `https://example.invalid` audio sentinel; the
 * render boundary uses `LocalRenderInputSchema` instead.
 */
export const RenderInputSchema = z.object({
  template: RenderTemplateIdSchema,
  title: renderText,
  durationS: z.number().positive().max(renderInputLimits.maxSeconds),
  audioUrl: z.string().max(renderInputLimits.maxUrlLength).refine(isHttpUrl, 'audioUrl must be an http(s) URL'),
  scenes: z.array(RenderSceneSchema).min(1).max(renderInputLimits.maxScenes),
  captions: z.array(RenderCaptionWordSchema).max(renderInputLimits.maxCaptionWords),
  disclosure: renderText.describe('Shown small on the final scene, e.g. "AI voice. Links may be affiliate."'),
});
export type RenderInput = z.infer<typeof RenderInputSchema>;

/**
 * What a render accepts from its producers (`@ace/video` `renderVideo`, the toolbox mapper, the
 * watcher's tool runner): no unknown keys, and every media URL on the loopback static server, so
 * the renderer fetches nothing off the machine.
 */
export const LocalRenderInputSchema = RenderInputSchema.extend({ audioUrl: loopbackMediaUrl }).strict();

export const compositionIds = {
  TOOL_DEMO: 'ToolDemo',
  AI_BATTLE: 'AiBattle',
  AUTOMATION_BLUEPRINT: 'AutomationBlueprint',
  PRODUCT_TOUR_16X9: 'ProductTour16x9',
} as const satisfies Record<RenderTemplateId, string>;
