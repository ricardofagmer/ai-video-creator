import { Badge } from '@studio/ui';
import { type ScheduleView } from '@studio/shared/api';
import type { ReactElement } from 'react';
import styles from '../schedules.module.css';

interface ScheduleBriefListProps {
  schedule: Pick<ScheduleView, 'briefs' | 'briefsRemaining'>;
}

/**
 * The brief queue of a schedule (SPEC 0006 section 5.7, Q5), in order: the briefs already used by a
 * fired slot and those still waiting. Brief text is owner text and is shown as a text node.
 */
export function ScheduleBriefList({ schedule }: ScheduleBriefListProps): ReactElement {
  const remaining = schedule.briefsRemaining;
  return (
    <div className={styles.controls}>
      <p className="caption">
        {remaining === null
          ? 'O mesmo briefing é usado em todo horário.'
          : remaining === 0
            ? 'A fila acabou: os próximos horários serão pulados.'
            : `${remaining === 1 ? '1 briefing ainda não usado' : `${remaining} briefings ainda não usados`}.`}
      </p>
      <ol className={styles.briefQueue} aria-label="Fila de briefings">
        {schedule.briefs.map((entry, index) => (
          <li key={entry.briefId} className={styles.briefQueueItem}>
            <span className={styles.plainText}>{`${index + 1}. ${entry.title ?? entry.brief?.topic ?? 'Briefing sem nome'}`}</span>
            <Badge tone={entry.used ? 'neutral' : 'info'}>{entry.used ? 'Usado' : 'Na fila'}</Badge>
          </li>
        ))}
      </ol>
    </div>
  );
}
