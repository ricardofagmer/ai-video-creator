import type { ReactElement } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Icon.module.css';

/** Glyph names describe the shape, not the page that uses it. */
export type IconName =
  | 'menu'
  | 'close'
  | 'folder'
  | 'clipboard'
  | 'play-circle'
  | 'columns'
  | 'calendar'
  | 'bar-chart'
  | 'trending-up'
  | 'link'
  | 'globe'
  | 'moon'
  | 'chevron-down'
  | 'log-out'
  | 'sparkles'
  | 'help-circle'
  | 'cart'
  | 'trash'
  | 'broom'
  | 'plus'
  | 'arrow-right'
  | 'star'
  | 'star-filled';

export interface IconProps {
  name: IconName;
  /** `md` (default) is `--size-icon-md`, `sm` is `--size-icon-sm`. */
  size?: 'sm' | 'md';
  className?: string;
}

const glyphs: Record<IconName, ReactElement> = {
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  trash: <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />,
  broom: <path d="M19 3l-7.5 7.5M9 10l5 5M9 10l-4.5 1.5L3 21l9.5-1.5L14 15M6.5 15.5L5 19M10 17l-1 3" />,
  plus: <path d="M12 5v14M5 12h14" />,
  'arrow-right': <path d="M5 12h14M13 6l6 6-6 6" />,
  star: <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" />,
  // The filled form marks an "on" state (a favorite); the path overrides the outline-only `fill: none`.
  'star-filled': <path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3l-5.6 2.9 1.1-6.2L3 9.6l6.2-.9Z" fill="currentColor" />,
  cart: (
    <>
      <path d="M3 4h2l2.4 11.2a2 2 0 0 0 2 1.6h7.7a2 2 0 0 0 2-1.5L21 8H6.2" />
      <circle cx="10" cy="20.5" r="1" />
      <circle cx="17" cy="20.5" r="1" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  folder: <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />,
  clipboard: (
    <>
      <rect x="8" y="3" width="8" height="4" rx="1" />
      <path d="M8 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M8 12h8M8 16h5" />
    </>
  ),
  'play-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M10 8.5v7l6-3.5Z" />
    </>
  ),
  columns: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M12 4v16" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  'bar-chart': <path d="M4 20h16M7 16v-5M12 16V6M17 16v-8" />,
  'trending-up': <path d="M3 17l6-6 4 4 8-8M15 7h6v6" />,
  link: <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1" />,
  globe: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9M12 3c-2.5 2.6-3.8 5.6-3.8 9s1.3 6.4 3.8 9" />
    </>
  ),
  moon: <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />,
  'chevron-down': <path d="M6 9l6 6 6-6" />,
  'log-out': <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  sparkles: <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8ZM18 15l.8 2.2L21 18l-2.2.8L18 21l-.8-2.2L15 18l2.2-.8ZM6 15l.6 1.4L8 17l-1.4.6L6 19l-.6-1.4L4 17l1.4-.6Z" />,
  'help-circle': (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9.5a2.5 2.5 0 0 1 4.9.7c0 1.7-2.4 2.3-2.4 3.8M12 17h.01" />
    </>
  ),
};

/** Decorative outline icon (24×24 grid, `currentColor` stroke); always hidden from assistive tech. */
export function Icon({ name, size = 'md', className }: IconProps): ReactElement {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false" className={classNames(styles.icon, styles[size], className)}>
      {glyphs[name]}
    </svg>
  );
}
