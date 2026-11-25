'use client';

import { IconLock, IconUnlink } from '@tabler/icons-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Alert, Button, ConfirmDialog, GoogleMark, Icon } from '@/components/ui';

import { canUnlinkGoogle, classifyUnlinkFailure } from './account';
import styles from './account.module.css';
import { accountApi, AuthApiError, type Account } from './api';
import { useFailureText } from './useFailureText';

/** Sign-in methods: e-mail + password, and Google link / unlink (UC-04 1d-1f). */
export function MethodsSection({ account }: { account: Account }) {
  const t = useTranslations('account.methods');
  const tUi = useTranslations('ui');
  const failureText = useFailureText();
  const queryClient = useQueryClient();
  const methods = account.sign_in_methods;
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState(false);

  const link = useMutation({
    mutationFn: () => accountApi.startGoogle('link'),
    onSuccess: (url) => window.location.assign(url),
  });
  const linkBusy = link.isPending || link.isSuccess;

  const unlink = useMutation({
    mutationFn: accountApi.unlinkGoogle,
    onMutate: () => setDone(false),
    onSuccess: (next) => {
      queryClient.setQueryData(['account'], next);
      setConfirming(false);
      setDone(true);
    },
    onError: () => setConfirming(false),
  });

  function errorText(): string | undefined {
    if (link.isError) return failureText(link.error, t('linkFailed'));
    if (!unlink.isError) return undefined;
    if (
      unlink.error instanceof AuthApiError &&
      classifyUnlinkFailure(unlink.error) === 'passwordRequired'
    ) {
      return t('unlinkPasswordRequired');
    }
    return failureText(unlink.error, t('unlinkFailed'));
  }
  const error = errorText();
  const unlinkable = canUnlinkGoogle(methods);

  return (
    <section className={styles.card} aria-labelledby="account-methods">
      <h2 id="account-methods" className={styles.cardTitle}>
        {t('title')}
      </h2>
      <p className={styles.muted}>{t('subtitle')}</p>
      {error && <Alert tone="error">{error}</Alert>}
      {done && !error && <Alert tone="success">{t('unlinkDone')}</Alert>}
      <ul className={styles.methodList}>
        {methods.password && (
          <li className={styles.method}>
            <span className={styles.methodMark}>
              <Icon icon={IconLock} size={20} />
            </span>
            <div className={styles.methodText}>
              <strong>{t('password')}</strong>
              <span className={styles.okState}>● {t('active')}</span>
            </div>
          </li>
        )}
        <li className={styles.method}>
          <span className={styles.methodMark}>
            <GoogleMark size={20} />
          </span>
          <div className={styles.methodText}>
            <strong>{t('google')}</strong>
            {methods.google ? (
              <span className={styles.okState}>
                ● {methods.password ? t('linked') : t('linkedAs', { email: account.email })}
              </span>
            ) : (
              <span className={styles.mutedState}>{t('notLinked')}</span>
            )}
          </div>
          {methods.google ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={!unlinkable || unlink.isPending}
              aria-describedby={unlinkable ? undefined : 'google-only-reason'}
              icon={<Icon icon={IconUnlink} size={16} />}
              onClick={() => setConfirming(true)}
            >
              {t('unlink')}
            </Button>
          ) : (
            <Button
              variant="secondary"
              size="sm"
              disabled={linkBusy}
              icon={<GoogleMark size={16} />}
              onClick={() => link.mutate()}
            >
              {linkBusy ? t('linking') : t('link')}
            </Button>
          )}
        </li>
      </ul>
      {methods.google && !unlinkable && (
        <p id="google-only-reason" className={styles.mutedSmall}>
          {t('unlinkOnlyMethod')}
        </p>
      )}
      <ConfirmDialog
        open={confirming}
        destructive
        icon={<Icon icon={IconUnlink} size={20} />}
        confirmIcon={<Icon icon={IconUnlink} size={16} />}
        closeLabel={tUi('close')}
        title={t('unlinkTitle')}
        confirmLabel={t('unlink')}
        cancelLabel={t('unlinkCancel')}
        onConfirm={() => unlink.mutate()}
        onCancel={() => setConfirming(false)}
      >
        <p>{t('unlinkText1')}</p>
        <p>{t('unlinkText2')}</p>
      </ConfirmDialog>
    </section>
  );
}
