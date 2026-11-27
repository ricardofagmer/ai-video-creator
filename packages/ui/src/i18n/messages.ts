import type { Locale } from './locale';
import type { Messages } from './message-types';
import { uiEn } from './messages/en';
import { uiEs } from './messages/es';
import { uiPtBR } from './messages/pt-BR';

export type UiMessages = Messages<typeof uiPtBR>;

/** Every locale's texts for the kit's components; the type forces the three to stay in step. */
export const uiMessages: Readonly<Record<Locale, UiMessages>> = {
  'pt-BR': uiPtBR,
  es: uiEs,
  en: uiEn,
};
