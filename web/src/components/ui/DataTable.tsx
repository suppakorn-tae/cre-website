import type { ReactNode } from 'react';

import { cx } from './cx';
import styles from './display.module.css';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  /** Right-align numbers. */
  align?: 'end';
  /** Card title on small screens: shown without its header label. */
  primary?: boolean;
  /** Keep the value on one line (codes, numbers). The other columns wrap instead. */
  nowrap?: boolean;
};

type Props<T> = {
  /** Names the table for screen readers; not shown. */
  caption: string;
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Rendered instead of the table when there are no rows. */
  empty?: ReactNode;
  /** No border or background, for a table that sits inside a card of its own. */
  bare?: boolean;
};

/**
 * A table on wide screens. Below 768px CSS turns each row into a card and
 * shows every cell's `data-label` (the column header) next to its value.
 */
export function DataTable<T>({ caption, columns, rows, rowKey, empty, bare }: Props<T>) {
  if (rows.length === 0 && empty) return <>{empty}</>;
  return (
    <div className={cx(styles.tableWrap, bare && styles.bare)}>
      <table className={styles.table}>
        <caption className={styles.caption}>{caption}</caption>
        <thead>
          <tr>
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cx(c.align === 'end' && styles.end, c.nowrap && styles.nowrap)}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((c) => (
                <td
                  key={c.key}
                  data-label={c.header}
                  data-primary={c.primary ? 'true' : undefined}
                  className={cx(c.align === 'end' && styles.end, c.nowrap && styles.nowrap)}
                >
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
