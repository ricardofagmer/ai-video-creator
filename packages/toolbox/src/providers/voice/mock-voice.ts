import { videoSpec, type VoiceProvider, type VoiceRequest, type VoiceResult, type WordTiming } from '@studio/shared/ace';
import { encodeWavPcm16Mono } from '../../encoding/wav-encoder';
import { splitWords } from '../../validation/text';

const WORDS_PER_SECOND = 2.4;
const TONE_HZ = 220;
// About -30 dBFS: audible enough that silencedetect (-50 dB) does not flag it, never mistaken for speech.
const TONE_AMPLITUDE = Math.round(32767 * 10 ** (-30 / 20));
const WORD_FILL_RATIO = 0.9;

/** PROVIDER_VOICE=mock: a quiet tone lasting wordCount / 2.4 s with evenly spaced word timings. */
export class MockVoiceProvider implements VoiceProvider {
  async synthesize(input: VoiceRequest): Promise<VoiceResult> {
    const tokens = splitWords(input.text);
    const durationS = tokens.length / WORDS_PER_SECOND;
    const sampleRate = videoSpec.audioSampleRate;
    const samples = new Int16Array(Math.ceil(durationS * sampleRate));
    for (let index = 0; index < samples.length; index += 1) {
      samples[index] = Math.round(TONE_AMPLITUDE * Math.sin((2 * Math.PI * TONE_HZ * index) / sampleRate));
    }
    const slotS = durationS / Math.max(1, tokens.length);
    const words: WordTiming[] = tokens.map((text, index) => ({
      text,
      startS: index * slotS,
      endS: index * slotS + slotS * WORD_FILL_RATIO,
    }));
    return {
      audio: encodeWavPcm16Mono(samples, sampleRate),
      mimeType: 'audio/wav',
      durationS,
      voice: 'mock:tone-220hz',
      words,
      usage: [{ provider: 'mock-voice', unit: 'characters', quantity: input.text.length, usdEstimate: 0 }],
    };
  }
}
