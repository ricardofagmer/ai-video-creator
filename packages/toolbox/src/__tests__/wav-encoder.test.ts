import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { encodeWavPcm16Mono } from '../encoding/wav-encoder';

/* CR12 (ticket 10): the RIFF/WAVE writer behind the mock voice and the hook audio. */

describe('toolbox encodeWavPcm16Mono (CR12)', () => {
  it('writes a 44-byte PCM mono 16-bit header for the sample rate', () => {
    const wav = encodeWavPcm16Mono(new Int16Array([0, 1, -1]), 22_050);

    assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
    assert.equal(wav.readUInt32LE(4), 36 + 6);
    assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
    assert.equal(wav.toString('ascii', 12, 16), 'fmt ');
    assert.equal(wav.readUInt32LE(16), 16);
    assert.equal(wav.readUInt16LE(20), 1, 'PCM');
    assert.equal(wav.readUInt16LE(22), 1, 'mono');
    assert.equal(wav.readUInt32LE(24), 22_050);
    assert.equal(wav.readUInt32LE(28), 44_100, 'byte rate');
    assert.equal(wav.readUInt16LE(32), 2, 'block align');
    assert.equal(wav.readUInt16LE(34), 16, 'bits per sample');
    assert.equal(wav.toString('ascii', 36, 40), 'data');
    assert.equal(wav.readUInt32LE(40), 6);
  });

  it('stores every sample little-endian after the header, including the extremes', () => {
    const samples = new Int16Array([0, 32_767, -32_768, -1, 1234]);

    const wav = encodeWavPcm16Mono(samples, 8000);

    assert.equal(wav.length, 44 + samples.length * 2);
    assert.deepEqual(
      Array.from({ length: samples.length }, (_, index) => wav.readInt16LE(44 + index * 2)),
      Array.from(samples),
    );
  });

  it('writes a header-only file for no samples', () => {
    const wav = encodeWavPcm16Mono(new Int16Array(0), 44_100);

    assert.equal(wav.length, 44);
    assert.equal(wav.readUInt32LE(4), 36);
    assert.equal(wav.readUInt32LE(40), 0);
  });

  it('produces identical bytes for identical input', () => {
    const samples = new Int16Array([5, -5, 500]);

    assert.ok(encodeWavPcm16Mono(samples, 16_000).equals(encodeWavPcm16Mono(samples, 16_000)));
  });
});
