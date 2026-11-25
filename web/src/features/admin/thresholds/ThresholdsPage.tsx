'use client';

import { useTranslations } from 'next-intl';

import { RlTable } from './RlTable';
import styles from './thresholds.module.css';

/** Admin: RL thresholds per indicator and the shared RI_C / RI_T tables. */
export function ThresholdsPage() {
  const t = useTranslations('admin-thresholds');
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>
      <aside className={styles.notice}>
        <p className={styles.noticeTitle}>{t('notice.title')}</p>
        <p className={styles.noticeBody}>{t('notice.body')}</p>
      </aside>
      <section className={styles.card} aria-labelledby="rl-title">
        <h2 id="rl-title" className={styles.cardTitle}>
          {t('rl.title')}
        </h2>
        <p className={styles.muted}>{t('rl.subtitle')}</p>
        <RlTable />
      </section>
    </div>
  );
}
