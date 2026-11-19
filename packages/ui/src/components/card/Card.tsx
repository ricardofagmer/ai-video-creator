import { useId, type HTMLAttributes, type ReactElement, type ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Card.module.css';

export type CardHeadingLevel = 'h2' | 'h3' | 'h4';

export interface CardProps extends Omit<HTMLAttributes<HTMLElement>, 'title'> {
  /** Card title; with it the card becomes `<section aria-labelledby>`. */
  title?: ReactNode;
  /** Heading level of the title (the look is always `heading-3`). */
  as?: CardHeadingLevel;
  description?: ReactNode;
  /** Actions at the top right of the header (for example a "Nova versão" button). */
  actions?: ReactNode;
  /** Footer actions, right-aligned. */
  footer?: ReactNode;
}

export function Card({
  title,
  as: Heading = 'h2',
  description,
  actions,
  footer,
  className,
  children,
  ...props
}: CardProps): ReactElement {
  const titleId = useId();
  const hasTitle = title !== undefined && title !== null && title !== false;
  const hasHeader = hasTitle || Boolean(description) || Boolean(actions);

  const content = (
    <>
      {hasHeader && (
        <div className={styles.header}>
          <div className={styles.heading}>
            {hasTitle && (
              <Heading id={titleId} className="heading-3">
                {title}
              </Heading>
            )}
            {description && <p className={classNames('caption', styles.description)}>{description}</p>}
          </div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </div>
      )}
      {children}
      {footer && <div className={styles.footer}>{footer}</div>}
    </>
  );

  if (hasTitle) {
    return (
      <section {...props} aria-labelledby={titleId} className={classNames(styles.card, className)}>
        {content}
      </section>
    );
  }
  return (
    <div {...props} className={classNames(styles.card, className)}>
      {content}
    </div>
  );
}
