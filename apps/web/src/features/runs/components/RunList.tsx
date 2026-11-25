import { StatusBadge, formatUsd, type Locale } from '@studio/ui';
import { type RunIndexEntryView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { PosterCard } from '@/features/common/components/PosterCard';
import layout from '@/features/common/layout.module.css';
import poster from '@/features/common/poster-card.module.css';
import { studioToneOf } from '@/features/common/studio-artwork';
import { type WebMessages } from '@/messages';
import { formatDateTime } from '../run-labels';
import styles from '../runs.module.css';

interface RunListProps {
  entries: readonly RunIndexEntryView[];
  t: WebMessages['runs'];
  locale: Locale;
}

/** "Etapa atual" from the row's `cursor` (SPEC 0002 rev 4, A22): stage · step, or a dash when null. */
function currentStageText(cursor: RunIndexEntryView['cursor'], runs: WebMessages['runs']): string {
  return cursor === null ? '—' : `${runs.stages[cursor.stageId]} · ${runs.steps[cursor.step]}`;
}

/** One poster card per run: status on the cover, the former table columns as labelled facts. The whole card opens the run. */
function RunCard({ entry, t, locale }: { entry: RunIndexEntryView; t: WebMessages['runs']; locale: Locale }): ReactElement {
  const columns = t.list.columns;
  return (
    <PosterCard artwork={{ glyph: 'reel', tone: studioToneOf(entry.runId) }} coverBadge={<StatusBadge kind="run" status={entry.status} />}>
      <h3 className={`heading-3 ${poster.name}`}>
        <Link href={`/execucoes/${entry.runId}`} className={poster.cardLink}>
          {entry.title}
        </Link>
      </h3>
      <p className={poster.meta}>
        <span className="caption">{columns.run}</span>
        <span className="mono">{entry.runId}</span>
      </p>
      <dl className={styles.runFacts}>
        <dt>{columns.recipe}</dt>
        <dd className="mono">{entry.recipe.ref}</dd>
        <dt>{columns.stage}</dt>
        <dd>{currentStageText(entry.cursor, t)}</dd>
        <dt>{columns.cost}</dt>
        <dd>{formatUsd(entry.costUsd, locale)}</dd>
        <dt>{columns.started}</dt>
        <dd>{formatDateTime(entry.createdAt, locale)}</dd>
      </dl>
    </PosterCard>
  );
}

/** design/telas/07 run index as a poster grid, newest first. */
export function RunList({ entries, t, locale }: RunListProps): ReactElement {
  return (
    <ul className={layout.cardGrid} aria-label={t.list.title}>
      {entries.map((entry) => (
        <li key={entry.runId}>
          <RunCard entry={entry} t={t} locale={locale} />
        </li>
      ))}
    </ul>
  );
}
