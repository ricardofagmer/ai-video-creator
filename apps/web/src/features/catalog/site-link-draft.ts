import { type AssetMetadataInput, type AssetVersionView } from '@studio/shared/api';
import { type ReferenceDetails } from '@studio/shared/catalog';
import { httpsUrlFrom } from '../common/https-url';
import { assetIdFromName } from './asset-form/asset-form-model';
import { shortHashOf } from './image-link-draft';

/** Same cap as the brief's `sourceUrl`, so a saved site can always become a run's source. */
export const SITE_LINK_URL_MAX = 2048;
export const SITE_NAME_MAX = 120;
export const SITE_OWNER_MAX = 100;

/** What the site link form collects; the URL is the parsed `https:` address, never raw form text. */
export interface SiteLinkInput {
  url: URL;
  name: string;
  owner: string;
  /** The owner's own tags; `site` is always added first. */
  tags?: readonly string[];
}

/** Every saved website carries this tag, whatever else the owner adds. */
export const SITE_TAG = 'site';

/** The tags of a saved website: `site` first, then the owner's, without repeats. */
export function siteTagsOf(tags: readonly string[]): string[] {
  return [...new Set([SITE_TAG, ...tags])];
}

/** The create-asset request for one site saved by link: id, kind, metadata and the tiny text file. */
export interface SiteLinkDraft {
  assetId: string;
  kind: 'reference';
  metadata: AssetMetadataInput;
  file: File;
}

export function siteLinkUrlFrom(text: string): URL | null {
  return httpsUrlFrom(text, SITE_LINK_URL_MAX);
}

/**
 * docs/specs/2026-11-23-site-analysis-design.md point 7: the item's only content is a `text/plain` file
 * holding the page URL. Nothing is fetched at save time; the item is a third-party draft reference.
 */
export function siteLinkDraftOf(input: SiteLinkInput): SiteLinkDraft {
  const href = input.url.href;
  const stem = assetIdFromName(input.name).slice(0, 48).replace(/-+$/g, '');
  const assetId = `${stem === '' ? 'site' : stem}-${shortHashOf(href)}`;
  const details: ReferenceDetails = { subKind: 'website', referenceNotes: '' };
  return {
    assetId,
    kind: 'reference',
    metadata: {
      name: input.name.trim().slice(0, SITE_NAME_MAX),
      owner: input.owner.trim().slice(0, SITE_OWNER_MAX),
      tags: siteTagsOf(input.tags ?? []),
      provenance: { source: { type: 'url', url: href }, author: input.url.hostname, capturedAt: null },
      sensitivity: 'third-party',
      details,
    },
    file: new File([`${href}\n`], `${assetId}.txt`, { type: 'text/plain' }),
  };
}

/** A reference whose subtype is `website`, whatever its link: it belongs to the Sites section. */
export function isSiteReference(version: AssetVersionView): boolean {
  return version.kind === 'reference' && version.details.subKind === 'website';
}

/** The `https:` page of a site reference, for its card and the cart; null for any other version. */
export function siteLinkOf(version: AssetVersionView): URL | null {
  const source = version.provenance?.source;
  if (!isSiteReference(version) || source?.type !== 'url') return null;
  return siteLinkUrlFrom(source.url);
}
