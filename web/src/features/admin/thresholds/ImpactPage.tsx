'use client';

import { useTranslations } from 'next-intl';

import { ImpactTables } from './ImpactTables';
import styles from './thresholds.module.css';

/** Admin: the shared RI_C / RI_T impact tables, edited side by side with one save. */
export function ImpactPage() {
  const t = useTranslations('admin-thresholds');
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>
          {t.rich('impact.titleRich', { sub: (chunks) => <sub>{chunks}</sub> })}
        </h1>
        <p className={styles.subtitle}>{t('impact.subtitle')}</p>
      </header>
      <ImpactTables />
    </div>
  );
}
