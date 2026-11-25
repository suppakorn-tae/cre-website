import type { Icon as TablerIcon } from '@tabler/icons-react';
import type { ReactNode } from 'react';

import styles from './display.module.css';
import { Icon } from './Icon';

type Props = {
  title: string;
  description?: string;
  /** Tabler icon for the page (24px in a 64px tinted tile). Left out: no tile. */
  icon?: TablerIcon;
  /** Usually a primary Button. */
  action?: ReactNode;
};

export function EmptyState({ title, description, icon, action }: Props) {
  return (
    <div className={styles.empty}>
      {icon && (
        <span className="mb-2 flex size-16 items-center justify-center rounded-pill bg-blue-50 text-primary">
          <Icon icon={icon} size={24} />
        </span>
      )}
      <p className={styles.emptyTitle}>{title}</p>
      {description && <p className={styles.emptyText}>{description}</p>}
      {action && <div className={styles.emptyAction}>{action}</div>}
    </div>
  );
}
