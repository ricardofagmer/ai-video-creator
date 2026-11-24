import { videoLinkFrom, type AssetVersion, type VideoPost } from '@studio/shared/catalog';

/** Which job a version can have; every answer but `ok` is shown on the reference's page. */
export type ReferenceAnalysisEligibility = 'ok' | 'not-a-video-reference' | 'link-only' | 'biometric';

/** The voice engine a sample is spoken by: ElevenLabs voices by ElevenLabs, the clone locally. */
export type VoiceSampleProvider = 'elevenlabs' | 'local-voice';

/** An `ai-model` row that passed `isVoiceVersion`. */
export type VoiceVersion = Extract<AssetVersion, { kind: 'ai-model' }>;

/**
 * Guided-creation design section 2: a voice is an `ai-model` item that is the owner's clone or an
 * ElevenLabs or local voice. Any other model (an avatar, a checkpoint, an Anthropic model) has
 * nothing to speak with.
 */
export function isVoiceVersion(version: AssetVersion): version is VoiceVersion {
  if (version.kind !== 'ai-model') return false;
  const { modelType, provider } = version.details;
  return modelType === 'voice-clone' || provider === 'elevenlabs' || provider === 'local-voice';
}

/** The provider whose live mode decides whether a sample is real or a labelled mock. */
export function voiceSampleProviderOf(version: VoiceVersion): VoiceSampleProvider {
  return version.details.provider === 'elevenlabs' ? 'elevenlabs' : 'local-voice';
}

/**
 * The Instagram, YouTube or TikTok post a link-only video reference points at; null for a stored
 * file and for any other link. The provenance URL is untrusted text: only the parts the shared
 * allowlist parser returns are used (docs/specs/2026-11-24-link-reference-analysis-design.md).
 */
export function referenceLinkPostOf(version: AssetVersion): VideoPost | null {
  if (version.kind !== 'reference' || version.details.subKind !== 'video' || version.mimeType !== 'text/plain') return null;
  const source = version.provenance?.source;
  if (source?.type !== 'url') return null;
  const link = videoLinkFrom(source.url);
  return link.status === 'supported' ? link.post : null;
}

/**
 * Guided-creation design section 4, amended on 2026-11-24: a `video` reference that is not biometric
 * is analysed when it is a stored video file, or a link to a supported post (the watcher fetches
 * that video for a moment). Any other link (a `text/plain` body holding a URL) has no frames to
 * send; biometric material never leaves the machine. Biometric is checked before link-only so the
 * page names the stronger reason.
 */
export function referenceAnalysisEligibility(version: AssetVersion): ReferenceAnalysisEligibility {
  if (version.kind !== 'reference' || version.details.subKind !== 'video') return 'not-a-video-reference';
  if (version.sensitivity === 'biometric') return 'biometric';
  if (version.mimeType === 'text/plain') return referenceLinkPostOf(version) === null ? 'link-only' : 'ok';
  if (version.layout !== 'file' || !version.mimeType.startsWith('video/')) return 'not-a-video-reference';
  return 'ok';
}
