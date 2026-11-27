'use client';

import { Alert, FormField, Select, Textarea } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { BRIEF_INSTRUCTIONS_MAX } from '@studio/shared/recipes';
import { useEffect, useState, type ReactElement } from 'react';
import { browserStudioClient } from '@/lib/api';
import { useWebMessages } from '@/lib/i18n/client';

type PromptList = { status: 'loading' } | { status: 'ready'; prompts: readonly AssetVersionView[] } | { status: 'failed' };

type PickNotice =
  | { status: 'none' }
  | { status: 'loading' }
  | { status: 'loaded'; name: string; truncated: boolean }
  | { status: 'failed' };

interface RunInstructionsFieldProps {
  /** Unique per page: the text box id; the saved-prompt picker uses `<id>-prompt`. */
  id: string;
  value: string;
  onChange: (text: string) => void;
  disabled?: boolean;
}

/** The newest version of each saved prompt, so the picker shows one row per prompt. */
function newestPerPrompt(versions: readonly AssetVersionView[]): AssetVersionView[] {
  const newest = new Map<string, AssetVersionView>();
  for (const version of versions) {
    const current = newest.get(version.id);
    if (current === undefined || version.version > current.version) newest.set(version.id, version);
  }
  return [...newest.values()].sort((left, right) => left.name.localeCompare(right.name));
}

/**
 * docs/specs/2026-11-23-images-prompts-and-run-instructions-design.md: the owner's own instructions for
 * the AI (planner, writer, director), typed or loaded from a prompt saved in the catalog. Loading a
 * prompt replaces the box's text, cut to the brief's limit.
 */
export function RunInstructionsField({ id, value, onChange, disabled = false }: RunInstructionsFieldProps): ReactElement {
  const t = useWebMessages();
  const texts = t.runs.instructions;
  const [list, setList] = useState<PromptList>({ status: 'loading' });
  const [picked, setPicked] = useState('');
  const [notice, setNotice] = useState<PickNotice>({ status: 'none' });

  useEffect(() => {
    let cancelled = false;
    browserStudioClient
      .searchAssets({ kinds: ['prompt'], sensitivity: 'exclude-biometric', limit: 100 })
      .then((page) => {
        if (!cancelled) setList({ status: 'ready', prompts: newestPerPrompt(page.items) });
      })
      .catch(() => {
        if (!cancelled) setList({ status: 'failed' });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function loadPrompt(assetId: string): Promise<void> {
    setPicked(assetId);
    if (list.status !== 'ready') return;
    const prompt = list.prompts.find((version) => version.id === assetId);
    if (prompt === undefined) return;
    setNotice({ status: 'loading' });
    try {
      const file = await browserStudioClient.readEntryFile(prompt.id, prompt.version);
      const text = file.text.trim();
      onChange(text.slice(0, BRIEF_INSTRUCTIONS_MAX));
      setNotice({ status: 'loaded', name: prompt.name, truncated: text.length > BRIEF_INSTRUCTIONS_MAX });
    } catch {
      setNotice({ status: 'failed' });
    }
  }

  const promptOptions = list.status === 'ready' ? list.prompts.map((prompt) => ({ value: prompt.id, label: prompt.name })) : [];
  const pickerPlaceholder =
    list.status === 'loading' ? texts.loadingPrompts : list.status === 'ready' && promptOptions.length === 0 ? texts.noPrompts : texts.choosePrompt;
  const pickerDisabled = disabled || list.status !== 'ready' || promptOptions.length === 0 || notice.status === 'loading';

  return (
    <>
      <FormField id={`${id}-prompt`} label={texts.savedPrompt} disabled={pickerDisabled}>
        {(control) => (
          <Select
            {...control}
            options={promptOptions}
            placeholder={pickerPlaceholder}
            value={picked}
            onChange={(event) => void loadPrompt(event.currentTarget.value)}
          />
        )}
      </FormField>
      {list.status === 'failed' && <Alert variant="warning">{texts.promptFailed}</Alert>}
      {notice.status === 'loading' && <p className="caption" role="status">{texts.loadingPrompt}</p>}
      {notice.status === 'loaded' && (
        <p className="caption" role="status">
          {notice.truncated ? texts.promptTruncated(notice.name, BRIEF_INSTRUCTIONS_MAX) : texts.promptLoaded(notice.name)}
        </p>
      )}
      {notice.status === 'failed' && <Alert variant="warning">{texts.promptFailed}</Alert>}
      <FormField
        id={id}
        label={texts.label}
        help={`${texts.help(BRIEF_INSTRUCTIONS_MAX)} ${texts.remaining(BRIEF_INSTRUCTIONS_MAX - value.length)}`}
        disabled={disabled}
      >
        {(control) => (
          <Textarea {...control} rows={5} value={value} maxLength={BRIEF_INSTRUCTIONS_MAX} onChange={(event) => onChange(event.target.value)} />
        )}
      </FormField>
    </>
  );
}
