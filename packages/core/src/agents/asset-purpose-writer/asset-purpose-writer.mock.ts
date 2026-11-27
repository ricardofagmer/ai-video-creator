import { ASSET_PURPOSE_MAX_CHARS } from '@studio/shared/catalog';

/** Room left for the item name inside the 280-character purpose. */
const NAME_IN_PURPOSE_MAX_CHARS = 120;

/**
 * Stand-in purpose of mock mode (ADR 0002 "Mock by default", AP-07): built from the item name
 * only, no connection opens and nothing is spent. It starts with "Simulado" so a mock purpose can
 * never pass for one a model wrote. Plain text, within `ASSET_PURPOSE_MAX_CHARS`.
 */
export function mockAssetPurpose(name: string): string {
  const shownName = name.replace(/\s+/g, ' ').trim().slice(0, NAME_IN_PURPOSE_MAX_CHARS) || 'item sem nome';
  return `Simulado: finalidade de exemplo do item ${shownName}; nenhum modelo escreveu este texto.`.slice(0, ASSET_PURPOSE_MAX_CHARS);
}
