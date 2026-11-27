import { classifyProviderFailure, type ProviderErrorSignal, type ProviderFailure } from '@studio/core/providers';
import { type Secret } from '@studio/core/secrets';
import { elevenLabsRefusalCode } from '../shared/elevenlabs-refusal-code';

const API_BASE = 'https://api.elevenlabs.io/v1/text-to-speech';
/** Same format as the retired toolbox ElevenLabs adapter (removed 2026-11-25; last in commit c52a849). */
const OUTPUT_FORMAT = 'mp3_44100_128';
/** A narration line is a few hundred characters; a larger body is not narration audio. */
const MAX_AUDIO_BYTES = 50 * 1024 * 1024;

export interface ElevenLabsSpeechRequest {
  credential: Secret;
  voiceId: string;
  modelId: string;
  text: string;
  signal: AbortSignal;
  now: () => Date;
}

export type ElevenLabsSpeechOutcome = { status: 'ok'; audio: Uint8Array } | { status: 'failed'; failure: ProviderFailure };

/**
 * One ElevenLabs text-to-speech call (live mode only; the caller records egress first). The key
 * is revealed only into the request header. Failures are classified from the HTTP status and
 * the network error code, plus the short refusal code of a 401/403 (`elevenLabsRefusalCode`);
 * the error body is never logged, stored or returned.
 */
export async function speakWithElevenLabs(request: ElevenLabsSpeechRequest): Promise<ElevenLabsSpeechOutcome> {
  const url = `${API_BASE}/${encodeURIComponent(request.voiceId)}?output_format=${OUTPUT_FORMAT}`;
  let response: Response;
  try {
    response = await fetch(url, {
      method: 'POST',
      headers: { 'xi-api-key': request.credential.revealForProviderCall(), 'content-type': 'application/json', accept: 'audio/mpeg' },
      body: JSON.stringify({ text: request.text, model_id: request.modelId }),
      signal: request.signal,
      redirect: 'error',
    });
  } catch (error) {
    return failed(request, { httpStatus: null, retryAfter: null, networkCode: networkCodeOf(error) });
  }
  if (!response.ok) {
    const refusalCode = await elevenLabsRefusalCode(response);
    return failed(request, { httpStatus: response.status, retryAfter: response.headers.get('retry-after'), networkCode: null, refusalCode });
  }
  const audio = new Uint8Array(await response.arrayBuffer());
  if (audio.byteLength === 0 || audio.byteLength > MAX_AUDIO_BYTES) {
    return { status: 'failed', failure: { class: 'fatal', provider: 'elevenlabs', reason: 'unrecognized' } };
  }
  return { status: 'ok', audio };
}

function failed(
  request: ElevenLabsSpeechRequest,
  observed: { httpStatus: number | null; retryAfter: string | null; networkCode: string | null; refusalCode?: string | null },
): ElevenLabsSpeechOutcome {
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
