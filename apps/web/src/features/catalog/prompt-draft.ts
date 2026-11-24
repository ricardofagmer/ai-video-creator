import { type AssetMetadataInput } from '@studio/shared/api';
import { assetIdFromName } from './asset-form/asset-form-model';

export const PROMPT_NAME_MAX = 120;
export const PROMPT_OWNER_MAX = 100;
export const PROMPT_TEXT_MAX = 20_000;

export interface PromptInput {
  name: string;
  owner: string;
  text: string;
}

export interface PromptDraft {
  assetId: string;
  kind: 'prompt';
  metadata: AssetMetadataInput;
  file: File;
}

/**
 * docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md: a named prompt text saved as a
 * `draft` prompt version whose only file is the text as Markdown, with no variables.
 */
export function promptDraftOf(input: PromptInput): PromptDraft {
  const stem = assetIdFromName(input.name);
  const assetId = stem === '' ? 'prompt' : stem;
  return {
    assetId,
    kind: 'prompt',
    metadata: {
      name: input.name.trim().slice(0, PROMPT_NAME_MAX),
      owner: input.owner.trim().slice(0, PROMPT_OWNER_MAX),
      provenance: { source: { type: 'created-here' }, author: input.owner.trim().slice(0, PROMPT_OWNER_MAX), capturedAt: null },
      sensitivity: 'normal',
      details: { variables: [] },
    },
    file: new File([input.text.slice(0, PROMPT_TEXT_MAX)], `${assetId}.md`, { type: 'text/markdown' }),
  };
}
