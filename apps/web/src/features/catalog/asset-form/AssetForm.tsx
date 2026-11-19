'use client';

import { Alert, Button, buttonClassName } from '@studio/ui';
import { type AssetVersionView } from '@studio/shared/api';
import { type AssetKind, type Sensitivity } from '@studio/shared/catalog';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type FormEvent, type ReactElement, useEffect, useRef, useState } from 'react';
import layout from '@/features/common/layout.module.css';
import { assetFormFrom, assetIdFromName, buildAssetMetadata, emptyAssetForm, fieldIds, type AssetFormValues } from './asset-form-model';
import { fileError, saveAsset, type AssetFormTarget } from './asset-form-submit';
import { FileSection } from './FileSection';
import { type FieldErrors } from './form-messages';
import { IdentitySection } from './IdentitySection';
import { defaultDetailFields } from './kind-details-model';
import { KindDetailsSection } from './KindDetailsSection';
import { LicenseSection } from './LicenseSection';

export interface AssetFormProps {
  target: AssetFormTarget;
  /** Version N whose metadata the new version starts from (design/telas/03 "Nova versão"). */
  base: AssetVersionView | null;
  /** Number the saved version will get (N+1 of the newest version). */
  nextVersion: number;
  cancelHref: string;
}

/** Content modes that never send biometric bytes (criterion 22). */
function safeContentMode(target: AssetFormTarget, sensitivity: Sensitivity, current: AssetFormValues['contentMode']): AssetFormValues['contentMode'] {
  if (sensitivity !== 'biometric' || current !== 'upload') return current;
  return target.type === 'new' ? 'reference' : 'previous';
}

/** The first invalid control in document order; file inputs are hidden, so their picker button takes focus. */
function focusFirstInvalid(form: HTMLFormElement | null, fallback: HTMLElement | null): void {
  const invalid = form?.querySelector<HTMLElement>(
    `[aria-invalid="true"], #${fieldIds.licenseUses}[aria-describedby], [id="variaveis"][aria-describedby]`,
  );
  if (invalid instanceof HTMLInputElement && invalid.type === 'file') {
    invalid.closest('[role="group"]')?.querySelector<HTMLButtonElement>('button')?.focus();
    return;
  }
  (invalid ?? fallback)?.focus();
}

/**
 * design/telas/04: upload, register by reference, or version N+1 of an asset. Every mode saves
 * through the api; by reference posts the metadata and the typed path (SPEC 0002 rev 4, R1-27).
 */
export function AssetForm({ target, base, nextVersion, cancelHref }: AssetFormProps): ReactElement {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const formErrorRef = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<AssetFormValues>(() => (base === null ? emptyAssetForm() : assetFormFrom(base)));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitCount, setSubmitCount] = useState(0);
  const [dirty, setDirty] = useState(false);
  const sensitivityLocked = base?.sensitivity === 'biometric';

  useEffect(() => {
    if (!dirty) return undefined;
    const confirmLeave = (event: BeforeUnloadEvent): void => event.preventDefault();
    window.addEventListener('beforeunload', confirmLeave);
    return () => window.removeEventListener('beforeunload', confirmLeave);
  }, [dirty]);

  useEffect(() => {
    if (submitCount > 0) focusFirstInvalid(formRef.current, formErrorRef.current);
  }, [submitCount]);

  function update(patch: Partial<AssetFormValues>): void {
    setDirty(true);
    setValues((current) => {
      const next = { ...current, ...patch };
      return { ...next, contentMode: safeContentMode(target, next.sensitivity, next.contentMode) };
    });
  }

  function changeKind(kind: AssetKind): void {
    update({ kind, layout: kind === 'skill' ? 'folder' : 'file', files: [], details: defaultDetailFields(kind), variables: [] });
  }

  function changeName(name: string): void {
    update(target.type === 'new' && !values.assetIdEdited ? { name, assetId: assetIdFromName(name) } : { name });
  }

  function fail(fieldErrors: FieldErrors, message: string | null): void {
    setErrors(fieldErrors);
    setFormError(message);
    setSubmitCount((count) => count + 1);
  }

  async function submit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (submitting) return;
    const built = buildAssetMetadata(values);
    const selectionError = values.contentMode === 'upload' ? fileError(values) : null;
    const fieldErrors: FieldErrors = {
      ...(built.ok ? {} : built.errors),
      ...(selectionError === null ? {} : { [fieldIds.files]: selectionError }),
    };
    if (!built.ok || selectionError !== null) {
      fail(fieldErrors, null);
      return;
    }
    setSubmitting(true);
    setErrors({});
    setFormError(null);
    const outcome = await saveAsset(target, values, built.metadata);
    if (!outcome.ok) {
      setSubmitting(false);
      fail(outcome.fieldErrors, outcome.formError);
      return;
    }
    setDirty(false);
    router.push(`/catalogo/${outcome.saved.id}?versao=${outcome.saved.version}&aviso=salvo`);
  }

  const submitLabel = target.type === 'new' ? 'Salvar rascunho' : `Salvar versão ${nextVersion}`;

  return (
    <form ref={formRef} className={layout.form} noValidate aria-busy={submitting} onSubmit={(event) => void submit(event)}>
      {formError !== null && (
        <div ref={formErrorRef} tabIndex={-1}>
          <Alert variant="error">{formError}</Alert>
        </div>
      )}
      <FileSection
        target={target}
        values={values}
        errors={errors}
        disabled={submitting}
        onKindChange={changeKind}
        onChange={update}
      />
      <IdentitySection
        target={target}
        values={values}
        sensitivityLocked={sensitivityLocked}
        errors={errors}
        disabled={submitting}
        onNameChange={changeName}
        onChange={(patch) => update(patch.assetId === undefined ? patch : { ...patch, assetIdEdited: true })}
      />
      <LicenseSection values={values} errors={errors} disabled={submitting} onChange={update} />
      <KindDetailsSection
        kind={values.kind}
        fields={values.details}
        variables={values.variables}
        errors={errors}
        disabled={submitting}
        onFieldChange={(key, value) => update({ details: { ...values.details, [key]: value } })}
        onVariablesChange={(variables) => update({ variables })}
      />
      <div className={layout.formFooter}>
        <Link href={cancelHref} className={buttonClassName({ variant: 'secondary' })}>
          Cancelar
        </Link>
        <Button type="submit" loading={submitting} loadingLabel="Salvando…">
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
