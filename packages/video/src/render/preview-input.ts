import { templateTimelines, type RenderScene, type TemplateId, type WordTiming } from '@studio/shared/ace';
import { sampleScripts, type SampleBeat } from '../sample/sample-scripts';

const WORD_FILL = 0.85;
const SECTION_LEAD_S = 0.15;
const SECTION_TRAIL_S = 0.25;

/** The sample copy of a template, cut to its first `seconds`: what the catalog preview clip renders. */
export interface PreviewInput {
  title: string;
  durationS: number;
  scenes: RenderScene[];
  captions: WordTiming[];
}

/**
 * Template preview (2026-11-25). The same meeting-notes copy and timing rule the Studio sample uses
 * (`../sample/sample-input.ts`), with scenes and captions clipped to `seconds`. Kept free of Remotion
 * and of the theme so the watcher daemon can import it from `dist` without loading the renderer.
 */
export function buildPreviewInput(template: TemplateId, seconds: number): PreviewInput {
  const timeline = templateTimelines[template];
  const script = sampleScripts[template];
  const scenes: RenderScene[] = [];
  const captions: WordTiming[] = [];
  for (const section of timeline) {
    const beats = script.beats[section.kind] ?? [];
    const span = (section.toS - section.fromS) / Math.max(1, beats.length);
    beats.forEach((beat, beatIndex) => {
      const startS = section.fromS + beatIndex * span;
      const endS = startS + span;
      if (startS >= seconds) return;
      scenes.push({ id: `${section.kind}-${beatIndex + 1}`, kind: section.kind, startS, endS: Math.min(endS, seconds), onScreenText: beat.onScreenText, asset: null });
      captions.push(...spreadWords(beat, startS, endS).filter((word) => word.endS <= seconds));
    });
  }
  const last = timeline[timeline.length - 1];
  const fullS = last === undefined ? seconds : last.toS;
  return { title: script.title, durationS: Math.min(seconds, fullS), scenes, captions };
}

function spreadWords(beat: SampleBeat, startS: number, endS: number): WordTiming[] {
  const words = beat.narration.split(/\s+/).filter(Boolean);
  const windowStart = startS + SECTION_LEAD_S;
  const slot = (endS - SECTION_TRAIL_S - windowStart) / Math.max(1, words.length);
  return words.map((text, index) => {
    const wordStart = windowStart + index * slot;
    return { text, startS: round(wordStart), endS: round(wordStart + slot * WORD_FILL) };
  });
}

function round(seconds: number): number {
  return Math.round(seconds * 1000) / 1000;
}
