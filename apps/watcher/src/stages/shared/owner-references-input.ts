import { readFile } from 'node:fs/promises';
import { Logger } from '@nestjs/common';
import { OWNER_REFERENCES_MAX, OWNER_REFERENCE_TEXT_MAX_CHARS, type BoundAssetSummary, type OwnerReferenceNote } from '@studio/core/agents';
import type { StageExecutionContext } from '@studio/shared/ports';
import { readRunFile } from '@studio/shared/run-files';
import { errorName } from '../../platform/error-name';
import { type CatalogLookup } from './catalog-lookup';

const logger = new Logger('OwnerReferencesInput');
const TEXT_MIME_TYPES: ReadonlySet<string> = new Set(['application/json', 'application/x-subrip']);

function isTextMime(mimeType: string): boolean {
  return mimeType.startsWith('text/') || TEXT_MIME_TYPES.has(mimeType);
}

/**
 * Every reference the owner put on the run, of any sub-kind (video, image, text, style, audio,
 * screenshot set, website), as the writer and the director receive it: name, sub-kind and the
 * owner's notes, plus the content of a text reference. Image, audio and video bytes are never read
 * here: an image reaches the agents through its name and notes only. Biometric references are
 * skipped. Guidance only: a failure is logged (run id and error name) and reads as none.
 */
export async function readOwnerReferences(context: StageExecutionContext, catalog: CatalogLookup): Promise<OwnerReferenceNote[]> {
  try {
    const run = await readRunFile(context.runDir);
    const notes: OwnerReferenceNote[] = [];
    for (const ref of [...new Set(run.references)].slice(0, OWNER_REFERENCES_MAX)) {
      const asset = context.assets.find((candidate) => candidate.ref === ref);
      if (asset === undefined || asset.sensitivity === 'biometric') continue;
      const version = await catalog.version(ref);
      if (version.kind === 'image') {
        // A catalog image the owner put on the run (from the cart or the picker) is a reference too.
        notes.push({ ref, name: version.name, subKind: 'image', notes: version.summary });
        continue;
      }
      if (version.kind !== 'reference') continue;
      const { subKind, referenceNotes } = version.details;
      const readsText = subKind === 'text' && asset.layout === 'file' && isTextMime(asset.mimeType);
      const text = readsText ? (await readFile(asset.absolutePath, 'utf8')).slice(0, OWNER_REFERENCE_TEXT_MAX_CHARS) : undefined;
      notes.push({ ref, name: version.name, subKind, notes: referenceNotes, ...(text === undefined ? {} : { text }) });
    }
    return notes;
  } catch (error) {
    logger.warn({ event: 'stage.owner-references-unread', runId: context.runId, stageId: context.stage.stageId, error: errorName(error) });
    return [];
  }
}

/** The packet source field: the notes when there is at least one, nothing otherwise. */
export function ownerReferencesField(notes: readonly OwnerReferenceNote[]): { ownerReferences?: readonly OwnerReferenceNote[] } {
  return notes.length === 0 ? {} : { ownerReferences: notes };
}

/**
 * The run's references the director may put on screen: non-biometric image and video files, each
 * offered under the slot `reference:image` or `reference:video`. The recipe pins none of them, so
 * without this list a picture the owner chose could never become a scene's visual. A failure is
 * logged and reads as none.
 */
export async function readReferenceMedia(context: StageExecutionContext, catalog: CatalogLookup): Promise<BoundAssetSummary[]> {
  try {
    const run = await readRunFile(context.runDir);
    const media: BoundAssetSummary[] = [];
    for (const ref of [...new Set(run.references)].slice(0, OWNER_REFERENCES_MAX)) {
      const asset = context.assets.find((candidate) => candidate.ref === ref);
      if (asset === undefined || asset.sensitivity === 'biometric' || asset.layout !== 'file') continue;
      const medium = asset.mimeType.startsWith('image/') ? 'image' : asset.mimeType.startsWith('video/') ? 'video' : null;
      if (medium === null) continue;
      const version = await catalog.version(ref);
      media.push({ slot: `reference:${medium}`, ref: asset.ref, kind: asset.kind, title: version.name, sensitivity: asset.sensitivity });
    }
    return media;
  } catch (error) {
    logger.warn({ event: 'stage.reference-media-unread', runId: context.runId, stageId: context.stage.stageId, error: errorName(error) });
    return [];
  }
}
