'use client';

import { buttonClassName } from '@studio/ui';
import type { ReactElement } from 'react';
import { usePortalMessages } from '@/messages';

export interface OpenStudioLinkProps {
  /** `http://127.0.0.1:<web port>`. */
  studioUrl: string;
}

/**
 * A plain top-level navigation, not a fetch: it is not a mixed-content subresource and Local
 * Network Access does not gate main-frame navigation, so it works in every browser, Safari
 * included (vetting 0006 section 2.4).
 */
export function OpenStudioLink({ studioUrl }: OpenStudioLinkProps): ReactElement {
  const t = usePortalMessages();
  return (
    <a href={studioUrl} target="_blank" rel="noopener noreferrer" className={buttonClassName({ variant: 'secondary' })}>
      {t.detection.openStudio}
    </a>
  );
}
