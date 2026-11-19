import type { ReactElement, ReactNode } from 'react';
import { classNames } from '../../utils/class-names';
import styles from './Table.module.css';

export interface TableColumn<Row> {
  key: string;
  header: ReactNode;
  render: (row: Row) => ReactNode;
  align?: 'start' | 'end';
  /** Marks the column that names the row; it renders as `<th scope="row">`. */
  rowHeader?: boolean;
}

export interface TableProps<Row> {
  /** Accessible table name; visible unless `hideCaption`. */
  caption: string;
  hideCaption?: boolean;
  columns: readonly TableColumn<Row>[];
  rows: readonly Row[];
  rowKey: (row: Row) => string;
  /** Text of the designed empty state (for example "Nenhuma execução ainda."). */
  emptyText: string;
  className?: string;
}

export function Table<Row>({
  caption,
  hideCaption = false,
  columns,
  rows,
  rowKey,
  emptyText,
  className,
}: TableProps<Row>): ReactElement {
  return (
    // The wrapper scrolls horizontally on narrow screens and is focusable so keyboard users can scroll it.
    <div className={classNames(styles.wrapper, className)} tabIndex={0} role="region" aria-label={caption}>
      <table className={styles.table}>
        <caption className={hideCaption ? 'visually-hidden' : classNames('caption', styles.caption)}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={classNames(styles.headerCell, column.align === 'end' && styles.end)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className={styles.empty}>
                {emptyText}
              </td>
            </tr>
          ) : (
            rows.map((row) => (
              <tr key={rowKey(row)} className={styles.row}>
                {columns.map((column) => {
                  const cellClassName = classNames(styles.cell, column.align === 'end' && styles.end);
                  return column.rowHeader ? (
                    <th key={column.key} scope="row" className={classNames(cellClassName, styles.rowHeader)}>
                      {column.render(row)}
                    </th>
                  ) : (
                    <td key={column.key} className={cellClassName}>
                      {column.render(row)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
