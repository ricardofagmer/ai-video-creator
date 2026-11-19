import type { NarrationManifest, ScriptScene, WordTiming } from '@studio/shared/ace';
import { countWords } from '../validation/text';

export type SceneTiming = NarrationManifest['sceneTimings'][number];

/**
 * Walks the scenes' narration word counts across the spoken word timings. If the voice
 * returned a different number of words than the script holds (text normalisation),
 * scene boundaries are placed proportionally. Scenes are contiguous: each ends where
 * the next starts, the first starts at 0 and the last ends at the audio's end.
 */
export function computeSceneTimings(scenes: readonly ScriptScene[], words: readonly WordTiming[], durationS: number): SceneTiming[] {
  const sceneWordCounts = scenes.map((scene) => countWords(scene.narration));
  const scriptWordTotal = sceneWordCounts.reduce((sum, count) => sum + count, 0);
  const scale = scriptWordTotal > 0 ? words.length / scriptWordTotal : 0;
  const starts: number[] = [];
  let cursor = 0;
  for (const count of sceneWordCounts) {
    const wordIndex = Math.min(words.length - 1, Math.max(0, Math.round(cursor * scale)));
    starts.push(starts.length === 0 ? 0 : (words[wordIndex]?.startS ?? durationS));
    cursor += count;
  }
  return scenes.map((scene, index) => {
    const startS = starts[index] ?? 0;
    const nextStart = starts[index + 1];
    const endS = nextStart === undefined ? durationS : Math.max(startS, nextStart);
    return { sceneId: scene.id, startS, endS };
  });
}
