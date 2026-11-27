import { Badge, type Locale } from '@studio/ui';
import { type ScheduleView } from '@studio/shared/api';
import Link from 'next/link';
import type { ReactElement } from 'react';
import { PosterCard } from '@/features/common/components/PosterCard';
import poster from '@/features/common/poster-card.module.css';
import { studioToneOf } from '@/features/common/studio-artwork';
import { type WebMessages } from '@/messages';
import { nextSlotText, recurrenceText, scheduleHref, scheduleStatusTones } from '../schedule-labels';
import styles from '../schedules.module.css';

/**
 * One schedule poster in the list (SPEC 0006 section 5.7, R3-AC-23): status, pinned recipe, recurrence,
 * "Próxima: qua., 25/11 09:00" and "Perdidas (7 dias): 2". Every value is a text node; the whole card
 * opens the schedule.
 */
export function ScheduleSummaryCard({ schedule, t, locale }: { schedule: ScheduleView; t: WebMessages['schedules']; locale: Locale }): ReactElement {
  return (
    <PosterCard artwork={{ glyph: 'calendar', tone: studioToneOf(schedule.scheduleId) }}>
      <h2 className={`heading-3 ${poster.name}`}>
        <Link href={scheduleHref(schedule.scheduleId)} className={poster.cardLink}>
          <span className={styles.plainText}>{schedule.title}</span>
        </Link>
      </h2>
      <p className={poster.meta}>
        <Badge tone={scheduleStatusTones[schedule.status]}>{t.statuses[schedule.status]}</Badge>
        <span className="caption">{recurrenceText(schedule.recurrence, t, locale)}</span>
      </p>
      <p className={poster.excerpt}>
        {t.list.recipePrefix}
        <span className="mono">{schedule.recipeRef}</span>
      </p>
      <ul className={`${styles.slotList} ${styles.posterFooter}`}>
        <li>{nextSlotText(schedule, t, locale)}</li>
        <li className="caption">{t.missed(schedule.missedLast7Days)}</li>
      </ul>
    </PosterCard>
  );
}
