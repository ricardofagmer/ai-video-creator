'use client';

import { Button, Dialog, Icon } from '@studio/ui';
import { useState, type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { WizardReferenceLibrary } from './WizardReferenceLibrary';

interface WizardNewReferenceDialogProps {
  /** The `assetId@version` refs already on the video. */
  selected: readonly string[];
  onChange: (refs: string[]) => void;
}

/**
 * "Add a reference in the catalog" without leaving the wizard: the catalog's References screen in a
 * dialog over the step, so the answers typed so far stay on screen. Owner rule 2026-11-25: this
 * button never navigates.
 */
export function WizardNewReferenceDialog({ selected, onChange }: WizardNewReferenceDialogProps): ReactElement {
  const t = useWebMessages();
  const closeLabel = t.catalog.asset.closeModal;
  const [open, setOpen] = useState(false);
  const close = (): void => setOpen(false);

  return (
    <>
      <Button type="button" variant="secondary" size="sm" onClick={() => setOpen(true)}>
        {t.wizard.references.addNew}
      </Button>
      {open && (
        <Dialog
          open
          onClose={close}
          size="wide"
          title={t.wizard.references.addNew}
          headerAction={
            <Button variant="ghost" size="sm" onClick={close} aria-label={closeLabel} title={closeLabel}>
              <Icon name="close" />
            </Button>
          }
          footer={
            <Button variant="secondary" onClick={close}>
              {closeLabel}
            </Button>
          }
        >
          <WizardReferenceLibrary selected={selected} onChange={onChange} />
        </Dialog>
      )}
    </>
  );
}
