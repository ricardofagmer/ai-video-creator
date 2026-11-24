import { Badge, Card, textLinkClassName, type Locale } from '@studio/ui';
import { type ScheduleView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { type WebMessages } from '@/messages';
import { nextSlotText, recurrenceText, scheduleHref, scheduleStatusTones } from '../schedule-labels';
import styles from '../schedules.module.css';

/**
 * One schedule in the list (SPEC 0006 section 5.7, R3-AC-23): status, pinned recipe, recurrence,
 * "Próxima: qua., 25/11 09:00" and "Perdidas (7 dias): 2". Every value is a text node.
 */
export function ScheduleSummaryCard({ schedule, t, locale }: { schedule: ScheduleView; t: WebMessages['schedules']; locale: Locale }): ReactElement {
  return (
    <Card
      as="h2"
      title={
        <Link href={scheduleHref(schedule.scheduleId)} className={textLinkClassName()}>
          <span className={styles.plainText}>{schedule.title}</span>
        </Link>
      }
      actions={<Badge tone={scheduleStatusTones[schedule.status]}>{t.statuses[schedule.status]}</Badge>}
    >
      <ul className={styles.slotList}>
        <li className="caption">
          {t.list.recipePrefix}
          <span className="mono">{schedule.recipeRef}</span>
        </li>
        <li className="caption">{recurrenceText(schedule.recurrence, t, locale)}</li>
        <li>{nextSlotText(schedule, t, locale)}</li>
        <li>{t.missed(schedule.missedLast7Days)}</li>
      </ul>
    </Card>
  );
}
