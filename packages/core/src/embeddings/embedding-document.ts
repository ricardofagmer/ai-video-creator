import { EMBEDDING_DOCUMENT_MAX_CHARS, type AssetKind, type AssetRef, type RelativePath, type Sha256 } from '@studio/shared/catalog';

/** Items 1 to 3 of the document (SPEC 0003 section 5.2): the only part a biometric row has. */
export interface EmbeddingDocumentHead {
  readonly kind: AssetKind;
  readonly name: string;
  readonly summary: string;
  readonly tags: readonly string[];
}

/**
 * Item 6, the kind text, for versions held in the content store only. By-reference versions
 * always get `none` (B11): their target is never opened for embedding.
 */
export type KindTextSource =
  | { readonly type: 'none' }
  | { readonly type: 'inline'; readonly text: string }
  | { readonly type: 'stored-file'; readonly contentHash: Sha256; readonly variableNames: readonly string[] }
  | { readonly type: 'stored-folder-entry'; readonly manifestHash: Sha256; readonly entryFile: RelativePath };

/** The kind texts that need a read from the content store. */
export type StoredKindTextSource = Extract<KindTextSource, { type: 'stored-file' | 'stored-folder-entry' }>;

/**
 * What the document builder receives for one version. It carries no `reference_path` in any
 * variant, and a biometric variant carries nothing beyond the head (R2-AC-08): no notes, no
 * learnings, no content hash, no kind text.
 */
export type EmbeddingSource =
  | { readonly sensitivity: 'biometric'; readonly ref: AssetRef; readonly head: EmbeddingDocumentHead }
  | {
      readonly sensitivity: 'normal' | 'third-party';
      readonly ref: AssetRef;
      readonly head: EmbeddingDocumentHead;
      /** Active learning notes, newest first (item 4). */
      readonly learningNotes: readonly string[];
      /** The version's own `notes` field (item 5). */
      readonly versionNotes: string;
      readonly kindText: KindTextSource;
    };

/** Reads at most `maxChars` characters of a stored text; null when it cannot be read. */
export interface StoredTextReader {
  read(source: StoredKindTextSource, maxChars: number): Promise<string | null>;
}

const LINE_SEPARATOR = '\n';

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

/** Cuts at `EMBEDDING_DOCUMENT_MAX_CHARS` (B8) without leaving half of a surrogate pair. */
export function capDocument(text: string): string {
  if (text.length <= EMBEDDING_DOCUMENT_MAX_CHARS) return text;
  const cut = text.slice(0, EMBEDDING_DOCUMENT_MAX_CHARS);
  return isHighSurrogate(cut.charCodeAt(cut.length - 1)) ? cut.slice(0, -1) : cut;
}

function joinLines(lines: readonly string[]): string {
  return lines
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join(LINE_SEPARATOR);
}

function headLines(head: EmbeddingDocumentHead): string[] {
  return [`${head.kind}: ${head.name}`, head.summary, head.tags.length === 0 ? '' : `tags: ${head.tags.join(', ')}`];
}

async function kindTextLines(source: KindTextSource, reader: StoredTextReader, budget: number): Promise<string[]> {
  switch (source.type) {
    case 'none':
      return [];
    case 'inline':
      return [source.text];
    case 'stored-file': {
      const variables = source.variableNames.length === 0 ? '' : `variables: ${source.variableNames.join(', ')}`;
      return [variables, (await reader.read(source, budget)) ?? ''];
    }
    case 'stored-folder-entry':
      return [(await reader.read(source, budget)) ?? ''];
  }
}

/**
 * The embedding document of one version (SPEC 0003 section 5.2, B8): kind and name, summary, tags,
 * active learning notes newest first, the version's notes, then the kind text, NFC, cut at 2,000
 * characters. Paths, hashes, licence text and provenance URLs are never part of it.
 */
export async function buildEmbeddingDocument(source: EmbeddingSource, reader: StoredTextReader): Promise<string> {
  const head = headLines(source.head);
  // R2-AC-08: a biometric version is kind, name, summary and tags, returned before any content
  // read; this branch has no reader call, no notes and no path to pass.
  if (source.sensitivity === 'biometric') return capDocument(joinLines(head).normalize('NFC'));
  const metadata = joinLines([...head, ...source.learningNotes, source.versionNotes]);
  const budget = EMBEDDING_DOCUMENT_MAX_CHARS - metadata.length - LINE_SEPARATOR.length;
  // Metadata already fills the document: the kind text would be cut away, so it is not read.
  if (budget <= 0) return capDocument(metadata.normalize('NFC'));
  const kindText = await kindTextLines(source.kindText, reader, budget);
  return capDocument(joinLines([metadata, ...kindText]).normalize('NFC'));
}
