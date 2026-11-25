'use client';

import { useTranslations } from 'next-intl';

import { RlTable } from './RlTable';
import styles from './thresholds.module.css';

/** Admin: RL thresholds per indicator. */
export function ThresholdsPage() {
  const t = useTranslations('admin-thresholds');
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>{t('rl.title')}</h1>
        <p className={styles.subtitle}>{t('rl.subtitle')}</p>
      </header>
      <RlTable />
    </div>
  );
}
