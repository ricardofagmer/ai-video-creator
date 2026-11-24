import { type AssetVersionView } from '@studio/shared/api';
import { formatAssetRef } from '@studio/shared/catalog';
import { siteLinkOf } from '@/features/catalog/site-link-draft';
import { isVoiceVersion } from '@/features/voices/voice-asset';
import { type CartItem } from './cart-store';

/** The cart row of one catalog version: name, kind and ref (plus a site's page link), never the asset's content. */
export function cartItemOf(version: AssetVersionView): CartItem {
  const siteLink = siteLinkOf(version);
  return {
    ref: formatAssetRef({ assetId: version.id, version: version.version }),
    name: version.name,
    kind: version.kind,
    status: version.status,
    sensitivity: version.sensitivity,
    ...(siteLink === null ? {} : { siteUrl: siteLink.href }),
    ...(isVoiceVersion(version) ? { voice: true } : {}),
  };
}

/** `/catalogo/<id>?versao=<n>` for a cart ref `id@n`. */
export function catalogHrefOf(ref: string): string {
  const at = ref.lastIndexOf('@');
  return `/catalogo/${encodeURIComponent(ref.slice(0, at))}?versao=${encodeURIComponent(ref.slice(at + 1))}`;
}
