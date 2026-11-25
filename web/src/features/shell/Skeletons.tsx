'use client';

import { useTranslations } from 'next-intl';

import { Skeleton } from '@/components/ui';

import styles from './shell.module.css';

/** Stands in for the account button while the session loads. */
export function AccountSkeleton() {
  return (
    <div className={styles.account} aria-hidden="true">
      <div className={styles.accountButton}>
        <span className={styles.avatarSkeleton}>
          <Skeleton width={32} height={32} />
        </span>
      </div>
    </div>
  );
}

/** Stands in for the page while the session is checked. */
export function ContentSkeleton() {
  const t = useTranslations('shell');
  return (
    <div role="status" className={styles.contentSkeleton}>
      <span className={styles.visuallyHidden}>{t('loading')}</span>
      <Skeleton width="40%" height={28} />
      <Skeleton height={16} />
      <Skeleton width="85%" height={16} />
    </div>
  );
}

/** Stands in for the admin side menu while the session is checked. */
export function SideSkeleton() {
  return (
    <div className={styles.sideCard} aria-hidden="true">
      <div className={styles.contentSkeleton}>
        <Skeleton width="60%" height={20} />
        <Skeleton height={16} />
        <Skeleton height={16} />
        <Skeleton height={16} />
      </div>
    </div>
  );
}
