import type { CalculateMetadataFunction } from 'remotion';
import type { z } from 'zod';
import { RenderInputSchema, compositionIds, videoSpec } from '@studio/shared/ace';

/**
 * Composition id the `product-tour-template` catalog row names (`details.compositionId`), taken
 * from the render contract so a live render of `PRODUCT_TOUR_16X9` selects this composition.
 */
export const PRODUCT_TOUR_COMPOSITION_ID = compositionIds.PRODUCT_TOUR_16X9;

/**
 * Props of the 16:9 tour: `RenderInput` (the shape R1-14's render plan produces) without
 * `template`: the composition is picked by id, so the props never need it. A full `RenderInput`
 * (template `PRODUCT_TOUR_16X9`) still parses: zod drops the extra key.
 */
export const ProductTourInputSchema = RenderInputSchema.omit({ template: true });
export type ProductTourInput = z.infer<typeof ProductTourInputSchema>;

export const PRODUCT_TOUR_FPS = videoSpec.fps;

/** Same rule as the 9:16 compositions in `Root.tsx`: narration duration plus a 0.5 s tail. */
const TAIL_S = 0.5;

export const calculateProductTourMetadata: CalculateMetadataFunction<ProductTourInput> = ({ props }) => ({
  durationInFrames: Math.ceil((props.durationS + TAIL_S) * PRODUCT_TOUR_FPS),
});
