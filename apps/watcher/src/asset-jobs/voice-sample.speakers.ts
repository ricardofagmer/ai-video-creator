import { MockVoiceProvider } from '@ace/toolbox/dist/providers/voice/mock-voice';
import { type ProviderFailure } from '@studio/core/providers';
import { type Secret } from '@studio/core/secrets';
import { type VoiceSampleAudio } from '@studio/shared/asset-jobs';
import { type AbsolutePath } from '@studio/shared/catalog';
import { type Language } from '@studio/shared/recipes';
import { speakWithLocalVoice } from '../stages/process/local-voice.process';
import { type StageSettings } from '../stages/shared/stage-settings';
import { speakWithElevenLabs } from '../stages/voice/elevenlabs-tts.client';
import { type AssetJobFailedCode } from './asset-job-file.mapper';

/** The C11 job's line id; the sample has one line and no scene. */
const SAMPLE_LINE_ID = 'sample';

export type SpokenSample = { status: 'spoken'; audio: Uint8Array; format: VoiceSampleAudio } | { status: 'failed'; code: AssetJobFailedCode } | { status: 'cancelled' };

/** The in-process mock voice (no spawn, no network): a labelled tone, as narration's mock. */
export async function speakSampleWithMock(text: string): Promise<SpokenSample> {
  const spoken = await new MockVoiceProvider().synthesize({ text });
  return { status: 'spoken', audio: spoken.audio, format: 'wav' };
}

/** `ProviderFailure` classes as job codes; `cancelled` is left to the step's signal naming. */
function elevenLabsFailureCode(failure: ProviderFailure): AssetJobFailedCode | null {
  switch (failure.class) {
    case 'authentication':
      return 'credential-refused';
    case 'rate-limit':
      return 'rate-limited';
    case 'transient':
    case 'fatal':
      return 'provider-error';
    case 'cancelled':
      return null;
  }
}

/** One ElevenLabs call with the sample sentence only; the caller has written the egress line. */
export async function speakSampleWithElevenLabs(request: {
  credential: Secret;
  voiceId: string;
  modelId: string;
  text: string;
  signal: AbortSignal;
  now: () => Date;
}): Promise<SpokenSample> {
  const spoken = await speakWithElevenLabs(request);
  if (spoken.status === 'ok') return { status: 'spoken', audio: spoken.audio, format: 'mp3' };
  const code = elevenLabsFailureCode(spoken.failure);
  return code === null ? { status: 'cancelled' } : { status: 'failed', code };
}

/**
 * C11 local voice with the clone. The registered recording path goes into the C11 job file only
 * (0600, in a private temporary folder `speakWithLocalVoice` removes), exactly as narration does:
 * never into a log, an egress line, `job.json`, an error or a child-process argument. Nothing
 * leaves the machine.
 */
export async function speakSampleWithLocalVoice(
  settings: StageSettings,
  request: { language: Language; text: string; voicePath: AbsolutePath; signal: AbortSignal; timeoutMs: number },
): Promise<SpokenSample> {
  const outcome = await speakWithLocalVoice(settings, {
    language: request.language === 'pt-BR' ? 'pt' : 'en',
    lines: [{ sceneId: SAMPLE_LINE_ID, text: request.text }],
    voice: request.voicePath,
    signal: request.signal,
    timeoutMs: request.timeoutMs,
  });
  switch (outcome.status) {
    case 'not-configured':
      return { status: 'failed', code: 'tool-missing' };
    case 'failed':
      return { status: 'failed', code: localVoiceFailureCode(outcome.reason) };
    case 'spoken': {
      const [clip] = outcome.clips;
      return clip === undefined || outcome.clips.length !== 1 ? { status: 'failed', code: 'output-invalid' } : { status: 'spoken', audio: clip.audio, format: 'wav' };
    }
  }
}

function localVoiceFailureCode(reason: 'timeout' | 'exit' | 'spawn' | 'no-audio'): AssetJobFailedCode {
  switch (reason) {
    case 'timeout':
      return 'timed-out';
    case 'spawn':
      return 'tool-missing';
    case 'exit':
      return 'provider-error';
    case 'no-audio':
      return 'output-invalid';
  }
}
