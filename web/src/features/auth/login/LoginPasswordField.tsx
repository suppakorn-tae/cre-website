'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { PasswordInput } from '@/components/ui';
import styles from '@/features/auth/register/register.module.css';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Link shown on the label row, e.g. "forgot password". */
  aside?: React.ReactNode;
};

/** Password control for log in: lock icon, show/hide toggle, no rules or strength. */
export function LoginPasswordField({ label, value, onChange, aside }: Props) {
  const t = useTranslations('auth.login');
  const id = useId();
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <PasswordInput
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="current-password"
        required
        labels={{ show: t('showPassword'), hide: t('hidePassword') }}
      />
      {aside}
    </div>
  );
}
