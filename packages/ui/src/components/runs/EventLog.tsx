'use client';

import type { ReactElement } from 'react';
import { useI18n } from '../../i18n/I18nProvider';
import { classNames } from '../../utils/class-names';
import styles from './EventLog.module.css';

export type EventLevel = 'info' | 'warning' | 'error';

export interface EventLogItem {
  id: string;
  /** ISO timestamp, used for `<time dateTime>`. */
  at: string;
  /** Already formatted, for example "14:32:05". */
  timeLabel: string;
  level: EventLevel;
  /** Where it happened, for example "narração · verificar". */
  source?: string;
  message: string;
  /** BCP 47 tag of `message` when it differs from the page language (recorded pt-BR text). */
  messageLang?: string;
}

export interface EventLogProps {
  /** Newest last, as in `events.jsonl`. */
  items: readonly EventLogItem[];
  label?: string;
  emptyText?: string;
  className?: string;
}

/** Live event feed of a run (`events.jsonl`); new entries are announced politely. */
export function EventLog({ items, label, emptyText, className }: EventLogProps): ReactElement {
  const { ui } = useI18n();
  return (
    // role="log" announces appended entries; the box scrolls and takes keyboard focus.
    <div role="log" aria-label={label ?? ui.runs.eventsLabel} aria-live="polite" tabIndex={0} className={classNames(styles.wrapper, className)}>
      <ol className={styles.list}>
        {items.length === 0 && <li className={classNames('caption', styles.empty)}>{emptyText ?? ui.runs.noEvents}</li>}
        {items.map((item) => (
          <li key={item.id} className={classNames(styles.item, styles[item.level])}>
            <time dateTime={item.at} className={classNames('mono', styles.time)}>
              {item.timeLabel}
            </time>
            <span className={styles.level}>{ui.runs.eventLevels[item.level]}</span>
            <span className={styles.message}>
              {item.source && <span className={styles.source}>{item.source}: </span>}
              {item.messageLang === undefined ? item.message : <span lang={item.messageLang}>{item.message}</span>}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
