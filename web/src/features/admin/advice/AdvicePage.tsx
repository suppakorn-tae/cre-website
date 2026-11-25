'use client';

import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button, EmptyState, Select, Skeleton } from '@/components/ui';

import styles from './advice.module.css';
import { useAdvice, useIndicatorCatalogue } from './api';
import { AdviceListEditor } from './AdviceListEditor';
import { AdviceMocks } from './AdviceMocks';
import { LISTS, type AdviceList, type Draft } from './rules';

/**
 * Admin screen to edit the advice lists of one indicator: the one in
 * `?indicator=`, else the first of the catalogue. The picker and tabs follow.
 */
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
  const first = catalogue.data?.dimensions[0]?.factors[0]?.indicators[0]?.code;
  const code = initialCode ?? first;

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
      {catalogue.data &&
        (code ? (
          <Lists key={code} code={code} />
        ) : (
          <EmptyState title={t('empty.title')} description={t('empty.description')} />
        ))}
    </>
  );
}

function Lists({ code }: { code: string }) {
  const t = useTranslations('admin-advice');
  const advice = useAdvice(code);
  const [list, setList] = useState<AdviceList>('RL');
  // Unsaved edits per list, so switching list never loses them.
  const [drafts, setDrafts] = useState<Partial<Record<AdviceList, Draft>>>({});

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

  return (
    <>
      <Select
        className={styles.switcher}
        label={t('tabs.label')}
        value={list}
        options={LISTS.map((l) => ({ value: l, label: t(`list.${l}`) }))}
        onChange={(e) => setList(e.target.value as AdviceList)}
      />
      <AdviceListEditor
        key={list}
        code={code}
        list={list}
        saved={advice.data.lists[list]}
        updatedAt={advice.data.updated_at}
        draft={drafts[list]}
        onDraft={(d) => setDrafts((prev) => ({ ...prev, [list]: d }))}
      />
    </>
  );
}
