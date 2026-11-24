import type { Locale } from '@studio/ui';
import { webEn } from './en';
import { webEs } from './es';
import { webPtBR, type WebMessages } from './pt-BR';

export type { WebMessages };

/** Every locale's web texts; the type forces the three to stay in step. */
export const webMessages: Readonly<Record<Locale, WebMessages>> = {
  'pt-BR': webPtBR,
  es: webEs,
  en: webEn,
};
