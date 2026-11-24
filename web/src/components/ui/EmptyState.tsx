import type { ReactNode } from 'react';

import styles from './display.module.css';

type Props = {
  title: string;
  description?: string;
  /** Usually a primary Button. */
  action?: ReactNode;
};

export function EmptyState({ title, description, action }: Props) {
  return (
    <div className={styles.empty}>
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyText}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}
