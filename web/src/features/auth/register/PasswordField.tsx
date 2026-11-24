'use client';

import { useTranslations } from 'next-intl';
import { useId, useState, type ReactNode } from 'react';

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

/** Password control with a show/hide toggle. Always required on sign-up. */
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
  const [visible, setVisible] = useState(false);
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
      <div className={styles.controlWrap}>
        <input
          id={id}
          className={styles.control}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          maxLength={maxLength}
          required
          aria-invalid={error ? true : undefined}
          aria-describedby={hasMessage ? messageId : undefined}
          data-valid={okText ? 'true' : undefined}
        />
        <button
          type="button"
          className={styles.toggle}
          aria-pressed={visible}
          aria-label={visible ? t('hidePassword') : t('showPassword')}
          onClick={() => setVisible((v) => !v)}
        >
          {visible ? t('hideShort') : t('showShort')}
        </button>
      </div>
      {error && (
        <p id={messageId} className={styles.errorText} role="alert">
          {error}
        </p>
      )}
      {!error && okText && (
        <p id={messageId} className={styles.okText}>
          {okText}
        </p>
      )}
      {children}
    </div>
  );
}
