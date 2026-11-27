import { z } from 'zod';
import { AssetJobErrorCodeSchema } from '../asset-jobs/asset-job';
import { AbsolutePathSchema, RelativePathSchema } from '../common/ids';
import {
  AssetIdSchema,
  AssetKindSchema,
  AssetStatusSchema,
  MimeTypeSchema,
  SensitivitySchema,
  TagSchema,
} from '../catalog/asset-kind';
import {
  ASSET_PURPOSE_MAX_CHARS,
  AiModelAssetVersionSchema,
  AssetLayoutSchema,
  BrandKitAssetVersionSchema,
  ImageAssetVersionSchema,
  MusicAssetVersionSchema,
  PromptAssetVersionSchema,
  ReferenceAssetVersionSchema,
  SfxAssetVersionSchema,
  SkillAssetVersionSchema,
  TemplateAssetVersionSchema,
  assetVersionBaseShape,
} from '../catalog/asset-version';
import { PageLimitQuerySchema, pageOf, queryInteger, queryList } from './common';
import { LearningNoteViewSchema } from './learnings';
import { PromotionApprovalViewSchema } from './promotion';

/**
 * Storage as the api shows it. A by-reference path is shown for normal and third-party rows only;
 * for `sensitivity: biometric` it is `null`, so a biometric path never leaves the api (PRD 12).
 */
export const AssetStorageViewSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('store') }).strict(),
  z.object({ mode: z.literal('reference'), absolutePath: AbsolutePathSchema.nullable() }).strict(),
]);
export type AssetStorageView = z.infer<typeof AssetStorageViewSchema>;

/**
 * Fields the api adds to every C1 version (rev 3, SPEC 0003 section 4.3):
 * - `searchIndex`: the version's row in the semantic index: `indexed` (vector current), `pending`
 *   (no current vector), `stale` (vector from another model), `unavailable` (model absent or
 *   rejected);
 * - `learnings`: the version's notes, active and retired, newest first;
 * - `activation`: the approval that made it `active`, or null;
 * - `purposeJob`: the open or failed purpose job (ADR 0012, C-P2), or null.
 */
/**
 * ADR 0012 (C-P2): the version's open or failed `asset-purpose` job. `null` means no job, or a
 * `done` one, whose text is already copied into `purpose`. `errorCode` is set for `failed` and
 * `refused` only.
 */
export const AssetPurposeJobViewSchema = z
  .object({
    status: z.enum(['requested', 'running', 'failed', 'refused']),
    errorCode: AssetJobErrorCodeSchema.nullable(),
  })
  .strict();
export type AssetPurposeJobView = z.infer<typeof AssetPurposeJobViewSchema>;

const versionView = {
  storage: AssetStorageViewSchema,
  searchIndex: z.enum(['indexed', 'pending', 'stale', 'unavailable']),
  learnings: z.array(LearningNoteViewSchema).max(50),
  activation: PromotionApprovalViewSchema.nullable(),
  purposeJob: AssetPurposeJobViewSchema.nullable(),
};

/** C1 `embedding` is omitted: no response of any route carries a vector (SPEC 0003 L8, R2-AC-10). */
const withoutVector: { embedding: true } = { embedding: true };

/**
 * One C1 asset version as returned by the api: C1 with `storage` replaced by its view, without
 * `embedding`, plus the rev 3 fields above.
 */
export const AssetVersionViewSchema = z.discriminatedUnion('kind', [
  TemplateAssetVersionSchema.omit(withoutVector).extend(versionView),
  AiModelAssetVersionSchema.omit(withoutVector).extend(versionView),
  ReferenceAssetVersionSchema.omit(withoutVector).extend(versionView),
  PromptAssetVersionSchema.omit(withoutVector).extend(versionView),
  SkillAssetVersionSchema.omit(withoutVector).extend(versionView),
  ImageAssetVersionSchema.omit(withoutVector).extend(versionView),
  MusicAssetVersionSchema.omit(withoutVector).extend(versionView),
  SfxAssetVersionSchema.omit(withoutVector).extend(versionView),
  BrandKitAssetVersionSchema.omit(withoutVector).extend(versionView),
]);
export type AssetVersionView = z.infer<typeof AssetVersionViewSchema>;

export const AssetVersionPageSchema = pageOf(AssetVersionViewSchema);
export type AssetVersionPageView = z.infer<typeof AssetVersionPageSchema>;

