import { type AssetVersionView } from '@studio/shared/api';
import { type AssetKind } from '@studio/shared/catalog';
import { catalogHref } from './catalog-query';

/** `?editar=<assetId>@<version>` on the Prompts section opens the prompt form filled with that version. */
export const PROMPT_EDIT_PARAM = 'editar';

/**
 * Where a card's Edit button goes. A prompt opens the Prompts section's own form with its text filled in; every
 * other kind opens the new-version form (`/catalogo/novo?de=`), since a saved version is never changed in place.
 */
export function editHrefOf(version: Pick<AssetVersionView, 'id' | 'version' | 'kind'>): string {
  if (version.kind === 'prompt') {
    const target = catalogHref({ section: 'prompts' });
    return `${target}${target.includes('?') ? '&' : '?'}${PROMPT_EDIT_PARAM}=${encodeURIComponent(`${version.id}@${version.version}`)}`;
  }
  // Skills have their own editor for SKILL.md and the folder's files.
  if (version.kind === 'skill') return `/skills/${encodeURIComponent(version.id)}/editar`;
  return `/catalogo/novo?de=${encodeURIComponent(version.id)}&versao=${version.version}`;
}

/** Where a section's "Add <kind>" button goes: the new-asset form with that kind preset. */
export function addHrefOf(kind: AssetKind): string {
  // A skill is a folder with SKILL.md; its own importer reads it.
  if (kind === 'skill') return '/skills/novo?modo=importar';
  return `/catalogo/novo?tipo=${kind}`;
}
