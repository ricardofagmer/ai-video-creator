import { useMemo, type ReactElement, type ReactNode } from 'react';
import { AbsoluteFill, Audio, Sequence, useVideoConfig } from 'remotion';
import type { RenderInput } from '@studio/shared/ace';
import { SAMPLE_AUDIO_URL, accentSoft, brand, fontFamily } from '../theme';
import { Captions } from './Captions';
import { Disclosure } from './Disclosure';
import { ProgressBar } from './ProgressBar';
import { buildSceneSlots, type SceneSlot } from './scene-slots';

interface TemplateShellProps {
  input: RenderInput;
  renderScene: (slot: SceneSlot) => ReactNode;
}

/** Shared chrome for every template: background, scene sequences, captions, progress, disclosure, narration. */
export function TemplateShell({ input, renderScene }: TemplateShellProps): ReactElement {
  const { fps, durationInFrames } = useVideoConfig();
  const slots = useMemo(
    () => buildSceneSlots(input.scenes, fps, durationInFrames),
    [input.scenes, fps, durationInFrames],
  );
  const lastSlot = slots[slots.length - 1];

  return (
    <AbsoluteFill style={{ backgroundColor: brand.background, color: brand.text, fontFamily }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(circle at 85% 8%, ${accentSoft} 0%, transparent 45%), radial-gradient(circle at 10% 95%, rgba(46, 196, 182, 0.08) 0%, transparent 40%)`,
        }}
      />
      {slots.map((slot) => (
        <Sequence
          key={slot.scene.id}
          name={`${slot.scene.kind} ${slot.kindNumber}`}
          from={slot.from}
          durationInFrames={slot.durationInFrames}
        >
          {renderScene(slot)}
        </Sequence>
      ))}
      <ProgressBar />
      {lastSlot ? (
        <Sequence name="Disclosure" from={lastSlot.from} durationInFrames={lastSlot.durationInFrames}>
          <Disclosure text={input.disclosure} />
        </Sequence>
      ) : null}
      <Captions words={input.captions} />
      {input.audioUrl === SAMPLE_AUDIO_URL ? null : <Audio src={input.audioUrl} />}
    </AbsoluteFill>
  );
}
