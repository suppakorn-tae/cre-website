'use client';

import { IconArrowLeft, IconBuilding, IconMail } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type FormEvent, type ReactNode } from 'react';

import { Alert, Button, Icon, Input } from '@/components/ui';

import { AuthApiError, startRegistration, type OtpChallenge } from './api';
import { ConsentCheckboxes } from './ConsentCheckboxes';
import { LOGIN_PATH } from './google';
import {
  confirmationState,
  MAX_PASSWORD_LENGTH,
  passwordRules,
  passwordStrength,
} from './password';
import { PasswordField } from './PasswordField';
import styles from './register.module.css';

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+$/;
const MAX_ORGANISATION = 200;

type Errors = Partial<
  Record<
    'email' | 'password' | 'confirmation' | 'organisation' | 'retention' | 'terms' | 'form',
    string
  >
>;

type Props = {
  onBack: () => void;
  onSent: (email: string, challenge: OtpChallenge) => void;
  initialEmail?: string;
};

/** Step 2: e-mail, password, optional organisation, notice and terms. */
export function SignupForm({ onBack, onSent, initialEmail = '' }: Props) {
  const t = useTranslations('auth.register');
  const tCommon = useTranslations('common.errors');
  const tUi = useTranslations('ui');
  const [email, setEmail] = useState(initialEmail);
  const [organisation, setOrganisation] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [retention, setRetention] = useState(false);
  const [terms, setTerms] = useState(false);
  const [errors, setErrors] = useState<Errors>({});

  const rules = passwordRules(password);
  const strength = passwordStrength(password);
  const match = confirmationState(password, confirmation);

  const start = useMutation({
    mutationFn: () =>
      startRegistration({
        email: email.trim(),
        password,
        password_confirmation: confirmation,
        organisation: organisation.trim() || undefined,
        retention_accepted: retention,
        terms_accepted: terms,
      }),
    onSuccess: (challenge) => onSent(email.trim(), challenge),
    onError: (error) => setErrors(fromServer(error)),
  });

  function fromServer(error: unknown): Errors {
    if (!(error instanceof AuthApiError)) {
      return { form: error instanceof TypeError ? tCommon('network') : tCommon('unknown') };
    }
    if (error.code === 'email_taken') return { email: 'email_taken' };
    if (error.status === 429) {
      return {
        form: error.retryAfter
          ? t('form.errors.cooldown', { seconds: error.retryAfter })
          : tCommon('too_many_requests'),
      };
    }
    const out: Errors = {};
    const map: Record<string, [keyof Errors, string]> = {
      '/email': ['email', 'emailInvalid'],
      '/password': ['password', 'passwordTooShort'],
      '/password_confirmation': ['confirmation', 'passwordsMismatch'],
      '/retention_accepted': ['retention', 'retentionNotAccepted'],
      '/terms_accepted': ['terms', 'termsNotAccepted'],
    };
    for (const field of Object.keys(error.fields)) {
      const hit = map[field];
      if (hit) out[hit[0]] = hit[1];
    }
    if (Object.keys(out).length === 0) out.form = tCommon('validation_failed');
    return out;
  }

  function validate(): Errors {
    const out: Errors = {};
    if (!email.trim()) out.email = 'emailRequired';
    else if (!EMAIL_PATTERN.test(email.trim())) out.email = 'emailInvalid';
    if (!rules.minLength) out.password = 'passwordTooShort';
    else if ([...password].length > MAX_PASSWORD_LENGTH) out.password = 'passwordTooLong';
    if (!confirmation) out.confirmation = 'confirmationRequired';
    else if (match === 'mismatch') out.confirmation = 'passwordsMismatch';
    if (organisation.trim().length > MAX_ORGANISATION) out.organisation = 'organisationTooLong';
    if (!retention) out.retention = 'retentionNotAccepted';
    if (!terms) out.terms = 'termsNotAccepted';
    return out;
  }

  /** Drops the error of a field as soon as the user edits it. */
  const clear = (...keys: (keyof Errors)[]) =>
    setErrors((prev) => {
      const next = { ...prev };
      for (const key of keys) delete next[key];
      return next;
    });

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length === 0) start.mutate();
  }

  const message = (key?: string): ReactNode => {
    if (!key) return undefined;
    if (key === 'email_taken') {
      return t.rich('form.errors.emailTaken', {
        login: (chunks) => (
          <Link href={LOGIN_PATH} className={styles.link}>
            {chunks}
          </Link>
        ),
      });
    }
    if (key === 'passwordsMismatch') return t('form.passwordsMismatch');
    return t(`form.errors.${key}`);
  };

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className={styles.back}
        icon={<Icon icon={IconArrowLeft} size={16} />}
        onClick={onBack}
      >
        {t('form.back')}
      </Button>
      <h1 className={styles.title}>{t('form.title')}</h1>
      <p className={styles.subtitle}>{t('form.subtitle')}</p>
      <form className={styles.form} onSubmit={submit} noValidate>
        {errors.form && <Alert tone="error">{errors.form}</Alert>}
        <Input
          label={t('form.email')}
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder={t('form.emailPlaceholder')}
          icon={IconMail}
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            clear('email', 'form');
          }}
          error={message(errors.email)}
          required
        />
        <Input
          label={t('form.organisation')}
          optionalLabel={tUi('optional')}
          autoComplete="organization"
          placeholder={t('form.organisationPlaceholder')}
          icon={IconBuilding}
          value={organisation}
          onChange={(e) => {
            setOrganisation(e.target.value);
            clear('organisation');
          }}
          error={message(errors.organisation)}
        />
        <PasswordField
          label={t('form.password')}
          autoComplete="new-password"
          value={password}
          onChange={(v) => {
            setPassword(v);
            clear('password', 'confirmation');
          }}
          error={message(errors.password)}
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
                  {t('form.strengthLabel')} {t(`form.strength.${strength.level}`)}
                  {' · '}
                </>
              )}
              <span className={styles.rule} data-met={rules.minLength}>
                {t('form.ruleMinLength')}
                <span className={styles.srOnly}>
                  {' '}
                  {rules.minLength ? t('form.ruleMet') : t('form.ruleNotMet')}
                </span>
              </span>
            </p>
          </div>
        </PasswordField>
        <PasswordField
          label={t('form.passwordConfirmation')}
          autoComplete="new-password"
          value={confirmation}
          onChange={(v) => {
            setConfirmation(v);
            clear('confirmation');
          }}
          error={
            errors.confirmation
              ? message(errors.confirmation)
              : match === 'mismatch'
                ? t('form.passwordsMismatch')
                : undefined
          }
          okText={match === 'match' ? t('form.passwordsMatch') : undefined}
        />
        <ConsentCheckboxes
          retention={retention}
          terms={terms}
          onRetention={(v) => {
            setRetention(v);
            clear('retention');
          }}
          onTerms={(v) => {
            setTerms(v);
            clear('terms');
          }}
          retentionError={message(errors.retention)}
          termsError={message(errors.terms)}
        />
        <Button type="submit" size="lg" fullWidth disabled={start.isPending}>
          {start.isPending ? t('form.submitting') : t('form.submit')}
        </Button>
      </form>
      <p className={styles.switch}>
        {t('haveAccount')}{' '}
        <Link href={LOGIN_PATH} className={styles.link}>
          {t('login')}
        </Link>
      </p>
    </>
  );
}