/**
 * `PUT /catalog/assets/:assetId/versions/:version/status` response: the version after the call. The
 * route only deprecates; activation is `POST .../promotion`.
 */
export const SetAssetStatusResponseSchema = z
  .object({
    version: AssetVersionViewSchema,
  })
  .strict();
export type SetAssetStatusResponse = z.infer<typeof SetAssetStatusResponseSchema>;

/**
 * `POST /catalog/assets/:assetId/versions/:version/promotion` (201, rev 3): the version now
 * `active`, the version it replaced (now `deprecated`) or null, and the recorded approval.
 */
export const PromoteAssetVersionResponseSchema = z
  .object({
    version: AssetVersionViewSchema,
    replaced: AssetVersionViewSchema.nullable(),
    approval: PromotionApprovalViewSchema,
  })
  .strict();
export type PromoteAssetVersionResponse = z.infer<typeof PromoteAssetVersionResponseSchema>;

/** `minQuality`: a decimal 1..5 such as `4` or `3.5`; query values always arrive as text. */
const MinQualityQuerySchema = z
  .string()
  .regex(/^[0-9](\.[0-9]{1,3})?$/, 'expected a decimal such as 4 or 3.5')
  .transform((value) => Number.parseFloat(value))
  .refine((value) => value >= 1 && value <= 5, { message: 'expected 1..5' });

/**
 * `GET /catalog/assets` query (lexical search, PRD 5; search by meaning is `POST /catalog/search`).
 * Rev 3 (SPEC 0003 section 4.3): `sort` (absent means `recent`, the rev 2 order); `sort=quality`
 * orders by `qualityScore` descending, ties by id descending, null scores last. `minQuality`
 * excludes null scores. `cursor` is an opaque token from `nextCursor`; a numeric rev 2 cursor is
 * still valid for `sort=recent`.
 */
export const SearchAssetsQuerySchema = z
  .object({
    text: z.string().max(200).optional(),
    kinds: queryList(AssetKindSchema, AssetKindSchema.options.length).optional(),
    tags: queryList(TagSchema, 8).optional(),
    statuses: queryList(AssetStatusSchema, AssetStatusSchema.options.length).optional(),
    /** The owner's catalog view may pass `any`; biometric rows are excluded by default. */
    sensitivity: z.enum(['any', 'exclude-biometric']).optional(),
    sort: z.enum(['recent', 'quality']).optional(),
    minQuality: MinQualityQuerySchema.optional(),
    minSampleSize: queryInteger(1, 1_000_000).optional(),
    limit: PageLimitQuerySchema.optional(),
    cursor: z.string().regex(/^[A-Za-z0-9._-]{1,64}$/).optional(),
  })
  .strict();
export type SearchAssetsQuery = z.input<typeof SearchAssetsQuerySchema>;

/** `GET /catalog/assets/:assetId/versions` query. */
export const PageQuerySchema = z
  .object({
    limit: PageLimitQuerySchema.optional(),
    cursor: z.string().regex(/^[1-9][0-9]{0,14}$/).optional(),
  })
  .strict();
export type PageQuery = z.input<typeof PageQuerySchema>;

export const AssetParamsSchema = z.object({ assetId: AssetIdSchema }).strict();
export const AssetVersionParamsSchema = z
  .object({ assetId: AssetIdSchema, version: queryInteger(1, 1_000_000) })
  .strict();

/**
 * Owner-supplied metadata of a new version (PRD 5.2). System fields (version, status, timestamps,
 * usage, storage facts) are never accepted. `details` is checked against the kind's C1 schema by
 * the catalog module.
 */
export const AssetMetadataInputSchema = z
  .object({
    name: assetVersionBaseShape.name,
    summary: assetVersionBaseShape.summary.optional(),
    tags: assetVersionBaseShape.tags.optional(),
    owner: assetVersionBaseShape.owner,
    provenance: assetVersionBaseShape.provenance.optional(),
    license: assetVersionBaseShape.license.optional(),
    sensitivity: SensitivitySchema,
    notes: assetVersionBaseShape.notes.optional(),
    details: z.unknown(),
  })
  .strict();
export type AssetMetadataInput = z.input<typeof AssetMetadataInputSchema>;

