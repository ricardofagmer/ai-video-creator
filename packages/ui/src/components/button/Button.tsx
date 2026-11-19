import type { ComponentProps, ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import { Spinner } from '../spinner/Spinner';
import styles from './Button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';

export type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonClassNameOptions {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Takes the full width of its container. */
  block?: boolean;
  className?: string;
}

/** Button classes for links (`<a>`, `next/link`) that look like a button. */
export function buttonClassName({
  variant = 'primary',
  size = 'md',
  block = false,
  className,
}: ButtonClassNameOptions = {}): string {
  return classNames(styles.button, styles[variant], styles[size], block && styles.block, className);
}

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows the spinner, disables the button and sets `aria-busy="true"`. */
  loading?: boolean;
  /** Label shown instead of the children while loading (for example "Salvando…"). */
  loadingLabel?: string;
}

export function Button({
  variant = 'primary',
  size = 'md',
  block = false,
  loading = false,
  loadingLabel,
  type = 'button',
  disabled,
  className,
  children,
  ...props
}: ButtonProps): ReactElement {
  const label =
    loading && loadingLabel ? (
      <span className={styles.labelStack}>
        <span className={styles.reservedLabel} aria-hidden="true">
          {children}
        </span>
        <span>{loadingLabel}</span>
      </span>
    ) : (
      children
    );

  return (
    <button
      {...props}
      type={type}
      disabled={disabled || loading}
      aria-busy={loading ? true : undefined}
      className={buttonClassName({ variant, size, block, className })}
    >
      {loading && <Spinner size="sm" decorative />}
      {label}
    </button>
  );
}
