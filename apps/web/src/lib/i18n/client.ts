'use client';

import { useI18n } from '@studio/ui';
import { webMessages, type WebMessages } from '@/messages';

/** Web texts for client components; the locale comes from the provider the root layout renders. */
export function useWebMessages(): WebMessages {
  return webMessages[useI18n().locale];
}
