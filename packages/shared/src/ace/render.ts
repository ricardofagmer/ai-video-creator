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

/** Props handed to the Remotion compositions in packages/video. URLs must be fetchable by the renderer. */
export const RenderSceneSchema = z.object({
  id: z.string(),
  kind: SceneKindSchema,
  startS: z.number().nonnegative(),
  endS: z.number().positive(),
  onScreenText: z.string(),
  asset: z
    .object({
      url: z.string().url(),
      kind: z.enum(['image', 'video']),
    })
    .nullable(),
});
export type RenderScene = z.infer<typeof RenderSceneSchema>;

export const RenderInputSchema = z.object({
  template: RenderTemplateIdSchema,
  title: z.string(),
  durationS: z.number().positive(),
  audioUrl: z.string().url(),
  scenes: z.array(RenderSceneSchema).min(1),
  captions: z.array(WordTimingSchema),
  disclosure: z.string().describe('Shown small on the final scene, e.g. "AI voice. Links may be affiliate."'),
});
export type RenderInput = z.infer<typeof RenderInputSchema>;

export const compositionIds = {
  TOOL_DEMO: 'ToolDemo',
  AI_BATTLE: 'AiBattle',
  AUTOMATION_BLUEPRINT: 'AutomationBlueprint',
  PRODUCT_TOUR_16X9: 'ProductTour16x9',
} as const satisfies Record<RenderTemplateId, string>;
