import { type AssetMetadataInput } from '@studio/shared/api';
import { type CatalogCategory } from './template-categories';
import { videoPostUrl, type VideoPlatform, type VideoPost } from './video-link';

export const REFERENCE_NAME_MAX = 120;
export const REFERENCE_OWNER_MAX = 100;
export const REFERENCE_AUTHOR_MAX = 80;

const ASSET_ID_PREFIXES: Readonly<Record<VideoPlatform, string>> = {
  instagram: 'ig',
  youtube: 'yt',
  tiktok: 'tt',
  vimeo: 'vm',
  dailymotion: 'dm',
  facebook: 'fb',
  x: 'x',
  twitch: 'tw',
};

/** What the Save as reference form collects; the post comes from the parsed link, never from the form. */
export interface ReferenceLinkInput {
  post: VideoPost;
  name: string;
  category: CatalogCategory;
  owner: string;
  author: string;
}

/** The create-asset request for one saved link: id, kind, metadata and the tiny text file. */
export interface ReferenceLinkDraft {
  assetId: string;
  kind: 'reference';
  metadata: AssetMetadataInput;
  file: File;
}

/** One id per post (`ig-`, `yt-` or `tt-` plus the post id), so saving the same post twice answers "already exists". */
export function referenceAssetIdOf(post: VideoPost): string {
  const slug = post.id
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return `${ASSET_ID_PREFIXES[post.platform]}-${slug}`.slice(0, 64).replace(/-+$/, '');
}

/**
 * docs/specs/2026-11-23-reference-link-save-and-categories-design.md, option B: the item's only content
 * is a `text/plain` file holding the canonical post URL. Nothing is fetched from the platform; the item is
 * a third-party draft, so the catalog keeps it out of videos until license and provenance are filled.
 * Without an author the platform's name is recorded.
 */
export function referenceLinkDraftOf(input: ReferenceLinkInput): ReferenceLinkDraft {
  const url = videoPostUrl(input.post);
  const author = input.author.trim().slice(0, REFERENCE_AUTHOR_MAX);
  const assetId = referenceAssetIdOf(input.post);
  return {
    assetId,
    kind: 'reference',
    metadata: {
      name: input.name.trim().slice(0, REFERENCE_NAME_MAX),
      owner: input.owner.trim().slice(0, REFERENCE_OWNER_MAX),
      tags: [input.category, input.post.platform],
      provenance: { source: { type: 'url', url }, author: author === '' ? input.post.platform : author, capturedAt: null },
      sensitivity: 'third-party',
      details: { subKind: 'video', referenceNotes: '' },
    },
    file: new File([`${url}\n`], `${assetId}.txt`, { type: 'text/plain' }),
  };
}
