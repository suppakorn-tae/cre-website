'use client';

import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type FormEvent } from 'react';

import { Button, Input } from '@/components/ui';
import { AuthShell } from '@/features/auth/register/AuthShell';
import { RESEND_SECONDS } from '@/features/auth/register/countdown';
import { OTP_LENGTH } from '@/features/auth/register/otp';
import { OtpInput } from '@/features/auth/register/OtpInput';
import {
  confirmationState,
  MAX_PASSWORD_LENGTH,
  passwordRules,
  passwordStrength,
} from '@/features/auth/register/password';
import { PasswordField } from '@/features/auth/register/PasswordField';
import styles from '@/features/auth/register/register.module.css';
import { useCountdown } from '@/features/auth/register/useCountdown';
import extra from '@/features/auth/login/login.module.css';
import {
  AuthApiError,
  requestPasswordReset,
  resetPassword,
  type OtpChallenge,
} from '@/features/auth/login/api';
import { waitParts } from '@/features/auth/login/failure';
import { LOGIN_PATH } from '@/features/auth/login/paths';

import { classifyResetFailure, maskEmail } from './reset';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;

/** Forgot password: e-mail, then OTP and new password on one screen (UC-02 1c-1g). */
export function ForgotFlow() {
  const [step, setStep] = useState<{ email: string; challenge: OtpChallenge } | null>(null);
  return (
    <AuthShell>
      {step ? (
        <ResetStep
          email={step.email}
          challenge={step.challenge}
          onChallenge={(challenge) => setStep({ ...step, challenge })}
          onBack={() => setStep(null)}
        />
      ) : (
        <EmailStep onSent={(email, challenge) => setStep({ email, challenge })} />
      )}
    </AuthShell>
  );
}

function StepIndicator({ current }: { current: 1 | 2 }) {
  const t = useTranslations('auth.reset.steps');
  return (
    <ol className={extra.steps}>
      {([1, 2] as const).map((n) => (
        <li
          key={n}
          className={extra.stepItem}
          aria-current={n === current ? 'step' : undefined}
          data-done={n < current}
        >
          <span className={extra.stepDot} aria-hidden="true">
            {n}
          </span>
          {t(`step${n}`)}
        </li>
      ))}
    </ol>
  );
}

function useWaitText() {
  const t = useTranslations('auth.login.errors');
  const tCommon = useTranslations('common.errors');
  return (retryAfter?: number) => {
    if (!retryAfter) return tCommon('too_many_requests');
    const w = waitParts(retryAfter);
    return t(`waitIn.${w.unit}`, { value: w.value });
  };
}

