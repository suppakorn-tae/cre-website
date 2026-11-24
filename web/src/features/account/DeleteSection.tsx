'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, ConfirmDialog } from '@/components/ui';
import { LoginPasswordField } from '@/features/auth/login/LoginPasswordField';
import registerStyles from '@/features/auth/register/register.module.css';

import { AFTER_DELETE_PATH, classifyDeleteFailure } from './account';
import styles from './account.module.css';
import { accountApi, AuthApiError, type Account } from './api';
import { useFailureText } from './useFailureText';

type Props = {
  account: Account;
  /** Back from Google re-authentication: open the dialog, already verified. */
  reauthenticated: boolean;
};

/** Delete the account with a re-authentication (UC-04 1a, 1b; BR-13). */
export function DeleteSection({ account, reauthenticated }: Props) {
  const t = useTranslations('account.delete');
  const failureText = useFailureText();
  const router = useRouter();
  const queryClient = useQueryClient();
  const hasPassword = account.sign_in_methods.password;
  const [open, setOpen] = useState(reauthenticated);
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [verified, setVerified] = useState(reauthenticated);

  const remove = useMutation({
    mutationFn: () => accountApi.deleteAccount(hasPassword ? password : undefined),
    onSuccess: () => {
      queryClient.clear();
      router.replace(AFTER_DELETE_PATH);
    },
    onError: (e) => {
      if (!(e instanceof AuthApiError)) return setError(failureText(e));
      const kind = classifyDeleteFailure(e);
      if (kind === 'passwordIncorrect') setError(t('passwordIncorrect'));
      else if (kind === 'reauthRequired') {
        setVerified(false);
        setError(t('reauthRequired'));
      } else setError(failureText(e, t('failed')));
    },
  });

  const reauth = useMutation({
    mutationFn: () => accountApi.startGoogle('reauth'),
    onSuccess: (url) => window.location.assign(url),
    onError: (e) => setError(failureText(e, t('failed'))),
  });
  const reauthBusy = reauth.isPending || reauth.isSuccess;

  function close() {
    if (remove.isPending) return;
    setOpen(false);
    setPassword('');
    setError(undefined);
  }

  function confirm() {
    if (remove.isPending) return;
    if (hasPassword && password === '') {
      setError(t('passwordRequired'));
      return;
    }
    if (!hasPassword && !verified) {
      setError(t('reauthRequired'));
      return;
    }
    setError(undefined);
    remove.mutate();
  }

  return (
    <section className={`${styles.card} ${styles.danger}`} aria-labelledby="account-delete">
      <h2 id="account-delete" className={`${styles.cardTitle} ${styles.dangerTitle}`}>
        {t('title')}
      </h2>
      <p className={styles.muted}>{t('text')}</p>
      <div className={styles.actions}>
        <Button variant="destructive" onClick={() => setOpen(true)}>
          {t('open')}
        </Button>
      </div>
      <ConfirmDialog
        open={open}
        destructive
        title={t('dialogTitle')}
        confirmLabel={t('confirm')}
        cancelLabel={t('cancel')}
        onConfirm={confirm}
        onCancel={close}
      >
        <ul className={styles.kept}>
          <li>{t('kept1')}</li>
          <li>{t('kept2')}</li>
          <li>{t('kept3')}</li>
        </ul>
        <div className={styles.verify}>
          <p className={styles.mutedSmall}>{t('verify')}</p>
          {hasPassword ? (
            <LoginPasswordField
              label={t('currentPassword')}
              value={password}
              onChange={(v) => {
                setPassword(v);
                setError(undefined);
              }}
            />
          ) : verified ? (
            <p className={registerStyles.success} role="status">
              {t('googleVerified')}
            </p>
          ) : (
            <Button
              variant="secondary"
              fullWidth
              disabled={reauthBusy}
              onClick={() => reauth.mutate()}
            >
              {reauthBusy ? t('googleReauthing') : t('googleReauth')}
            </Button>
          )}
        </div>
        {error && (
          <p className={registerStyles.errorText} role="alert">
            {error}
          </p>
        )}
      </ConfirmDialog>
    </section>
  );
}
