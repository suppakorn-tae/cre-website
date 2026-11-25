'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/components/ui';

import type { RlThreshold } from './api';
import styles from './thresholds.module.css';
import {
  activeSlots,
  checkRl,
  isClean,
  parseDraft,
  SLOTS,
  toDraft,
  type Check,
  type Draft,
  type RlValues,
} from './validation';

type Props = {
  row: RlThreshold;
  name: string;
  editing: boolean;
  busy: boolean;
  serverError?: string;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: RlValues) => void;
};

/** One indicator. Three-threshold indicators show only their own fields. */
export function RlRow({ row, name, editing, busy, serverError, onEdit, onCancel, onSave }: Props) {
  const t = useTranslations('admin-thresholds.rl');
  const tField = useTranslations('admin-thresholds.field');
  const [draft, setDraft] = useState<Draft>(() => toDraft(row.thresholds));
  const [check, setCheck] = useState<Check>({ fields: {} });
  const code = row.indicator_code;
  const slots = activeSlots(row.thresholds);
  const inverse = row.direction === 'inverse';

  function change(slot: (typeof SLOTS)[number], value: string) {
    const next = { ...draft, [slot]: value };
    setDraft(next);
    setCheck(checkRl(row.direction, parseDraft(next)));
  }

  function save() {
    const parsed = parseDraft(draft);
    const found = checkRl(row.direction, parsed);
    setCheck(found);
    if (isClean(found)) onSave(parsed as RlValues);
  }

  function start() {
    setDraft(toDraft(row.thresholds));
    setCheck({ fields: {} });
    onEdit();
  }

  const formError = check.form
    ? check.form === 'pattern'
      ? t('errors.pattern', { code })
      : t(inverse ? 'errors.orderInverse' : 'errors.orderNormal', { code })
    : serverError;

  return (
    <>
      <tr className={editing ? styles.editing : undefined}>
        <td data-label={t('columns.code')} className={styles.code}>
          {code}
        </td>
        <td data-label={t('columns.name')}>{name}</td>
        <td data-label={t('columns.unit')}>{row.unit}</td>
        <td data-label={t('columns.direction')}>
          <span className={inverse ? styles.inverse : styles.normal}>
            {t(`direction.${row.direction}`)}
          </span>
        </td>
        {SLOTS.map((s) => (
          <td key={s} data-label={s} className={styles.num} hidden={!slots.includes(s)}>
            {editing ? (
              <input
                className={styles.cell}
                inputMode="decimal"
                aria-label={t('inputLabel', { slot: s, code })}
                value={draft[s]}
                aria-invalid={check.fields[s] || check.form ? true : undefined}
                onChange={(e) => change(s, e.target.value)}
                disabled={busy}
              />
            ) : (
              (row.thresholds[s] ?? '')
            )}
            {editing && check.fields[s] && (
              <span className={styles.cellError} role="alert">
                {tField(check.fields[s])}
              </span>
            )}
          </td>
        ))}
        <td className={styles.actions}>
          {editing ? (
            <>
              <Button variant="secondary" size="sm" onClick={onCancel} disabled={busy}>
                {t('cancel')}
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {t('save')}
              </Button>
            </>
          ) : (
            <Button variant="ghost" size="sm" aria-label={t('editLabel', { code })} onClick={start}>
              {t('edit')}
            </Button>
          )}
        </td>
      </tr>
      {editing && formError && (
        <tr className={styles.errorRow}>
          <td colSpan={10}>
            <p className={styles.rowError} role="alert">
              {formError}
            </p>
          </td>
        </tr>
      )}
    </>
  );
}
