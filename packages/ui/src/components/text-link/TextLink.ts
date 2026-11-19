import { classNames } from '../../utils/class-names';
import styles from './TextLink.module.css';

/** Classes for inline text links (`<a>` or `next/link`). */
export function textLinkClassName(className?: string): string {
  return classNames(styles.link, className);
}
