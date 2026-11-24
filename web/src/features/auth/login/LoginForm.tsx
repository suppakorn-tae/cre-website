'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { Button, Input } from '@/components/ui';
import { AuthShell } from '@/features/auth/register/AuthShell';
import styles from '@/features/auth/register/register.module.css';

import { AuthApiError, login, refreshCsrf, startGoogleLogin } from './api';
import { classifyLoginFailure, waitParts, type LoginFailure } from './failure';
import { LoginPasswordField } from './LoginPasswordField';
import extra from './login.module.css';
import { AFTER_LOGIN_PATH, FORGOT_PATH, loginReturnView, REGISTER_PATH } from './paths';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

/** Log in with e-mail and password or Google (UC-02). */
export function LoginForm() {
  const t = useTranslations('auth.login');
  const tCommon = useTranslations('common.errors');
  const router = useRouter();
  const params = useSearchParams();
  const view = loginReturnView(params.get('result'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [keep, setKeep] = useState(false);
  const [emailError, setEmailError] = useState<string>();
  const [failure, setFailure] = useState<LoginFailure | { kind: 'network' } | null>(null);

  useEffect(() => {
    if (view.kind === 'redirect') router.replace(AFTER_LOGIN_PATH);
  }, [view.kind, router]);

  const submitLogin = useMutation({
    mutationFn: () => login({ email: email.trim(), password, keep_logged_in: keep }),
    onSuccess: async () => {
      await refreshCsrf();
      router.replace(AFTER_LOGIN_PATH);
    },
    onError: (error) =>
      setFailure(
        error instanceof AuthApiError
          ? classifyLoginFailure(error)
          : error instanceof TypeError
            ? { kind: 'network' }
            : { kind: 'other' },
      ),
  });

  const google = useMutation({
    mutationFn: startGoogleLogin,
    onSuccess: (url) => window.location.assign(url),
  });
  const googleBusy = google.isPending || google.isSuccess;

  function submit(e: FormEvent) {
    e.preventDefault();
    setFailure(null);
    const trimmed = email.trim();
    if (!trimmed) {
      setEmailError(t('errors.emailRequired'));
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setEmailError(t('errors.emailInvalid'));
      return;
    }
    setEmailError(undefined);
    submitLogin.mutate();
  }

  function banner() {
    if (failure) {
      switch (failure.kind) {
        case 'invalid':
          return { title: t('errors.invalidTitle'), text: t('errors.invalidText') };
        case 'unavailable':
          return { title: t('errors.unavailableTitle'), text: t('errors.unavailableText') };
        case 'rate_limited': {
          const text = failure.retryAfter
            ? (() => {
                const w = waitParts(failure.retryAfter);
                return t(`errors.waitIn.${w.unit}`, { value: w.value });
              })()
            : t('errors.tooManyText');
          return { title: t('errors.tooManyTitle'), text };
        }
        case 'network':
          return { text: tCommon('network') };
        default:
          return { text: tCommon('unknown') };
      }
    }
    if (google.isError) return { text: t('errors.googleFailed') };
    if (view.kind === 'message') {
      if (view.key === 'noAccount') return { title: t('result.noAccountTitle'), noAccount: true };
      return { text: t(`result.${view.key}`) };
    }
    return null;
  }
  const alert = banner();
  const loggedOut = params.get('logged_out') === '1';
  const resetDone = params.get('reset') === '1';

  return (
    <AuthShell>
      {loggedOut && !alert && (
        <p className={styles.success} role="status">
          {t('loggedOut')}
        </p>
      )}
      {resetDone && !alert && (
        <p className={styles.success} role="status">
          {t('resetDone')}
        </p>
      )}
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.subtitle}>{t('subtitle')}</p>
      {alert && (
        <div className={styles.alert} role="alert">
          {'title' in alert && alert.title && <strong>{alert.title}</strong>}
          {'text' in alert && alert.text && <p className={extra.alertText}>{alert.text}</p>}
          {'noAccount' in alert && (
            <p className={extra.alertText}>
              {t('result.noAccountText')}{' '}
              <Link href={REGISTER_PATH} className={styles.link}>
                {t('register')}
              </Link>
            </p>
          )}
        </div>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <Input
          label={t('email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t('emailPlaceholder')}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setEmailError(undefined);
          }}
          error={emailError}
          required
        />
        <LoginPasswordField label={t('password')} value={password} onChange={setPassword} />
        <div className={extra.rowBetween}>
          <label className={extra.consentRow}>
            <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
            <span>{t('keepLoggedIn')}</span>
          </label>
          <Link href={FORGOT_PATH} className={styles.link}>
            {t('forgot')}
          </Link>
        </div>
        <Button type="submit" size="lg" fullWidth disabled={submitLogin.isPending}>
          {submitLogin.isPending ? t('submitting') : t('submit')}
        </Button>
      </form>
      <p className={styles.divider}>{t('or')}</p>
      <Button
        variant="secondary"
        size="lg"
        fullWidth
        disabled={googleBusy}
        onClick={() => google.mutate()}
      >
        {googleBusy ? t('googleLoading') : t('google')}
      </Button>
      <p className={styles.switch}>
        {t('noAccount')}{' '}
        <Link href={REGISTER_PATH} className={styles.link}>
          {t('register')}
        </Link>
      </p>
    </AuthShell>
  );
}
