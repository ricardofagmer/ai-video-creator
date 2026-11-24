'use client';

import { useI18n, type Locale, type Messages } from '@studio/ui';
import { portalEn } from './en';
import { portalEs } from './es';
import { portalPtBR } from './pt-BR';

export type PortalMessages = Messages<typeof portalPtBR>;

/** Every locale's portal texts; the type forces the three to stay in step. */
export const portalMessages: Readonly<Record<Locale, PortalMessages>> = {
  'pt-BR': portalPtBR,
  es: portalEs,
  en: portalEn,
};

/** Portal texts for client components; the locale comes from the provider the page renders. */
export function usePortalMessages(): PortalMessages {
  return portalMessages[useI18n().locale];
}
