import { type VoiceVersion } from '@studio/core/asset-jobs';
import { type ProviderName } from '@studio/shared/run-format';
import { type AssetJobRefusedCode } from './asset-job-file.mapper';

/** Catalog variable name the seed's `elevenlabs-voice` row gives as its `modelIdRef` (as in `planVoice`). */
const ELEVENLABS_VOICE_VARIABLE = 'ELEVENLABS_VOICE_ID';

export type VoiceSamplePlan =
  | { status: 'ready'; engine: 'mock'; provider: 'elevenlabs' | 'local-voice' }
  | { status: 'ready'; engine: 'elevenlabs'; voiceId: string; modelId: string }
  | { status: 'ready'; engine: 'local-voice' }
  | { status: 'refused'; code: AssetJobRefusedCode };

export interface VoiceSamplePlanInput {
  version: VoiceVersion;
  isLive: (provider: ProviderName) => boolean;
  elevenLabs: { voiceId: string | null; modelId: string };
}

/**
 * Picks the sample's engine by the narration rule of `planVoice` (stages/voice/narration-voice.ts),
 * applied to the one version instead of a recipe's bindings, so a sample sounds like narration
 * with that voice:
 * - a biometric version is the owner's clone and is spoken by the C11 local voice when it is live,
 *   otherwise by the in-process mock voice; it is checked first and never reaches ElevenLabs;
 * - an ElevenLabs version is spoken by ElevenLabs when it is live and its voice id is configured,
 *   by the mock voice when ElevenLabs is not live; a live one without the configured id is refused;
 * - any other voice is refused while a voice provider is live (it has no engine bound), and spoken
 *   by the mock voice otherwise.
 * `planVoice` itself takes a run's execution context, hence this run-less twin of its rule.
 */
export function planVoiceSample(input: VoiceSamplePlanInput): VoiceSamplePlan {
  const { version, isLive, elevenLabs } = input;
  if (version.sensitivity === 'biometric') {
    return isLive('local-voice') ? { status: 'ready', engine: 'local-voice' } : { status: 'ready', engine: 'mock', provider: 'local-voice' };
  }
  if (version.details.provider === 'elevenlabs') {
    if (!isLive('elevenlabs')) return { status: 'ready', engine: 'mock', provider: 'elevenlabs' };
    const reference = version.details.modelIdRef;
    if (elevenLabs.voiceId === null || reference.type !== 'env' || reference.name !== ELEVENLABS_VOICE_VARIABLE) {
      return { status: 'refused', code: 'not-supported' };
    }
    return { status: 'ready', engine: 'elevenlabs', voiceId: elevenLabs.voiceId, modelId: elevenLabs.modelId };
  }
  const anyLive = isLive('elevenlabs') || isLive('local-voice');
  return anyLive ? { status: 'refused', code: 'not-supported' } : { status: 'ready', engine: 'mock', provider: 'local-voice' };
}
