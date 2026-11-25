import type { ReactNode } from 'react';

import styles from './display.module.css';

type Props = {
  /** Illustration in a 64px tile above the title: an `<Icon size={24} />`. */
  icon?: ReactNode;
  title: string;
  description?: string;
  /** Usually a primary Button. */
  action?: ReactNode;
};

export function EmptyState({ icon, title, description, action }: Props) {
  return (
    <div className={styles.empty}>
      {icon && (
        <span className={styles.emptyIcon} aria-hidden="true">
          {icon}
        </span>
      )}
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyText}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}
