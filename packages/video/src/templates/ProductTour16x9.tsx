import { useMemo, type ReactElement } from 'react';
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';
import { buildSceneSlots, type SceneSlot } from '../components/scene-slots';
import { SAMPLE_AUDIO_URL, brand, fontFamily } from '../theme';
import { TourAppScene } from './product-tour/TourAppScene';
import { TourClose, TourHook } from './product-tour/TourBookends';
import { TourCaptionBand } from './product-tour/TourCaptionBand';
import { TourBackdrop } from './product-tour/TourChrome';
import type { ProductTourInput } from './product-tour/product-tour-input';

// The template's public surface for the composition root (Root.tsx).
export {
  PRODUCT_TOUR_COMPOSITION_ID,
  PRODUCT_TOUR_FPS,
  ProductTourInputSchema,
  calculateProductTourMetadata,
} from './product-tour/product-tour-input';
export { TOUR_CANVAS } from './product-tour/tour-layout';
export { buildProductTourSample } from './product-tour/tour-sample';

/**
 * R1-14's render plan marks the first scene `hook` and the last `cta`. The hook always opens
 * with the headline; a `cta` without a visual becomes the title close; every other scene is an
 * app scene in the card.
 */
function rendersAsAppScene(slot: SceneSlot): boolean {
  if (slot.scene.kind === 'hook') return false;
  return !(slot.scene.kind === 'cta' && slot.scene.asset === null);
}

/**
 * "Product tour 16:9" (SPEC 0002 R1-15), derived from the Spesia tour (`SpesiaDemo.tsx`): a
 * headline hook, then each app scene in a framed card with a numbered chip and progress dots, then
 * a title close. The band below the card is left for the captions the `captions` stage burns.
 * Props are the render plan's `RenderInput` (see `product-tour-input.ts`).
 */
export function ProductTour16x9(input: ProductTourInput): ReactElement {
  const { fps, durationInFrames } = useVideoConfig();
  const slots = useMemo(() => buildSceneSlots(input.scenes, fps, durationInFrames), [input.scenes, fps, durationInFrames]);
  const appSlots = slots.filter(rendersAsAppScene);

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background, color: brand.text, fontFamily }}>
      <TourBackdrop />
      {slots.map((slot) => (
        <Sequence key={slot.scene.id} name={`${slot.scene.kind} ${slot.index + 1}`} from={slot.from} durationInFrames={slot.durationInFrames}>
          <TourScene slot={slot} appNumber={appSlots.indexOf(slot) + 1} appTotal={appSlots.length} input={input} />
        </Sequence>
      ))}
      <TourCaptionBand words={input.captions} />
      {input.audioUrl === SAMPLE_AUDIO_URL ? null : <Audio src={input.audioUrl} />}
    </AbsoluteFill>
  );
}

interface TourSceneProps {
  slot: SceneSlot;
  /** 1-based among app scenes; 0 for the hook and the title close. */
  appNumber: number;
  appTotal: number;
  input: ProductTourInput;
}

/** A hook with a capture blurs it behind the headline; a `cta` with a capture keeps the app on screen. */
function TourScene({ slot, appNumber, appTotal, input }: TourSceneProps): ReactElement {
  if (slot.scene.kind === 'hook') {
    return <TourHook scene={slot.scene} title={input.title} durationInFrames={slot.durationInFrames} />;
  }
  if (!rendersAsAppScene(slot)) {
    return <TourClose scene={slot.scene} title={input.title} disclosure={input.disclosure} />;
  }
  return <TourAppScene slot={slot} number={appNumber} total={appTotal} disclosure={input.disclosure} />;
}
