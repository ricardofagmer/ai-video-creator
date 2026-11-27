'use client';

import { Alert, useI18n } from '@studio/ui';
import { type CompositionConflict } from '@studio/shared/recipes';
import { type ReactElement } from 'react';
import { useWebMessages } from '@/lib/i18n/client';
import { compositionConflictTexts } from '../composition-conflict-text';

export interface CompositionConflictListProps {
  conflicts: readonly CompositionConflict[];
  /** Element id, so a disabled button can point at the list with `aria-describedby`. */
  id?: string;
}

/**
 * The choices that cannot make one video together, one sentence each (guided-creation spec
 * section 3). Renders nothing when there is no conflict, so callers can always place it.
 */
export function CompositionConflictList({ conflicts, id }: CompositionConflictListProps): ReactElement | null {
  const t = useWebMessages();
  const { locale } = useI18n();
  if (conflicts.length === 0) return null;
  const texts = compositionConflictTexts(conflicts, t, locale);
  return (
    <div id={id}>
      <Alert variant="warning" title={t.common.compositionConflicts.title}>
        <ul>
          {texts.map((text) => (
            <li key={text}>{text}</li>
          ))}
        </ul>
        <p className="caption">{t.common.compositionConflicts.blockedHint}</p>
      </Alert>
    </div>
  );
}
