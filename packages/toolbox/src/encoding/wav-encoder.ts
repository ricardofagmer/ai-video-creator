const BITS_PER_SAMPLE = 16;
const HEADER_BYTES = 44;

/** Encodes mono 16-bit PCM samples as a RIFF/WAVE file. */
export function encodeWavPcm16Mono(samples: Int16Array, sampleRate: number): Buffer {
  const blockAlign = BITS_PER_SAMPLE / 8;
  const dataBytes = samples.length * blockAlign;
  const buffer = Buffer.alloc(HEADER_BYTES + dataBytes);
  buffer.write('RIFF', 0, 'ascii');
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write('WAVE', 8, 'ascii');
  buffer.write('fmt ', 12, 'ascii');
  buffer.writeUInt32LE(16, 16); // fmt chunk size
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(BITS_PER_SAMPLE, 34);
  buffer.write('data', 36, 'ascii');
  buffer.writeUInt32LE(dataBytes, 40);
  for (let index = 0; index < samples.length; index += 1) {
    buffer.writeInt16LE(samples[index] ?? 0, HEADER_BYTES + index * blockAlign);
  }
  return buffer;
}
