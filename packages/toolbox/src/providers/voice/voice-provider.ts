import type { VoiceProvider } from '@studio/shared/ace';
import { requireElevenLabsConfig, requireLocalVoiceConfig, type ToolboxEnv } from '../../config/env';
import { ElevenLabsVoiceProvider } from './elevenlabs-voice';
import { LocalVoiceProvider } from './local-voice';
import { MockVoiceProvider } from './mock-voice';

export interface SelectedVoiceProvider {
  mode: 'mock' | 'live';
  /** What speaks: `mock`, `elevenlabs` or `local`. */
  engine: 'mock' | ToolboxEnv['voiceEngine'];
  /** Estimated spend per character; zero for engines that cost nothing per call. */
  usdPerCharacter: number;
  provider: VoiceProvider;
}

/** Live mode reads the selected engine's settings now, so a missing value fails before any work. */
export function createVoiceProvider(env: ToolboxEnv, log: (message: string) => void): SelectedVoiceProvider {
  if (env.providerVoice === 'mock') return { mode: 'mock', engine: 'mock', usdPerCharacter: 0, provider: new MockVoiceProvider() };
  if (env.voiceEngine === 'local') {
    return {
      mode: 'live',
      engine: 'local',
      usdPerCharacter: 0,
      provider: new LocalVoiceProvider({
        config: requireLocalVoiceConfig(env.repoRoot),
        ffmpegPath: env.ffmpegPath,
        ffprobePath: env.ffprobePath,
        log,
      }),
    };
  }
  return {
    mode: 'live',
    engine: 'elevenlabs',
    usdPerCharacter: env.elevenLabsUsdPerChar,
    provider: new ElevenLabsVoiceProvider({ config: requireElevenLabsConfig(), usdPerCharacter: env.elevenLabsUsdPerChar, log }),
  };
}
