import { Fragment, type ReactElement } from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { RenderInput } from '@studio/shared/ace';
import { KindLabel } from '../components/OnScreenText';
import { HeroLayout, SceneLayout } from '../components/SceneLayout';
import { SceneVisual } from '../components/SceneVisual';
import { TemplateShell } from '../components/TemplateShell';
import type { SceneSlot } from '../components/scene-slots';
import { brand, hairline, surfaceRaised } from '../theme';
import { kindLabels } from './kind-labels';

const ARROW_SEPARATOR = /\s*(?:->|→)\s*/;

/** Node-and-arrow overview card for 'overview' scenes and numbered build steps. */
export function AutomationBlueprint(input: RenderInput): ReactElement {
  return <TemplateShell input={input} renderScene={(slot) => <BlueprintScene slot={slot} title={input.title} />} />;
}

function BlueprintScene({ slot, title }: { slot: SceneSlot; title: string }): ReactElement {
  const { scene } = slot;

  if (scene.kind === 'overview') {
    // "Zoom -> Transcript -> Notion" style on-screen text becomes the node chain.
    const nodes = scene.onScreenText.split(ARROW_SEPARATOR).filter((node) => node.trim());
    return (
      <HeroLayout
        text={nodes.length > 1 ? title : scene.onScreenText}
        eyebrow={<KindLabel>{kindLabels.overview}</KindLabel>}
      >
        {nodes.length > 1 ? <NodeFlow nodes={nodes} /> : null}
      </HeroLayout>
    );
  }

  const eyebrow =
    scene.kind === 'step' ? (
      <BuildStepNumber number={slot.kindNumber} total={slot.kindCount} />
    ) : (
      <KindLabel>{kindLabels[scene.kind]}</KindLabel>
    );

  if (!scene.asset) {
    return <HeroLayout text={scene.onScreenText} eyebrow={eyebrow} />;
  }

  return (
    <SceneLayout headline={scene.onScreenText} eyebrow={eyebrow} headlineSize={60}>
      <div style={{ width: '100%', height: '100%', borderRadius: 28, overflow: 'hidden', border: `2px solid ${hairline}` }}>
        <SceneVisual asset={scene.asset} fallbackText={scene.onScreenText} durationInFrames={slot.durationInFrames} />
      </div>
    </SceneLayout>
  );
}

function BuildStepNumber({ number, total }: { number: number; total: number }): ReactElement {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
      <div style={{ fontSize: 72, fontWeight: 900, color: brand.accent, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>
        {String(number).padStart(2, '0')}
      </div>
      <div style={{ fontSize: 30, fontWeight: 600, color: brand.muted }}>of {String(total).padStart(2, '0')}</div>
    </div>
  );
}

/** Vertical chain of nodes; each node and the arrow into it reveal in sequence. */
function NodeFlow({ nodes }: { nodes: string[] }): ReactElement {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const stagger = 0.45 * fps;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch' }}>
      {nodes.map((node, index) => {
        const reveal = spring({
          frame: frame - Math.round(0.4 * fps + index * stagger),
          fps,
          config: { damping: 200 },
          durationInFrames: Math.round(0.5 * fps),
        });
        return (
          <Fragment key={`${index}-${node}`}>
            {index > 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', height: 56 }}>
                <div style={{ width: 4, height: interpolate(reveal, [0, 1], [0, 40]), backgroundColor: brand.accent }} />
                <div
                  style={{
                    width: 0,
                    height: 0,
                    borderLeft: '12px solid transparent',
                    borderRight: '12px solid transparent',
                    borderTop: `16px solid ${brand.accent}`,
                    opacity: reveal,
                  }}
                />
              </div>
            ) : null}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 20,
                padding: '20px 28px',
                borderRadius: 20,
                backgroundColor: surfaceRaised,
                border: `2px solid ${index === 0 ? brand.accent : hairline}`,
                fontSize: 42,
                fontWeight: 700,
                color: brand.text,
                opacity: reveal,
                translate: `${interpolate(reveal, [0, 1], [-24, 0])}px 0px`,
              }}
            >
              <div style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: brand.accent }} />
              {node.trim()}
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}
