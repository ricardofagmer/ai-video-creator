import { Badge, Card, textLinkClassName } from '@studio/ui';
import { type ScheduleView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { missedText, nextSlotText, recurrenceText, scheduleHref, scheduleStatusLabels, scheduleStatusTones } from '../schedule-labels';
import styles from '../schedules.module.css';

/**
 * One schedule in the list (SPEC 0006 section 5.7, R3-AC-23): status, pinned recipe, recurrence,
 * "Próxima: qua., 25/11 09:00" and "Perdidas (7 dias): 2". Every value is a text node.
 */
export function ScheduleSummaryCard({ schedule }: { schedule: ScheduleView }): ReactElement {
  return (
    <Card
      as="h2"
      title={
        <Link href={scheduleHref(schedule.scheduleId)} className={textLinkClassName()}>
          <span className={styles.plainText}>{schedule.title}</span>
        </Link>
      }
      actions={<Badge tone={scheduleStatusTones[schedule.status]}>{scheduleStatusLabels[schedule.status]}</Badge>}
    >
      <ul className={styles.slotList}>
        <li className="caption">
          {'Receita: '}
          <span className="mono">{schedule.recipeRef}</span>
        </li>
        <li className="caption">{recurrenceText(schedule.recurrence)}</li>
        <li>{nextSlotText(schedule)}</li>
        <li>{missedText(schedule.missedLast7Days)}</li>
      </ul>
    </Card>
  );
}
