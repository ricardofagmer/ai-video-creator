import { type AssetVersion } from '@studio/shared/catalog';
import { type AssetPurposeContent, type AssetPurposeFacts, type AssetPurposeWriterInput } from '@studio/shared/ports';

/** C-P6: the longest entry text a purpose input carries, in UTF-16 code units. */
export const PURPOSE_TEXT_MAX_CHARS = 12_000;

/** C-P6: the largest image a purpose input carries (one image, 5 MB). */
export const PURPOSE_IMAGE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * C-P6: the extra content a purpose input may carry beyond metadata (AP-06): the bounded entry
 * text of a prompt, skill or template, one stored image, or a done reference analysis. Built by
 * `AssetPurposeContentReader` (`asset-purpose.content.ts`).
 */
export type PurposeContent = AssetPurposeContent;

/** The content of a metadata-only input. */
export const NO_PURPOSE_CONTENT: PurposeContent = { kind: 'none' };

/**
 * C-P6, AP-05: the whole model input of a biometric version. Only the name, kind and tags are
 * read: no path, hash, bytes, summary, notes or details, so a face or voice row can never leak
 * more than its catalog label.
 */
export function biometricPurposeInput(version: AssetVersion): AssetPurposeFacts {
  return { name: version.name, kind: version.kind, tags: [...version.tags] };
}

/**
 * C-P6: the model input of a version. A biometric row always gets `biometricPurposeInput`,
 * whatever `content` says, so no caller can widen it. Every other row carries its catalog
 * metadata (name, kind, tags, summary, details) plus `content`, held to the C-P6 bounds again
 * here so no reader can grow the prompt past them.
 */
export function purposeInput(version: AssetVersion, content: PurposeContent): AssetPurposeWriterInput {
  if (version.sensitivity === 'biometric') return { scope: 'biometric', ...biometricPurposeInput(version) };
  return {
    scope: 'metadata',
    name: version.name,
    kind: version.kind,
    tags: [...version.tags],
    summary: version.summary,
    details: version.details,
    content: boundedContent(content),
  };
}

/** A text cut to `PURPOSE_TEXT_MAX_CHARS`, never splitting a surrogate pair. */
export function boundedPurposeText(text: string): { text: string; truncated: boolean } {
  if (text.length <= PURPOSE_TEXT_MAX_CHARS) return { text, truncated: false };
  const end = isHighSurrogate(text.charCodeAt(PURPOSE_TEXT_MAX_CHARS - 1)) ? PURPOSE_TEXT_MAX_CHARS - 1 : PURPOSE_TEXT_MAX_CHARS;
  return { text: text.slice(0, end), truncated: true };
}

/** An image over the byte bound or a blank text is dropped to metadata only; a long text is cut. */
function boundedContent(content: PurposeContent): PurposeContent {
  switch (content.kind) {
    case 'none':
    case 'reference-analysis':
      return content;
    case 'image':
      return content.bytes.byteLength > 0 && content.bytes.byteLength <= PURPOSE_IMAGE_MAX_BYTES ? content : NO_PURPOSE_CONTENT;
    case 'text': {
      if (content.text.trim().length === 0) return NO_PURPOSE_CONTENT;
      const bounded = boundedPurposeText(content.text);
      return { kind: 'text', text: bounded.text, truncated: content.truncated || bounded.truncated };
    }
  }
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}
