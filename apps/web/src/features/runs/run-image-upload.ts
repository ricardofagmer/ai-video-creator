import { type AssetMetadataInput } from '@studio/shared/api';
import { type ImageDetails } from '@studio/shared/catalog';
import { assetIdFromName } from '@/features/catalog/asset-form/asset-form-model';
import { shortHashOf } from '@/features/catalog/image-link-draft';
import { allowedMimeTypesByKind, maxUploadBytesByKind } from '@/features/catalog/upload-rules';

const IMAGE_NAME_MAX = 120;
// ImageDetailsSchema caps each side at 16384 px.
const IMAGE_SIDE_MAX = 16384;

export type RunImageProblem = 'type' | 'size';

/** The create-asset request for one picture the owner picked or pasted on the new-run page. */
export interface RunImageDraft {
  assetId: string;
  kind: 'image';
  metadata: AssetMetadataInput;
  file: File;
}

export interface RunImageInput {
  file: File;
  width: number;
  height: number;
  /** Catalog owner written on the new item; the catalog form's default owner. */
  owner: string;
  /** Name used when the file has none (a pasted screenshot is called `image.png`). */
  fallbackName: string;
  /** Milliseconds since the epoch, so two pastes of the same picture get two ids. */
  now: number;
}

/** Same type and size rules as the catalog upload form; the api stays authoritative. */
export function runImageProblemOf(file: File): RunImageProblem | null {
  if (!allowedMimeTypesByKind.image.includes(file.type)) return 'type';
  if (file.size === 0 || file.size > maxUploadBytesByKind.image) return 'size';
  return null;
}

function clampSide(side: number): number {
  return Math.min(Math.max(Math.round(side), 1), IMAGE_SIDE_MAX);
}

function nameOf(file: File, fallbackName: string): string {
  const stem = file.name.replace(/\.[a-z0-9]+$/i, '').trim();
  // Browsers name every pasted picture `image.png`; that name says nothing about it.
  return (stem === '' || stem.toLowerCase() === 'image' ? fallbackName : stem).slice(0, IMAGE_NAME_MAX);
}

/**
 * The picture is stored in the catalog as an ordinary draft image (owner's own upload, so
 * sensitivity `normal`), then used on this run by its `assetId@1` ref.
 */
export function runImageDraftOf(input: RunImageInput): RunImageDraft {
  const name = nameOf(input.file, input.fallbackName);
  const stem = assetIdFromName(name).slice(0, 48).replace(/-+$/g, '');
  const assetId = `${stem === '' ? 'imagem' : stem}-${shortHashOf(`${input.file.name}:${input.file.size}:${input.now}`)}`;
  const details: ImageDetails = { width: clampSide(input.width), height: clampSide(input.height), purpose: 'still' };
  return {
    assetId,
    kind: 'image',
    metadata: { name, owner: input.owner, tags: ['upload'], sensitivity: 'normal', details },
    file: input.file,
  };
}
