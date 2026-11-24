import { useId, type ReactElement, type ReactNode } from 'react';
import { DEFAULT_LOCALE } from '../../i18n/locale';
import { uiMessages } from '../../i18n/messages';
import { classNames } from '../../utils/class-names';
import { StatusBadge } from '../status/StatusBadge';
import type { RunStatus } from '../status/status-types';
import styles from './NowPanel.module.css';

export interface NowPanelProps {
  runStatus: RunStatus;
  /** Current stage and step names in the active locale. */
  stageLabel?: string;
  stepLabel?: string;
  /** What is happening right now, for example "Gerando a narração da cena 3 de 8". */
  message?: string;
  /** Already formatted, for example "atualizado há 1 s". */
  updatedLabel?: string;
  /** No fresh data for more than 5 s: the update line turns to the warning colour. */
  stale?: boolean;
  /** Run controls, usually `<RunControls />`. */
  actions?: ReactNode;
  /** Heading of the panel; the kit's pt-BR text by default (pass `ui.runs.nowTitle` for the active locale). */
  title?: string;
  className?: string;
}

/** "Agora" panel of the run page: status, current stage/step and the live message. */
export function NowPanel({
  runStatus,
  stageLabel,
  stepLabel,
  message,
  updatedLabel,
  stale = false,
  actions,
  title = uiMessages[DEFAULT_LOCALE].runs.nowTitle,
  className,
}: NowPanelProps): ReactElement {
  const titleId = useId();
  const position = [stageLabel, stepLabel].filter(Boolean).join(' · ');
  return (
    <section aria-labelledby={titleId} className={classNames(styles.panel, className)}>
      <div className={styles.header}>
        <h2 id={titleId} className="heading-3">
          {title}
        </h2>
        <StatusBadge kind="run" status={runStatus} />
      </div>
      {/* Polite live region: the 1 s poll updates this text without stealing focus. */}
      <div aria-live="polite" aria-atomic="true" className={styles.live}>
        {position && <p className={styles.position}>{position}</p>}
        {message && <p className={classNames('body-sm', styles.message)}>{message}</p>}
      </div>
      {updatedLabel && <p className={classNames('caption', styles.updated, stale && styles.stale)}>{updatedLabel}</p>}
      {actions && <div className={styles.actions}>{actions}</div>}
    </section>
  );
}
