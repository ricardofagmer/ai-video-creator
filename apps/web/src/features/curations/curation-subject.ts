import { type AssetVersionView, type RecipeVersionView } from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { type CurationSubject } from '@studio/shared/curation';
import { type WebMessages } from '@/messages';

/** The curation subject of an asset version page: prompts and skills only (SPEC 0005 section 5.9). */
export function assetCurationSubject(version: AssetVersionView): CurationSubject | null {
  if (version.kind !== 'prompt' && version.kind !== 'skill') return null;
  return { kind: version.kind, ref: formatAssetRef({ assetId: version.id, version: version.version }) };
}

export function recipeCurationSubject(view: RecipeVersionView): CurationSubject {
  return { kind: 'recipe', ref: view.ref };
}

/**
 * Why a version cannot receive a new request, or null when it can. The button is hidden for
 * deprecated and biometric versions; the api refuses them again (C5-AC-12).
 */
export function curationBlockedText(
  options: { status: AssetVersionView['status']; biometric: boolean },
  t: WebMessages['curations']['blocked'],
): string | null {
  if (options.biometric) return t.biometric;
  if (options.status === 'deprecated') return t.deprecated;
  return null;
}
