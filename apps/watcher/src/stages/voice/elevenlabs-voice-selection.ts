import { type AiModelDetails } from '@studio/shared/catalog';

/** Variable name the seed's `elevenlabs-voice` row gives as its `modelIdRef`. */
const ELEVENLABS_VOICE_VARIABLE = 'ELEVENLABS_VOICE_ID';

export interface ElevenLabsVoiceSelection {
  voiceId: string;
  modelId: string;
}

/**
 * The ElevenLabs voice and speech model a catalog voice speaks with. A voice registered in the app
 * carries its own public voice id (`literal`); the seeded row names `ELEVENLABS_VOICE_ID`, read
 * from the watcher's settings. The item's `voiceModelId` wins over the configured default model.
 * Null when the voice id cannot be resolved: an unset variable, or a reference that is neither.
 */
export function selectElevenLabsVoice(
  details: AiModelDetails,
  configured: { voiceId: string | null; modelId: string },
): ElevenLabsVoiceSelection | null {
  const reference = details.modelIdRef;
  const modelId = details.voiceModelId ?? configured.modelId;
  if (reference.type === 'literal') return { voiceId: reference.value, modelId };
  if (reference.type !== 'env' || reference.name !== ELEVENLABS_VOICE_VARIABLE || configured.voiceId === null) return null;
  return { voiceId: configured.voiceId, modelId };
}
