import { Badge } from '@studio/ui';
import { type ScheduleView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import { type WebMessages } from '@/messages';
import styles from '../schedules.module.css';

interface ScheduleBriefListProps {
  schedule: Pick<ScheduleView, 'briefs' | 'briefsRemaining'>;
  t: WebMessages['schedules']['briefList'];
}

/**
 * The brief queue of a schedule (SPEC 0006 section 5.7, Q5), in order: the briefs already used by a
 * fired slot and those still waiting. Brief text is owner text and is shown as a text node.
 */
export function ScheduleBriefList({ schedule, t }: ScheduleBriefListProps): ReactElement {
  const remaining = schedule.briefsRemaining;
  return (
    <div className={styles.controls}>
      <p className="caption">
        {remaining === null
          ? t.sameBrief
          : remaining === 0
            ? t.queueEnded
            : t.remaining(remaining)}
      </p>
      <ol className={styles.briefQueue} aria-label={t.queueLabel}>
        {schedule.briefs.map((entry, index) => (
          <li key={entry.briefId} className={styles.briefQueueItem}>
            <span className={styles.plainText}>{`${index + 1}. ${entry.title ?? entry.brief?.topic ?? t.unnamed}`}</span>
            <Badge tone={entry.used ? 'neutral' : 'info'}>{entry.used ? t.used : t.queued}</Badge>
          </li>
        ))}
      </ol>
    </div>
  );
}
