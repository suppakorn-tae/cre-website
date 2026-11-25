'use client';

import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { FieldError } from '@/components/ui';

import { RETENTION_NOTICE_PATH, TERMS_PATH } from './google';
import styles from './register.module.css';

type Props = {
  retention: boolean;
  terms: boolean;
  onRetention: (value: boolean) => void;
  onTerms: (value: boolean) => void;
  retentionError?: ReactNode;
  termsError?: ReactNode;
};

/** The retention notice and the terms, each accepted on its own. */
export function ConsentCheckboxes({
  retention,
  terms,
  onRetention,
  onTerms,
  retentionError,
  termsError,
}: Props) {
  const t = useTranslations('auth.register.form');
  return (
    <fieldset className={styles.consents}>
      <div>
        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={retention}
            onChange={(e) => onRetention(e.target.checked)}
            aria-invalid={retentionError ? true : undefined}
          />
          <span>
            {t('acceptPrefix')}{' '}
            <a
              className={styles.link}
              href={RETENTION_NOTICE_PATH}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('retentionNotice')}
            </a>
          </span>
        </label>
        {retentionError && <FieldError>{retentionError}</FieldError>}
      </div>
      <div>
        <label className={styles.consent}>
          <input
            type="checkbox"
            checked={terms}
            onChange={(e) => onTerms(e.target.checked)}
            aria-invalid={termsError ? true : undefined}
          />
          <span>
            {t('acceptPrefix')}{' '}
            <a className={styles.link} href={TERMS_PATH} target="_blank" rel="noopener noreferrer">
              {t('terms')}
            </a>
          </span>
        </label>
        {termsError && <FieldError>{termsError}</FieldError>}
      </div>
    </fieldset>
  );
}
