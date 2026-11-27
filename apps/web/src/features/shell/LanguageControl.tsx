'use client';

import { LanguageSwitch } from '@studio/ui';
import { useRouter } from 'next/navigation';
import type { ReactElement } from 'react';

/** The kit's language switch, wired to re-render the server components after the cookie changes. */
export function LanguageControl(): ReactElement {
  const router = useRouter();
  return <LanguageSwitch onChanged={() => router.refresh()} />;
}
