'use client';

import { IconArrowLeft } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button, FieldError, FieldOk, Icon } from '@/components/ui';

import {
  AuthApiError,
  refreshCsrf,
  resendRegistrationOtp,
  verifyRegistration,
  type OtpChallenge,
} from './api';
import { AFTER_SIGNUP_PATH, LOGIN_PATH } from './google';
import { classifyOtpFailure, OTP_LENGTH, type OtpFailure } from './otp';
import { OtpInput } from './OtpInput';
import styles from './register.module.css';
import { RESEND_SECONDS } from './countdown';
import { useCountdown } from './useCountdown';

type Props = {
  email: string;
  challenge: OtpChallenge;
  onBack: () => void;
};

/** Step 3: the 6-digit code, with resend and the error states. */
export function OtpStep({ email, challenge, onBack }: Props) {
  const t = useTranslations('auth.register');
  const tCommon = useTranslations('common.errors');
  const router = useRouter();
  const [code, setCode] = useState('');
  const [failure, setFailure] = useState<OtpFailure | { kind: 'incomplete' } | null>(null);
  const [resent, setResent] = useState(false);
  const wrongTries = useRef(0);
  const { secondsLeft, start } = useCountdown();

  useEffect(() => {
    start(challenge.resend_available_in_seconds);
  }, [challenge, start]);

  const verify = useMutation({
    mutationFn: () => verifyRegistration(email, code),
    onSuccess: async () => {
      await refreshCsrf();
      router.replace(AFTER_SIGNUP_PATH);
    },
    onError: (error) => {
      if (!(error instanceof AuthApiError)) {
        setFailure({ kind: 'other' });
        return;
      }
      if (error.fields['/otp'] === 'otp_invalid') wrongTries.current += 1;
      const result = classifyOtpFailure(error, wrongTries.current);
      setFailure(result);
      if (result.kind === 'wrong' || result.kind === 'expired' || result.kind === 'locked') {
        setCode('');
      }
    },
  });

  const resend = useMutation({
    mutationFn: () => resendRegistrationOtp(email),
    onSuccess: (next) => {
      wrongTries.current = 0;
      setCode('');
      setFailure(null);
      setResent(true);
      start(next.resend_available_in_seconds);
    },
    onError: (error) => {
      if (error instanceof AuthApiError && error.status === 429) {
        start(error.retryAfter ?? RESEND_SECONDS);
        return;
      }
      setFailure(
        error instanceof AuthApiError && error.code === 'no_pending_signup'
          ? { kind: 'no_pending' }
          : { kind: 'other' },
      );
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setResent(false);
    if (code.length < OTP_LENGTH) {
      setFailure({ kind: 'incomplete' });
      return;
    }
    setFailure(null);
    verify.mutate();
  }

  const errorText = failureText(failure);
  const errorId = 'otp-error';
  const canResend = secondsLeft === 0 && !resend.isPending;

  function failureText(f: typeof failure) {
    if (!f) return null;
    switch (f.kind) {
      case 'incomplete':
        return t('otp.errors.incomplete');
      case 'wrong':
        return t('otp.errors.wrong', { remaining: f.remaining });
      case 'expired':
        return t('otp.errors.expired');
      case 'locked':
        return t('otp.errors.locked');
      case 'no_pending':
        return t('otp.errors.noPending');
      case 'email_taken':
        return t.rich('otp.errors.emailTaken', {
          login: (chunks) => (
            <Link href={LOGIN_PATH} className={styles.link}>
              {chunks}
            </Link>
          ),
        });
      case 'rate_limited':
        return tCommon('too_many_requests');
      default:
        return tCommon('unknown');
    }
  }

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={styles.back}
        icon={<Icon icon={IconArrowLeft} size={16} />}
        onClick={onBack}
      >
        {t('otp.back')}
      </Button>
      <h1 className={styles.title}>{t('otp.title')}</h1>
      <p className={styles.subtitle}>
        {t('otp.subtitle', { email, minutes: Math.round(challenge.expires_in_seconds / 60) })}
      </p>
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <span className={styles.label}>
            {t('otp.label')}
            <span aria-hidden="true" className={styles.required}>
              *
            </span>
          </span>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (failure?.kind === 'incomplete') setFailure(null);
            }}
            label={t('otp.label')}
            invalid={Boolean(errorText)}
            describedBy={errorText ? errorId : undefined}
            disabled={verify.isPending}
          />
          {errorText && <FieldError id={errorId}>{errorText}</FieldError>}
          {resent && !errorText && <FieldOk>{t('otp.resent')}</FieldOk>}
        </div>
        <p className={styles.resend}>
          {t('otp.noCode')}{' '}
          {canResend ? (
            <Button variant="ghost" size="sm" onClick={() => resend.mutate()}>
              {t('otp.resend')}
            </Button>
          ) : (
            <span aria-live="off">{t('otp.resendWait', { seconds: secondsLeft })}</span>
          )}
        </p>
        <Button type="submit" size="lg" fullWidth disabled={verify.isPending}>
          {verify.isPending ? t('otp.submitting') : t('otp.submit')}
        </Button>
      </form>
    </>
  );
}
