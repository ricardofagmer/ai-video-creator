'use client';

import { Card, FormField, Input, RadioGroup, Select, UploadDropzone, formatBytes, useI18n, type RadioOption } from '@studio/ui';
import { AssetKindSchema, type AssetKind } from '@studio/shared/catalog';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { acceptAttribute, allowsFolder, uploadHint } from '../upload-rules';
import { type WebMessages } from '@/messages';
import { fieldIds, type AssetFormValues, type ContentMode } from './asset-form-model';
import { type AssetFormTarget } from './asset-form-submit';
import { type FieldErrors } from './form-messages';
import { ImagePreview, type ImageSize } from './ImagePreview';

type FileValues = Pick<AssetFormValues, 'kind' | 'contentMode' | 'files' | 'referencePath' | 'sensitivity'>;

export interface FileSectionProps {
  target: AssetFormTarget;
  values: FileValues;
  errors: FieldErrors;
  disabled: boolean;
  onKindChange: (kind: AssetKind) => void;
  onChange: (patch: Partial<FileValues>) => void;
  /** Called with the picked image's pixel size, so the image details fill themselves. */
  onImageMeasured: (size: ImageSize) => void;
}

const PREVIEWABLE_IMAGE_TYPES: ReadonlySet<string> = new Set(['image/png', 'image/jpeg', 'image/webp']);

function isAssetKind(value: string): value is AssetKind {
  return AssetKindSchema.safeParse(value).success;
}

/**
 * Biometric material never travels as bytes (criterion 22): only reference, or the previous content.
 * Rev 4: by reference is saved through the api for a new asset and for version N+1 alike.
 */
function contentModeOptions(target: AssetFormTarget, values: FileValues, t: WebMessages['catalog']['form']['file']): RadioOption<ContentMode>[] {
  const biometric = values.sensitivity === 'biometric';
  const upload: RadioOption<ContentMode> = {
    value: 'upload',
    label: t.upload,
    disabled: biometric,
    description: biometric ? t.biometricNoUpload : undefined,
  };
  const reference: RadioOption<ContentMode> = { value: 'reference', label: t.byReference };
  if (target.type === 'new-version') {
    return [{ value: 'previous', label: t.keepPrevious(target.baseVersion) }, upload, reference];
  }
  return [upload, reference];
}

/** The one picked image worth previewing; the picker only offers PNG, JPEG and WebP for images. */
function imagePreviewFile(values: FileValues): File | null {
  if (values.kind !== 'image' || values.files.length !== 1) return null;
  const file = values.files[0];
  return file !== undefined && PREVIEWABLE_IMAGE_TYPES.has(file.type) ? file : null;
}

/** design/telas/04 card "Arquivo": kind, how the content arrives, and the content itself. */
export function FileSection({ target, values, errors, disabled, onKindChange, onChange, onImageMeasured }: FileSectionProps): ReactElement {
  const { locale } = useI18n();
  const catalogTexts = useWebMessages().catalog;
  const texts = catalogTexts.form.file;
  const kindOptions = AssetKindSchema.options.map((kind) => ({ value: kind, label: catalogTexts.kinds[kind] }));
  const totalBytes = values.files.reduce((sum, file) => sum + file.size, 0);
  const previewFile = imagePreviewFile(values);
  return (
    <fieldset className={layout.fieldset} disabled={disabled}>
      <legend className="visually-hidden">{texts.title}</legend>
      <Card title={texts.title}>
        <div className={layout.stack}>
          <FormField id={fieldIds.kind} label={texts.kind} error={errors[fieldIds.kind]}>
            {(control) =>
              target.type === 'new' ? (
                <Select
                  {...control}
                  options={kindOptions}
                  value={values.kind}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    if (isAssetKind(value)) onKindChange(value);
                  }}
                />
              ) : (
                <Input {...control} readOnly value={catalogTexts.kinds[values.kind]} />
              )
            }
          </FormField>
          <RadioGroup
            name="como-adicionar"
            legend={texts.howToAdd}
            inline
            options={contentModeOptions(target, values, texts)}
            value={values.contentMode}
            onChange={(contentMode) => onChange({ contentMode })}
          />
          {values.contentMode === 'upload' && (
            <FormField id={fieldIds.files} label={texts.file} error={errors[fieldIds.files]}>
              {(control) => (
                <UploadDropzone
                  id={control.id}
                  aria-describedby={control['aria-describedby']}
                  invalid={control.invalid}
                  disabled={disabled}
                  accept={values.kind === 'skill' ? undefined : acceptAttribute(values.kind)}
                  allowFolder={allowsFolder(values.kind)}
                  hint={uploadHint(values.kind, catalogTexts, locale)}
                  onFiles={(files) => onChange({ files })}
                >
                  {values.files.length === 0 ? undefined : (
                    <ul className={layout.selectedFiles}>
                      {values.files.length === 1 ? (
                        <li className="body-sm">
                          {values.files[0]?.name} · {formatBytes(totalBytes, locale)}
                        </li>
                      ) : (
                        <li className="body-sm">
                          {texts.filesSelected(values.files.length, formatBytes(totalBytes, locale))}
                        </li>
                      )}
                    </ul>
                  )}
                  {previewFile !== null && <ImagePreview file={previewFile} alt={previewFile.name} onMeasured={onImageMeasured} />}
                </UploadDropzone>
              )}
            </FormField>
          )}
          {values.contentMode === 'reference' && (
            // A text field only: no file picker, and the web never reads, lists, hashes or previews the path.
            <FormField
              id={fieldIds.referencePath}
              label={texts.referencePath}
              help={texts.referenceHelp}
              error={errors[fieldIds.referencePath]}
            >
              {(control) => (
                <Input
                  {...control}
                  mono
                  spellCheck={false}
                  autoComplete="off"
                  placeholder="/Users/…"
                  value={values.referencePath}
                  onChange={(event) => onChange({ referencePath: event.currentTarget.value })}
                />
              )}
            </FormField>
          )}
        </div>
      </Card>
    </fieldset>
  );
}
