import {
  Biquad,
  createStereo,
  midiToHz,
  noiseSample,
  OnePoleLowpass,
  percussive,
  renderVoice,
  SAMPLE_RATE,
  SawOscillator,
  type StereoBuffer,
} from './synth';

/**
 * Instruments of the hook score. Each one owns a frequency band so layers never mask each
 * other: sub/kick below 120 Hz, pad 150 Hz-2 kHz, clap 1-3 kHz, pings/arp 300 Hz-3 kHz with
 * sharp attacks, hats above 7 kHz.
 */

const TWO_PI = 2 * Math.PI;

/** Bright sine with a quickly fading 2nd/3rd harmonic: the motif voice. */
export function renderPing(midi: number, options: { decayTauS: number; durationS: number }): Float32Array {
  const frequency = midiToHz(midi);
  return renderVoice(options.durationS, (t) => {
    const body = Math.sin(TWO_PI * frequency * t) * percussive(t, 0.002, options.decayTauS);
    const harmonics =
      (0.32 * Math.sin(TWO_PI * 2 * frequency * t) + 0.1 * Math.sin(TWO_PI * 3 * frequency * t)) * percussive(t, 0.002, 0.09);
    return 0.8 * (body + harmonics);
  });
}

/** Two-operator FM pluck; the decaying index gives the bright-then-round attack. */
export function renderFmPluck(midi: number, durationS: number): Float32Array {
  const frequency = midiToHz(midi);
  return renderVoice(durationS, (t) => {
    const index = 2.4 * Math.exp(-t / 0.04);
    const modulator = Math.sin(TWO_PI * frequency * 2 * t) * index;
    return Math.sin(TWO_PI * frequency * t + modulator) * percussive(t, 0.003, 0.12) * 0.7;
  });
}

/** Pitch-swept sine with a short noise click; soft drops the click and shortens the body. */
export function renderKick(random: () => number, soft: boolean): Float32Array {
  const durationS = soft ? 0.32 : 0.45;
  const clickFilter = new Biquad('highpass', 2500);
  let phase = 0;
  return renderVoice(durationS, (t) => {
    const frequency = 48 + (soft ? 70 : 115) * Math.exp(-t / 0.032);
    phase += frequency / SAMPLE_RATE;
    const body = Math.sin(TWO_PI * phase) * percussive(t, 0.0015, soft ? 0.14 : 0.22);
    const click = soft ? 0 : clickFilter.process(noiseSample(random)) * percussive(t, 0.0005, 0.004) * 0.5;
    return 0.95 * body + click;
  });
}

export function renderHat(random: () => number, decayTauS: number): Float32Array {
  const highpass = new Biquad('highpass', 7500, 0.9);
  return renderVoice(decayTauS * 5, (t) => highpass.process(noiseSample(random)) * percussive(t, 0.0008, decayTauS) * 0.6);
}

/** Three micro-bursts of band-passed noise read as a clap. */
export function renderClap(random: () => number): Float32Array {
  const bandpass = new Biquad('bandpass', 1600, 1.1);
  return renderVoice(0.35, (t) => {
    const bursts = [0, 0.011, 0.022].reduce((sum, offset) => sum + percussive(t - offset, 0.0008, 0.006), 0);
    const tail = percussive(t - 0.022, 0.001, 0.07);
    return bandpass.process(noiseSample(random)) * (0.6 * bursts + tail) * 1.4;
  });
}

export function renderSubPulse(midi: number, durationS: number): Float32Array {
  const frequency = midiToHz(midi);
  return renderVoice(durationS, (t) => {
    const fadeOut = Math.min(1, (durationS - t) / 0.03);
    return Math.sin(TWO_PI * frequency * t) * percussive(t, 0.006, durationS * 0.6) * Math.max(0, fadeOut);
  });
}

/** Two alternating tones (A5 / F#5), softened square, so it reads as a prompt, not a siren. */
export function renderAlarm(): Float32Array {
  const lowpass = new OnePoleLowpass(3500);
  const toneS = 0.075;
  return renderVoice(toneS * 4 + 0.05, (t) => {
    const step = Math.floor(t / toneS);
    if (step >= 4) return lowpass.process(0);
    const frequency = midiToHz(step % 2 === 0 ? 81 : 78);
    const local = t - step * toneS;
    const gate = Math.min(1, local / 0.004) * Math.min(1, Math.max(0, (toneS - local) / 0.01));
    const tone = Math.sin(TWO_PI * frequency * t) + 0.25 * Math.sin(TWO_PI * 3 * frequency * t);
    return lowpass.process(tone * gate * 0.55);
  });
}

