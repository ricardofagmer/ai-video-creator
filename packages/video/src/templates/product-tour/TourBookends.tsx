import type { ReactElement } from 'react';
import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderScene } from '@studio/shared/ace';
import { SceneVisual } from '../../components/SceneVisual';
import { brand } from '../../theme';
import { tourLayout } from './tour-layout';

const MAX_HOOK_WORDS = 12;
const clamp = { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' } as const;

interface TourHookProps {
  scene: RenderScene;
  title: string;
  durationInFrames: number;
}

/**
 * Opening scene (Spesia `Hook`): the headline word by word, the last word in the accent colour,
 * over a blurred copy of the scene's capture when it has one. Exits with a scale-up fade.
 */
export function TourHook({ scene, title, durationInFrames }: TourHookProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const text = scene.onScreenText.trim() === '' ? title : scene.onScreenText;
  const words = text.split(/\s+/).filter((word) => word !== '').slice(0, MAX_HOOK_WORDS);
  const exit = interpolate(frame, [durationInFrames - 0.7 * fps, durationInFrames], [0, 1], clamp);

  return (
    <AbsoluteFill>
      {scene.asset ? (
        <AbsoluteFill style={{ opacity: 0.32, filter: 'blur(16px) saturate(0.8)', transform: `scale(${1.12 + frame / 2000})` }}>
          <SceneVisual asset={scene.asset} fallbackText={text} durationInFrames={durationInFrames} objectFit="cover" />
        </AbsoluteFill>
      ) : null}
      <AbsoluteFill style={{ background: `linear-gradient(180deg, ${brand.background}8C, ${brand.background}D9)` }} />
      <AbsoluteFill
        style={{
          justifyContent: 'center',
          alignItems: 'center',
          padding: `0 ${tourLayout.sideInset}px`,
          opacity: 1 - exit,
          transform: `scale(${1 + exit * 0.25})`,
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            justifyContent: 'center',
            columnGap: 30,
            fontWeight: 800,
            fontSize: 112,
            lineHeight: 1.12,
            letterSpacing: -2,
            textAlign: 'center',
          }}
        >
          {words.map((word, index) => {
            const appear = spring({ frame: frame - 6 - index * 7, fps, config: { damping: 14, stiffness: 160 } });
            const accent = index === words.length - 1;
            return (
              <span
                key={`${index}-${word}`}
                style={{
                  color: accent ? brand.accent : brand.text,
                  opacity: appear,
                  transform: `translateY(${(1 - appear) * 60}px)`,
                  filter: `blur(${(1 - appear) * 10}px)`,
                }}
              >
                {word}
              </span>
            );
          })}
        </div>
        <div
          style={{ marginTop: 40, height: 6, borderRadius: 3, backgroundColor: brand.accent, width: interpolate(frame, [36, 70], [0, 420], clamp) }}
        />
      </AbsoluteFill>
    </AbsoluteFill>
  );
}

interface TourCloseProps {
  scene: RenderScene;
  title: string;
  disclosure: string;
}

/** Closing scene without a capture (Spesia `Close`): the title, an accent rule, the tagline, the disclosure. */
export function TourClose({ scene, title, disclosure }: TourCloseProps): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const titleIn = spring({ frame: frame - 4, fps, config: { damping: 13, stiffness: 120 } });
  const taglineIn = spring({ frame: frame - 24, fps, config: { damping: 16, stiffness: 140 } });
  const tagline = scene.onScreenText.trim();

  return (
    <AbsoluteFill style={{ justifyContent: 'center', alignItems: 'center', padding: `0 ${tourLayout.sideInset}px` }}>
      <div
        style={{
          fontWeight: 800,
          fontSize: 96,
          lineHeight: 1.1,
          letterSpacing: -2,
          textAlign: 'center',
          color: brand.text,
          opacity: titleIn,
          transform: `scale(${0.8 + 0.2 * titleIn})`,
          filter: `blur(${(1 - titleIn) * 8}px)`,
        }}
      >
        {title}
      </div>
      <div style={{ marginTop: 28, height: 6, borderRadius: 3, backgroundColor: brand.accent, width: 320 * titleIn }} />
      {tagline === '' || tagline === title ? null : (
        <div
          style={{
            marginTop: 32,
            fontWeight: 600,
            fontSize: 52,
            textAlign: 'center',
            color: brand.text,
            opacity: taglineIn,
            transform: `translateY(${(1 - taglineIn) * 30}px)`,
          }}
        >
          {tagline}
        </div>
      )}
      <div
        style={{
          position: 'absolute',
          left: tourLayout.sideInset,
          right: tourLayout.sideInset,
          // Above the caption band, so a burned caption never covers the disclosure.
          bottom: tourLayout.captionBand.height + 16,
          textAlign: 'center',
          fontWeight: 500,
          fontSize: 24,
          color: brand.muted,
        }}
      >
        {disclosure}
      </div>
    </AbsoluteFill>
  );
}
