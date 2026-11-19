import { Biquad, createStereo, SAMPLE_RATE, softClip, type StereoBuffer } from './synth';

/** Freeverb-style comb tunings (in samples at 44.1 kHz), offset on the right for width. */
const COMB_TUNINGS = [1116, 1188, 1277, 1356, 1422, 1491] as const;
const ALLPASS_TUNINGS = [556, 441, 341] as const;
const STEREO_SPREAD = 23;

class Comb {
  private readonly buffer: Float32Array;
  private index = 0;
  private filterState = 0;

  constructor(length: number, private readonly feedback: number, private readonly damping: number) {
    this.buffer = new Float32Array(length);
  }

  process(input: number): number {
    const output = this.buffer[this.index] ?? 0;
    this.filterState = output * (1 - this.damping) + this.filterState * this.damping;
    this.buffer[this.index] = input + this.filterState * this.feedback;
    this.index = (this.index + 1) % this.buffer.length;
    return output;
  }
}

class Allpass {
  private readonly buffer: Float32Array;
  private index = 0;

  constructor(length: number) {
    this.buffer = new Float32Array(length);
  }

  process(input: number): number {
    const delayed = this.buffer[this.index] ?? 0;
    this.buffer[this.index] = input + delayed * 0.5;
    this.index = (this.index + 1) % this.buffer.length;
    return delayed - input;
  }
}

function scaledLength(tuning: number): number {
  return Math.round((tuning * SAMPLE_RATE) / 44_100);
}

function reverbChannel(input: Float32Array, spread: number, options: ReverbOptions): Float32Array {
  const combs = COMB_TUNINGS.map((tuning) => new Comb(scaledLength(tuning + spread), options.feedback, options.damping));
  const allpasses = ALLPASS_TUNINGS.map((tuning) => new Allpass(scaledLength(tuning + spread)));
  const output = new Float32Array(input.length);
  for (let index = 0; index < input.length; index += 1) {
    const sample = (input[index] ?? 0) * 0.08;
    let wet = 0;
    for (const comb of combs) wet += comb.process(sample);
    for (const allpass of allpasses) wet = allpass.process(wet);
    output[index] = wet;
  }
  return output;
}

export interface ReverbOptions {
  /** Comb feedback, 0.7 (room) to 0.88 (hall). */
  feedback: number;
  damping: number;
}

/** Returns only the wet signal of a stereo send; the caller sets the return level. */
export function reverb(send: StereoBuffer, options: ReverbOptions): StereoBuffer {
  const mono = new Float32Array(send.left.length);
  for (let index = 0; index < mono.length; index += 1) mono[index] = ((send.left[index] ?? 0) + (send.right[index] ?? 0)) / 2;
  return { sampleRate: send.sampleRate, left: reverbChannel(mono, 0, options), right: reverbChannel(mono, STEREO_SPREAD, options) };
}

/** Multiplies both channels by a gain function of time (masks, ducking, fades). */
export function applyGain(buffer: StereoBuffer, gainAt: (t: number) => number): void {
  for (let index = 0; index < buffer.left.length; index += 1) {
    const gain = gainAt(index / SAMPLE_RATE);
    buffer.left[index] = (buffer.left[index] ?? 0) * gain;
    buffer.right[index] = (buffer.right[index] ?? 0) * gain;
  }
}

const AUTOMATION_BLOCK = 32;

/** Lowpass whose cutoff follows cutoffAt(t); a cutoff at or above 18 kHz bypasses it. */
export function automatedLowpass(buffer: StereoBuffer, cutoffAt: (t: number) => number): void {
  const left = new Biquad('lowpass', 18_000);
  const right = new Biquad('lowpass', 18_000);
  for (let index = 0; index < buffer.left.length; index += 1) {
    if (index % AUTOMATION_BLOCK === 0) {
      const cutoff = cutoffAt(index / SAMPLE_RATE);
      left.setCutoff(cutoff);
      right.setCutoff(cutoff);
    }
    buffer.left[index] = left.process(buffer.left[index] ?? 0);
    buffer.right[index] = right.process(buffer.right[index] ?? 0);
  }
}

export function softClipBuffer(buffer: StereoBuffer, drive: number): void {
  for (let index = 0; index < buffer.left.length; index += 1) {
    buffer.left[index] = softClip((buffer.left[index] ?? 0) * drive) / drive;
    buffer.right[index] = softClip((buffer.right[index] ?? 0) * drive) / drive;
  }
}

export function sumInto(target: StereoBuffer, source: StereoBuffer, gain: number): void {
  const length = Math.min(target.left.length, source.left.length);
  for (let index = 0; index < length; index += 1) {
    target.left[index] = (target.left[index] ?? 0) + (source.left[index] ?? 0) * gain;
    target.right[index] = (target.right[index] ?? 0) + (source.right[index] ?? 0) * gain;
  }
}

export function cloneSilent(like: StereoBuffer): StereoBuffer {
  return createStereo(like.left.length / SAMPLE_RATE);
}

export function peakOf(buffer: StereoBuffer): number {
  let peak = 0;
  for (let index = 0; index < buffer.left.length; index += 1) {
    peak = Math.max(peak, Math.abs(buffer.left[index] ?? 0), Math.abs(buffer.right[index] ?? 0));
  }
  return peak;
}
