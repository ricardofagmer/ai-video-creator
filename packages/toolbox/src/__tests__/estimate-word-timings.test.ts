import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { estimateWordTimings } from '../narration/estimate-word-timings';

/* CR12 (ticket 10): word timings spread by character weight for voices that return none. */

describe('toolbox estimateWordTimings (CR12)', () => {
  it('returns one timing per word, in order, with the word text', () => {
    const timings = estimateWordTimings('abra o aplicativo', 3);

    assert.deepEqual(
      timings.map((timing) => timing.text),
      ['abra', 'o', 'aplicativo'],
    );
  });

  it('starts after the edge gap and keeps every word inside the clip', () => {
    const timings = estimateWordTimings('um dois três quatro', 2);

    assert.equal(timings[0]?.startS, 0.06);
    for (const timing of timings) {
      assert.ok(timing.endS > timing.startS);
      assert.ok(timing.endS <= 2 - 0.06);
    }
  });

  it('never overlaps consecutive words', () => {
    const timings = estimateWordTimings('passo um passo dois passo três', 4);

    for (let index = 1; index < timings.length; index += 1) {
      assert.ok((timings[index]?.startS ?? 0) >= (timings[index - 1]?.endS ?? Number.POSITIVE_INFINITY));
    }
  });

  it('gives longer words a longer share of the clip', () => {
    const [short, long] = estimateWordTimings('a aplicativo', 2);

    assert.ok(short !== undefined && long !== undefined);
    assert.ok(long.endS - long.startS > short.endS - short.startS);
  });

  it('shifts every timing by the clip offset', () => {
    const base = estimateWordTimings('um dois', 1);
    const shifted = estimateWordTimings('um dois', 1, 10);

    assert.deepEqual(
      shifted.map((timing) => Math.round((timing.startS - 10) * 1000) / 1000),
      base.map((timing) => timing.startS),
    );
  });

  it('rounds times to milliseconds', () => {
    for (const timing of estimateWordTimings('um dois três', 1.2345)) {
      assert.equal(Math.round(timing.startS * 1000) / 1000, timing.startS);
      assert.equal(Math.round(timing.endS * 1000) / 1000, timing.endS);
    }
  });

  it('returns no timings for empty text', () => {
    assert.deepEqual(estimateWordTimings('   ', 3), []);
  });

  it('still returns ordered timings for a clip shorter than the edge gaps', () => {
    const timings = estimateWordTimings('um dois', 0.05);

    assert.equal(timings.length, 2);
    assert.ok((timings[1]?.startS ?? 0) >= (timings[0]?.endS ?? Number.POSITIVE_INFINITY));
  });
});
