import { type ShellLocale } from './locale';
import { setupLabelsEn } from './setup-labels-en';
import { setupLabelsEs } from './setup-labels-es';
import { setupLabelsPtBR } from './setup-labels-pt-br';
import { type SetupLabels, type UninstallLabels } from './setup-labels-shape';

/*
 * Owner-facing text of the setup window and the uninstall dialogs (D16), in the menu's three
 * languages; pt-BR is the source. The Gatekeeper help names the System Settings path only: the
 * Control-click route was removed in macOS 15 and is never suggested (vetting 0006).
 */

export const setupLabels: Readonly<Record<ShellLocale, SetupLabels>> = {
  'pt-BR': setupLabelsPtBR,
  es: setupLabelsEs,
  en: setupLabelsEn,
};

export type { SetupLabels, UninstallLabels };
