import { ApiRev7ErrorReasonSchema, apiRev7ErrorTexts, type ApiRev7ErrorReason } from '@studio/shared/api';
import { type Platform } from '@studio/shared/metrics';
import { type PlatformMode } from '@studio/shared/platforms';
import { ApiRequestError } from '@/lib/api';
import { platformLabels } from '@/features/metrics/metric-labels';
import { describeApiError } from './api-error-text';

/*
 * Rev 7 (SPEC 0007 section 4.4): the pt-BR text of each platform and publish refusal, verbatim from
 * `apiRev7ErrorTexts`. The api never fills `{plataforma}` or `{modo}`; the screen that knows them
 * does it here. No platform's own error text is ever shown.
 */

/** The account's mode in "conectada em modo {modo}". */
const platformModeWords: Readonly<Record<PlatformMode, string>> = {
  mock: 'simulado',
  live: 'real',
};

export interface PlatformTextContext {
  /** The platform the screen is about; null when it cannot know (the callback names none). */
  platform: Platform | null;
  /** This process's mode for the platform; the account was connected in the other one. */
  mode?: PlatformMode;
}

/**
 * Without a known platform the sentence still reads in Portuguese: the preposition takes its
 * article ("em" becomes "na plataforma") and a leading placeholder becomes "A plataforma".
 */
const genericPlatformPhrases: readonly (readonly [RegExp, string])[] = [
  [/\bem \{plataforma\}/g, 'na plataforma'],
  [/\bde \{plataforma\}/g, 'da plataforma'],
  [/\bcom \{plataforma\}/g, 'com a plataforma'],
  [/\bpara \{plataforma\}/g, 'para a plataforma'],
  [/^\{plataforma\}/, 'A plataforma'],
  [/\{plataforma\}/g, 'a plataforma'],
];

function otherMode(mode: PlatformMode): PlatformMode {
  return mode === 'mock' ? 'live' : 'mock';
}

/** Fills `{plataforma}` and `{modo}` of one rev 7 text. */
function fillPlatformText(text: string, context: PlatformTextContext): string {
  let filled = text;
  if (context.mode === undefined) {
    filled = filled.replace(' em modo {modo}', '');
  } else {
    filled = filled.replace('{modo}', platformModeWords[otherMode(context.mode)]);
  }
  if (context.platform !== null) return filled.replaceAll('{plataforma}', platformLabels[context.platform]);
  for (const [pattern, replacement] of genericPlatformPhrases) filled = filled.replace(pattern, replacement);
  return filled;
}

/** The pt-BR text of one rev 7 reason. */
export function rev7ReasonText(reason: ApiRev7ErrorReason, context: PlatformTextContext): string {
  return fillPlatformText(apiRev7ErrorTexts[reason], context);
}

/** The rev 7 text of a failed call, or null when the failure is not a rev 7 refusal. */
function rev7ErrorText(error: unknown, context: PlatformTextContext): string | null {
  if (!(error instanceof ApiRequestError) || error.reason === null) return null;
  const parsed = ApiRev7ErrorReasonSchema.safeParse(error.reason);
  return parsed.success ? rev7ReasonText(parsed.data, context) : null;
}

/** One pt-BR sentence for any failure of a platform or publish call. */
export function describePlatformApiError(error: unknown, context: PlatformTextContext): string {
  return rev7ErrorText(error, context) ?? describeApiError(error);
}
