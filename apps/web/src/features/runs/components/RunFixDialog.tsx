'use client';

import { Alert, Button, Dialog } from '@studio/ui';
import { type RunFile, type WaitingCause } from '@studio/shared/run-format';
import Link from 'next/link';
import { useState, type ReactElement, type ReactNode } from 'react';
import layout from '@/features/common/layout.module.css';
import { useWebMessages } from '@/lib/i18n/client';
import { buildBrief, type NewRunErrors, type NewRunField, type NewRunFormValues } from '../new-run-model';
import { describeRunError } from '../run-error-text';
import { browserRunsApi } from '../runs-api';
import { RunBriefFields } from './RunBriefFields';

/**
 * What the owner can fix for a waiting cause: the run's brief (saved and resumed here), a catalog
 * item, a provider key (never typed in the web) or the preset's cost limit. Gates and planner
 * questions have their own answer form, so they have no fix.
 */
export type RunFix = { kind: 'brief' } | { kind: 'asset'; ref: string } | { kind: 'provider'; provider: string } | { kind: 'cost' };

export function fixOf(cause: WaitingCause): RunFix | null {
  switch (cause.kind) {
    case 'gate':
    case 'planner-questions':
      return null;
    case 'authentication':
      return { kind: 'provider', provider: cause.provider };
    case 'cost-ceiling':
      return { kind: 'cost' };
    case 'license-doubt':
    case 'biometric-asset':
      return { kind: 'asset', ref: cause.ref };
    case 'claim-without-evidence':
    case 'needs-person':
    case 'revisions-exhausted':
    case 'agent-failed':
      return { kind: 'brief' };
  }
}

/** `assetId@version` to the catalog page of the item. */
export function assetHref(ref: string): string {
  return `/catalogo/${encodeURIComponent(ref.split('@')[0] ?? ref)}`;
}

/** `recipeId@version` to the preset page. */
export function presetHref(ref: string): string {
  return `/receitas/${encodeURIComponent(ref.split('@')[0] ?? ref)}`;
}

function valuesOf(run: RunFile): NewRunFormValues {
  return {
    recipeRef: run.recipe.ref,
    topic: run.brief.topic,
    sourceUrl: run.brief.sourceUrl ?? '',
    siteCapture: run.brief.siteCapture ?? '',
    keyMessages: run.brief.keyMessages.join('\n'),
    targetDurationSec: String(run.brief.targetDurationSec),
  };
}

interface RunFixDialogProps {
  run: RunFile;
  cause: WaitingCause;
  fix: RunFix;
  open: boolean;
  onClose: () => void;
  /** Called after the api took the corrected brief and the resume request. */
  onChanged: () => void;
}

/**
 * The fix window of "Aguardando você". For a brief problem it edits the run's brief and sends it
 * with the resume request; the watcher writes it into run.json. For the other causes it says where
 * the fix is and links there.
 */
export function RunFixDialog({ run, cause, fix, open, onClose, onChanged }: RunFixDialogProps): ReactElement {
  const t = useWebMessages();
  const texts = t.runs.waiting;
  const recipe = run.recipe.definition;
  const [values, setValues] = useState<NewRunFormValues>(() => valuesOf(run));
  const [errors, setErrors] = useState<NewRunErrors>({});
  const [pending, setPending] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  function change(field: NewRunField, value: string): void {
    setErrors((current) => ({ ...current, [field]: undefined }));
    setValues((current) => ({ ...current, [field]: value }));
  }

  async function saveAndResume(): Promise<void> {
    const built = buildBrief(values, recipe, t.runs.brief.errors);
    if (built.kind === 'invalid') {
      setErrors(built.errors);
      return;
    }
    setPending(true);
    setFailure(null);
    try {
      // The form has no instructions field; the run keeps the ones it was created with.
      const instructions = run.brief.instructions;
      const brief = instructions === undefined ? built.brief : { ...built.brief, instructions };
      await browserRunsApi.requestControl(run.runId, { kind: 'resume', brief });
      onChanged();
      onClose();
    } catch (caught) {
      setFailure(describeRunError(caught, t));
    } finally {
      setPending(false);
    }
  }

  let description: string;
  let body: ReactNode;
  if (fix.kind === 'brief') {
    description = texts.fixBriefDescription;
    body = (
      <div className={layout.stack}>
        {cause.kind === 'revisions-exhausted' && cause.issues.length > 0 && (
          <Alert variant="info" title={texts.issuesTitle}>
            <ul>
              {cause.issues.map((issue, index) => (
                <li key={index}>{issue}</li>
              ))}
            </ul>
          </Alert>
        )}
        <RunBriefFields values={values} errors={errors} recipe={recipe} disabled={pending} onChange={change} />
        {failure !== null && <Alert variant="error">{failure}</Alert>}
      </div>
    );
  } else if (fix.kind === 'asset') {
    description = texts.fixAssetDescription;
    body = <Link href={assetHref(fix.ref)}>{texts.assetLink(fix.ref)}</Link>;
  } else if (fix.kind === 'provider') {
    description = texts.fixProviderDescription(fix.provider);
    body = null;
  } else {
    description = texts.fixCostDescription;
    body = <Link href={presetHref(run.recipe.ref)}>{texts.presetLink(run.recipe.ref)}</Link>;
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={texts.fixTitle}
      description={description}
      size="wide"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            {fix.kind === 'brief' ? texts.cancel : texts.close}
          </Button>
          {fix.kind === 'brief' && (
            <Button variant="primary" loading={pending} loadingLabel={texts.saving} onClick={() => void saveAndResume()}>
              {texts.saveAndResume}
            </Button>
          )}
        </>
      }
    >
      {body}
    </Dialog>
  );
}
