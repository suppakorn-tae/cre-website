'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button } from '@/components/ui';

import { startGoogleSignup } from './api';
import { LOGIN_PATH } from './google';
import styles from './register.module.css';

/** Step 1: Google or e-mail. */
export function ChooseMethod({ onEmail }: { onEmail: () => void }) {
  const t = useTranslations('auth.register');
  const google = useMutation({
    mutationFn: startGoogleSignup,
    onSuccess: (url) => window.location.assign(url),
  });
  const busy = google.isPending || google.isSuccess;

  return (
    <>
      <h1 className={styles.title}>{t('choose.title')}</h1>
      <p className={styles.subtitle}>{t('choose.subtitle')}</p>
      {google.isError && (
        <p className={styles.alert} role="alert">
          {t('choose.googleFailed')}
        </p>
      )}
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        disabled={busy}
        onClick={() => google.mutate()}
      >
        {busy ? t('choose.googleLoading') : t('choose.google')}
      </Button>
      <p className={styles.divider}>{t('choose.or')}</p>
      <Button variant="primary" size="lg" fullWidth onClick={onEmail}>
        {t('choose.email')}
      </Button>
      <p className={styles.note}>{t('choose.note')}</p>
      <p className={styles.switch}>
        {t('haveAccount')}{' '}
        <Link href={LOGIN_PATH} className={styles.link}>
          {t('login')}
        </Link>
      </p>
    </>
  );
}
