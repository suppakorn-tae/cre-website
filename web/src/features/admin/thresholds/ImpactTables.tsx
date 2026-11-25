'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, Toast } from '@/components/ui';

import { saveErrorKey, useImpactTables, useUpdateImpact, type ImpactTables as Tables } from './api';
import styles from './thresholds.module.css';
import {
  checkImpact,
  isClean,
  parseDraft,
  SLOTS,
  toDraft,
  type Check,
  type Draft,
  type ImpactValues,
} from './validation';

type Key = 'ri_c' | 'ri_t';
const TABLES: { key: Key; text: 'ric' | 'rit' }[] = [
  { key: 'ri_c', text: 'ric' },
  { key: 'ri_t', text: 'rit' },
];

const draftsOf = (d: Tables): Record<Key, Draft> => ({
  ri_c: toDraft(d.ri_c.thresholds),
  ri_t: toDraft(d.ri_t.thresholds),
});

export function ImpactTables() {
  const query = useImpactTables();
  const t = useTranslations('admin-thresholds');
  if (query.isError) {
    return (
      <p className={styles.alert} role="alert">
        {t('loadFailed')}{' '}
        <Button variant="ghost" size="sm" onClick={() => query.refetch()}>
          {t('retry')}
        </Button>
      </p>
    );
  }
  if (!query.data)
    return (
      <p className={styles.muted} role="status">
        {t('loading')}
      </p>
    );
  return <ImpactForm stored={query.data} />;
}

/** RI_C and RI_T side by side, validated together and saved in one call. */
const sub = { sub: (chunks: React.ReactNode) => <sub>{chunks}</sub> };

export function ImpactForm({ stored }: { stored: Tables }) {
  const t = useTranslations('admin-thresholds.impact');
  const tNotice = useTranslations('admin-thresholds.notice');
  const tField = useTranslations('admin-thresholds.field');
  const tSave = useTranslations('admin-thresholds.save');
  const update = useUpdateImpact();
  const [drafts, setDrafts] = useState(() => draftsOf(stored));
  const [checks, setChecks] = useState<Record<Key, Check>>({
    ri_c: { fields: {} },
    ri_t: { fields: {} },
  });
  const [saved, setSaved] = useState(false);

  function change(key: Key, slot: (typeof SLOTS)[number], value: string) {
    const next = { ...drafts[key], [slot]: value };
    setDrafts({ ...drafts, [key]: next });
    setChecks({ ...checks, [key]: checkImpact(parseDraft(next)) });
    setSaved(false);
  }

  function reset() {
    setDrafts(draftsOf(stored));
    setChecks({ ri_c: { fields: {} }, ri_t: { fields: {} } });
    update.reset();
    setSaved(false);
  }

  function save() {
    const parsed = { ri_c: parseDraft(drafts.ri_c), ri_t: parseDraft(drafts.ri_t) };
    const found = { ri_c: checkImpact(parsed.ri_c), ri_t: checkImpact(parsed.ri_t) };
    setChecks(found);
    if (!isClean(found.ri_c) || !isClean(found.ri_t)) return;
    update.mutate(parsed as { ri_c: ImpactValues; ri_t: ImpactValues }, {
      onSuccess: (data) => {
        setDrafts(draftsOf(data));
        setSaved(true);
      },
    });
  }

  return (
    <form
      className={styles.impactForm}
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
      noValidate
    >
      <div className={styles.impactGrid}>
        {TABLES.map(({ key, text }) => (
          <section key={key} className={styles.impactCard} aria-labelledby={`impact-${key}`}>
            <h3 id={`impact-${key}`} className={styles.cardTitle}>
              {t.rich(`${text}.titleRich`, sub)}
            </h3>
            <table className={styles.impactTable}>
              <thead>
                <tr>
                  <th scope="col">{t('threshold')}</th>
                  <th scope="col">{t(`${text}.unit`)}</th>
                  <th scope="col">{t.rich(`${text}.scoreRich`, sub)}</th>
                </tr>
              </thead>
              <tbody>
                {SLOTS.map((s, i) => (
                  <tr key={s}>
                    <th scope="row">{s}</th>
                    <td>
                      <input
                        className={styles.cell}
                        inputMode="decimal"
                        aria-label={t('inputLabel', { slot: s, table: t(`${text}.title`) })}
                        value={drafts[key][s]}
                        aria-invalid={checks[key].fields[s] || checks[key].form ? true : undefined}
                        onChange={(e) => change(key, s, e.target.value)}
                        disabled={update.isPending}
                      />
                      {checks[key].fields[s] && (
                        <span className={styles.cellError} role="alert">
                          {tField(checks[key].fields[s])}
                        </span>
                      )}
                    </td>
                    <td>
                      <span className={styles.score}>{i + 1}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className={styles.muted}>{t('rule')}</p>
            {checks[key].form && (
              <p className={styles.rowError} role="alert">
                {t('orderError', { table: t(`${text}.title`) })}
              </p>
            )}
          </section>
        ))}
      </div>
      {update.isError && (
        <p className={styles.alert} role="alert">
          {tSave(saveErrorKey(update.error))}
        </p>
      )}
      {saved && <Toast tone="success" title={t('saved')} />}
      <aside className={styles.notice}>
        <p className={styles.noticeTitle}>{tNotice('title')}</p>
        <p className={styles.noticeBody}>{tNotice('body')}</p>
      </aside>
      <div className={styles.formActions}>
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? tSave('saving') : t('save')}
        </Button>
        <Button variant="secondary" onClick={reset} disabled={update.isPending}>
          {t('reset')}
        </Button>
      </div>
    </form>
  );
}
