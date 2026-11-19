import type { ReactElement } from 'react';
import { Composition, type CalculateMetadataFunction } from 'remotion';
import { RenderInputSchema, compositionIds, videoSpec, type RenderInput } from '@studio/shared/ace';
import { HookCompositions } from './hooks/HookRoot';
import { buildSampleInput } from './sample/sample-input';
import { AiBattle } from './templates/AiBattle';
import { AutomationBlueprint } from './templates/AutomationBlueprint';
import {
  PRODUCT_TOUR_COMPOSITION_ID,
  PRODUCT_TOUR_FPS,
  ProductTour16x9,
  ProductTourInputSchema,
  TOUR_CANVAS,
  buildProductTourSample,
  calculateProductTourMetadata,
} from './templates/ProductTour16x9';
import { ToolDemo } from './templates/ToolDemo';

/** Spec section 6: duration = narration duration + 0.5 s tail. */
const TAIL_S = 0.5;

const calculateMetadata: CalculateMetadataFunction<RenderInput> = ({ props }) => ({
  durationInFrames: Math.ceil((props.durationS + TAIL_S) * videoSpec.fps),
});

// defaultProps are generated Studio previews; production props always come from renderVideo().
export function RemotionRoot(): ReactElement {
  return (
    <>
      <Composition
        id={compositionIds.TOOL_DEMO}
        component={ToolDemo}
        schema={RenderInputSchema}
        defaultProps={buildSampleInput('TOOL_DEMO')}
        calculateMetadata={calculateMetadata}
        durationInFrames={Math.ceil((80 + TAIL_S) * videoSpec.fps)}
        fps={videoSpec.fps}
        width={videoSpec.width}
        height={videoSpec.height}
      />
      <Composition
        id={compositionIds.AI_BATTLE}
        component={AiBattle}
        schema={RenderInputSchema}
        defaultProps={buildSampleInput('AI_BATTLE')}
        calculateMetadata={calculateMetadata}
        durationInFrames={Math.ceil((85 + TAIL_S) * videoSpec.fps)}
        fps={videoSpec.fps}
        width={videoSpec.width}
        height={videoSpec.height}
      />
      <Composition
        id={compositionIds.AUTOMATION_BLUEPRINT}
        component={AutomationBlueprint}
        schema={RenderInputSchema}
        defaultProps={buildSampleInput('AUTOMATION_BLUEPRINT')}
        calculateMetadata={calculateMetadata}
        durationInFrames={Math.ceil((85 + TAIL_S) * videoSpec.fps)}
        fps={videoSpec.fps}
        width={videoSpec.width}
        height={videoSpec.height}
      />
      <Composition
        id={PRODUCT_TOUR_COMPOSITION_ID}
        component={ProductTour16x9}
        schema={ProductTourInputSchema}
        defaultProps={buildProductTourSample()}
        calculateMetadata={calculateProductTourMetadata}
        durationInFrames={Math.ceil((60 + TAIL_S) * PRODUCT_TOUR_FPS)}
        fps={PRODUCT_TOUR_FPS}
        width={TOUR_CANVAS.width}
        height={TOUR_CANVAS.height}
      />
      <HookCompositions />
    </>
  );
}
