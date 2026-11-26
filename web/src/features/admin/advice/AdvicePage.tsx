'use client';

import * as ToggleGroup from '@radix-ui/react-toggle-group';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, EmptyState, Skeleton } from '@/components/ui';

import styles from './advice.module.css';
import { useAdvice, useIndicatorCatalogue } from './api';
import { AdviceListEditor } from './AdviceListEditor';
import { AdviceMocks } from './AdviceMocks';
import { IndicatorPicker } from './IndicatorPicker';
import { Notation } from './Notation';
import { LISTS, type AdviceList, type Draft } from './rules';

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
  const [list, setList] = useState<AdviceList>('RL');
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
          <div className={styles.controls}>
            <IndicatorPicker indicators={indicators} value={code} onChange={setPicked} />
            {code && <ListPicker code={code} list={list} onChange={setList} drafts={drafts} />}
          </div>
          {code ? (
            <Lists key={code} code={code} list={list} drafts={drafts} setDraft={setDraft} />
          ) : (
            <EmptyState title={t('empty.title')} description={t('empty.description')} />
          )}
        </>
      )}
    </>
  );
}

/** Segmented control: which of the four advice lists to edit. */
function ListPicker({
  code,
  list,
  onChange,
  drafts,
}: {
  code: string;
  list: AdviceList;
  onChange: (list: AdviceList) => void;
  drafts: Record<string, Draft>;
}) {
  const t = useTranslations('admin-advice');
  return (
    <div className={styles.listPick}>
      <span id="advice-list-label" className={styles.pickerLabel}>
        {t('tabs.label')}
      </span>
      <ToggleGroup.Root
        type="single"
        value={list}
        // A segmented control always keeps one list selected.
        onValueChange={(v) => v && onChange(v as AdviceList)}
        aria-labelledby="advice-list-label"
        className={styles.segmented}
      >
        {LISTS.map((l) => (
          <ToggleGroup.Item key={l} value={l} className={styles.segment}>
            <span>
              <Notation list={l} /> · {t(`tabs.${l}`)}
            </span>
            {drafts[`${code}:${l}`] && (
              <span className={styles.dot} role="img" aria-label={t('tabs.unsaved')} />
            )}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
    </div>
  );
}

function Lists({
  code,
  drafts,
  list,
  setDraft,
}: {
  code: string;
  list: AdviceList;
  drafts: Record<string, Draft>;
  setDraft: (key: string, draft: Draft | undefined) => void;
}) {
  const t = useTranslations('admin-advice');
  const advice = useAdvice(code);
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
    </section>
  );
}
