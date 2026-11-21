import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { LocalRenderInputSchema, RenderInputSchema, type RenderInput } from './render';

/*
 * The render input boundary (baseline review 2026-11-21, "strict render schema"): producers hand the
 * renderer loopback media URLs only, with no unknown keys and bounded text and arrays, while the
 * Remotion composition schema keeps accepting Studio previews and the 16:9 tour's props.
 */

const SERVER = 'http://127.0.0.1:53111/0123456789abcdef0123456789abcdef';

function validInput(overrides: Partial<RenderInput> = {}): RenderInput {
  return {
    template: 'TOOL_DEMO',
    title: 'Meeting notes with AI',
    durationS: 42.5,
    audioUrl: `${SERVER}/narration.wav`,
    scenes: [
      { id: 'hook-1', kind: 'hook', startS: 0, endS: 3, onScreenText: 'Stop typing notes', asset: { url: `${SERVER}/capture-1.webm`, kind: 'video' } },
      { id: 'cta-1', kind: 'cta', startS: 3, endS: 42.5, onScreenText: 'Try it', asset: null },
    ],
    captions: [{ text: 'Stop', startS: 0.1, endS: 0.4 }],
    disclosure: 'AI-generated voice. Links may be affiliate.',
    ...overrides,
  };
}

function withAssetUrl(url: string): RenderInput {
  const input = validInput();
  const [first, ...rest] = input.scenes;
  assert.ok(first !== undefined);
  return { ...input, scenes: [{ ...first, asset: { url, kind: 'image' } }, ...rest] };
}

describe('LocalRenderInputSchema', () => {
  it('accepts the URLs the toolbox static server builds', () => {
    assert.equal(LocalRenderInputSchema.safeParse(validInput()).success, true);
    assert.equal(LocalRenderInputSchema.safeParse(validInput({ audioUrl: 'http://localhost:4000/token/a.mp3' })).success, true);
    assert.equal(LocalRenderInputSchema.safeParse(validInput({ audioUrl: 'http://[::1]:4000/token/a.mp3' })).success, true);
  });

  for (const audioUrl of [
    'file:///etc/passwd',
    'https://example.com/narration.mp3',
    'http://192.168.1.10/narration.mp3',
    'http://user:secret@127.0.0.1:4000/narration.mp3',
    'data:audio/wav;base64,AAAA',
    'not a url',
  ]) {
    it(`refuses audioUrl ${audioUrl}`, () => {
      assert.equal(LocalRenderInputSchema.safeParse(validInput({ audioUrl })).success, false);
    });
  }

  it('refuses a scene asset that is not on the loopback server', () => {
    assert.equal(LocalRenderInputSchema.safeParse(withAssetUrl('https://cdn.example.com/a.png')).success, false);
    assert.equal(LocalRenderInputSchema.safeParse(withAssetUrl('file:///Users/someone/a.png')).success, false);
  });

  it('refuses unknown keys at every level', () => {
    assert.equal(LocalRenderInputSchema.safeParse({ ...validInput(), extra: true }).success, false);
    const input = validInput();
    assert.equal(LocalRenderInputSchema.safeParse({ ...input, scenes: input.scenes.map((scene) => ({ ...scene, extra: 1 })) }).success, false);
    assert.equal(LocalRenderInputSchema.safeParse({ ...input, captions: [{ text: 'a', startS: 0, endS: 1, extra: 1 }] }).success, false);
  });

  it('refuses oversized text and arrays', () => {
    const input = validInput();
    const [scene] = input.scenes;
    assert.ok(scene !== undefined);
    assert.equal(LocalRenderInputSchema.safeParse(validInput({ title: 'x'.repeat(201) })).success, false);
    assert.equal(LocalRenderInputSchema.safeParse(validInput({ disclosure: 'x'.repeat(201) })).success, false);
    assert.equal(LocalRenderInputSchema.safeParse(validInput({ scenes: Array.from({ length: 101 }, () => scene) })).success, false);
    assert.equal(
      LocalRenderInputSchema.safeParse(validInput({ captions: Array.from({ length: 20_001 }, () => ({ text: 'a', startS: 0, endS: 1 })) })).success,
      false,
    );
    assert.equal(LocalRenderInputSchema.safeParse(validInput({ durationS: 36_001 })).success, false);
  });
});

describe('RenderInputSchema (composition props)', () => {
  it('still accepts the Studio preview audio sentinel', () => {
    assert.equal(RenderInputSchema.safeParse(validInput({ audioUrl: 'https://example.invalid/ace-sample-narration.mp3' })).success, true);
  });

  it('still lets the 16:9 tour validate props that carry template', () => {
    const tourSchema = RenderInputSchema.omit({ template: true });
    assert.equal(tourSchema.safeParse(validInput({ template: 'PRODUCT_TOUR_16X9' })).success, true);
  });

  it('refuses a non-http audio URL', () => {
    assert.equal(RenderInputSchema.safeParse(validInput({ audioUrl: 'file:///etc/passwd' })).success, false);
  });
});
