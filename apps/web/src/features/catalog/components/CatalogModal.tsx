'use client';

import { Button, Dialog, Icon } from '@studio/ui';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useRef, useState, type ReactElement, type ReactNode } from 'react';
import { ModalFormBridgeContext, type ModalFormBridge } from '@/features/common/modal-form-bridge';
import { skillsReturnTarget } from '@/features/skills/skills-return';
import { useWebMessages } from '@/lib/i18n/client';
import { catalogReturnTarget } from '../catalog-return';

/** The list a modal sits over and returns to. */
export type ModalReturnScope = 'catalog' | 'skills';

interface CatalogModalProps {
  title: string;
  closeLabel: string;
  backLabel: string;
  /** The list behind the modal; defaults to the catalog. */
  returnTo?: ModalReturnScope;
  children: ReactNode;
}

function returnTargetOf(scope: ModalReturnScope): string {
  return scope === 'skills' ? skillsReturnTarget() : catalogReturnTarget();
}

/**
 * Asset details and the asset and skill forms opened from a list: the list stays mounted behind the
 * dialog, and every way out (close button, footer, Escape, backdrop) returns to it with its filters.
 * A form with unsaved changes asks before it is discarded; a save closes and refreshes the list.
 */
export function CatalogModal({ title, closeLabel, backLabel, returnTo = 'catalog', children }: CatalogModalProps): ReactElement {
  const router = useRouter();
  const texts = useWebMessages().catalog.asset;
  const dirtyRef = useRef(false);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const leave = useCallback(
    (refresh: boolean): void => {
      dirtyRef.current = false;
      router.push(returnTargetOf(returnTo), { scroll: false });
      if (refresh) router.refresh();
    },
    [router, returnTo],
  );

  const requestClose = useCallback((): void => {
    if (dirtyRef.current) setConfirmingDiscard(true);
    else leave(false);
  }, [leave]);

  const bridge = useMemo<ModalFormBridge>(
    () => ({
      setDirty: (dirty) => {
        dirtyRef.current = dirty;
      },
      close: (options) => (options?.saved === true ? leave(true) : requestClose()),
    }),
    [leave, requestClose],
  );

  return (
    <ModalFormBridgeContext.Provider value={bridge}>
      <Dialog
        open
        onClose={requestClose}
        size="wide"
        title={title}
        headerAction={
          <Button variant="ghost" size="sm" onClick={requestClose} aria-label={closeLabel} title={closeLabel}>
            <Icon name="close" />
          </Button>
        }
        footer={
          <Button variant="secondary" onClick={requestClose}>
            {backLabel}
          </Button>
        }
      >
        {children}
      </Dialog>
      <Dialog
        open={confirmingDiscard}
        role="alertdialog"
        onClose={() => setConfirmingDiscard(false)}
        title={texts.discardTitle}
        description={texts.discardDescription}
        footer={
          <>
            <Button variant="secondary" onClick={() => setConfirmingDiscard(false)}>
              {texts.keepEditing}
            </Button>
            <Button variant="danger" onClick={() => leave(false)}>
              {texts.discardChanges}
            </Button>
          </>
        }
      />
    </ModalFormBridgeContext.Provider>
  );
}
