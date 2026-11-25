'use client';

import { useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';

import { FieldError, FieldOk, PasswordInput } from '@/components/ui';

import styles from './register.module.css';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete: 'new-password';
  error?: ReactNode;
  /** Green border and text when the field is valid. */
  okText?: ReactNode;
  /** Extra content under the control, e.g. the strength bars. */
  children?: ReactNode;
  maxLength?: number;
};

/** Password control with a lock icon and a show/hide toggle. Always required on sign-up. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  error,
  okText,
  children,
  maxLength,
}: Props) {
  const t = useTranslations('auth.register.form');
  const id = useId();
  const messageId = `${id}-message`;
  const hasMessage = Boolean(error || okText);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
        <span aria-hidden="true" className={styles.required}>
          *
        </span>
      </label>
      <PasswordInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete={autoComplete}
        maxLength={maxLength}
        required
        aria-invalid={error ? true : undefined}
        aria-describedby={hasMessage ? messageId : undefined}
        valid={Boolean(okText) && !error}
        labels={{ show: t('showPassword'), hide: t('hidePassword') }}
      />
      {error && <FieldError id={messageId}>{error}</FieldError>}
      {!error && okText && <FieldOk id={messageId}>{okText}</FieldOk>}
      {children}
    </div>
  );
}