/**
 * Multipart upload (PRD 5.3 "Web upload"), `multipart/form-data` with parts in this order:
 * 1. one text part named `fields` holding the JSON of the matching `*UploadFieldsSchema`;
 * 2. `layout: file`: exactly one file part named `file` (its Content-Type is the version's MIME
 *    type, checked against the per-kind allowlist);
 *    `layout: folder`: one file part named `files` per file, each with its folder-relative path as
 *    filename (`[A-Za-z0-9._-]` segments joined by `/`, e.g. `webkitRelativePath`).
 * Biometric material is never uploaded: it is registered by reference, through the CLI or through
 * the by-reference routes (`POST /catalog/assets/by-reference` and
 * `POST /catalog/assets/:assetId/versions/by-reference`, SPEC 0002 rev 4).
 */
export const uploadPartNames = { fields: 'fields', file: 'file', folderFiles: 'files' };

/** `POST /catalog/assets`: a new asset and its version 1 as `draft`. */
export const CreateAssetUploadFieldsSchema = z
  .object({
    assetId: AssetIdSchema,
    kind: AssetKindSchema,
    layout: AssetLayoutSchema,
    metadata: AssetMetadataInputSchema,
  })
  .strict();
export type CreateAssetUploadFields = z.infer<typeof CreateAssetUploadFieldsSchema>;

/** `POST /catalog/assets/:assetId/versions`: version N+1 with new bytes, as `draft`. */
export const SaveAssetVersionUploadFieldsSchema = z
  .object({
    layout: AssetLayoutSchema,
    metadata: AssetMetadataInputSchema,
  })
  .strict();
export type SaveAssetVersionUploadFields = z.infer<typeof SaveAssetVersionUploadFieldsSchema>;

/** `POST /catalog/assets/:assetId/versions/from-previous` (JSON): N+1 reusing the bytes of `fromVersion`. */
/** A skill's entry file (SKILL.md) as text; core enforces the same 256 KiB byte cap in UTF-8. */
export const ENTRY_FILE_TEXT_MAX_BYTES = 256 * 1024;

const EntryFileTextSchema = z
  .string()
  .refine((text) => new TextEncoder().encode(text).byteLength <= ENTRY_FILE_TEXT_MAX_BYTES, {
    message: `at most ${ENTRY_FILE_TEXT_MAX_BYTES} bytes as UTF-8`,
  });

/**
 * N+1 from `fromVersion`. With `entryFile` (skills only, skills spec addendum T5) the stored folder
 * keeps every other file and its entry file is replaced by `entryFile.text`; without it the bytes
 * are reused as they are.
 */
export const SaveMetadataVersionRequestSchema = z
  .object({
    fromVersion: z.number().int().min(1),
    metadata: AssetMetadataInputSchema,
    entryFile: z.object({ text: EntryFileTextSchema }).strict().optional(),
  })
  .strict();
export type SaveMetadataVersionRequest = z.infer<typeof SaveMetadataVersionRequestSchema>;

/** `GET .../versions/:version/entry-file`: the entry file of a skill version as UTF-8 text. */
export const EntryFileViewSchema = z
  .object({
    path: RelativePathSchema,
    text: z.string(),
  })
  .strict();
export type EntryFileView = z.infer<typeof EntryFileViewSchema>;

/**
 * Step 1 of the by-reference path validation (SPEC 0002 rev 4, section 13.4): `AbsolutePathSchema`,
 * normalized (no empty segment) and with no trailing separator. A failure is a 400 request-shape
 * error; the api runs steps 2 to 6 (realpath, existence, kind, data home, home or `/Volumes/`) with
 * `lstat` and `realpath` only, and never opens, reads, lists or hashes the target.
 */
const ReferencePathSchema = AbsolutePathSchema.refine((value) => value.split('/').slice(1).every((segment) => segment !== ''), {
  message: 'absolute path must be normalized, with no empty segment and no trailing separator',
});

/**
 * `POST /catalog/assets/by-reference` (JSON, rev 4): a new asset and its version 1 as `draft`,
 * stored by reference (A23). `sensitivity` lives in `metadata` only and may be `biometric`. The api
 * derives the layout from the target (file or folder); for a file, an absent `mimeType` defaults to
 * `mimeTypeForFileName` and an unknown extension is refused; a folder ignores it. For a biometric
 * version the returned `storage.absolutePath` is `null`, so the path never comes back.
 */
