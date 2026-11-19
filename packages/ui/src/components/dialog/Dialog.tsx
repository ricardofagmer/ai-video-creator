'use client';

import { useEffect, useId, useRef, type MouseEvent, type ReactElement, type ReactNode, type SyntheticEvent } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Dialog.module.css';

export interface DialogProps {
  open: boolean;
  /** Called on Escape, on a backdrop click (plain dialogs only) and by the footer buttons the screen wires. */
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Action buttons, right-aligned; the confirming action comes last. */
  footer: ReactNode;
  /** `alertdialog` for destructive confirmations (stop a run, reject a video): no backdrop dismissal. */
  role?: 'dialog' | 'alertdialog';
  className?: string;
}

/**
 * Modal dialog on the native `<dialog>` element: `showModal()` gives the focus trap,
 * the inert background and Escape handling; focus returns to the element that opened it.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  role = 'dialog',
  className,
}: DialogProps): ReactElement {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();

  // Syncs the `open` prop with the imperative showModal()/close() API of <dialog>.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      const active = document.activeElement;
      returnFocusRef.current = active instanceof HTMLElement ? active : null;
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
      returnFocusRef.current?.focus();
    }
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>): void {
    // The parent owns `open`; Escape asks it to close instead of closing behind its back.
    event.preventDefault();
    onClose();
  }

  function handleBackdropClick(event: MouseEvent<HTMLDialogElement>): void {
    if (role === 'dialog' && event.target === event.currentTarget) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      role={role === 'alertdialog' ? 'alertdialog' : undefined}
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
      className={classNames(styles.dialog, className)}
    >
      <div className={styles.panel}>
        <h2 id={titleId} className="heading-2">
          {title}
        </h2>
        {description && (
          <div id={descriptionId} className={classNames('body-sm', styles.description)}>
            {description}
          </div>
        )}
        {children && <div className={styles.body}>{children}</div>}
        <div className={styles.footer}>{footer}</div>
      </div>
    </dialog>
  );
}
