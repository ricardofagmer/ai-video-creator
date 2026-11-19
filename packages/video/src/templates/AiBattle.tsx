import type { ReactElement, ReactNode } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderInput } from '@studio/shared/ace';
import { KindLabel } from '../components/OnScreenText';
import { HeroLayout, SceneLayout } from '../components/SceneLayout';
import { SceneVisual } from '../components/SceneVisual';
import { TemplateShell } from '../components/TemplateShell';
import type { SceneSlot } from '../components/scene-slots';
import { brand, hairline, surfaceRaised } from '../theme';
import { kindLabels, numberedLabel } from './kind-labels';

/** Head-to-head styling: scoreboard rubric, split evidence rounds and a verdict banner. */
export function AiBattle(input: RenderInput): ReactElement {
  return <TemplateShell input={input} renderScene={(slot) => <AiBattleScene slot={slot} />} />;
}

function AiBattleScene({ slot }: { slot: SceneSlot }): ReactElement {
  const { scene } = slot;
  const label = numberedLabel(scene.kind, slot.kindNumber, slot.kindCount);

  if (scene.kind === 'rubric') {
    // Multi-line on-screen text renders as scoreboard rows: first line is the headline.
    const [headline = scene.onScreenText, ...criteria] = scene.onScreenText.split('\n').filter((line) => line.trim());
    return (
      <HeroLayout text={headline} eyebrow={<KindLabel>{label}</KindLabel>}>
        {criteria.length > 0 ? <Scoreboard rows={criteria} /> : null}
      </HeroLayout>
    );
  }

  if (scene.kind === 'verdict') {
    return <HeroLayout text={scene.onScreenText} eyebrow={<KindLabel filled>{kindLabels.verdict}</KindLabel>} />;
  }

  if (!scene.asset) {
    return <HeroLayout text={scene.onScreenText} eyebrow={<KindLabel>{label}</KindLabel>} />;
  }

  const visual = (
    <SceneVisual
      asset={scene.asset}
      fallbackText={scene.onScreenText}
      durationInFrames={slot.durationInFrames}
      objectFit="contain"
    />
  );

  return (
    <SceneLayout headline={scene.onScreenText} eyebrow={<KindLabel>{label}</KindLabel>} headlineSize={60}>
      {scene.kind === 'evidence' ? <SplitFrame>{visual}</SplitFrame> : visual}
    </SceneLayout>
  );
}

function Scoreboard({ rows }: { rows: string[] }): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {rows.map((row, index) => (
        <div
          key={row}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 20,
            padding: '18px 24px',
            borderRadius: 18,
            backgroundColor: surfaceRaised,
            border: `2px solid ${hairline}`,
            fontSize: 40,
            fontWeight: 700,
            opacity: interpolate(frame, [(0.4 + index * 0.25) * fps, (0.7 + index * 0.25) * fps], [0, 1], {
              extrapolateLeft: 'clamp',
              extrapolateRight: 'clamp',
            }),
          }}
        >
          <div style={{ color: brand.accent, fontVariantNumeric: 'tabular-nums' }}>{String(index + 1).padStart(2, '0')}</div>
          <div style={{ color: brand.text }}>{row.trim()}</div>
        </div>
      ))}
    </div>
  );
}

/** Evidence frame split down the middle with a VS chip, so each round reads as a head-to-head. */
function SplitFrame({ children }: { children: ReactNode }): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const chip = spring({ frame: frame - Math.round(0.2 * fps), fps, config: { damping: 12, stiffness: 180 } });

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        borderRadius: 28,
        overflow: 'hidden',
        backgroundColor: surfaceRaised,
        borderStyle: 'solid',
        borderWidth: 4,
        borderColor: `${brand.accent} ${brand.muted} ${brand.muted} ${brand.accent}`,
      }}
    >
      {children}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          left: '50%',
          width: 3,
          translate: '-1.5px 0px',
          backgroundColor: 'rgba(244, 247, 251, 0.35)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          top: 24,
          left: '50%',
          translate: '-50% 0px',
          padding: '10px 26px',
          borderRadius: 999,
          backgroundColor: brand.background,
          border: `3px solid ${brand.accent}`,
          color: brand.accent,
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: 3,
          scale: String(chip),
        }}
      >
        VS
      </div>
    </div>
  );
}
