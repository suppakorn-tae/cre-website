'use client';

import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import styles from '@/features/auth/register/register.module.css';

type Props = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  /** Link shown on the label row, e.g. "forgot password". */
  aside?: React.ReactNode;
};

/** Password control for log in: show/hide toggle, no rules or strength. */
export function LoginPasswordField({ label, value, onChange, aside }: Props) {
  const t = useTranslations('auth.login');
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <div className={styles.controlWrap}>
        <input
          id={id}
          className={styles.control}
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete="current-password"
          required
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
      {aside}
    </div>
  );
}
