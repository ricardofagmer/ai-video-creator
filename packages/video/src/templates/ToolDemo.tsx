import type { ReactElement, ReactNode } from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderInput } from '@studio/shared/ace';
import { KindLabel } from '../components/OnScreenText';
import { HeroLayout, SceneLayout } from '../components/SceneLayout';
import { SceneVisual } from '../components/SceneVisual';
import { TemplateShell } from '../components/TemplateShell';
import type { SceneSlot } from '../components/scene-slots';
import { brand, hairline, surfaceRaised } from '../theme';
import { kindLabels, numberedLabel } from './kind-labels';

/** UI captures framed in a browser window; 'step' scenes carry numbered step badges. */
export function ToolDemo(input: RenderInput): ReactElement {
  return <TemplateShell input={input} renderScene={(slot) => <ToolDemoScene slot={slot} title={input.title} />} />;
}

function ToolDemoScene({ slot, title }: { slot: SceneSlot; title: string }): ReactElement {
  const { scene } = slot;
  const isStep = scene.kind === 'step';
  const eyebrow = isStep ? (
    <StepBadge number={slot.kindNumber} total={slot.kindCount} />
  ) : (
    <KindLabel>{kindLabels[scene.kind]}</KindLabel>
  );

  if (!scene.asset) {
    return <HeroLayout text={scene.onScreenText} eyebrow={eyebrow} />;
  }

  return (
    <SceneLayout headline={scene.onScreenText} eyebrow={eyebrow} headlineSize={isStep ? 60 : 68}>
      <BrowserFrame address={title}>
        <SceneVisual
          asset={scene.asset}
          fallbackText={scene.onScreenText}
          durationInFrames={slot.durationInFrames}
          objectFit="contain"
        />
      </BrowserFrame>
    </SceneLayout>
  );
}

function StepBadge({ number, total }: { number: number; total: number }): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 14, stiffness: 160 }, durationInFrames: Math.round(0.5 * fps) });

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
      <div
        style={{
          width: 64,
          height: 64,
          borderRadius: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: brand.accent,
          color: brand.background,
          fontSize: 36,
          fontWeight: 800,
          scale: String(pop),
        }}
      >
        {number}
      </div>
      <KindLabel>{numberedLabel('step', number, total)}</KindLabel>
    </div>
  );
}

function BrowserFrame({ address, children }: { address: string; children: ReactNode }): ReactElement {
  return (
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        borderRadius: 28,
        overflow: 'hidden',
        border: `2px solid ${hairline}`,
        backgroundColor: surfaceRaised,
        boxShadow: '0 30px 80px rgba(0, 0, 0, 0.45)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '18px 24px', borderBottom: `2px solid ${hairline}` }}>
        {['#FF5F57', '#FEBC2E', '#28C840'].map((color) => (
          <div key={color} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: color }} />
        ))}
        <div
          style={{
            flex: 1,
            marginLeft: 16,
            padding: '8px 20px',
            borderRadius: 999,
            backgroundColor: 'rgba(11, 20, 38, 0.7)',
            color: brand.muted,
            fontSize: 24,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {address}
        </div>
      </div>
      <div style={{ flex: 1, position: 'relative', backgroundColor: brand.background }}>{children}</div>
    </div>
  );
}