function EmailStep({ onSent }: { onSent: (email: string, challenge: OtpChallenge) => void }) {
  const t = useTranslations('auth.reset.email');
  const tCommon = useTranslations('common.errors');
  const waitText = useWaitText();
  const [email, setEmail] = useState('');
  const [fieldError, setFieldError] = useState<string>();
  const [formError, setFormError] = useState<string>();

  const send = useMutation({
    mutationFn: () => requestPasswordReset(email.trim()),
    // The answer is the same for every e-mail, so always move on (neutral).
    onSuccess: (challenge) => onSent(email.trim(), challenge),
    onError: (error) => {
      if (error instanceof AuthApiError && error.status === 429) {
        setFormError(waitText(error.retryAfter));
      } else {
        setFormError(error instanceof TypeError ? tCommon('network') : tCommon('unknown'));
      }
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setFormError(undefined);
    const trimmed = email.trim();
    if (!trimmed) return setFieldError(t('errors.emailRequired'));
    if (!EMAIL_PATTERN.test(trimmed)) return setFieldError(t('errors.emailInvalid'));
    setFieldError(undefined);
    send.mutate();
  }

  return (
    <>
      <Link href={LOGIN_PATH} className={styles.link}>
        {t('back')}
      </Link>
      <StepIndicator current={1} />
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.subtitle}>{t('subtitle')}</p>
      {formError && (
        <p className={styles.alert} role="alert">
          {formError}
        </p>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <Input
          label={t('label')}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t('placeholder')}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            setFieldError(undefined);
          }}
          error={fieldError}
          required
        />
        <Button type="submit" size="lg" fullWidth disabled={send.isPending}>
          {send.isPending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </>
  );
}

type FormFailure =
  | { kind: 'incomplete' }
  | { kind: 'otp_bad' }
  | { kind: 'locked' }
  | { kind: 'form'; text: string };

function ResetStep({
  email,
  challenge,
  onChallenge,
  onBack,
}: {
  email: string;
  challenge: OtpChallenge;
  onChallenge: (challenge: OtpChallenge) => void;
  onBack: () => void;
}) {
  const t = useTranslations('auth.reset.form');
  const tReg = useTranslations('auth.register.form');
  const tCommon = useTranslations('common.errors');
  const router = useRouter();
  const waitText = useWaitText();
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [failure, setFailure] = useState<FormFailure | null>(null);
  const [passwordError, setPasswordError] = useState<string>();
  const [confirmError, setConfirmError] = useState<string>();
  const [resent, setResent] = useState(false);
  const { secondsLeft, start } = useCountdown();
  const first = useRef(true);

  useEffect(() => {
    start(challenge.resend_available_in_seconds);
    first.current = false;
  }, [challenge, start]);

  const rules = passwordRules(password);
  const strength = passwordStrength(password);
  const match = confirmationState(password, confirmation);

  const reset = useMutation({
    mutationFn: () =>
      resetPassword({
        email,
        otp: code,
        new_password: password,
        new_password_confirmation: confirmation,
      }),
    // Every session ended, so go back to log in (no cookie is set).
    onSuccess: () => router.replace(`${LOGIN_PATH}?reset=1`),
    onError: (error) => {
      if (!(error instanceof AuthApiError)) {
        setFailure({
          kind: 'form',
          text: error instanceof TypeError ? tCommon('network') : tCommon('unknown'),
        });
        return;
      }
      const result = classifyResetFailure(error);
      switch (result.kind) {
        case 'otp_bad':
          setCode('');
          setFailure({ kind: 'otp_bad' });
          break;
        case 'locked':
          setCode('');
          setFailure({ kind: 'locked' });
          break;
        case 'password_short':
          setPasswordError(t('errors.passwordTooShort'));
          break;
        case 'mismatch':
          setConfirmError(tReg('passwordsMismatch'));
          break;
        case 'rate_limited':
          setFailure({ kind: 'form', text: waitText(result.retryAfter) });
          break;
        default:
          setFailure({ kind: 'form', text: tCommon('unknown') });
      }
    },
  });

  const resend = useMutation({
    mutationFn: () => requestPasswordReset(email),
    onSuccess: (next) => {
      setCode('');
      setFailure(null);
      setResent(true);
      onChallenge(next);
    },
    onError: (error) => {
      if (error instanceof AuthApiError && error.status === 429) {
        start(error.retryAfter ?? RESEND_SECONDS);
        return;
      }
      setFailure({ kind: 'form', text: tCommon('unknown') });
    },
  });

  function submit(e: FormEvent) {
    e.preventDefault();
    setResent(false);
    setFailure(null);
    let ok = true;
    if (code.length < OTP_LENGTH) {
      setFailure({ kind: 'incomplete' });
      ok = false;
    }
    if (!rules.minLength) {
      setPasswordError(t('errors.passwordTooShort'));
      ok = false;
    } else if ([...password].length > MAX_PASSWORD_LENGTH) {
      setPasswordError(t('errors.passwordTooLong'));
      ok = false;
    }
    if (!confirmation) {
      setConfirmError(t('errors.confirmationRequired'));
      ok = false;
    } else if (match === 'mismatch') {
      setConfirmError(tReg('passwordsMismatch'));
      ok = false;
    }
    if (ok) reset.mutate();
  }

  const otpError =
    failure?.kind === 'incomplete'
      ? t('errors.incomplete')
      : failure?.kind === 'otp_bad'
        ? t('errors.otpBad')
        : failure?.kind === 'locked'
          ? t('errors.locked')
          : undefined;
  const canResend = secondsLeft === 0 && !resend.isPending;
  const minutes = Math.round(challenge.expires_in_seconds / 60);

  return (
    <>
      <Button variant="ghost" size="sm" className={styles.back} onClick={onBack}>
        {t('changeEmail')}
      </Button>
      <StepIndicator current={2} />
      <h1 className={styles.title}>{t('title')}</h1>
      <p className={styles.subtitle}>{t('subtitle', { email: maskEmail(email), minutes })}</p>
      {failure?.kind === 'form' && (
        <p className={styles.alert} role="alert">
          {failure.text}
        </p>
      )}
      <form className={styles.form} onSubmit={submit} noValidate>
        <div className={styles.field}>
          <span className={styles.label}>
            {t('otpLabel')}
            <span aria-hidden="true" className={styles.required}>
              *
            </span>
          </span>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              if (failure && failure.kind !== 'form') setFailure(null);
            }}
            label={t('otpLabel')}
            invalid={Boolean(otpError)}
            describedBy={otpError ? 'reset-otp-error' : undefined}
            disabled={reset.isPending}
          />
          {otpError && (
            <p id="reset-otp-error" className={styles.errorText} role="alert">
              {otpError}
            </p>
          )}
          {resent && !otpError && (
            <p className={styles.okText} role="status">
              {t('resent')}
            </p>
          )}
        </div>
        <p className={styles.resend}>
          {t('noCode')}{' '}
          {canResend ? (
            <Button variant="ghost" size="sm" onClick={() => resend.mutate()}>
              {t('resend')}
            </Button>
          ) : (
            <span aria-live="off">{t('resendWait', { seconds: secondsLeft })}</span>
          )}
        </p>
        <PasswordField
          label={t('newPassword')}
          autoComplete="new-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            setPasswordError(undefined);
            setConfirmError(undefined);
          }}
          error={passwordError}
        >
          <div className={styles.strength} data-level={strength.level}>
            <div className={styles.bars} aria-hidden="true">
              {[1, 2, 3, 4].map((n) => (
                <span key={n} className={styles.bar} data-on={n <= strength.bars} />
              ))}
            </div>
            <p className={styles.strengthText} aria-live="polite">
              {strength.level !== 'none' && (
                <>
                  {tReg('strengthLabel')} {tReg(`strength.${strength.level}`)}
                  {' · '}
                </>
              )}
              <span className={styles.rule} data-met={rules.minLength}>
                {tReg('ruleMinLength')}
              </span>
            </p>
          </div>
        </PasswordField>
        <PasswordField
          label={t('newPasswordConfirmation')}
          autoComplete="new-password"
          value={confirmation}
          onChange={(v) => {
            setConfirmation(v);
            setConfirmError(undefined);
          }}
          error={confirmError ?? (match === 'mismatch' ? tReg('passwordsMismatch') : undefined)}
          okText={match === 'match' ? tReg('passwordsMatch') : undefined}
        />
        <Button type="submit" size="lg" fullWidth disabled={reset.isPending}>
          {reset.isPending ? t('submitting') : t('submit')}
        </Button>
      </form>
    </>
  );
}
