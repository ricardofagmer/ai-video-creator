/**
 * Offline synthesis primitives for the hook score: 48 kHz Float32 buffers, deterministic.
 * Everything renders ahead of time, so filters recompute coefficients per block instead of
 * smoothing parameters per sample.
 */

export const SAMPLE_RATE = 48_000;

export interface StereoBuffer {
  sampleRate: number;
  left: Float32Array;
  right: Float32Array;
}

export interface Envelope {
  attackS: number;
  decayS: number;
  sustain: number;
  releaseS: number;
}

export interface PlaceOptions {
  atS: number;
  gain: number;
  /** -1 left, 0 centre, 1 right. */
  pan?: number;
}

export function createStereo(durationS: number): StereoBuffer {
  const length = Math.max(1, Math.ceil(durationS * SAMPLE_RATE));
  return { sampleRate: SAMPLE_RATE, left: new Float32Array(length), right: new Float32Array(length) };
}

export function midiToHz(midi: number): number {
  return 440 * 2 ** ((midi - 69) / 12);
}

export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** mulberry32: tiny and seedable, so every render of the same timeline is bit-identical. */
export function createRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** Noise in [-1, 1]. */
export function noiseSample(random: () => number): number {
  return random() * 2 - 1;
}

/** ADSR level at time t for a note whose gate closes at gateS. */
export function adsrAt(envelope: Envelope, t: number, gateS: number): number {
  if (t < 0) return 0;
  const held = (time: number): number => {
    if (time < envelope.attackS) return time / Math.max(envelope.attackS, 1e-6);
    const decayed = time - envelope.attackS;
    if (decayed < envelope.decayS) return 1 - (1 - envelope.sustain) * (decayed / Math.max(envelope.decayS, 1e-6));
    return envelope.sustain;
  };
  if (t < gateS) return held(t);
  const released = t - gateS;
  if (released >= envelope.releaseS) return 0;
  return held(gateS) * (1 - released / Math.max(envelope.releaseS, 1e-6));
}

/** Exponential decay with a short linear attack, the shape of every percussive hit. */
export function percussive(t: number, attackS: number, decayTauS: number): number {
  if (t < 0) return 0;
  if (t < attackS) return t / attackS;
  return Math.exp(-(t - attackS) / decayTauS);
}

/** polyBLEP residual: removes the aliasing step of a naive saw at the wrap point. */
function polyBlep(phase: number, phaseIncrement: number): number {
  if (phase < phaseIncrement) {
    const x = phase / phaseIncrement;
    return x + x - x * x - 1;
  }
  if (phase > 1 - phaseIncrement) {
    const x = (phase - 1) / phaseIncrement;
    return x * x + x + x + 1;
  }
  return 0;
}

export class SawOscillator {
  private phase: number;

  constructor(private readonly frequencyHz: number, initialPhase: number) {
    this.phase = initialPhase % 1;
  }

  next(): number {
    const increment = this.frequencyHz / SAMPLE_RATE;
    const value = 2 * this.phase - 1 - polyBlep(this.phase, increment);
    this.phase += increment;
    if (this.phase >= 1) this.phase -= 1;
    return value;
  }
}

export class OnePoleLowpass {
  private state = 0;
  private coefficient = 0;

  constructor(cutoffHz: number) {
    this.setCutoff(cutoffHz);
  }

  setCutoff(cutoffHz: number): void {
    this.coefficient = 1 - Math.exp((-2 * Math.PI * cutoffHz) / SAMPLE_RATE);
  }

  process(input: number): number {
    this.state += this.coefficient * (input - this.state);
    return this.state;
  }
}

export type BiquadType = 'lowpass' | 'highpass' | 'bandpass';

/** RBJ cookbook biquad, transposed direct form II. */
export class Biquad {
  private b0 = 1;
  private b1 = 0;
  private b2 = 0;
  private a1 = 0;
  private a2 = 0;
  private z1 = 0;
  private z2 = 0;

  constructor(private readonly type: BiquadType, cutoffHz: number, q = Math.SQRT1_2) {
    this.setCutoff(cutoffHz, q);
  }

  setCutoff(cutoffHz: number, q = Math.SQRT1_2): void {
    const clamped = Math.min(Math.max(cutoffHz, 20), SAMPLE_RATE * 0.45);
    const omega = (2 * Math.PI * clamped) / SAMPLE_RATE;
    const cosine = Math.cos(omega);
    const alpha = Math.sin(omega) / (2 * q);
    const a0 = 1 + alpha;
    let b0: number;
    let b1: number;
    let b2: number;
    if (this.type === 'lowpass') {
      b0 = (1 - cosine) / 2;
      b1 = 1 - cosine;
      b2 = b0;
    } else if (this.type === 'highpass') {
      b0 = (1 + cosine) / 2;
      b1 = -(1 + cosine);
      b2 = b0;
    } else {
      b0 = alpha;
      b1 = 0;
      b2 = -alpha;
    }
    this.b0 = b0 / a0;
    this.b1 = b1 / a0;
    this.b2 = b2 / a0;
    this.a1 = (-2 * cosine) / a0;
    this.a2 = (1 - alpha) / a0;
  }

  process(input: number): number {
    const output = this.b0 * input + this.z1;
    this.z1 = this.b1 * input - this.a1 * output + this.z2;
    this.z2 = this.b2 * input - this.a2 * output;
    return output;
  }
}

/** Smooth saturation that stays linear below ~0.5 and never exceeds +-1. */
export function softClip(sample: number): number {
  return Math.tanh(sample);
}

function addAt(channel: Float32Array, index: number, value: number): void {
  if (index >= 0 && index < channel.length) channel[index] = (channel[index] ?? 0) + value;
}

/** Mixes a mono voice into a stereo buffer with an equal-power pan. */
export function placeMono(target: StereoBuffer, voice: Float32Array, options: PlaceOptions): void {
  const angle = ((options.pan ?? 0) + 1) * (Math.PI / 4);
  const leftGain = Math.cos(angle) * Math.SQRT2 * options.gain;
  const rightGain = Math.sin(angle) * Math.SQRT2 * options.gain;
  const offset = Math.round(options.atS * SAMPLE_RATE);
  for (let index = 0; index < voice.length; index += 1) {
    const sample = voice[index] ?? 0;
    addAt(target.left, offset + index, sample * leftGain);
    addAt(target.right, offset + index, sample * rightGain);
  }
}

export function placeStereo(target: StereoBuffer, source: StereoBuffer, options: PlaceOptions): void {
  const offset = Math.round(options.atS * SAMPLE_RATE);
  for (let index = 0; index < source.left.length; index += 1) {
    addAt(target.left, offset + index, (source.left[index] ?? 0) * options.gain);
    addAt(target.right, offset + index, (source.right[index] ?? 0) * options.gain);
  }
}

/** Renders a mono voice sample by sample from a function of time in seconds. */
export function renderVoice(durationS: number, sampleAt: (t: number) => number): Float32Array {
  const voice = new Float32Array(Math.max(1, Math.ceil(durationS * SAMPLE_RATE)));
  for (let index = 0; index < voice.length; index += 1) voice[index] = sampleAt(index / SAMPLE_RATE);
  return voice;
}
