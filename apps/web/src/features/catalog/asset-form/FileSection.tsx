'use client';

import { Card, FormField, Input, RadioGroup, Select, UploadDropzone, formatBytes, type RadioOption } from '@studio/ui';
import { AssetKindSchema, type AssetKind } from '@studio/shared/catalog';
import { type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { assetKindLabels } from '../catalog-labels';
import { acceptAttribute, allowsFolder, uploadHint } from '../upload-rules';
import { fieldIds, type AssetFormValues, type ContentMode } from './asset-form-model';
import { type AssetFormTarget } from './asset-form-submit';
import { type FieldErrors } from './form-messages';

type FileValues = Pick<AssetFormValues, 'kind' | 'contentMode' | 'files' | 'referencePath' | 'sensitivity'>;

export interface FileSectionProps {
  target: AssetFormTarget;
  values: FileValues;
  errors: FieldErrors;
  disabled: boolean;
  onKindChange: (kind: AssetKind) => void;
  onChange: (patch: Partial<FileValues>) => void;
}

const kindOptions = AssetKindSchema.options.map((kind) => ({ value: kind, label: assetKindLabels[kind] }));

function isAssetKind(value: string): value is AssetKind {
  return AssetKindSchema.safeParse(value).success;
}

/**
 * Biometric material never travels as bytes (criterion 22): only reference, or the previous content.
 * Rev 4: by reference is saved through the api for a new asset and for version N+1 alike.
 */
function contentModeOptions(target: AssetFormTarget, values: FileValues): RadioOption<ContentMode>[] {
  const biometric = values.sensitivity === 'biometric';
  const upload: RadioOption<ContentMode> = {
    value: 'upload',
    label: 'Enviar arquivo',
    disabled: biometric,
    description: biometric ? 'Material biométrico não é enviado pelo navegador.' : undefined,
  };
  const reference: RadioOption<ContentMode> = { value: 'reference', label: 'Registrar por referência' };
  if (target.type === 'new-version') {
    return [{ value: 'previous', label: `Manter o conteúdo da versão ${target.baseVersion}` }, upload, reference];
  }
  return [upload, reference];
}

/** design/telas/04 card "Arquivo": kind, how the content arrives, and the content itself. */
export function FileSection({ target, values, errors, disabled, onKindChange, onChange }: FileSectionProps): ReactElement {
  const totalBytes = values.files.reduce((sum, file) => sum + file.size, 0);
  return (
    <fieldset className={layout.fieldset} disabled={disabled}>
      <legend className="visually-hidden">Arquivo</legend>
      <Card title="Arquivo">
        <div className={layout.stack}>
          <FormField id={fieldIds.kind} label="Tipo de ativo" error={errors[fieldIds.kind]}>
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
                <Input {...control} readOnly value={assetKindLabels[values.kind]} />
              )
            }
          </FormField>
          <RadioGroup
            name="como-adicionar"
            legend="Como adicionar"
            inline
            options={contentModeOptions(target, values)}
            value={values.contentMode}
            onChange={(contentMode) => onChange({ contentMode })}
          />
          {values.contentMode === 'upload' && (
            <FormField id={fieldIds.files} label="Arquivo" error={errors[fieldIds.files]}>
              {(control) => (
                <UploadDropzone
                  id={control.id}
                  aria-describedby={control['aria-describedby']}
                  invalid={control.invalid}
                  disabled={disabled}
                  accept={values.kind === 'skill' ? undefined : acceptAttribute(values.kind)}
                  allowFolder={allowsFolder(values.kind)}
                  hint={uploadHint(values.kind)}
                  onFiles={(files) => onChange({ files })}
                >
                  {values.files.length === 0 ? undefined : (
                    <ul className={layout.selectedFiles}>
                      {values.files.length === 1 ? (
                        <li className="body-sm">
                          {values.files[0]?.name} · {formatBytes(totalBytes)}
                        </li>
                      ) : (
                        <li className="body-sm">
                          {values.files.length} arquivos · {formatBytes(totalBytes)}
                        </li>
                      )}
                    </ul>
                  )}
                </UploadDropzone>
              )}
            </FormField>
          )}
          {values.contentMode === 'reference' && (
            // A text field only: no file picker, and the web never reads, lists, hashes or previews the path.
            <FormField
              id={fieldIds.referencePath}
              label="Caminho no Mac"
              help="O arquivo não é copiado. O catálogo guarda o caminho e o hash. Use um arquivo ou pasta da sua pasta pessoal ou de /Volumes."
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
