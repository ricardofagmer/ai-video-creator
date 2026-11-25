import { classifyProviderFailure, type ProviderErrorSignal, type ProviderFailure } from '@studio/core/providers';
import { type Secret } from '@studio/core/secrets';

/**
 * ElevenLabs Music "Compose music" (https://elevenlabs.io/docs/api-reference/music/compose, read
 * 2026-11-25): POST /v1/music with a text prompt. `music_v2_5` is the current model; the default
 * `music_v1` is deprecated (https://elevenlabs.io/docs/overview/models, read 2026-11-25).
 */
const API_URL = 'https://api.elevenlabs.io/v1/music';
const ELEVENLABS_MUSIC_MODEL_ID = 'music_v2_5';
/** Fixed, so the content type and the size bound below are known; the API default is `auto`. */
const OUTPUT_FORMAT = 'mp3_44100_128';
/**
 * The compose endpoint accepts 3 000 to 600 000 ms, but the music FAQ and the API pricing page
 * both state a five-minute limit; the stricter one is used.
 */
export const MUSIC_LENGTH_LIMITS_MS = { min: 3_000, max: 300_000 } as const;
/** Five minutes at 128 kbps is about 4.8 MB; anything far larger is not the requested track. */
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;

export interface ElevenLabsMusicRequest {
  credential: Secret;
  prompt: string;
  lengthMs: number;
  instrumental: boolean;
  signal: AbortSignal;
  now: () => Date;
}

export type ElevenLabsMusicOutcome = { status: 'ok'; audio: Uint8Array } | { status: 'failed'; failure: ProviderFailure };

/**
 * One ElevenLabs music generation (live mode only; the caller priced it and recorded egress
 * first). The key is revealed only into the request header. Failures are classified from the HTTP
 * status and network code alone; the body is never read on error, logged or returned.
 */
export async function composeWithElevenLabs(request: ElevenLabsMusicRequest): Promise<ElevenLabsMusicOutcome> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}?output_format=${OUTPUT_FORMAT}`, {
      method: 'POST',
      headers: { 'xi-api-key': request.credential.revealForProviderCall(), 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({
        prompt: request.prompt,
        music_length_ms: request.lengthMs,
        model_id: ELEVENLABS_MUSIC_MODEL_ID,
        force_instrumental: request.instrumental,
      }),
      signal: request.signal,
      redirect: 'error',
    });
  } catch (error) {
    return failed(request, { httpStatus: null, retryAfter: null, networkCode: networkCodeOf(error) });
  }
  if (!response.ok) {
    await response.body?.cancel();
    return failed(request, { httpStatus: response.status, retryAfter: response.headers.get('retry-after'), networkCode: null });
  }
  if (!isMpegContentType(response.headers.get('content-type'))) {
    await response.body?.cancel();
    return unrecognized();
  }
  const declaredLength = Number.parseInt(response.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(declaredLength) && declaredLength > MAX_AUDIO_BYTES) {
    await response.body?.cancel();
    return unrecognized();
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES || !looksLikeMp3(audio)) return unrecognized();
  return { status: 'ok', audio };
}

function isMpegContentType(value: string | null): boolean {
  if (value === null) return false;
  const mediaType = value.split(';')[0]?.trim().toLowerCase();
  return mediaType === 'audio/mpeg' || mediaType === 'audio/mp3';
}

/** An ID3 tag or an MPEG frame sync: enough to refuse an error page sent with an audio type. */
function looksLikeMp3(audio: Uint8Array): boolean {
  const [first, second, third] = audio;
  if (first === undefined || second === undefined || third === undefined) return false;
  const id3 = first === 0x49 && second === 0x44 && third === 0x33;
  const frameSync = first === 0xff && (second & 0xe0) === 0xe0;
  return id3 || frameSync;
}

function unrecognized(): ElevenLabsMusicOutcome {
  return { status: 'failed', failure: { class: 'fatal', provider: 'elevenlabs', reason: 'unrecognized' } };
}

function failed(
  request: ElevenLabsMusicRequest,
  observed: { httpStatus: number | null; retryAfter: string | null; networkCode: string | null },
): ElevenLabsMusicOutcome {
  const signal: ProviderErrorSignal = { provider: 'elevenlabs', aborted: request.signal.aborted, ...observed };
  return { status: 'failed', failure: classifyProviderFailure(signal, request.now()) };
}

/** undici reports the socket error code on `cause`; anything else classifies as unrecognized. */
function networkCodeOf(error: unknown): string | null {
  if (!(error instanceof Error)) return null;
  const cause: unknown = error.cause;
  if (typeof cause === 'object' && cause !== null && 'code' in cause && typeof cause.code === 'string') return cause.code;
  return null;
}
