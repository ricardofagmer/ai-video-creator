import { type ApiRev7ErrorReason } from '@studio/shared/api';
import { type Platform, type PlatformMode } from '@studio/shared/platforms';
import { cliText } from '../i18n/messages.js';

/*
 * Words of the platform commands (SPEC 0007 sections 5.3, 5.4, 5.8 and 5.9), read from the active
 * language's catalogue (`cliText().platforms`). In pt-BR the status labels are the shared
 * `capabilityStatusLabels` and the refusal sentences the shared `apiRev7ErrorTexts`, so the CLI
 * and the web print the same words (AC 44). Platform names are proper nouns in every language.
 */

export const PLATFORM_LABELS: Readonly<Record<Platform, string>> = {
  youtube: 'YouTube',
  instagram: 'Instagram',
  tiktok: 'TikTok',
};

/**
 * The text of a C10 rev 7 reason (section 4.4) with the platform and the mode filled. `accountMode`
 * is the mode the account was connected in; null when the caller cannot know it, which reads
 * "diferente" in pt-BR.
 */
export function refusalText(reason: ApiRev7ErrorReason, context: { platform: Platform | null; accountMode: PlatformMode | null }): string {
  const text = cliText().platforms;
  const platform = context.platform === null ? text.anyPlatform : PLATFORM_LABELS[context.platform];
  const mode = context.accountMode === null ? null : text.modes[context.accountMode];
  return text.rev7Reason(reason, platform, mode);
}

/** An account is connected in the other mode exactly when `platform-mode-mismatch` applies. */
export function otherMode(mode: PlatformMode): PlatformMode {
  return mode === 'mock' ? 'live' : 'mock';
}
