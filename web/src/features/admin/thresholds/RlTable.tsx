'use client';

import { IconAlertCircle } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';

import { Button, Icon, Input, Select, Toast } from '@/components/ui';

import { saveErrorKey, useIndicatorInfo, useRlThresholds, useUpdateRl } from './api';
import { RlRow } from './RlRow';
import styles from './thresholds.module.css';
import { SLOTS } from './validation';

/** RL thresholds of every indicator: filter, then edit one row at a time. */
export function RlTable() {
  const t = useTranslations('admin-thresholds');
  const list = useRlThresholds();
  const names = useIndicatorInfo();
  const update = useUpdateRl();
  const [editing, setEditing] = useState<string | null>(null);
  const [factor, setFactor] = useState('');
  const [q, setQ] = useState('');
  const [savedCode, setSavedCode] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | undefined>();

  const rows = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return (list.data ?? []).filter((r) => {
      const info = names.data?.info.get(r.indicator_code);
      if (factor && info?.factorCode !== factor) return false;
      return (
        !needle ||
        r.indicator_code.toLowerCase().includes(needle) ||
        (info?.name ?? '').toLowerCase().includes(needle)
      );
    });
  }, [list.data, names.data, factor, q]);

  if (list.isError) {
    return (
      <p className={styles.alert} role="alert">
        {t('loadFailed')}{' '}
        <Button variant="ghost" size="sm" onClick={() => list.refetch()}>
          {t('retry')}
        </Button>
      </p>
    );
  }
  if (!list.data)
    return (
      <p className={styles.muted} role="status">
        {t('loading')}
      </p>
    );

  const options = (names.data?.factors ?? []).map((d) => ({
    value: d.code,
    label: `${d.code} ${d.name}`,
  }));

  const serverError =
    editing && update.isError ? t(`save.${saveErrorKey(update.error)}`) : undefined;
  const bannerText = formError ?? serverError;

  return (
    <>
      <div className={styles.filters}>
        <Select
          label={t('rl.factor')}
          value={factor}
          placeholder={t('rl.allFactors')}
          options={options}
          onChange={(e) => setFactor(e.target.value)}
        />
        <Input
          label={t('rl.search')}
          type="search"
          placeholder={t('rl.search')}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      {savedCode && <Toast tone="success" title={t('rl.saved', { code: savedCode })} />}
      <div className={styles.tableCard}>
        <table className={styles.table} aria-label={t('rl.list')}>
          <thead>
            <tr>
              {(['code', 'name', 'unit', 'direction'] as const).map((c) => (
                <th
                  key={c}
                  scope="col"
                  className={c === 'direction' ? styles.direction : undefined}
                >
                  {t(`rl.columns.${c}`)}
                </th>
              ))}
              {SLOTS.map((s) => (
                <th key={s} scope="col" className={styles.num}>
                  {s}
                </th>
              ))}
              <th scope="col" aria-label={t('rl.columns.actions')} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RlRow
                key={row.indicator_code}
                row={row}
                name={names.data?.info.get(row.indicator_code)?.name ?? ''}
                editing={editing === row.indicator_code}
                busy={update.isPending}
                onFormError={setFormError}
                onEdit={() => {
                  update.reset();
                  setSavedCode(null);
                  setFormError(undefined);
                  setEditing(row.indicator_code);
                }}
                onCancel={() => setEditing(null)}
                onSave={(thresholds) =>
                  update.mutate(
                    { code: row.indicator_code, thresholds },
                    {
                      onSuccess: () => {
                        setEditing(null);
                        setSavedCode(row.indicator_code);
                      },
                    },
                  )
                }
              />
            ))}
          </tbody>
        </table>
        {rows.length === 0 && <p className={styles.empty}>{t('rl.empty')}</p>}
      </div>
      {editing && bannerText && (
        <p className={styles.banner} role="alert">
          <Icon icon={IconAlertCircle} size={20} />
          <span>{bannerText}</span>
        </p>
      )}
      <p className={styles.hint}>{t('rl.hint')}</p>
      <aside className={styles.notice}>
        <p className={styles.noticeTitle}>{t('notice.title')}</p>
        <p className={styles.noticeBody}>{t('notice.body')}</p>
      </aside>
      <p className={styles.muted}>
        {t('rl.count', { shown: rows.length, total: list.data.length })}
      </p>
    </>
  );
}
