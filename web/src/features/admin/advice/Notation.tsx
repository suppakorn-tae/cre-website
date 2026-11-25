import { useTranslations } from 'next-intl';

import styles from './advice.module.css';
import type { AdviceList } from './rules';

/** Domain notation as the hi-fi shows it: RL, RI with a subscript C, T or E. Text comes from the catalogue. */
export function Notation({ list }: { list: AdviceList }) {
  const t = useTranslations('admin-advice.notation');
  if (list === 'RL') return <>{t('RL')}</>;
  return (
    <span className={styles.notation}>
      {t('RI')}
      <sub>{t(list.slice('RI_'.length) as 'C' | 'T' | 'E')}</sub>
    </span>
  );
}
