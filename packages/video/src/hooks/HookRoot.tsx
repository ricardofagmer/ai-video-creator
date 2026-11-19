import type { ReactElement } from 'react';
import { Composition, Still, type CalculateMetadataFunction } from 'remotion';
import { HookRenderInputSchema, hookAvatarSpec, hookCompositionIds, hookSpec, type HookRenderInput } from '@studio/shared/ace';
import { C01Video } from './c01/C01Video';
import { C01Carousel, C01Cover } from './c01/C01Stills';
import sampleC01 from './c01/sample-c01-pt.json';
import { IntroAvatarStill, IntroCover } from './intro/IntroStills';
import { IntroVideo } from './intro/IntroVideo';
import sampleIntro from './intro/sample-intro-pt.json';

// Studio preview only (estimated word timings, no audio); production props come from `ace hook`.
const c01Sample: HookRenderInput = HookRenderInputSchema.parse({ ...sampleC01, audioUrl: null, slide: 1 });
const introSample: HookRenderInput = HookRenderInputSchema.parse({ ...sampleIntro, audioUrl: null, slide: 1 });

const hookDuration: CalculateMetadataFunction<HookRenderInput> = ({ props }) => ({
  durationInFrames: Math.round(props.durationS * hookSpec.fps),
});

export function HookCompositions(): ReactElement {
  const ids = hookCompositionIds.c01;
  const intro = hookCompositionIds.intro;
  return (
    <>
      <Composition
        id={ids.video}
        component={C01Video}
        schema={HookRenderInputSchema}
        defaultProps={c01Sample}
        calculateMetadata={hookDuration}
        durationInFrames={Math.round(c01Sample.durationS * hookSpec.fps)}
        fps={hookSpec.fps}
        width={hookSpec.video.width}
        height={hookSpec.video.height}
      />
      <Still id={ids.cover} component={C01Cover} schema={HookRenderInputSchema} defaultProps={c01Sample} width={hookSpec.video.width} height={hookSpec.video.height} />
      <Still
        id={ids.carousel}
        component={C01Carousel}
        schema={HookRenderInputSchema}
        defaultProps={c01Sample}
        width={hookSpec.carousel.width}
        height={hookSpec.carousel.height}
      />
      <Composition
        id={intro.video}
        component={IntroVideo}
        schema={HookRenderInputSchema}
        defaultProps={introSample}
        calculateMetadata={hookDuration}
        durationInFrames={Math.round(introSample.durationS * hookSpec.fps)}
        fps={hookSpec.fps}
        width={hookSpec.video.width}
        height={hookSpec.video.height}
      />
      <Still id={intro.cover} component={IntroCover} schema={HookRenderInputSchema} defaultProps={introSample} width={hookSpec.video.width} height={hookSpec.video.height} />
      <Still id={intro.avatar} component={IntroAvatarStill} width={hookAvatarSpec.width} height={hookAvatarSpec.height} />
    </>
  );
}
