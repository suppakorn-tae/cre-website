'use client';

import { useTranslations } from 'next-intl';

import { Button, Skeleton } from '@/components/ui';

import { useAuditEntry } from './api';
import styles from './audit.module.css';

/** Pretty JSON of a stored value, or null when there is none. */
export function formatValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}

/** Old and new values of one entry, plus request id and address. Read-only. */
export function AuditDetail({ id }: { id: number }) {
  const t = useTranslations('admin-audit.detail');
  const entry = useAuditEntry(id, true);

  if (entry.isPending) {
    return (
      <div role="status" aria-label={t('loading')}>
        <Skeleton />
      </div>
    );
  }
  if (entry.isError) {
    return (
      <div className={styles.detailError} role="alert">
        <p>{t('failed')}</p>
        <Button variant="secondary" size="sm" onClick={() => entry.refetch()}>
          {t('retry')}
        </Button>
      </div>
    );
  }

  const { old_value, new_value, request_id, ip_address } = entry.data;
  const values = [
    { key: 'old', label: t('oldValue'), text: formatValue(old_value) },
    { key: 'new', label: t('newValue'), text: formatValue(new_value) },
  ];

  return (
    <div className={styles.detail}>
      <div className={styles.values}>
        {values.map((v) => (
          <section key={v.key} className={styles.valueBox}>
            <h3 className={styles.valueTitle}>{v.label}</h3>
            {v.text === null ? (
              <p className={styles.noValue}>{t('noValue')}</p>
            ) : (
              <pre className={styles.code}>{v.text}</pre>
            )}
          </section>
        ))}
      </div>
      <dl className={styles.meta}>
        <dt>{t('requestId')}</dt>
        <dd>{request_id}</dd>
        <dt>{t('ipAddress')}</dt>
        <dd>{ip_address ?? t('noValue')}</dd>
      </dl>
    </div>
  );
}