/** Very short, quiet UI click. */
export function renderClick(random: () => number): Float32Array {
  const bandpass = new Biquad('bandpass', 3200, 2);
  return renderVoice(0.03, (t) => bandpass.process(noiseSample(random)) * percussive(t, 0.0003, 0.003) * 1.5);
}

/** Low boom (pitch-swept sine) plus a darkened noise burst. */
export function renderImpact(random: () => number): Float32Array {
  const lowpass = new Biquad('lowpass', 1800);
  let phase = 0;
  return renderVoice(1.6, (t) => {
    const frequency = 38 + 60 * Math.exp(-t / 0.08);
    phase += frequency / SAMPLE_RATE;
    const boom = Math.sin(TWO_PI * phase) * percussive(t, 0.002, 0.45);
    const burst = lowpass.process(noiseSample(random)) * percussive(t, 0.001, 0.12) * 0.5;
    return 0.9 * boom + burst;
  });
}

/** Short low thump for the second prompt card. */
export function renderThump(): Float32Array {
  let phase = 0;
  return renderVoice(0.3, (t) => {
    phase += (55 + 40 * Math.exp(-t / 0.02)) / SAMPLE_RATE;
    return Math.sin(TWO_PI * phase) * percussive(t, 0.002, 0.08);
  });
}

/** Keystroke tick: short mid-high noise, clock-like when placed on 8ths. */
export function renderTick(random: () => number): Float32Array {
  const highpass = new Biquad('highpass', 4500, 0.8);
  return renderVoice(0.025, (t) => highpass.process(noiseSample(random)) * percussive(t, 0.0003, 0.004));
}

/** Faint filtered noise so the silence is not digital zero. */
export function renderRoomTone(random: () => number, durationS: number): Float32Array {
  const lowpass = new Biquad('lowpass', 500);
  return renderVoice(durationS, () => lowpass.process(noiseSample(random)) * 2.2);
}

export interface PadOptions {
  midis: readonly number[];
  durationS: number;
  cutoffStartHz: number;
  cutoffEndHz: number;
  fadeInS: number;
  fadeOutS: number;
  random: () => number;
}

const DETUNE_CENTS = [-9, 0, 8] as const;
const FILTER_BLOCK = 64;

/**
 * Detuned saw pad: three voices per note spread across the stereo field, with a lowpass whose
 * cutoff glides exponentially across the segment.
 */
export function renderPad(options: PadOptions): StereoBuffer {
  const pad = createStereo(options.durationS);
  const voices = options.midis.flatMap((midi) =>
    DETUNE_CENTS.map((cents, voiceIndex) => ({
      oscillator: new SawOscillator(midiToHz(midi + cents / 100), options.random()),
      leftWeight: voiceIndex === 2 ? 0.35 : 1,
      rightWeight: voiceIndex === 0 ? 0.35 : 1,
    })),
  );
  const leftFilter = new Biquad('lowpass', options.cutoffStartHz, 0.8);
  const rightFilter = new Biquad('lowpass', options.cutoffStartHz, 0.8);
  const normalise = 1 / Math.sqrt(voices.length * 2);
  const length = pad.left.length;
  for (let index = 0; index < length; index += 1) {
    if (index % FILTER_BLOCK === 0) {
      const progress = index / length;
      const cutoff = options.cutoffStartHz * (options.cutoffEndHz / options.cutoffStartHz) ** progress;
      leftFilter.setCutoff(cutoff, 0.8);
      rightFilter.setCutoff(cutoff, 0.8);
    }
    let left = 0;
    let right = 0;
    for (const voice of voices) {
      const sample = voice.oscillator.next();
      left += sample * voice.leftWeight;
      right += sample * voice.rightWeight;
    }
    const t = index / SAMPLE_RATE;
    const fadeIn = options.fadeInS > 0 ? Math.min(1, t / options.fadeInS) : 1;
    const fadeOut = options.fadeOutS > 0 ? Math.min(1, Math.max(0, (options.durationS - t) / options.fadeOutS)) : 1;
    const gain = normalise * fadeIn * fadeOut;
    pad.left[index] = leftFilter.process(left) * gain;
    pad.right[index] = rightFilter.process(right) * gain;
  }
  return pad;
}
