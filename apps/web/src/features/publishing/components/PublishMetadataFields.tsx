'use client';

import { Button, Checkbox, FormField, Input, RadioGroup, Textarea } from '@studio/ui';
import { type Platform } from '@studio/shared/metrics';
import { publishBounds, type Visibility } from '@studio/shared/platforms';
import { useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { platformUsesTags, type PublishDraft, type PublishDraftErrors } from '../publish-form-model';
import { AI_DISCLOSURE_LABEL, visibilityDescription, visibilityLabels } from '../publish-labels';
import styles from '../publishing.module.css';

interface PublishMetadataFieldsProps {
  platform: Platform;
  draft: PublishDraft;
  errors: PublishDraftErrors;
  allowedVisibilities: readonly Visibility[];
  disabled: boolean;
  onChange: (draft: PublishDraft) => void;
}

/** The id of a field of one tab, so labels, errors and focus stay per platform. */
export function publishFieldId(platform: Platform, field: keyof PublishDraftErrors): string {
  return `publicar-${platform}-${field}`;
}

type CopyState = 'idle' | 'copied' | 'failed';

/**
 * Title, caption, tags, visibility and "Conteúdo alterado ou sintético" of one tab (SPEC 0007
 * section 5.4). YouTube uses the caption as the description and sends the tags; TikTok receives
 * the video only, so its caption has a copy button for the app. No visibility is preselected (B7).
 */
export function PublishMetadataFields({ platform, draft, errors, allowedVisibilities, disabled, onChange }: PublishMetadataFieldsProps): ReactElement {
  const [copy, setCopy] = useState<CopyState>('idle');
  const usesTags = platformUsesTags(platform);

  async function copyCaption(): Promise<void> {
    try {
      await navigator.clipboard.writeText(draft.caption);
      setCopy('copied');
    } catch {
      setCopy('failed');
    }
  }

  return (
    <div className={layout.stack}>
      <FormField id={publishFieldId(platform, 'title')} label="Título" error={errors.title} disabled={disabled}>
        {({ invalid, ...control }) => (
          <Input
            {...control}
            invalid={invalid}
            maxLength={publishBounds.titleChars}
            value={draft.title}
            onChange={(event) => onChange({ ...draft, title: event.currentTarget.value })}
          />
        )}
      </FormField>
      <FormField
        id={publishFieldId(platform, 'caption')}
        label={usesTags ? 'Descrição' : 'Legenda'}
        optional
        help={usesTags ? undefined : 'O TikTok recebe só o vídeo, como rascunho. Copie a legenda e cole no aplicativo.'}
        error={errors.caption}
        disabled={disabled}
      >
        {({ invalid, ...control }) => (
          <Textarea
            {...control}
            invalid={invalid}
            rows={4}
            maxLength={publishBounds.captionChars}
            value={draft.caption}
            onChange={(event) => {
              setCopy('idle');
              onChange({ ...draft, caption: event.currentTarget.value });
            }}
          />
        )}
      </FormField>
      {!usesTags && (
        <div className={styles.actions}>
          <Button variant="secondary" size="sm" disabled={draft.caption === ''} onClick={() => void copyCaption()}>
            Copiar legenda
          </Button>
          <span className="caption" role="status">
            {copy === 'copied' ? 'Legenda copiada.' : copy === 'failed' ? 'Não foi possível copiar; selecione o texto e copie.' : ''}
          </span>
        </div>
      )}
      {usesTags && (
        <FormField
          id={publishFieldId(platform, 'tags')}
          label="Tags"
          optional
          help={`Separe por vírgulas. Até ${publishBounds.maxTags} tags, só letras, números e _.`}
          error={errors.tags}
          disabled={disabled}
        >
          {({ invalid, ...control }) => (
            <Input {...control} invalid={invalid} autoComplete="off" value={draft.tagsText} onChange={(event) => onChange({ ...draft, tagsText: event.currentTarget.value })} />
          )}
        </FormField>
      )}
      <div id={publishFieldId(platform, 'visibility')} tabIndex={-1}>
        <RadioGroup
          name={publishFieldId(platform, 'visibility')}
          legend="Visibilidade"
          options={allowedVisibilities.map((visibility) => ({
            value: visibility,
            label: visibilityLabels[visibility],
            description: visibilityDescription(platform, visibility),
          }))}
          value={draft.visibility}
          onChange={(visibility) => onChange({ ...draft, visibility })}
          error={errors.visibility}
          disabled={disabled}
        />
      </div>
      <Checkbox
        id={`publicar-${platform}-ai`}
        label={AI_DISCLOSURE_LABEL}
        description="Marque quando o vídeo tem voz, rosto ou cena gerados ou alterados por IA."
        checked={draft.aiDisclosure}
        disabled={disabled}
        onChange={(event) => onChange({ ...draft, aiDisclosure: event.currentTarget.checked })}
      />
    </div>
  );
}
