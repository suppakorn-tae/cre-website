'use client';

import { IconPencil } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, Icon } from '@/components/ui';

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
  /** Called with the form-level message, or nothing when it is clear. */
  onFormError: (message?: string) => void;
  onEdit: () => void;
  onCancel: () => void;
  onSave: (values: RlValues) => void;
};

/** One indicator. Three-threshold indicators show only their own fields. */
export function RlRow({ row, name, editing, busy, onFormError, onEdit, onCancel, onSave }: Props) {
  const t = useTranslations('admin-thresholds.rl');
  const tField = useTranslations('admin-thresholds.field');
  const [draft, setDraft] = useState<Draft>(() => toDraft(row.thresholds));
  const [check, setCheck] = useState<Check>({ fields: {} });
  const code = row.indicator_code;
  const slots = activeSlots(row.thresholds);
  const inverse = row.direction === 'inverse';

  const messageOf = (found: Check) =>
    found.form
      ? found.form === 'pattern'
        ? t('errors.pattern', { code })
        : t(inverse ? 'errors.orderInverse' : 'errors.orderNormal', { code })
      : undefined;

  function change(slot: (typeof SLOTS)[number], value: string) {
    const next = { ...draft, [slot]: value };
    const found = checkRl(row.direction, parseDraft(next));
    setDraft(next);
    setCheck(found);
    onFormError(messageOf(found));
  }

  function save() {
    const parsed = parseDraft(draft);
    const found = checkRl(row.direction, parsed);
    setCheck(found);
    onFormError(messageOf(found));
    if (isClean(found)) onSave(parsed as RlValues);
  }

  function start() {
    setDraft(toDraft(row.thresholds));
    setCheck({ fields: {} });
    onFormError(undefined);
    onEdit();
  }

  return (
    <>
      <tr className={editing ? styles.editing : undefined}>
        <td data-label={t('columns.code')} className={styles.code}>
          {code}
        </td>
        <td data-label={t('columns.name')} className={styles.nameCell}>
          <span className={styles.truncate} title={name}>
            {name}
          </span>
          {editing && <span className={styles.editingLabel}>{t('editing', { code })}</span>}
        </td>
        <td data-label={t('columns.unit')} className={styles.unit}>
          <span className={`${styles.truncate} ${styles.unitText}`} title={row.unit}>
            {row.unit}
          </span>
        </td>
        <td data-label={t('columns.direction')} className={styles.direction}>
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
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onFormError(undefined);
                  onCancel();
                }}
                disabled={busy}
              >
                {t('cancel')}
              </Button>
              <Button size="sm" onClick={save} disabled={busy}>
                {t('save')}
              </Button>
            </>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className={styles.editButton}
              aria-label={t('editLabel', { code })}
              title={t('editLabel', { code })}
              onClick={start}
            >
              <Icon icon={IconPencil} size={18} />
            </Button>
          )}
        </td>
      </tr>
    </>
  );
}
