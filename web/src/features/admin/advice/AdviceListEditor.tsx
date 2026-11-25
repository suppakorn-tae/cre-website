'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { Button, Toast } from '@/components/ui';
import { FieldMessage } from '@/components/ui/Field';
import { errorToToast } from '@/lib/api/errors';
import { formatDate } from '@/lib/format/locale';

import styles from './advice.module.css';
import { useReplaceList } from './api';
import { Notation } from './Notation';
import {
  MAX_ITEMS,
  addItem,
  canAdd,
  canRemove,
  draftFrom,
  isDirty,
  moveItem,
  removeItem,
  toItems,
  updateItem,
  validate,
  type AdviceItems,
  type AdviceList,
  type Draft,
} from './rules';

type Props = {
  code: string;
  list: AdviceList;
  saved: AdviceItems;
  updatedAt: string;
  /** E-mail of the last editor; null when the list was never edited. */
  updatedBy?: string | null;
  /** Unsaved edits kept by the page, so they survive switching tab or indicator. */
  draft: Draft | undefined;
  onDraft: (draft: Draft | undefined) => void;
};

type Focus = { id: number; dir: 'up' | 'down' };

/** One advice list: add, edit, remove, reorder (buttons or drag), save and cancel. */
export function AdviceListEditor({ code, list, saved, updatedAt, updatedBy, draft, onDraft }: Props) {
  const t = useTranslations('admin-advice.list');
  const tRoot = useTranslations();
  const replace = useReplaceList(code);
  const rows = draft ?? draftFrom(saved);
  const [attempted, setAttempted] = useState(false);
  const [announce, setAnnounce] = useState('');
  const [notice, setNotice] = useState<'saved' | 'failed' | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const focusAfter = useRef<Focus | null>(null);
  const root = useRef<HTMLDivElement>(null);

  const errors = attempted ? validate(rows) : {};
  const invalid = Object.keys(errors).length > 0;
  const dirty = isDirty(saved, rows);

  // After a button move the row is re-inserted; put focus back on the same button.
  useEffect(() => {
    const target = focusAfter.current;
    if (!target) return;
    focusAfter.current = null;
    const pick = (dir: string) =>
      root.current?.querySelector<HTMLButtonElement>(`[data-move="${target.id}-${dir}"]`);
    const same = pick(target.dir);
    (same && !same.disabled ? same : pick(target.dir === 'up' ? 'down' : 'up'))?.focus();
  });

  function edit(next: Draft) {
    setNotice(null);
    setFailure(null);
    onDraft(next);
  }

  function move(from: number, to: number, focus?: Focus) {
    const next = moveItem(rows, from, to);
    if (next === rows) return;
    focusAfter.current = focus ?? null;
    setAnnounce(t('moved', { n: to + 1, total: rows.length }));
    edit(next);
  }

  function reset() {
    setAttempted(false);
    setNotice(null);
    setFailure(null);
    onDraft(undefined);
  }

  function save() {
    setNotice(null);
    setFailure(null);
    setAttempted(true);
    if (Object.keys(validate(rows)).length > 0) return;
    replace.mutate(
      { list, items: toItems(rows) },
      {
        onSuccess: () => {
          setAttempted(false);
          onDraft(undefined);
          setNotice('saved');
        },
        onError: (error) => {
          setFailure(tRoot(errorToToast(error).messageKey));
          setNotice('failed');
        },
      },
    );
  }

  return (
    <div ref={root} className={styles.editor}>
      <div className={styles.listHead}>
        <h2 className={styles.listTitle}>
          {t(list)} (<Notation list={list} />) · {code}
        </h2>
        <span className={styles.count}>{t('count', { n: rows.length, max: MAX_ITEMS })}</span>
      </div>
      <p className={styles.hint}>{t('hint')}</p>

      <ol className={styles.items}>
        {rows.map((row, index) => {
          const n = index + 1;
          const fieldId = `advice-${list}-${row.id}`;
          return (
            <li
              key={row.id}
              className={styles.item}
              data-dragging={dragFrom === index || undefined}
              onDragOver={(e) => dragFrom !== null && e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragFrom !== null) move(dragFrom, index);
                setDragFrom(null);
              }}
            >
              <span className={styles.number} aria-hidden="true">
                {n}
              </span>
              <div className={styles.itemBody}>
                <label htmlFor={fieldId} className={styles.itemLabel}>
                  {t('itemLabel')}
                  <span className={styles.required} aria-hidden="true">
                    *
                  </span>
                  <span className={styles.srOnly}> {n}</span>
                </label>
                <textarea
                  id={fieldId}
                  className={styles.textarea}
                  rows={2}
                  required
                  value={row.text}
                  placeholder={t('itemPlaceholder')}
                  aria-invalid={errors[row.id] ? true : undefined}
                  aria-describedby={errors[row.id] ? `${fieldId}-error` : undefined}
                  onChange={(e) => edit(updateItem(rows, row.id, e.target.value))}
                />
                <FieldMessage id={fieldId} error={errors[row.id] ? t('itemRequired') : undefined} />
              </div>
              <div className={styles.tools}>
                <span
                  className={styles.handle}
                  draggable
                  role="img"
                  aria-label={t('dragHandle', { n })}
                  onDragStart={(e) => {
                    setDragFrom(index);
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', String(index));
                    const li = e.currentTarget.closest('li');
                    if (li) e.dataTransfer.setDragImage(li, 16, 16);
                  }}
                  onDragEnd={() => setDragFrom(null)}
                >
                  ⠿
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  data-move={`${row.id}-up`}
                  aria-label={t('moveUp', { n })}
                  disabled={index === 0}
                  onClick={() => move(index, index - 1, { id: row.id, dir: 'up' })}
                >
                  <span aria-hidden="true">↑</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  data-move={`${row.id}-down`}
                  aria-label={t('moveDown', { n })}
                  disabled={index === rows.length - 1}
                  onClick={() => move(index, index + 1, { id: row.id, dir: 'down' })}
                >
                  <span aria-hidden="true">↓</span>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={t('remove', { n })}
                  title={canRemove(rows) ? undefined : t('removeDisabled')}
                  disabled={!canRemove(rows)}
                  onClick={() => edit(removeItem(rows, row.id))}
                >
                  <span aria-hidden="true">✕</span>
                </Button>
              </div>
            </li>
          );
        })}
      </ol>
      <p className={styles.srOnly} role="status" aria-live="polite">
        {announce}
      </p>

      <Button
        variant="secondary"
        disabled={!canAdd(rows)}
        title={canAdd(rows) ? undefined : t('addDisabled')}
        onClick={() => edit(addItem(rows))}
      >
        {canAdd(rows) ? t('add', { n: MAX_ITEMS - rows.length }) : t('addDisabled')}
      </Button>

      {attempted && invalid && (
        <div className={styles.banner} role="alert">
          <p className={styles.bannerTitle}>{t('invalidTitle')}</p>
          <p>{t('invalidBody')}</p>
        </div>
      )}
      {notice === 'failed' && (
        <div className={styles.notice}>
          <Toast
            tone="error"
            title={t('failedTitle')}
            description={failure}
            closeLabel={t('dismiss')}
            onClose={() => setNotice(null)}
          />
        </div>
      )}
      {notice === 'saved' && (
        <div className={styles.notice}>
          <Toast title={t('saved')} closeLabel={t('dismiss')} onClose={() => setNotice(null)} />
        </div>
      )}

      <div className={styles.footer}>
        <p className={styles.updated}>{updatedBy
            ? t('updatedBy', { email: updatedBy, date: formatDate(updatedAt) })
            : t('updatedAt', { date: formatDate(updatedAt) })}</p>
        <div className={styles.actions}>
          <Button variant="secondary" disabled={!dirty || replace.isPending} onClick={reset}>
            {t('cancel')}
          </Button>
          <Button disabled={!dirty || replace.isPending} onClick={save}>
            {replace.isPending ? t('saving') : t('save')}
          </Button>
        </div>
      </div>
    </div>
  );
}
