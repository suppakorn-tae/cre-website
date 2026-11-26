import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { Logo } from '@/components/ui/Logo';
import '@/styles/tokens.css';

import styles from './register.module.css';

/** Two-column frame of the sign-up and log-in pages: brand panel and form. */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useTranslations('auth.register.brand');
  const steps = [1, 2, 3] as const;
  return (
    <div className={styles.page}>
      <aside className={styles.brand}>
        <Logo variant="full" className={styles.logo} />
        <div className={styles.brandBody}>
          <h2 className={styles.headline}>{t('headline')}</h2>
          <p className={styles.tagline}>{t('tagline')}</p>
          <ol className={styles.steps}>
            {steps.map((n) => (
              <li key={n} className={styles.step}>
                <span className={styles.stepNumber} aria-hidden="true">
                  {n}
                </span>
                <div>
                  <h3 className={styles.stepTitle}>{t(`step${n}Title`)}</h3>
                  <p className={styles.stepText}>{t(`step${n}Text`)}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
        <p className={styles.copyright}>{t('copyright')}</p>
      </aside>
      <main className={styles.panel}>
        <div className={styles.card}>
          <Logo variant="full" className={styles.logoMobile} />
          {children}
        </div>
      </main>
    </div>
  );
}
