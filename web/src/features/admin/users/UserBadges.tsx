import { useTranslations } from 'next-intl';

import type { AccountStatus, UserRole } from './api';
import styles from './users.module.css';

export function RoleBadge({ role }: { role: UserRole }) {
  const t = useTranslations('admin-users.roles');
  return <span className={`${styles.role} ${styles[`role_${role}`]}`}>{t(role)}</span>;
}

export function StatusBadge({ status }: { status: AccountStatus }) {
  const t = useTranslations('admin-users.statuses');
  return (
    <span className={`${styles.status} ${styles[`status_${status}`]}`}>
      <span className={styles.dot} aria-hidden="true" />
      {t(status)}
    </span>
  );
}
