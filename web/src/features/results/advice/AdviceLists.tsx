'use client';

import { useTranslations } from 'next-intl';

import type { IndicatorResult } from '../overview/api';
import styles from './advice.module.css';

type Advice = NonNullable<IndicatorResult['advice']>;

/**
 * The advice lists of one indicator. A list may hold 1 to 5 items and an
 * indicator 1 to 3 lists (ties show every tied list), so nothing here
 * assumes a count. Order is as the api returns it.
 */
export function AdviceLists({ advice }: { advice?: Advice }) {
  const t = useTranslations('advice');
  if (!advice || advice.length === 0) return <p className={styles.empty}>{t('noAdvice')}</p>;
  return (
    <div className={styles.lists}>
      {advice.map((list) => (
        <section key={list.list} aria-label={t(`lists.${list.list}`)} className={styles.list}>
          <h4 className={styles.label}>{t(`lists.${list.list}`)}</h4>
          <ul className={styles.items}>
            {list.items.map((text, i) => (
              <li key={i}>{text}</li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
