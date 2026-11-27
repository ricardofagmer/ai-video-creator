'use client';

import { Alert, Button, Dialog } from '@studio/ui';
import { BRIEF_INSTRUCTIONS_MAX } from '@studio/shared/recipes';
import { type RunFile } from '@studio/shared/run-format';
import { useState, type ReactElement } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { buildBrief, type NewRunErrors, type NewRunField, type NewRunFormValues } from '../new-run-model';
import { describeRunError } from '../run-error-text';
import { browserRunsApi } from '../runs-api';
import { RunBriefFields } from './RunBriefFields';
import { briefValuesOf } from './RunFixDialog';
import { RunInstructionsField } from './RunInstructionsField';

interface RunEditDialogProps {
  run: RunFile;
  open: boolean;
  onClose: () => void;
  /** Called after the api took the edited brief and the resume request. */
  onChanged: () => void;
}

/**
 * "Editar" of a stopped run: its brief and instructions, sent with the resume request. The preset,
 * format and language stay pinned; the api keeps them from the run.
 */
export function RunEditDialog({ run, open, onClose, onChanged }: RunEditDialogProps): ReactElement {
  const t = useWebMessages();
  const texts = t.runs.manage;
  const [values, setValues] = useState<NewRunFormValues>(() => briefValuesOf(run));
  const [instructions, setInstructions] = useState(run.brief.instructions ?? '');
  const [errors, setErrors] = useState<NewRunErrors>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function change(field: NewRunField, value: string): void {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function saveAndResume(): Promise<void> {
    const built = buildBrief(values, run.recipe.definition, t.runs.brief.errors);
    if (built.kind === 'invalid') {
      setErrors(built.errors);
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      const text = instructions.trim().slice(0, BRIEF_INSTRUCTIONS_MAX);
      const brief = text === '' ? built.brief : { ...built.brief, instructions: text };
      await browserRunsApi.requestControl(run.runId, { kind: 'resume', brief });
      onChanged();
      onClose();
    } catch (caught) {
      setFailure(describeRunError(caught, t));
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={texts.editTitle}
      description={texts.editDescription}
      size="wide"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {texts.cancel}
          </Button>
          <Button variant="primary" loading={pending} loadingLabel={texts.saving} onClick={() => void saveAndResume()}>
            {texts.saveAndResume}
          </Button>
        </>
      }
    >
      <div className={layout.stack}>
        <RunBriefFields values={values} errors={errors} recipe={run.recipe.definition} disabled={pending} onChange={change} />
        <RunInstructionsField id={`editar-instrucoes-${run.runId}`} value={instructions} onChange={setInstructions} disabled={pending} />
        {failure !== null && <Alert variant="error">{failure}</Alert>}
      </div>
    </Dialog>
  );
}
