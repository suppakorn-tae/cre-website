'use client';

import { useTranslations } from 'next-intl';
import { useCallback, useState } from 'react';

import { Button, Skeleton } from '@/components/ui';
import { ProjectSteps } from '@/features/shell/ProjectSteps';

import { saveAnswers, useAnswers, useCatalogue, type AnswerList, type Catalogue } from './api';
import styles from './assessment.module.css';
import { GroupList } from './GroupList';
import { countGroup, fromAnswer, toInput, type Draft } from './rules';
import { useAutosave } from './useAutosave';

type Ids = { projectId: string; versionId: string };

function Form({
  projectId,
  versionId,
  catalogue,
  answers,
}: Ids & {
  catalogue: Catalogue;
  answers: AnswerList;
}) {
  const t = useTranslations('assessment');
  const [drafts, setDrafts] = useState<Record<string, Draft | undefined>>(() =>
    Object.fromEntries(answers.items.map((a) => [a.indicator_code, fromAnswer(a)])),
  );
  const save = useCallback(
    (items: Parameters<typeof saveAnswers>[2]) => saveAnswers(projectId, versionId, items),
    [projectId, versionId],
  );
  const { status, queue, flush } = useAutosave(save);

  const change = (code: string, draft: Draft) => {
    setDrafts((prev) => ({ ...prev, [code]: draft }));
    queue(toInput(code, draft));
  };

  const all = catalogue.dimensions.flatMap((d) =>
    d.factors.flatMap((f) => f.indicators.map((i) => i.code)),
  );
  const { complete, total } = countGroup(all, drafts);

  return (
    <div className={styles.page}>
      <ProjectSteps current="assessment" />
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <div className={styles.status} role="status">
          <span data-status={status}>{t(`save.${status}`)}</span>
          {status === 'error' && (
            <Button variant="secondary" onClick={() => void flush()}>
              {t('save.retry')}
            </Button>
          )}
        </div>
      </header>
      <p className={styles.overall}>{t('progress.overall', { complete, total })}</p>
      {!answers.editable && <p className={styles.notice}>{t('readOnly')}</p>}
      <GroupList
        catalogue={catalogue}
        drafts={drafts}
        disabled={!answers.editable}
        onChange={change}
      />
    </div>
  );
}

/** Assessment form of one version (UC-07): loads catalogue and answers, then autosaves edits. */
export function AssessmentPage({ projectId, versionId }: Ids) {
  const t = useTranslations('assessment');
  const catalogue = useCatalogue();
  const answers = useAnswers(projectId, versionId);

  if (catalogue.isError || answers.isError) {
    return (
      <div className={styles.page}>
        <p role="alert">{t('loadFailed')}</p>
        <Button
          variant="secondary"
          onClick={() => {
            void catalogue.refetch();
            void answers.refetch();
          }}
        >
          {t('retry')}
        </Button>
      </div>
    );
  }
  if (!catalogue.data || !answers.data) {
    return (
      <div className={styles.page} aria-busy="true">
        <Skeleton height={48} />
        <Skeleton height={240} />
      </div>
    );
  }
  return (
    <Form
      projectId={projectId}
      versionId={versionId}
      catalogue={catalogue.data}
      answers={answers.data}
    />
  );
}
