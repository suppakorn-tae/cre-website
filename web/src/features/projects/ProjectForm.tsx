'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useId, useState, type FormEvent, type ReactNode } from 'react';

import { Button, Input, NumberInput } from '@/components/ui';
import { ApiError } from '@/lib/api/errors';
import { formatDate, formatNumber } from '@/lib/format/locale';

import { useCreateProject, useUpdateProject } from './api';
import { durationDays, expectedProgress, parseThaiDateInput, todayIso } from './dates';
import { useProjectLabels } from './labels';
import styles from './projects.module.css';
import {
  emptyForm,
  fromProject,
  ISLAND_CODES,
  parseBaht,
  parseProgress,
  TYPE_CODES,
  toPayload,
  validateForm,
  type FieldKey,
  type FormErrors,
  type FormValues,
  type Project,
} from './validation';

type Props = { project?: Project };

const FIELD_ORDER: FieldKey[] = [
  'name',
  'nickname',
  'islandCode',
  'islandOther',
  'typeCode',
  'typeOther',
  'value',
  'startDate',
  'endDate',
  'progress',
];

/** Create (no `project`) or edit form. Same fields, same rules. */
export function ProjectForm({ project }: Props) {
  const editing = project !== undefined;
  const t = useTranslations('projects.form');
  const tUnits = useTranslations('projects.units');
  const tCommon = useTranslations('common.errors');
  const tUi = useTranslations('ui');
  const labels = useProjectLabels();
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(project ? fromProject(project) : emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? '');
  const saving = create.isPending || update.isPending;

  const start = parseThaiDateInput(values.startDate);
  const end = parseThaiDateInput(values.endDate);
  const today = todayIso();
  const expected = expectedProgress(start, end, today);
  const actual = parseProgress(values.progress);

  function set<K extends FieldKey>(key: K, value: FormValues[K]) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setFormError(null);
  }

  const error = (key: FieldKey): string | undefined =>
    errors[key] ? t(`errors.${errors[key]}`) : undefined;

  function onFailure(failure: unknown) {
    if (failure instanceof ApiError && failure.status === 422) {
      // The server names the field in `error.fields`; the shared ApiError
      // does not keep it, so show one message for the whole form.
      setFormError(tCommon('validation_failed'));
      return;
    }
    setFormError(failure instanceof TypeError ? tCommon('network') : tCommon('unknown'));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    const found = validateForm(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      const first = FIELD_ORDER.find((key) => found[key]);
      if (first) document.getElementById(`project-${first}`)?.focus();
      return;
    }
    const body = toPayload(values);
    const done = (saved: Project) => router.push(`/projects/${saved.id}`);
    if (project) update.mutate(body, { onSuccess: done, onError: onFailure });
    else create.mutate(body, { onSuccess: done, onError: onFailure });
  }

  return (
    <form className={styles.formLayout} onSubmit={submit} noValidate>
      <div className={styles.formMain}>
        {formError && (
          <p className={styles.formAlert} role="alert">
            {formError}
          </p>
        )}
        <section className={styles.card} aria-labelledby="project-basic">
          <h2 id="project-basic" className={styles.cardTitle}>
            {t('sectionBasic')}
          </h2>

          <div className={styles.grid2}>
            <Input
              id="project-name"
              label={t('name')}
              placeholder={t('namePlaceholder')}
              value={values.name}
              onChange={(e) => set('name', e.target.value)}
              error={error('name')}
              required
            />
            <Input
              id="project-nickname"
              label={t('nickname')}
              placeholder={t('nicknamePlaceholder')}
              helper={t('nicknameHelper')}
              value={values.nickname}
              onChange={(e) => set('nickname', e.target.value)}
              error={error('nickname')}
              required
            />
          </div>

          <ChipGroup
            id="project-islandCode"
            legend={t('island')}
            name="island"
            options={ISLAND_CODES.map((code) => ({ value: code, label: labels.island(code) }))}
            value={values.islandCode}
            onChange={(v) => set('islandCode', v as FormValues['islandCode'])}
            error={error('islandCode')}
          />
          {values.islandCode === 'other' && (
            <Input
              id="project-islandOther"
              label={t('islandOther')}
              placeholder={t('islandOtherPlaceholder')}
              value={values.islandOther}
              onChange={(e) => set('islandOther', e.target.value)}
              error={error('islandOther')}
              required
            />
          )}

          <ChipGroup
            id="project-typeCode"
            legend={t('type')}
            name="type"
            options={TYPE_CODES.map((code) => ({ value: code, label: labels.type(code) }))}
            value={values.typeCode}
            onChange={(v) => set('typeCode', v as FormValues['typeCode'])}
            error={error('typeCode')}
          />
          {values.typeCode === 'other' && (
            <Input
              id="project-typeOther"
              label={t('typeOther')}
              placeholder={t('typeOtherPlaceholder')}
              value={values.typeOther}
              onChange={(e) => set('typeOther', e.target.value)}
              error={error('typeOther')}
              required
            />
          )}

          <div className={styles.grid3}>
            <NumberInput
              id="project-value"
              label={t('value')}
              placeholder={t('valuePlaceholder')}
              value={values.value}
              onChange={(v) => set('value', v)}
              suffix={tUnits('baht')}
              error={error('value')}
              required
            />
            <Input
              id="project-startDate"
              label={t('startDate')}
              inputMode="numeric"
              placeholder={t('datePlaceholder')}
              helper={t('dateHelper')}
              value={values.startDate}
              onChange={(e) => set('startDate', e.target.value)}
              error={error('startDate')}
              required
            />
            <Input
              id="project-endDate"
              label={t('endDate')}
              inputMode="numeric"
              placeholder={t('datePlaceholder')}
              helper={
                start && end && durationDays(start, end) > 0
                  ? t('afterStart', { days: formatNumber(durationDays(start, end)) })
                  : t('dateHelper')
              }
              value={values.endDate}
              onChange={(e) => set('endDate', e.target.value)}
              error={error('endDate')}
              required
            />
          </div>
        </section>

        <section className={styles.card} aria-labelledby="project-progress-title">
          <h2 id="project-progress-title" className={styles.cardTitle}>
            {t('progress')}
            <span className={styles.cardHint}>{t('progressDefault')}</span>
          </h2>
          <div className={styles.progressRow}>
            <NumberInput
              id="project-progress"
              label={<span className={styles.srOnly}>{t('progress')}</span>}
              value={values.progress}
              onChange={(v) => set('progress', v)}
              suffix={tUnits('percent')}
              error={error('progress')}
              className={styles.progressField}
            />
            {expected && (
              <span className={styles.expectedBadge}>
                {t('expectedBadge', { pct: expected.pct })}
              </span>
            )}
          </div>
          <p className={styles.expectedText}>
            {expected
              ? t('expectedHelper', {
                  today: formatDate(today),
                  pct: expected.pct,
                  elapsed: formatNumber(expected.elapsed),
                  days: formatNumber(expected.duration),
                })
              : t('expectedNone')}
          </p>
        </section>

        <section className={styles.card}>
          <label htmlFor="project-description" className={styles.cardTitle}>
            {t('description')}
            <span className={styles.cardHint}>{tUi('optional')}</span>
          </label>
          <textarea
            id="project-description"
            className={styles.textarea}
            rows={4}
            placeholder={t('descriptionPlaceholder')}
            value={values.description}
            onChange={(e) => set('description', e.target.value)}
          />
        </section>

        <div className={styles.actions}>
          <Button type="submit" size="lg" disabled={saving}>
            {saving ? t('submitting') : editing ? t('submitEdit') : t('submitCreate')}
          </Button>
          <Link
            href={project ? `/projects/${project.id}` : '/projects'}
            className={styles.cancelLink}
          >
            {t('cancel')}
          </Link>
        </div>
      </div>

      <aside className={styles.preview} aria-label={t('preview.title')}>
        <Preview values={values} expectedPct={expected?.pct ?? null} actual={actual} />
        <div className={styles.note}>
          <p className={styles.noteTitle}>{t('editLaterTitle')}</p>
          <p className={styles.noteText}>{t('editLaterText')}</p>
        </div>
      </aside>
    </form>
  );
}

