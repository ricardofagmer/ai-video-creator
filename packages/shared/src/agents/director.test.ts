import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ScenesOutputSchema } from './director';
import { ScriptOutputSchema } from './writer';

/*
 * Baseline review 2026-11-21: `sceneId` and `captureId` are model output that reaches logs, file
 * names, the frame tool and the terminal; both are bounded ids, and today's outputs still pass.
 */

function scenesWith(scene: { sceneId: string; captureId?: string }): unknown {
  const visual = scene.captureId === undefined ? { type: 'title-card', text: 'Abertura' } : { type: 'capture', captureId: scene.captureId, inMs: 0, outMs: 18_000 };
  return { scenes: [{ sceneId: scene.sceneId, visual, cameraMove: 'push-in', transition: 'cut' }], citedRefs: [] };
}

function accepts(scene: { sceneId: string; captureId?: string }): boolean {
  return ScenesOutputSchema.safeParse(scenesWith(scene)).success;
}

describe('ScenesOutputSchema ids', () => {
  it('accepts the ids the mock director and the capture stage produce', () => {
    assert.equal(accepts({ sceneId: 's1', captureId: 'cap-1' }), true);
    assert.equal(accepts({ sceneId: 's3', captureId: 'capture-1' }), true);
    assert.equal(accepts({ sceneId: 'scene_2' }), true);
    assert.equal(accepts({ sceneId: 'Intro' }), true);
  });

  it('accepts a scene id of exactly 64 characters and refuses 65', () => {
    assert.equal(accepts({ sceneId: `s${'1'.repeat(63)}` }), true);
    assert.equal(accepts({ sceneId: `s${'1'.repeat(64)}` }), false);
  });

  it('refuses a scene id with a path, whitespace, a control sequence or nothing at all', () => {
    for (const sceneId of ['../s1', 's1/x', 'cena 1', 's1\u001b[2J', '-s1', '']) {
      assert.equal(accepts({ sceneId }), false, JSON.stringify(sceneId));
    }
  });

  it('refuses a capture id that is not a lowercase kebab id of at most 64 characters', () => {
    for (const captureId of ['../capture-1', 'Capture-1', 'capture_1', 'capture-1\u001b]0;x\u0007', '', `c${'a'.repeat(64)}`]) {
      assert.equal(accepts({ sceneId: 's1', captureId }), false, JSON.stringify(captureId));
    }
  });
});

describe('ScriptOutputSchema scene ids', () => {
  function script(sceneId: string): unknown {
    return {
      title: 'Titulo',
      hook: 'Gancho',
      scenes: [{ sceneId, narration: 'Texto', claimIds: [], estDurationSec: 5 }],
      totalEstDurationSec: 5,
    };
  }

  it('bounds the Scriptwriter scene id exactly like the director', () => {
    for (const sceneId of ['s1', 'scene_2', 'Intro', `s${'1'.repeat(63)}`]) {
      assert.equal(ScriptOutputSchema.safeParse(script(sceneId)).success, true, sceneId);
    }
    for (const sceneId of ['../s1', 'cena 1', 's1\u001b[2J', '-s1', '', `s${'1'.repeat(64)}`]) {
      assert.equal(ScriptOutputSchema.safeParse(script(sceneId)).success, false, JSON.stringify(sceneId));
    }
  });
});
