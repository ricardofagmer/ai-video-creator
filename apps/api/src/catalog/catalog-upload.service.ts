import { Injectable } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import {
  CreateAssetCommand,
  MAX_STORED_BYTES_BY_KIND,
  SaveAssetVersionCommand,
  type NewAssetContentInput,
} from '@studio/core/catalog';
import { MAX_FOLDER_FILES } from '@studio/core/asset-store';
import {
  CreateAssetUploadFieldsSchema,
  SaveAssetVersionUploadFieldsSchema,
  uploadPartNames,
  type CreateAssetUploadFields,
  type SaveAssetVersionUploadFields,
} from '@studio/shared/api';
import { type AssetLayout, type AssetVersion } from '@studio/shared/catalog';
import { type Request } from 'express';
import { type z } from 'zod';
import { RequestValidationError, UploadRejectedError } from '../platform/api.errors';
import { FolderStaging } from './folder-staging';
import { multipartParts, type MultipartLimits, type MultipartPart } from './multipart-parts';

/** The largest per-kind store cap (R1-05); each kind's own cap is enforced by the catalog. */
const MAX_UPLOAD_BYTES = Math.max(...Object.values(MAX_STORED_BYTES_BY_KIND));
/** Multipart framing of up to MAX_FOLDER_FILES parts stays well under this. */
const MULTIPART_OVERHEAD_BYTES = 16 * 1024 * 1024;
const MAX_FIELDS_BYTES = 256 * 1024;

const uploadLimits: MultipartLimits = {
  maxFiles: MAX_FOLDER_FILES,
  maxFileBytes: MAX_UPLOAD_BYTES,
  maxFieldBytes: MAX_FIELDS_BYTES,
};

type SaveVersion<Fields> = (fields: Fields, content: NewAssetContentInput) => Promise<AssetVersion>;

/** Refuses a declared body larger than any upload can be before a byte is parsed. */
function assertDeclaredSize(request: Request): void {
  const declared = request.headers['content-length'];
  if (declared === undefined) return;
  const bytes = Number.parseInt(declared, 10);
  if (Number.isSafeInteger(bytes) && bytes > MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD_BYTES) throw new UploadRejectedError('file-too-large');
}

function parseFields<Fields>(part: MultipartPart, schema: z.ZodType<Fields, unknown>): Fields {
  if (part.kind !== 'field' || part.name !== uploadPartNames.fields) {
    if (part.kind === 'file') part.stream.resume();
    throw new UploadRejectedError('missing-fields');
  }
  let raw: unknown;
  try {
    raw = JSON.parse(part.value);
  } catch {
    throw new UploadRejectedError('invalid-fields');
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new RequestValidationError(
      parsed.error.issues.slice(0, 50).map((issue) => ({ path: ['fields', ...issue.path].join('.').slice(0, 200), code: issue.code })),
    );
  }
  return parsed.data;
}

/**
 * Web upload (PRD 5.3) for every asset kind: a single file streams straight into the catalog's
 * `upload` source; a folder is staged privately and imported through the catalog's folder import.
 * All boundary rules of R1-05 (MIME allowlist per kind, layout per kind, size cap per kind,
 * biometric by reference only, no traversal) are applied by the catalog commands themselves.
 */
@Injectable()
export class CatalogUploadService {
  constructor(private readonly commandBus: CommandBus) {}

  createAsset(request: Request, signal: AbortSignal): Promise<AssetVersion> {
    return this.receive<CreateAssetUploadFields>(request, CreateAssetUploadFieldsSchema, (fields, content) =>
      this.commandBus.execute(
        new CreateAssetCommand({ assetId: fields.assetId, kind: fields.kind, metadata: fields.metadata, content, signal }),
      ),
    );
  }

  saveVersion(assetId: string, request: Request, signal: AbortSignal): Promise<AssetVersion> {
    return this.receive<SaveAssetVersionUploadFields>(request, SaveAssetVersionUploadFieldsSchema, (fields, content) =>
      this.commandBus.execute(new SaveAssetVersionCommand({ assetId, metadata: fields.metadata, content, signal })),
    );
  }

  private async receive<Fields extends { layout: AssetLayout }>(
    request: Request,
    schema: z.ZodType<Fields, unknown>,
    save: SaveVersion<Fields>,
  ): Promise<AssetVersion> {
    assertDeclaredSize(request);
    const upload: { fields: Fields | null; staging: FolderStaging | null; saved: AssetVersion | null } = {
      fields: null,
      staging: null,
      saved: null,
    };
    try {
      for await (const part of multipartParts(request, uploadLimits)) {
        if (upload.fields === null) {
          upload.fields = parseFields(part, schema);
          if (upload.fields.layout === 'folder') upload.staging = await FolderStaging.create(MAX_UPLOAD_BYTES);
          continue;
        }
        if (part.kind !== 'file') throw new UploadRejectedError('unexpected-part');
        if (upload.staging !== null && part.name === uploadPartNames.folderFiles) {
          await upload.staging.add(part.filename, part.stream);
          continue;
        }
        if (upload.staging === null && part.name === uploadPartNames.file && upload.saved === null) {
          upload.saved = await save(upload.fields, { source: 'upload', stream: part.stream, mimeType: part.mimeType });
          continue;
        }
        part.stream.resume();
        throw new UploadRejectedError('unexpected-part');
      }
      if (upload.fields === null) throw new UploadRejectedError('missing-fields');
      if (upload.saved !== null) return upload.saved;
      if (upload.staging === null || upload.staging.isEmpty()) throw new UploadRejectedError('missing-file');
      return await save(upload.fields, { source: 'import-folder', absolutePath: upload.staging.importRoot() });
    } finally {
      await upload.staging?.dispose();
    }
  }
}
