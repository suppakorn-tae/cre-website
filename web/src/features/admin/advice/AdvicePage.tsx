'use client';

import { useTranslations } from 'next-intl';
import { useRef, useState, type KeyboardEvent } from 'react';

import { Button, EmptyState, Skeleton } from '@/components/ui';

import styles from './advice.module.css';
import { useAdvice, useIndicatorCatalogue } from './api';
import { AdviceListEditor } from './AdviceListEditor';
import { AdviceMocks } from './AdviceMocks';
import { IndicatorPicker } from './IndicatorPicker';
import { Notation } from './Notation';
import { LISTS, type AdviceList, type Draft } from './rules';

const tabId = (l: AdviceList) => `advice-tab-${l}`;
const panelId = (l: AdviceList) => `advice-panel-${l}`;

/** Admin screen to edit the four advice lists of any indicator. */
export function AdvicePage({ initialCode }: { initialCode?: string }) {
  return (
    <AdviceMocks>
      <Screen initialCode={initialCode} />
    </AdviceMocks>
  );
}

function Screen({ initialCode }: { initialCode?: string }) {
  const t = useTranslations('admin-advice');
  const catalogue = useIndicatorCatalogue();
  const [picked, setPicked] = useState<string | null>(initialCode ?? null);
  // Unsaved edits, kept per indicator and list so switching never loses them.
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});

  const indicators = catalogue.data?.indicators ?? [];
  const code = picked ?? indicators[0]?.code ?? null;

  function setDraft(key: string, draft: Draft | undefined) {
    setDrafts((prev) => {
      const next = { ...prev };
      if (draft) next[key] = draft;
      else delete next[key];
      return next;
    });
  }

  return (
    <>
      <header className={styles.pageHead}>
        <h1 className={styles.title}>{t('title')}</h1>
        <p className={styles.subtitle}>{t('subtitle')}</p>
      </header>

      {catalogue.isPending && (
        <div className={styles.status} role="status" aria-busy="true">
          <Skeleton height={64} />
          <span className={styles.srOnly}>{t('picker.loading')}</span>
        </div>
      )}
      {catalogue.isError && (
        <div className={styles.error} role="alert">
          <p>{t('picker.loadFailed')}</p>
          <Button variant="secondary" onClick={() => catalogue.refetch()}>
            {t('picker.retry')}
          </Button>
        </div>
      )}
      {catalogue.data && (
        <>
          <IndicatorPicker
            catalogue={catalogue.data.catalogue}
            indicators={indicators}
            value={code}
            onChange={setPicked}
          />
          {code ? (
            <Lists key={code} code={code} drafts={drafts} setDraft={setDraft} />
          ) : (
            <EmptyState title={t('empty.title')} description={t('empty.description')} />
          )}
        </>
      )}
    </>
  );
}

function Lists({
  code,
  drafts,
  setDraft,
}: {
  code: string;
  drafts: Record<string, Draft>;
  setDraft: (key: string, draft: Draft | undefined) => void;
}) {
  const t = useTranslations('admin-advice');
  const advice = useAdvice(code);
  const [list, setList] = useState<AdviceList>('RL');
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});

  function onKeyDown(e: KeyboardEvent, index: number) {
    const last = LISTS.length - 1;
    const next =
      e.key === 'ArrowRight'
        ? (index + 1) % LISTS.length
        : e.key === 'ArrowLeft'
          ? index === 0
            ? last
            : index - 1
          : e.key === 'Home'
            ? 0
            : e.key === 'End'
              ? last
              : null;
    if (next === null) return;
    e.preventDefault();
    setList(LISTS[next]);
    tabs.current[LISTS[next]]?.focus();
  }

  if (advice.isPending) {
    return (
      <div className={styles.status} role="status" aria-busy="true">
        <Skeleton height={240} />
        <span className={styles.srOnly}>{t('list.loading')}</span>
      </div>
    );
  }
  if (advice.isError) {
    return (
      <div className={styles.error} role="alert">
        <p>{t('list.loadFailed')}</p>
        <Button variant="secondary" onClick={() => advice.refetch()}>
          {t('picker.retry')}
        </Button>
      </div>
    );
  }

  const data = advice.data;
  return (
    <section className={styles.section}>
      <div role="tablist" aria-label={t('tabs.label')} className={styles.tablist}>
        {LISTS.map((l, i) => (
          <button
            key={l}
            ref={(el) => {
              tabs.current[l] = el;
            }}
            type="button"
            role="tab"
            id={tabId(l)}
            aria-selected={l === list}
            aria-controls={panelId(l)}
            tabIndex={l === list ? 0 : -1}
            className={styles.tab}
            onClick={() => setList(l)}
            onKeyDown={(e) => onKeyDown(e, i)}
          >
            <Notation list={l} /> · {t(`tabs.${l}`)}
            {drafts[`${code}:${l}`] && <span className={styles.dot} aria-hidden="true" />}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={panelId(list)} aria-labelledby={tabId(list)}>
        <AdviceListEditor
          key={list}
          code={code}
          list={list}
          saved={data.lists[list]}
          updatedAt={data.updated_at}
          updatedBy={data.updated_by}
          draft={drafts[`${code}:${list}`]}
          onDraft={(d) => setDraft(`${code}:${list}`, d)}
        />
      </div>
    </section>
  );
}
