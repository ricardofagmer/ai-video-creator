import { type ProviderName } from '@studio/shared/run-format';
import { type SecretName } from '../secrets/secret-names';

/**
 * What each provider needs in live mode. Claude and ElevenLabs are remote APIs with a key; the
 * local voice (C11) and Remotion render run on the owner's Mac; capture opens pages with
 * Playwright and needs no studio key, but it does send requests off the machine (PRD 12).
 */
interface ProviderProfile {
  credential: SecretName | null;
  /** Live calls send data to a remote party, so they belong on the "what left the machine" list. */
  leavesMachine: boolean;
}

const PROVIDER_PROFILES: Readonly<Record<ProviderName, ProviderProfile>> = {
  claude: { credential: 'anthropic-api-key', leavesMachine: true },
  elevenlabs: { credential: 'elevenlabs-api-key', leavesMachine: true },
  'local-voice': { credential: null, leavesMachine: false },
  capture: { credential: null, leavesMachine: true },
  render: { credential: null, leavesMachine: false },
};

export function requiredCredential(provider: ProviderName): SecretName | null {
  return PROVIDER_PROFILES[provider].credential;
}

export function leavesMachine(provider: ProviderName): boolean {
  return PROVIDER_PROFILES[provider].leavesMachine;
}
