import { ApiRev7ErrorReasonSchema, type ApiRev7ErrorReason } from '@studio/shared/api';
import { type Platform } from '@studio/shared/metrics';
import { type PlatformMode } from '@studio/shared/platforms';
import { ApiRequestError } from '@/lib/api';
import { platformLabels } from '@/features/metrics/metric-labels';
import { type WebMessages } from '@/messages';
import { describeApiError } from './api-error-text';

/*
 * Rev 7 (SPEC 0007 section 4.4): the text of each platform and publish refusal, in the active
 * language (`common.platformErrors`). The api never names the platform or the mode; the screen that
 * knows them passes them here. No platform's own error text is ever shown.
 */

export interface PlatformTextContext {
  /** The platform the screen is about; null when it cannot know (the callback names none). */
  platform: Platform | null;
  /** This process's mode for the platform; the account was connected in the other one. */
  mode?: PlatformMode;
}

function otherMode(mode: PlatformMode): PlatformMode {
  return mode === 'mock' ? 'live' : 'mock';
}

/** The text of one rev 7 reason. */
export function rev7ReasonText(reason: ApiRev7ErrorReason, context: PlatformTextContext, t: WebMessages): string {
  const texts = t.common.platformErrors;
  return texts.rev7Reasons[reason]({
    platform: context.platform === null ? null : platformLabels[context.platform],
    mode: context.mode === undefined ? null : texts.modes[otherMode(context.mode)],
  });
}

/** The rev 7 text of a failed call, or null when the failure is not a rev 7 refusal. */
function rev7ErrorText(error: unknown, context: PlatformTextContext, t: WebMessages): string | null {
  if (!(error instanceof ApiRequestError) || error.reason === null) return null;
  const parsed = ApiRev7ErrorReasonSchema.safeParse(error.reason);
  return parsed.success ? rev7ReasonText(parsed.data, context, t) : null;
}

/** One sentence in the active language for any failure of a platform or publish call. */
export function describePlatformApiError(error: unknown, context: PlatformTextContext, t: WebMessages): string {
  return rev7ErrorText(error, context, t) ?? describeApiError(error, t);
}
