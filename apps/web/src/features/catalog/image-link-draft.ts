import { type AssetMetadataInput, type AssetVersionView } from '@studio/shared/api';
import { type ImageDetails } from '@studio/shared/catalog';
import { httpsUrlFrom } from '../common/https-url';
import { assetIdFromName } from './asset-form/asset-form-model';

export const IMAGE_LINK_URL_MAX = 2048;
export const IMAGE_NAME_MAX = 120;
export const IMAGE_OWNER_MAX = 100;
// ImageDetailsSchema caps each side at 16384 px.
const IMAGE_SIDE_MAX = 16384;

/** What the image link form collects; the URL is the parsed `https:` address, never raw form text. */
export interface ImageLinkInput {
  url: URL;
  name: string;
  owner: string;
  purpose: ImageDetails['purpose'];
  width: number;
  height: number;
}

/** The create-asset request for one image saved by link: id, kind, metadata and the tiny text file. */
export interface ImageLinkDraft {
  assetId: string;
  kind: 'image';
  metadata: AssetMetadataInput;
  file: File;
}

/** Only an absolute `https:` URL with a host is accepted; anything else returns null. */
export function imageLinkUrlFrom(text: string): URL | null {
  return httpsUrlFrom(text, IMAGE_LINK_URL_MAX);
}

/** FNV-1a of the URL, so the same name saved from two links gets two ids. */
export function shortHashOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36).padStart(7, '0').slice(0, 7);
}

function clampSide(side: number): number {
  return Math.min(Math.max(Math.round(side), 1), IMAGE_SIDE_MAX);
}

/**
 * docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md: the item's only content is a
 * `text/plain` file holding the image URL. Nothing is fetched by the server; the item is a third-party
 * draft. Width and height come from the browser's preview of the link.
 */
export function imageLinkDraftOf(input: ImageLinkInput): ImageLinkDraft {
  const href = input.url.href;
  const stem = assetIdFromName(input.name).slice(0, 48).replace(/-+$/g, '');
  const assetId = `${stem === '' ? 'imagem' : stem}-${shortHashOf(href)}`;
  const details: ImageDetails = { width: clampSide(input.width), height: clampSide(input.height), purpose: input.purpose };
  return {
    assetId,
    kind: 'image',
    metadata: {
      name: input.name.trim().slice(0, IMAGE_NAME_MAX),
      owner: input.owner.trim().slice(0, IMAGE_OWNER_MAX),
      tags: ['link'],
      provenance: { source: { type: 'url', url: href }, author: input.url.hostname, capturedAt: null },
      sensitivity: 'third-party',
      details,
    },
    file: new File([`${href}\n`], `${assetId}.txt`, { type: 'text/plain' }),
  };
}

/** The `https:` link of an image saved by link, for its card thumbnail; null for any other version. */
export function imageLinkOf(version: AssetVersionView): URL | null {
  const source = version.provenance?.source;
  if (version.kind !== 'image' || source?.type !== 'url') return null;
  return imageLinkUrlFrom(source.url);
}
