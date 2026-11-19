import { z } from 'zod';
import {
  AssetKindSchema,
  BrandKitDetailsSchema,
  PromptDetailsSchema,
  ReferenceDetailsSchema,
  SensitivitySchema,
  Sha256Schema,
  SkillDetailsSchema,
  TagSchema,
  formatAssetRef,
  type AssetKind,
  type AssetRef,
} from '@studio/shared/catalog';
import { EmbeddingSourceCorruptError } from './embeddings.errors';
import { type EmbeddingDocumentHead, type EmbeddingSource, type KindTextSource } from './embedding-document';
import { type EmbeddingSourceRow } from './embedding-index.repository';

const TagsSchema = z.array(TagSchema);

export function refOfRow(row: { assetId: string; version: number }): AssetRef {
  return formatAssetRef({ assetId: row.assetId, version: row.version });
}

function parseValue<T>(schema: z.ZodType<T, unknown>, candidate: unknown, ref: AssetRef): T {
  const parsed = schema.safeParse(candidate);
  if (!parsed.success) throw new EmbeddingSourceCorruptError(ref);
  return parsed.data;
}

function parseJson<T>(schema: z.ZodType<T, unknown>, text: string, ref: AssetRef): T {
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch (error) {
    throw new EmbeddingSourceCorruptError(ref, { cause: error });
  }
  return parseValue(schema, candidate, ref);
}

function headOf(row: EmbeddingSourceRow, kind: AssetKind, ref: AssetRef): EmbeddingDocumentHead {
  return { kind, name: row.name, summary: row.summary, tags: parseJson(TagsSchema, row.tagsJson, ref) };
}

/**
 * Item 6 by kind, for content-store versions only (SPEC 0003 section 5.2, B11): the same text
 * kinds `AssetTextReader` serves to agents. Media, template and ai-model kinds have none.
 */
function kindTextOf(row: EmbeddingSourceRow, kind: AssetKind, ref: AssetRef): KindTextSource {
  if (row.storageMode !== 'store') return { type: 'none' };
  const contentHash = parseValue(Sha256Schema, row.contentHash, ref);
  switch (kind) {
    case 'prompt': {
      const details = parseJson(PromptDetailsSchema, row.detailsJson, ref);
      return { type: 'stored-file', contentHash, variableNames: details.variables.map((variable) => variable.name) };
    }
    case 'skill': {
      const details = parseJson(SkillDetailsSchema, row.detailsJson, ref);
      return { type: 'stored-folder-entry', manifestHash: contentHash, entryFile: details.entryFile };
    }
    case 'brand-kit':
      return { type: 'inline', text: parseJson(BrandKitDetailsSchema, row.detailsJson, ref).toneOfVoice };
    case 'reference':
      return { type: 'inline', text: parseJson(ReferenceDetailsSchema, row.detailsJson, ref).referenceNotes };
    case 'template':
    case 'ai-model':
    case 'image':
    case 'music':
    case 'sfx':
      return { type: 'none' };
  }
}

/**
 * Catalog row to document source. A biometric row returns its head before its notes, details or
 * content hash are looked at; no variant has a field for a by-reference path.
 */
export function toEmbeddingSource(row: EmbeddingSourceRow, learningNotes: readonly string[]): EmbeddingSource {
  const ref = refOfRow(row);
  const kind = parseValue(AssetKindSchema, row.asset.kind, ref);
  const head = headOf(row, kind, ref);
  const sensitivity = parseValue(SensitivitySchema, row.sensitivity, ref);
  if (sensitivity === 'biometric') return { sensitivity, ref, head };
  return { sensitivity, ref, head, learningNotes, versionNotes: row.notes, kindText: kindTextOf(row, kind, ref) };
}
