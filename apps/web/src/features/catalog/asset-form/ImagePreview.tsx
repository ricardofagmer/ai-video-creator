'use client';

import { type ReactElement, useEffect, useState } from 'react';
import layout from '@/features/common/layout.module.css';

export interface ImageSize {
  width: number;
  height: number;
}

export interface ImagePreviewProps {
  /** The picked file; only the browser decodes it, nothing is sent until the form is saved. */
  file: File;
  alt: string;
  onMeasured: (size: ImageSize) => void;
}

/**
 * Preview of an image picked for upload. The object URL lives only while this file is shown and is
 * revoked on change or unmount, so a long session does not keep every picked image in memory.
 */
export function ImagePreview({ file, alt, onMeasured }: ImagePreviewProps): ReactElement | null {
  const [source, setSource] = useState<string | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSource(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (source === null) return null;
  return (
    <img
      className={layout.imagePreview}
      src={source}
      alt={alt}
      onLoad={(event) => {
        const { naturalWidth, naturalHeight } = event.currentTarget;
        if (naturalWidth > 0 && naturalHeight > 0) onMeasured({ width: naturalWidth, height: naturalHeight });
      }}
    />
  );
}
