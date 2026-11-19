import type { ReactElement } from 'react';
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
}

export interface EventLogProps {
  /** Newest last, as in `events.jsonl`. */
  items: readonly EventLogItem[];
  label?: string;
  emptyText?: string;
  className?: string;
}

const levelLabels: Readonly<Record<EventLevel, string>> = {
  info: 'Info',
  warning: 'Aviso',
  error: 'Erro',
};

/** Live event feed of a run (`events.jsonl`); new entries are announced politely. */
export function EventLog({ items, label = 'Eventos', emptyText = 'Nenhum evento ainda.', className }: EventLogProps): ReactElement {
  return (
    // role="log" announces appended entries; the box scrolls and takes keyboard focus.
    <div role="log" aria-label={label} aria-live="polite" tabIndex={0} className={classNames(styles.wrapper, className)}>
      <ol className={styles.list}>
        {items.length === 0 && <li className={classNames('caption', styles.empty)}>{emptyText}</li>}
        {items.map((item) => (
          <li key={item.id} className={classNames(styles.item, styles[item.level])}>
            <time dateTime={item.at} className={classNames('mono', styles.time)}>
              {item.timeLabel}
            </time>
            <span className={styles.level}>{levelLabels[item.level]}</span>
            <span className={styles.message}>
              {item.source && <span className={styles.source}>{item.source}: </span>}
              {item.message}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
