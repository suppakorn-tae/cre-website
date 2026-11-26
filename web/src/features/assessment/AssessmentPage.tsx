'use client';

import { useRouter } from 'next/navigation';
import { IconArrowLeft } from '@tabler/icons-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useCallback, useRef, useState } from 'react';

import { Button, Icon, Skeleton } from '@/components/ui';
import { ProjectSteps } from '@/features/shell/ProjectSteps';

import {
  saveAnswers,
  useAnswers,
  useCatalogue,
  useUnitBasis,
  type AnswerList,
  type Catalogue,
} from './api';
import { useCollapsed } from './collapse';
import styles from './assessment.module.css';
import { fieldErrorsOf, type ServerErrors } from './fieldErrors';
import { GroupList } from './GroupList';
import {
  COST_UNITS,
  TIME_UNITS,
  countGroup,
  fromAnswer,
  sharedUnit,
  toInput,
  type Draft,
} from './rules';
import { SubmitBar, SubmitNotes } from './SubmitBar';
import { useUnitSwitch } from './unitSwitch';
import { Toolbar } from './Toolbar';
import { classifySubmitFailure, resultsPath, submitVersion, type SubmitFailure } from './submit';
import { useAutosave } from './useAutosave';
import { useBarHeight } from './useBarHeight';
import { useNarrow } from './useNarrow';

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
  const format = useFormatter();
  const [drafts, setDrafts] = useState<Record<string, Draft | undefined>>(() =>
    Object.fromEntries(answers.items.map((a) => [a.indicator_code, fromAnswer(a)])),
  );
  const router = useRouter();
  const narrow = useNarrow();
  const pageRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLElement>(null);
  useBarHeight(pageRef, barRef, narrow);
  const [serverErrors, setServerErrors] = useState<ServerErrors>({});
  const [confirming, setConfirming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const collapse = useCollapsed(versionId);
  const [unitSkipped, setUnitSkipped] = useState(0);
  const submitLock = useRef(false);

  const save = useCallback(
    async (items: Parameters<typeof saveAnswers>[2]) => {
      const codes = items.map((i) => i.indicator_code);
      try {
        await saveAnswers(projectId, versionId, items);
      } catch (error) {
        // The server refuses the whole batch; show each problem by its input.
        const found = fieldErrorsOf(error, codes);
        if (Object.keys(found).length > 0) setServerErrors((prev) => ({ ...prev, ...found }));
        throw error;
      }
    },
    [projectId, versionId],
  );
  const rejected = useCallback(
    (error: unknown, items: Parameters<typeof saveAnswers>[2]) =>
      new Set(
        Object.keys(
          fieldErrorsOf(
            error,
            items.map((i) => i.indicator_code),
          ),
        ),
      ),
    [],
  );
  const { status, savedAt, queue, flush } = useAutosave(save, undefined, rejected);
  const switchUnit = useUnitSwitch(projectId, versionId, queue);
  const all = catalogue.dimensions.flatMap((d) =>
    d.factors.flatMap((f) => f.indicators.map((i) => i.code)),
  );
  const factors = catalogue.dimensions.flatMap((d) => d.factors);
  const [selected, setSelected] = useState(() => factors.map((f) => f.code));
  // The unit switch converts % with the version's value and dates: wait until they are loaded.
  const basisReady = useUnitBasis(projectId, versionId).data !== undefined;
  const options = catalogue.ri_e_options;

  const change = (code: string, draft: Draft) => {
    setDrafts((prev) => ({ ...prev, [code]: draft }));
    setServerErrors((prev) => {
      if (!(code in prev)) return prev;
      const rest = { ...prev };
      delete rest[code];
      return rest;
    });
    setFailure(null);
    queue(toInput(code, draft));
  };

  // Typed amounts are converted to the new unit and saved.
  const setUnit = (field: 'y1' | 'y2', unit: string) => {
    const { drafts: next, skipped } = switchUnit(all, drafts, field, unit);
    setDrafts(next);
    setFailure(null);
    setUnitSkipped(skipped.length);
  };

  const confirmSubmit = async () => {
    if (submitLock.current) return;
    submitLock.current = true;
    setSubmitting(true);
    setFailure(null);
    try {
      if (!(await flush()) || Object.keys(serverErrors).length > 0) {
        setConfirming(false);
        setFailure('saveFailed');
        return;
      }
      await submitVersion(projectId, versionId);
      // Close first: Next.js keeps this page (and its state) for the way back.
      setConfirming(false);
      router.push(resultsPath(projectId, versionId));
    } catch (error) {
      setConfirming(false);
      setFailure(classifySubmitFailure(error));
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  const { complete, total } = countGroup(all, drafts);

  return (
    <div className={styles.page} ref={pageRef}>
      <ProjectSteps current="assessment" projectId={projectId} versionId={versionId} />
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>{t('title')}</h1>
          <p className={styles.subtitle}>{t('subtitle')}</p>
        </div>
        <div className={styles.status} role="status">
          <span data-status={status}>
            {t(`save.${status}`, {
              time:
                savedAt === null
                  ? ''
                  : format.dateTime(savedAt, { hour: '2-digit', minute: '2-digit' }),
            })}
          </span>
          {status === 'error' && (
            <Button variant="secondary" onClick={() => void flush()}>
              {t('save.retry')}
            </Button>
          )}
        </div>
      </header>
      {!answers.editable && <p className={styles.notice}>{t('readOnly')}</p>}
      <Toolbar
        firstOption={options[0]?.code ?? ''}
        lastOption={options[options.length - 1]?.code ?? ''}
        complete={complete}
        total={total}
        selected={selected}
        factorOptions={catalogue.dimensions.flatMap((d) =>
          d.factors.map((f) => ({ value: f.code, label: `${f.code} ${f.name}`, group: d.name })),
        )}
        costUnit={sharedUnit(all, drafts, 'y1')}
        timeUnit={sharedUnit(all, drafts, 'y2')}
        costUnits={COST_UNITS}
        timeUnits={TIME_UNITS}
        disabled={!answers.editable || !basisReady}
        unitSkipped={unitSkipped}
        onSelect={setSelected}
        onCostUnit={(unit) => setUnit('y1', unit)}
        onTimeUnit={(unit) => setUnit('y2', unit)}
      />
      <GroupList
        catalogue={catalogue}
        drafts={drafts}
        disabled={!answers.editable}
        factors={selected.length === factors.length ? undefined : selected}
        collapse={collapse}
        serverErrors={serverErrors}
        onChange={change}
      />
      {narrow && (
        // On a phone the bar is fixed, so its notes sit above it in the page, never under it.
        <div className={styles.submitNotes}>
          <SubmitNotes complete={complete} editable={answers.editable} failure={failure} />
        </div>
      )}
      <footer className={styles.footer} ref={barRef}>
        <span className={styles.showing}>
          {selected.length === factors.length
            ? t('footer.showingAll', { total: factors.length })
            : t('footer.showing', { shown: selected.length, total: factors.length })}
        </span>
        <div className={styles.footerActions}>
          <Button
            variant="secondary"
            size={narrow ? 'lg' : 'md'}
            icon={<Icon icon={IconArrowLeft} size={20} />}
            onClick={() =>
              // No earlier page in this tab (opened from a link): go to the project.
              window.history.length > 1 ? router.back() : router.push(`/projects/${projectId}`)
            }
          >
            {t('footer.back')}
          </Button>
          <SubmitBar
            complete={complete}
            total={total}
            editable={answers.editable}
            open={confirming}
            busy={submitting}
            failure={failure}
            onOpen={() => setConfirming(true)}
            onCancel={() => setConfirming(false)}
            onConfirm={() => void confirmSubmit()}
            showNotes={!narrow}
            large={narrow}
          />
        </div>
      </footer>
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
