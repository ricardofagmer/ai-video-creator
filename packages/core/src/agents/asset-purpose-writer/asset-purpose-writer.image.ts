import { type AssetPurposeImageMimeType, type AssetPurposeWriterInput } from '@studio/shared/ports';

/** The port's image cap (`AssetPurposeContent`, at most 5 MB); checked again before anything leaves. */
const IMAGE_MAX_BYTES = 5 * 1024 * 1024;

function startsWith(bytes: Uint8Array, signature: readonly number[], offset = 0): boolean {
  return signature.every((byte, index) => bytes[offset + index] === byte);
}

const RIFF = [0x52, 0x49, 0x46, 0x46];
const WEBP = [0x57, 0x45, 0x42, 0x50];

/** File signatures of the three image types the port allows. */
const SIGNATURES: Readonly<Record<AssetPurposeImageMimeType, (bytes: Uint8Array) => boolean>> = {
  'image/jpeg': (bytes) => startsWith(bytes, [0xff, 0xd8, 0xff]),
  'image/png': (bytes) => startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  'image/webp': (bytes) => startsWith(bytes, RIFF) && startsWith(bytes, WEBP, 8),
};

/** The engine the call goes to (ADR 0011); the Claude Code CLI path sends JPEG image blocks only. */
export type AssetPurposeEngine = 'api' | 'claude-code';

/**
 * Why an image the input carried is not sent; the call then goes ahead with the metadata only:
 * - `engine-unsupported-type`: the Claude Code engine labels every image block as JPEG, so a PNG or
 *   WebP is withheld rather than sent mislabelled;
 * - `invalid-image`: empty, over 5 MB, or the bytes do not match the declared type.
 */
export type AssetPurposeImageWithheldReason = 'engine-unsupported-type' | 'invalid-image';

/** The one image the call sends, already checked. */
export interface AssetPurposeImagePart {
  readonly mimeType: AssetPurposeImageMimeType;
  readonly bytes: Uint8Array;
}

export type AssetPurposeImagePlan =
  | { readonly status: 'no-image' }
  | { readonly status: 'attached'; readonly image: AssetPurposeImagePart }
  | { readonly status: 'withheld'; readonly reason: AssetPurposeImageWithheldReason };

function validImage(image: AssetPurposeImagePart): boolean {
  return image.bytes.byteLength > 0 && image.bytes.byteLength <= IMAGE_MAX_BYTES && SIGNATURES[image.mimeType](image.bytes);
}

/**
 * Whether the call carries the input's image. A biometric input never does (AP-05): that variant
 * has no content, and the scope is checked first so no later change can route bytes past it.
 */
export function assetPurposeImagePlan(input: AssetPurposeWriterInput, engine: AssetPurposeEngine): AssetPurposeImagePlan {
  if (input.scope === 'biometric' || input.content.kind !== 'image') return { status: 'no-image' };
  const image: AssetPurposeImagePart = { mimeType: input.content.mimeType, bytes: input.content.bytes };
  if (!validImage(image)) return { status: 'withheld', reason: 'invalid-image' };
  if (engine === 'claude-code' && image.mimeType !== 'image/jpeg') return { status: 'withheld', reason: 'engine-unsupported-type' };
  return { status: 'attached', image };
}