export const RegisterAssetByReferenceRequestSchema = z
  .object({
    assetId: AssetIdSchema,
    kind: AssetKindSchema,
    absolutePath: ReferencePathSchema,
    mimeType: MimeTypeSchema.optional(),
    metadata: AssetMetadataInputSchema,
  })
  .strict();
export type RegisterAssetByReferenceRequest = z.infer<typeof RegisterAssetByReferenceRequestSchema>;

/** `POST /catalog/assets/:assetId/versions/by-reference` (JSON, rev 4): version N+1 by reference, as `draft`. */
export const SaveAssetVersionByReferenceRequestSchema = z
  .object({
    absolutePath: ReferencePathSchema,
    mimeType: MimeTypeSchema.optional(),
    metadata: AssetMetadataInputSchema,
  })
  .strict();
export type SaveAssetVersionByReferenceRequest = z.infer<typeof SaveAssetVersionByReferenceRequestSchema>;

/**
 * File extensions a MIME type can be named for, limited to types some kind accepts in the core
 * allowlist (`ALLOWED_FILE_MIME_TYPES_BY_KIND`). The core still checks the type per kind.
 */
const mimeTypesByExtension: ReadonlyMap<string, string> = new Map([
  ['png', 'image/png'],
  ['jpg', 'image/jpeg'],
  ['jpeg', 'image/jpeg'],
  ['webp', 'image/webp'],
  ['mp3', 'audio/mpeg'],
  ['wav', 'audio/wav'],
  ['m4a', 'audio/mp4'],
  ['aac', 'audio/aac'],
  ['flac', 'audio/flac'],
  ['mp4', 'video/mp4'],
  ['mov', 'video/quicktime'],
  ['webm', 'video/webm'],
  ['json', 'application/json'],
  ['txt', 'text/plain'],
  ['md', 'text/markdown'],
  ['pdf', 'application/pdf'],
]);

/**
 * The MIME type of a file name (or the last segment of a path) from its extension, by the allowlist
 * table above only; the content is never sniffed. `null` for a name with no extension, a dotfile
 * name such as `.env`, or an extension not in the table (rev 4, A23). Case-insensitive.
 */
export function mimeTypeForFileName(name: string): string | null {
  const fileName = name.slice(name.lastIndexOf('/') + 1);
  const dot = fileName.lastIndexOf('.');
  if (dot <= 0 || dot === fileName.length - 1) return null;
  const extension = fileName.slice(dot + 1).toLowerCase();
  return mimeTypesByExtension.get(extension) ?? null;
}

/**
 * `PUT .../status` body for asset and recipe versions; nothing is ever deleted. The route only
 * deprecates, so `deprecated` is the only accepted value; any other status answers 400 `validation`.
 * A version becomes `active` only through `POST .../promotion` (`PromoteVersionRequest`).
 */
export const SetVersionStatusRequestSchema = z.object({ status: z.literal('deprecated') }).strict();
export type SetVersionStatusRequest = z.infer<typeof SetVersionStatusRequestSchema>;

/**
 * Markup and formatting an owner purpose may not carry (ADR 0012, C-P4): HTML or tag brackets,
 * code backticks, Markdown emphasis, headings, list bullets, links and control characters (a line
 * break included). The purpose is shown as an `alt` and a `title`, so plain text is the only safe
 * shape. Same rule as the purpose writer's output check (AP-04).
 */
const ASSET_PURPOSE_MARKUP_PATTERN = /[<>`*_#[\]|]|^\s*[-+]\s|\p{Cc}/mu;

/**
 * `PUT .../purpose` body (ADR 0012, C-P4): the owner's purpose text. Runs of spaces and tabs become
 * one space and the ends are trimmed before the 1..280 check, so a text of blanks is refused.
 * Sets `purposeSource: owner`; no job overwrites it afterwards (AP-03).
 */
export const SetAssetPurposeRequestSchema = z
  .object({
    purpose: z
      .string()
      .max(ASSET_PURPOSE_MAX_CHARS * 4)
      .transform((text) => text.replace(/[ \t]+/g, ' ').trim())
      .pipe(
        z
          .string()
          .min(1)
          .max(ASSET_PURPOSE_MAX_CHARS)
          .refine((text) => !ASSET_PURPOSE_MARKUP_PATTERN.test(text), { message: 'purpose must be plain text without markup' }),
      ),
  })
  .strict();
export type SetAssetPurposeRequest = z.input<typeof SetAssetPurposeRequestSchema>;
