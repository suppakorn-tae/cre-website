'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent } from 'react';

import { Button } from '@/components/ui';
import { LoginPasswordField } from '@/features/auth/login/LoginPasswordField';
import { confirmationState } from '@/features/auth/register/password';
import { PasswordField } from '@/features/auth/register/PasswordField';
import registerStyles from '@/features/auth/register/register.module.css';

import { classifyPasswordFailure, validatePasswordChange, type PasswordErrors } from './account';
import styles from './account.module.css';
import { accountApi, AuthApiError } from './api';
import { useFailureText } from './useFailureText';

/** Change password, for accounts that have one (UC-04 3, 4). */
export function PasswordSection() {
  const t = useTranslations('account.password');
  const tForm = useTranslations('auth.register.form');
  const failureText = useFailureText();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<PasswordErrors>({});
  const [banner, setBanner] = useState<string>();
  const [done, setDone] = useState(false);
  const match = confirmationState(next, confirmation);

  const change = useMutation({
    mutationFn: () =>
      accountApi.changePassword({
        current_password: current,
        new_password: next,
        new_password_confirmation: confirmation,
      }),
    onSuccess: () => {
      setCurrent('');
      setNext('');
      setConfirmation('');
      setDone(true);
    },
    onError: (error) => {
      if (!(error instanceof AuthApiError)) return setBanner(failureText(error));
      const failure = classifyPasswordFailure(error);
      if (failure.kind === 'fields') setErrors(failure.errors);
      else if (failure.kind === 'no_password') setBanner(t('errors.noPassword'));
      else setBanner(failureText(error));
    },
  });

  function clear(key: keyof PasswordErrors) {
    setErrors((e) => ({ ...e, [key]: undefined }));
    setDone(false);
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setBanner(undefined);
    setDone(false);
    const found = validatePasswordChange({ current, next, confirmation });
    setErrors(found);
    if (Object.keys(found).length === 0) change.mutate();
  }

  const message = (key: keyof PasswordErrors) =>
    errors[key] ? t(`errors.${errors[key]}`) : undefined;

  return (
    <section className={styles.card} aria-labelledby="account-password">
      <h2 id="account-password" className={styles.cardTitle}>
        {t('title')}
      </h2>
      {banner && (
        <p className={styles.alert} role="alert">
          {banner}
        </p>
      )}
      {done && (
        <p className={styles.success} role="status">
          {t('done')}
        </p>
      )}
      <form className={styles.stack} onSubmit={submit} noValidate>
        <LoginPasswordField
          label={t('current')}
          value={current}
          onChange={(v) => {
            setCurrent(v);
            clear('current');
          }}
          aside={
            message('current') && (
              <p className={registerStyles.errorText} role="alert">
                {message('current')}
              </p>
            )
          }
        />
        <div className={styles.pair}>
          <PasswordField
            label={t('next')}
            autoComplete="new-password"
            value={next}
            maxLength={128}
            onChange={(v) => {
              setNext(v);
              clear('next');
              clear('confirmation');
            }}
            error={message('next')}
          >
            {!errors.next && <p className={styles.mutedSmall}>{t('hint')}</p>}
          </PasswordField>
          <PasswordField
            label={t('confirmation')}
            autoComplete="new-password"
            value={confirmation}
            maxLength={128}
            onChange={(v) => {
              setConfirmation(v);
              clear('confirmation');
            }}
            error={
              message('confirmation') ??
              (match === 'mismatch' ? tForm('passwordsMismatch') : undefined)
            }
            okText={match === 'match' ? tForm('passwordsMatch') : undefined}
          />
        </div>
        <div className={styles.actions}>
          <Button type="submit" variant="secondary" disabled={change.isPending}>
            {change.isPending ? t('submitting') : t('submit')}
          </Button>
        </div>
      </form>
    </section>
  );
}
