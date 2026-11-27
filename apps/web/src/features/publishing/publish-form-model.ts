import { type PublishRequest } from '@studio/shared/api';
import { type AssetRef } from '@studio/shared/catalog';
import { type Platform } from '@studio/shared/metrics';
import { publishBounds, type Visibility } from '@studio/shared/platforms';
import { type WebMessages } from '@/messages';

/** One tab of the publish dialog as the owner fills it. */
export interface PublishDraft {
  title: string;
  caption: string;
  /** Tags as typed: separated by commas or spaces, a leading `#` allowed. */
  tagsText: string;
  /** No option is preselected (B7). */
  visibility: Visibility | null;
  aiDisclosure: boolean;
}

type PublishDraftField = 'title' | 'caption' | 'tags' | 'visibility';
export type PublishDraftErrors = Partial<Record<PublishDraftField, string>>;

/** Section 4.3 `PublishMetadataSchema.tags`. */
const TAG_PATTERN = /^[\p{L}\p{N}_]{1,50}$/u;

/**
 * Section 5.4: the title starts as the run title; no visibility is chosen (B7); `aiDisclosure` is
 * checked only when the run used a biometric asset (B8).
 */
export function initialPublishDraft(options: { runTitle: string; hasBiometricAssets: boolean }): PublishDraft {
  return {
    title: options.runTitle.trim().slice(0, publishBounds.titleChars),
    caption: '',
    tagsText: '',
    visibility: null,
    aiDisclosure: options.hasBiometricAssets,
  };
}

/** TikTok receives the video only (inbox draft, OD6): its caption is copied by hand and no tag is sent. */
export function platformUsesTags(platform: Platform): boolean {
  return platform === 'youtube';
}

function parseTags(tagsText: string): string[] {
  return tagsText
    .split(/[\s,]+/u)
    .map((tag) => tag.replace(/^#+/u, ''))
    .filter((tag) => tag !== '');
}

export type PublishRequestBuild = { status: 'ready'; request: PublishRequest } | { status: 'invalid'; errors: PublishDraftErrors };

/**
 * The `POST /runs/:runId/publish/:platform` body, or the errors of the draft. The api checks
 * everything again; this only answers early. `biometricRefs` is the set the dialog showed.
 */
export function buildPublishRequest(options: {
  platform: Platform;
  draft: PublishDraft;
  allowedVisibilities: readonly Visibility[];
  idempotencyKey: string;
  artifactSha256: string;
  biometricRefs: readonly AssetRef[];
  t: WebMessages['publishing']['errors'];
}): PublishRequestBuild {
  const { draft, platform, t } = options;
  const errors: PublishDraftErrors = {};
  const title = draft.title.trim();
  if (title === '') errors.title = t.titleRequired;
  else if (title.length > publishBounds.titleChars) errors.title = t.tooLong(publishBounds.titleChars);
  if (draft.caption.length > publishBounds.captionChars) errors.caption = t.captionTooLong;
  const tags = platformUsesTags(platform) ? parseTags(draft.tagsText) : [];
  if (tags.length > publishBounds.maxTags) errors.tags = t.tooManyTags(publishBounds.maxTags);
  else if (!tags.every((tag) => TAG_PATTERN.test(tag))) errors.tags = t.tagFormat;
  const visibility = draft.visibility;
  if (visibility === null || !options.allowedVisibilities.includes(visibility)) errors.visibility = t.visibility;
  if (visibility === null || Object.keys(errors).length > 0) return { status: 'invalid', errors };
  return {
    status: 'ready',
    request: {
      idempotencyKey: options.idempotencyKey,
      metadata: { title, caption: draft.caption, tags, visibility, aiDisclosure: draft.aiDisclosure },
      biometricRefs: [...options.biometricRefs],
      artifactSha256: options.artifactSha256,
    },
  };
}
