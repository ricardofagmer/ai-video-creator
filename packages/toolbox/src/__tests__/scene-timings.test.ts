import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ScriptScene, WordTiming } from '@studio/shared/ace';
import { computeSceneTimings } from '../narration/scene-timings';

/*
 * CR12 (ticket 10): scene boundaries walked across the spoken word timings. Scenes are contiguous,
 * the first starts at 0 and the last ends at the audio's end.
 */

function scene(id: string, narration: string): ScriptScene {
  return { id, kind: 'step', narration, onScreenText: '', visual: 'captura', claimIds: [], durationHintS: 5 };
}

/** One word per second: word i spans [i, i + 0.9]. */
function wordsOf(count: number): WordTiming[] {
  return Array.from({ length: count }, (_, index) => ({ text: `w${index}`, startS: index, endS: index + 0.9 }));
}

describe('toolbox computeSceneTimings (CR12)', () => {
  it('starts each scene at the timing of its first word when the counts match', () => {
    const scenes = [scene('hook', 'um dois'), scene('step', 'três quatro cinco'), scene('cta', 'seis')];

    assert.deepEqual(computeSceneTimings(scenes, wordsOf(6), 6.5), [
      { sceneId: 'hook', startS: 0, endS: 2 },
      { sceneId: 'step', startS: 2, endS: 5 },
      { sceneId: 'cta', startS: 5, endS: 6.5 },
    ]);
  });

  it('places boundaries proportionally when the voice returned a different word count', () => {
    const scenes = [scene('a', 'um dois'), scene('b', 'três quatro')];

    assert.deepEqual(computeSceneTimings(scenes, wordsOf(8), 8), [
      { sceneId: 'a', startS: 0, endS: 4 },
      { sceneId: 'b', startS: 4, endS: 8 },
    ]);
  });

  it('keeps scenes contiguous from 0 to the audio end', () => {
    const scenes = [scene('a', 'um'), scene('b', 'dois três'), scene('c', 'quatro cinco seis'), scene('d', 'sete')];

    const timings = computeSceneTimings(scenes, wordsOf(5), 9);

    assert.equal(timings[0]?.startS, 0);
    assert.equal(timings.at(-1)?.endS, 9);
    for (let index = 1; index < timings.length; index += 1) {
      assert.equal(timings[index]?.startS, timings[index - 1]?.endS);
    }
  });

  it('gives a single scene the whole audio', () => {
    assert.deepEqual(computeSceneTimings([scene('only', 'tudo aqui')], wordsOf(2), 3), [{ sceneId: 'only', startS: 0, endS: 3 }]);
  });

  it('returns no timings when there are no scenes', () => {
    assert.deepEqual(computeSceneTimings([], wordsOf(3), 3), []);
  });

  it('starts later scenes at the audio end when no word timings exist', () => {
    const timings = computeSceneTimings([scene('a', 'um'), scene('b', 'dois')], [], 4);

    assert.deepEqual(timings, [
      { sceneId: 'a', startS: 0, endS: 4 },
      { sceneId: 'b', startS: 4, endS: 4 },
    ]);
  });
});
