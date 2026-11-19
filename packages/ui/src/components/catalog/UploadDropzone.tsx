'use client';

import { useEffect, useRef, useState, type ChangeEvent, type DragEvent, type ReactElement, type ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import { Button } from '../button/Button';
import styles from './UploadDropzone.module.css';

export interface UploadDropzoneProps {
  /** Id of the file input, so a FormField label opens the picker. */
  id: string;
  /** Called with the dropped or picked files; MIME and size validation stays in the web (PRD 5.3). */
  onFiles: (files: File[]) => void;
  /** Allowlisted MIME types or extensions of the asset kind, for example "video/mp4,video/quicktime". */
  accept?: string;
  multiple?: boolean;
  /** Shows "Escolher pasta" (folder upload, PRD 5.3 web upload). */
  allowFolder?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  /** Accepted types and size limit, in pt-BR (for example "MP4 ou MOV, até 2 GB"). */
  hint?: string;
  'aria-describedby'?: string;
  /** Selected files, rendered under the drop area inside a polite live region. */
  children?: ReactNode;
  className?: string;
}

export function UploadDropzone({
  id,
  onFiles,
  accept,
  multiple = false,
  allowFolder = false,
  disabled = false,
  invalid = false,
  hint,
  'aria-describedby': describedBy,
  children,
  className,
}: UploadDropzoneProps): ReactElement {
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const hintId = `${id}-hint`;
  const buttonDescribedBy = [hint ? hintId : undefined, describedBy].filter(Boolean).join(' ') || undefined;

  // `webkitdirectory` has no React prop; it is set on the DOM node.
  useEffect(() => {
    if (folderInputRef.current) folderInputRef.current.webkitdirectory = true;
  }, [allowFolder]);

  function handleInputChange(event: ChangeEvent<HTMLInputElement>): void {
    const files = Array.from(event.currentTarget.files ?? []);
    // Reset so choosing the same file again still fires a change.
    event.currentTarget.value = '';
    if (files.length > 0) onFiles(files);
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>): void {
    if (disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>): void {
    if (event.currentTarget.contains(event.relatedTarget instanceof Node ? event.relatedTarget : null)) return;
    setDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLDivElement>): void {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const files = Array.from(event.dataTransfer.files);
    if (files.length > 0) onFiles(multiple ? files : files.slice(0, 1));
  }

  return (
    <div className={classNames(styles.wrapper, className)}>
      <div
        role="group"
        aria-label="Área para soltar arquivos"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={classNames(styles.zone, dragging && styles.dragging, invalid && styles.invalid, disabled && styles.disabled)}
      >
        <p className={classNames('body-sm', styles.title)}>{dragging ? 'Solte para enviar' : 'Arraste arquivos para cá'}</p>
        {hint && (
          <p id={hintId} className={classNames('caption', styles.hint)}>
            {hint}
          </p>
        )}
        <div className={styles.buttons}>
          <Button variant="secondary" size="sm" disabled={disabled} aria-describedby={buttonDescribedBy} onClick={() => fileInputRef.current?.click()}>
            {multiple ? 'Escolher arquivos' : 'Escolher arquivo'}
          </Button>
          {allowFolder && (
            <Button variant="ghost" size="sm" disabled={disabled} aria-describedby={buttonDescribedBy} onClick={() => folderInputRef.current?.click()}>
              Escolher pasta
            </Button>
          )}
        </div>
        <input
          ref={fileInputRef}
          id={id}
          type="file"
          accept={accept}
          multiple={multiple}
          disabled={disabled}
          tabIndex={-1}
          aria-invalid={invalid ? true : undefined}
          onChange={handleInputChange}
          className={styles.nativeInput}
        />
        {allowFolder && (
          <input
            ref={folderInputRef}
            type="file"
            disabled={disabled}
            tabIndex={-1}
            aria-hidden="true"
            onChange={handleInputChange}
            className={styles.nativeInput}
          />
        )}
      </div>
      {children !== undefined && (
        <div aria-live="polite" className={styles.selection}>
          {children}
        </div>
      )}
    </div>
  );
}