function Preview({
  values,
  expectedPct,
  actual,
}: {
  values: FormValues;
  expectedPct: number | null;
  actual: number | null;
}) {
  const t = useTranslations('projects.form.preview');
  const labels = useProjectLabels();
  const start = parseThaiDateInput(values.startDate);
  const end = parseThaiDateInput(values.endDate);
  const baht = parseBaht(values.value);
  const gap = actual !== null && expectedPct !== null ? Math.round(actual - expectedPct) : null;

  const rows: [string, ReactNode][] = [
    [
      t('type'),
      values.typeCode
        ? values.typeCode === 'other' && values.typeOther
          ? `${labels.type('other')} · ${values.typeOther}`
          : labels.type(values.typeCode, values.typeOther)
        : '–',
    ],
    [t('period'), start && end ? `${formatDate(start)} – ${formatDate(end)}` : '–'],
    [
      t('value'),
      baht !== null ? `฿${formatNumber(baht, 'th', { maximumFractionDigits: 2 })}` : '–',
    ],
  ];

  return (
    <div className={styles.previewCard}>
      <p className={styles.previewHead}>
        <span>{t('title')}</span>
        <span className={styles.liveTag}>{t('live')}</span>
      </p>
      <p className={styles.previewName}>
        <span className={styles.previewNick}>
          {values.nickname.trim() || t('placeholderNickname')}
        </span>
        <span>{values.name.trim() || t('placeholderName')}</span>
      </p>
      <p className={styles.previewIsland}>
        {values.islandCode ? labels.island(values.islandCode, values.islandOther) : '–'}
      </p>
      <dl className={styles.previewList}>
        {rows.map(([term, detail]) => (
          <div key={term} className={styles.previewRow}>
            <dt>{term}</dt>
            <dd>{detail}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.previewProgressHead}>{t('progress')}</p>
      <p>
        {actual !== null ? t('actual', { pct: actual }) : '–'}
        {expectedPct !== null && <> · {t('expected', { pct: expectedPct })}</>}
      </p>
      {gap !== null && (
        <p className={styles.gap} data-state={gap < 0 ? 'behind' : gap > 0 ? 'ahead' : 'on'}>
          {gap < 0 ? t('behind', { pct: -gap }) : gap > 0 ? t('ahead', { pct: gap }) : t('onPlan')}
        </p>
      )}
    </div>
  );
}

function ChipGroup({
  id,
  legend,
  name,
  options,
  value,
  onChange,
  error,
}: {
  id: string;
  legend: string;
  name: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = useId();
  return (
    <fieldset
      className={styles.chipset}
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className={styles.chipLegend}>
        {legend}
        <span className={styles.required} aria-hidden="true">
          *
        </span>
      </legend>
      <div className={styles.chips} id={id} tabIndex={-1}>
        {options.map((o) => (
          <label key={o.value} className={styles.chip}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={value === o.value}
              onChange={() => onChange(o.value)}
            />
            <span className={styles.chipFace}>{o.label}</span>
          </label>
        ))}
      </div>
      {error && (
        <p id={errorId} className={styles.fieldError} role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
