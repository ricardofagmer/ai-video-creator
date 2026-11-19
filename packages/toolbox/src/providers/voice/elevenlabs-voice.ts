import { z } from 'zod';
import type { VoiceProvider, VoiceRequest, VoiceResult } from '@studio/shared/ace';
import type { ElevenLabsConfig } from '../../config/env';
import { ProviderError } from '../../errors';
import { alignmentToWords } from './alignment-to-words';
import { fetchWithRetry } from './http-retry';

const API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';
const OUTPUT_FORMAT = 'mp3_44100_128';
const REQUEST_TIMEOUT_MS = 180_000;
const ERROR_BODY_LIMIT = 500;

const AlignmentSchema = z.object({
  characters: z.array(z.string()),
  character_start_times_seconds: z.array(z.number()),
  character_end_times_seconds: z.array(z.number()),
});

const TimestampsResponseSchema = z.object({
  audio_base64: z.string().min(1),
  alignment: AlignmentSchema,
});

export interface ElevenLabsOptions {
  config: ElevenLabsConfig;
  usdPerCharacter: number;
  log: (message: string) => void;
}

/** ElevenLabs TTS with character timestamps, via Node's built-in fetch. */
export class ElevenLabsVoiceProvider implements VoiceProvider {
  constructor(private readonly options: ElevenLabsOptions) {}

  async synthesize(input: VoiceRequest): Promise<VoiceResult> {
    const { config } = this.options;
    const url = `${API_BASE}/${encodeURIComponent(config.voiceId)}/with-timestamps?output_format=${OUTPUT_FORMAT}`;
    const response = await fetchWithRetry(
      url,
      {
        method: 'POST',
        headers: { 'xi-api-key': config.apiKey, 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({ text: input.text, model_id: config.modelId }),
      },
      { provider: 'elevenlabs', attempts: 3, baseDelayMs: 1000, timeoutMs: REQUEST_TIMEOUT_MS, log: this.options.log },
    );
    if (!response.ok) {
      const body = (await response.text()).slice(0, ERROR_BODY_LIMIT);
      const hint = response.status === 401 ? ' (check ELEVENLABS_API_KEY)' : response.status === 404 ? ' (check ELEVENLABS_VOICE_ID)' : '';
      throw new ProviderError(`ElevenLabs HTTP ${response.status}${hint}: ${body}`, 'elevenlabs', response.status);
    }
    const parsed = TimestampsResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new ProviderError('ElevenLabs response did not contain audio_base64 and alignment', 'elevenlabs');
    const words = alignmentToWords(parsed.data.alignment);
    const lastWord = words.at(-1);
    if (!lastWord) throw new ProviderError('ElevenLabs alignment contained no words', 'elevenlabs');
    const requestId = response.headers.get('request-id') ?? undefined;
    return {
      audio: Buffer.from(parsed.data.audio_base64, 'base64'),
      mimeType: 'audio/mpeg',
      durationS: lastWord.endS,
      voice: `elevenlabs:${config.voiceId}:${config.modelId}`,
      words,
      usage: [
        {
          provider: 'elevenlabs',
          unit: 'characters',
          quantity: input.text.length,
          usdEstimate: input.text.length * this.options.usdPerCharacter,
          ...(requestId ? { requestId } : {}),
        },
      ],
    };
  }
}
