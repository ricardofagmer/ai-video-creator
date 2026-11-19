import {
  CreateAssetUploadFieldsSchema,
  SaveAssetVersionUploadFieldsSchema,
  uploadPartNames,
  type CreateAssetUploadFields,
  type SaveAssetVersionUploadFields,
} from '@studio/shared/api';
import { checkedBody } from './request';

/** One file of a folder upload with its folder-relative path (C10: `[A-Za-z0-9._-]` segments). */
export interface FolderUploadFile {
  file: File;
  relativePath: string;
}

/** The bytes of a new version: one file, or the files of one folder (C10 `uploadPartNames`). */
export type UploadContent = { layout: 'file'; file: File } | { layout: 'folder'; files: readonly FolderUploadFile[] };

export interface CreateAssetUpload {
  fields: Omit<CreateAssetUploadFields, 'layout'>;
  content: UploadContent;
}

export interface SaveAssetVersionUpload {
  fields: Omit<SaveAssetVersionUploadFields, 'layout'>;
  content: UploadContent;
}

/**
 * C10 multipart order: the `fields` JSON part first, then the file part(s). The layout of the
 * fields always follows the content, so the two cannot disagree.
 */
function multipartOf(fields: unknown, content: UploadContent): FormData {
  const form = new FormData();
  form.append(uploadPartNames.fields, JSON.stringify(fields));
  if (content.layout === 'file') {
    form.append(uploadPartNames.file, content.file, content.file.name);
  } else {
    for (const entry of content.files) form.append(uploadPartNames.folderFiles, entry.file, entry.relativePath);
  }
  return form;
}

export function createAssetMultipart(upload: CreateAssetUpload): FormData {
  const fields = checkedBody(CreateAssetUploadFieldsSchema, { ...upload.fields, layout: upload.content.layout });
  return multipartOf(fields, upload.content);
}

export function saveAssetVersionMultipart(upload: SaveAssetVersionUpload): FormData {
  const fields = checkedBody(SaveAssetVersionUploadFieldsSchema, { ...upload.fields, layout: upload.content.layout });
  return multipartOf(fields, upload.content);
}
