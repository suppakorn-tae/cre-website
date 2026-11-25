'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState, type FormEvent } from 'react';

import { Button, Input } from '@/components/ui';

import { buildRequest, useAdminUsers, type AdminUser, type ExportRequest } from './api';
import styles from './export.module.css';

const SEARCH_DELAY_MS = 300;

type Props = { pending: boolean; failed: boolean; onSubmit: (request: ExportRequest) => void };

/** Scope (all or chosen users), the deleted-data option and the submit button. */
export function ExportForm({ pending, failed, onSubmit }: Props) {
  const t = useTranslations('admin-export.form');
  const [scope, setScope] = useState<ExportRequest['scope']>('all');
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [chosen, setChosen] = useState<AdminUser[]>([]);
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [showError, setShowError] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setQ(text.trim()), SEARCH_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text]);

  const selecting = scope === 'selected';
  const users = useAdminUsers(q, selecting);
  const missing = selecting && chosen.length === 0;

  const toggle = (user: AdminUser) =>
    setChosen((prev) =>
      prev.some((u) => u.id === user.id) ? prev.filter((u) => u.id !== user.id) : [...prev, user],
    );

  function submit(event: FormEvent) {
    event.preventDefault();
    if (missing) {
      setShowError(true);
      return;
    }
    onSubmit(
      buildRequest(
        scope,
        chosen.map((u) => u.id),
        includeDeleted,
      ),
    );
  }

  return (
    <form className={styles.card} onSubmit={submit} noValidate>
      <h2 className={styles.cardTitle}>{t('heading')}</h2>
      <fieldset className={styles.fieldset}>
        <legend className={styles.legend}>{t('scopeLegend')}</legend>
        {(['all', 'selected'] as const).map((value) => (
          <label key={value} className={styles.choice}>
            <input
              type="radio"
              name="scope"
              checked={scope === value}
              onChange={() => setScope(value)}
            />
            {t(value === 'all' ? 'scopeAll' : 'scopeSelected')}
          </label>
        ))}
      </fieldset>

      {selecting && (
        <div className={styles.picker}>
          <Input
            label={t('searchLabel')}
            placeholder={t('searchPlaceholder')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            error={showError && missing ? t('selectedRequired') : undefined}
          />
          {chosen.length > 0 && (
            <ul className={styles.chips} aria-label={t('selectedLabel', { count: chosen.length })}>
              {chosen.map((u) => (
                <li key={u.id} className={styles.chip}>
                  {u.email}
                  <button
                    type="button"
                    aria-label={t('remove', { name: u.email ?? u.id })}
                    onClick={() => toggle(u)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {users.isPending && <p className={styles.muted}>{t('searching')}</p>}
          {users.isError && <p role="alert">{t('usersFailed')}</p>}
          {users.data && users.data.items.length === 0 && (
            <p className={styles.muted}>{t('noUsers')}</p>
          )}
          <ul className={styles.userList}>
            {users.data?.items.map((u) => (
              <li key={u.id}>
                <label className={styles.choice}>
                  <input
                    type="checkbox"
                    checked={chosen.some((c) => c.id === u.id)}
                    onChange={() => toggle(u)}
                  />
                  <span>
                    {u.email}
                    <span className={styles.muted}> · {u.organisation ?? t('noOrganisation')}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}

      <label className={styles.choice}>
        <input
          type="checkbox"
          checked={includeDeleted}
          onChange={(e) => setIncludeDeleted(e.target.checked)}
        />
        {t('includeDeleted')}
      </label>

      <p className={styles.muted}>{t('format')}</p>
      {failed && <p role="alert">{t('failed')}</p>}
      <Button type="submit" disabled={pending}>
        {pending ? t('submitting') : t('submit')}
      </Button>
    </form>
  );
}
