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

export interface DiffRow {
  field: string | null;
  old: string | null;
  next: string | null;
  changed: boolean;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const cell = (v: unknown): string | null =>
  v === null || v === undefined ? null : typeof v === 'string' ? v : JSON.stringify(v);

/**
 * Lines up old and new values field by field. Two objects give one row per key
 * (old keys first); anything else gives one row without a field name.
 */
export function diffRows(oldValue: unknown, newValue: unknown): DiffRow[] {
  if ((isRecord(oldValue) || oldValue == null) && (isRecord(newValue) || newValue == null)) {
    const before = isRecord(oldValue) ? oldValue : {};
    const after = isRecord(newValue) ? newValue : {};
    const keys = [...Object.keys(before), ...Object.keys(after).filter((k) => !(k in before))];
    return keys.map((field) => {
      const old = cell(before[field]);
      const next = cell(after[field]);
      return { field, old, next, changed: old !== next };
    });
  }
  const old = cell(oldValue);
  const next = cell(newValue);
  return [{ field: null, old, next, changed: old !== next }];
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
  const rows = diffRows(old_value, new_value);

  return (
    <div className={styles.detail}>
      <section>
        <h3 className={styles.valueTitle}>{t('diffTitle')}</h3>
        {rows.length === 0 ? (
          <p className={styles.noValue}>{t('noValue')}</p>
        ) : (
          <div className={styles.diffScroll}>
            <table className={styles.diff}>
              <thead>
                <tr>
                  <th scope="col">{t('field')}</th>
                  <th scope="col">{t('oldValue')}</th>
                  <th scope="col">{t('newValue')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.field ?? i} data-changed={r.changed ? 'true' : undefined}>
                    <td>{r.field ?? t('value')}</td>
                    <td>{r.old ?? t('noValue')}</td>
                    <td className={r.changed ? styles.changed : undefined}>
                      {r.next ?? t('noValue')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <dl className={styles.meta}>
        <dt>{t('requestId')}</dt>
        <dd>{request_id}</dd>
        <dt>{t('ipAddress')}</dt>
        <dd>{ip_address ?? t('noValue')}</dd>
      </dl>
      <p className={styles.readOnly}>{t('readOnly')}</p>
    </div>
  );
}
