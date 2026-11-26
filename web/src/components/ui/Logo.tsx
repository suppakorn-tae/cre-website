import Image from 'next/image';
import { useTranslations } from 'next-intl';

import styles from './Logo.module.css';

type Props = {
  /**
   * `header`: the mark with the name and subtitle (mobile: the mark and "CRE").
   * `full`: the mark with the wordmark and tagline, for the auth pages.
   */
  variant: 'header' | 'full';
  className?: string;
};

/**
 * The CRE logo. Both images are for light backgrounds only. The header variant
 * shows the name as text, so its image is decorative (`alt=""`); the full logo
 * carries the name in its `alt`. The caller adds the link and its accessible name.
 */
export function Logo({ variant, className }: Props) {
  const t = useTranslations('shell.brand');

  if (variant === 'full') {
    return (
      <Image
        src="/brand/cre-logo-full.png"
        alt={t('name')}
        width={998}
        height={486}
        priority
        className={[styles.full, className].filter(Boolean).join(' ')}
      />
    );
  }

  return (
    <span className={[styles.header, className].filter(Boolean).join(' ')}>
      <Image
        src="/brand/cre-logo-mark.png"
        alt=""
        width={431}
        height={486}
        priority
        className={styles.mark}
      />
      <span className={styles.text}>
        <span className={styles.name}>
          <span className={styles.nameLong}>{t('name')}</span>
          <span className={styles.nameShort} aria-hidden="true">
            {t('short')}
          </span>
        </span>
        <span className={styles.tagline}>{t('tagline')}</span>
      </span>
    </span>
  );
}
