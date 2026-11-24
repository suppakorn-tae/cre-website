'use client';

import { useTranslations } from 'next-intl';
import { useId, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

import { normaliseOtp, OTP_LENGTH } from './otp';
import styles from './register.module.css';

type Props = {
  value: string;
  onChange: (value: string) => void;
  label: string;
  invalid?: boolean;
  describedBy?: string;
  disabled?: boolean;
};

/** Six single-digit boxes. The value stays a compact digit string. */
export function OtpInput({ value, onChange, label, invalid, describedBy, disabled }: Props) {
  const t = useTranslations('auth.register.otp');
  const groupId = useId();
  const refs = useRef<(HTMLInputElement | null)[]>([]);

  const commit = (next: string) => {
    onChange(next);
    refs.current[Math.min(next.length, OTP_LENGTH - 1)]?.focus();
  };

  const onInput = (index: number, raw: string) => {
    const digits = normaliseOtp(raw);
    // An emptied box removes its digit; a typed or autofilled value replaces from here on.
    commit(digits ? (value.slice(0, index) + digits).slice(0, OTP_LENGTH) : value.slice(0, index));
  };

  const onKeyDown = (index: number, e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      e.preventDefault();
      commit(value.slice(0, index - 1) + value.slice(index));
    }
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus();
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus();
  };

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    commit(normaliseOtp(e.clipboardData.getData('text')));
  };

  return (
    <div role="group" aria-labelledby={`${groupId}-label`} className={styles.otp}>
      <span id={`${groupId}-label`} className={styles.srOnly}>
        {label}
      </span>
      {Array.from({ length: OTP_LENGTH }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            refs.current[i] = el;
          }}
          className={styles.otpBox}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={OTP_LENGTH}
          value={value[i] ?? ''}
          disabled={disabled}
          aria-label={t('digit', { n: i + 1 })}
          aria-invalid={invalid ? true : undefined}
          aria-describedby={describedBy}
          onChange={(e) => onInput(i, e.target.value)}
          onKeyDown={(e) => onKeyDown(i, e)}
          onPaste={onPaste}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}
