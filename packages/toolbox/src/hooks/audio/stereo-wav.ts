import type { StereoBuffer } from './synth';

const BITS_PER_SAMPLE = 24;
const BYTES_PER_SAMPLE = BITS_PER_SAMPLE / 8;
const CHANNELS = 2;
const HEADER_BYTES = 44;
const FULL_SCALE = 8_388_607;

/** Encodes a stereo buffer as 24-bit PCM RIFF/WAVE; samples beyond +-1 are clamped. */
export function encodeWavPcm24Stereo(buffer: StereoBuffer): Buffer {
  const frames = Math.min(buffer.left.length, buffer.right.length);
  const blockAlign = CHANNELS * BYTES_PER_SAMPLE;
  const dataBytes = frames * blockAlign;
  const output = Buffer.alloc(HEADER_BYTES + dataBytes);
  output.write('RIFF', 0, 'ascii');
  output.writeUInt32LE(36 + dataBytes, 4);
  output.write('WAVE', 8, 'ascii');
  output.write('fmt ', 12, 'ascii');
  output.writeUInt32LE(16, 16);
  output.writeUInt16LE(1, 20);
  output.writeUInt16LE(CHANNELS, 22);
  output.writeUInt32LE(buffer.sampleRate, 24);
  output.writeUInt32LE(buffer.sampleRate * blockAlign, 28);
  output.writeUInt16LE(blockAlign, 32);
  output.writeUInt16LE(BITS_PER_SAMPLE, 34);
  output.write('data', 36, 'ascii');
  output.writeUInt32LE(dataBytes, 40);
  for (let frame = 0; frame < frames; frame += 1) {
    const offset = HEADER_BYTES + frame * blockAlign;
    output.writeIntLE(toPcm24(buffer.left[frame] ?? 0), offset, BYTES_PER_SAMPLE);
    output.writeIntLE(toPcm24(buffer.right[frame] ?? 0), offset + BYTES_PER_SAMPLE, BYTES_PER_SAMPLE);
  }
  return output;
}

function toPcm24(sample: number): number {
  const clamped = Math.max(-1, Math.min(1, sample));
  return Math.round(clamped * FULL_SCALE);
}
