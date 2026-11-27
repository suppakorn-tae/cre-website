'use client';

import { IconArrowRight, IconCheck, IconCurrencyBaht } from '@tabler/icons-react';
import * as Slider from '@radix-ui/react-slider';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { Button, DatePicker, Icon, Input } from '@/components/ui';
import { planState } from '@/features/versions/rules';
import { ApiError } from '@/lib/api/errors';
import { formatDate, formatNumber } from '@/lib/format/locale';

import { useCreateProject, useUpdateProject } from './api';
import { addDays, durationDays, expectedProgress, parseThaiDateInput, todayIso } from './dates';
import { useProjectLabels } from './labels';
import { controlClass, IconField } from './IconField';
import { afterCreatePath } from './paths';
import {
  DESCRIPTION_MAX,
  emptyForm,
  fromProject,
  ISLAND_CODES,
  NAME_MAX,
  NICKNAME_MAX,
  OTHER_MAX,
  parseBaht,
  parseProgress,
  snapProgress,
  typedLength,
  TYPE_CODES,
  toPayload,
  validateForm,
  type FieldKey,
  type FormErrors,
  type FormValues,
  type Project,
} from './validation';

type Props = { project?: Project };

/** Pause after the last keystroke before the number fields show their error. */
const LIVE_DELAY_MS = 300;

/** Fields whose error shows while typing (after a pause); the others check on blur and submit. */
const DEBOUNCED: FieldKey[] = ['value', 'progress'];
/** Text fields whose length error shows at once: the counter already tells the user. */
const COUNTED: FieldKey[] = ['name', 'islandOther', 'typeOther', 'description'];

/** The form keeps the typed text (`onTextChange`), so the ISO value is not needed. */
const noop = () => {};

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
  const tDate = useTranslations('projects.form.datePicker');
  const dateLabels = {
    open: tDate('open'),
    calendar: tDate('calendar'),
    previousMonth: tDate('previousMonth'),
    nextMonth: tDate('nextMonth'),
    previousYears: tDate('previousYears'),
    nextYears: tDate('nextYears'),
    outOfRange: tDate('outOfRange'),
  };
  const labels = useProjectLabels();
  const router = useRouter();
  const [values, setValues] = useState<FormValues>(project ? fromProject(project) : emptyForm);
  const [errors, setErrors] = useState<FormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const timers = useRef<Partial<Record<FieldKey, ReturnType<typeof setTimeout>>>>({});
  // True while the last input on the slider was the keyboard: arrows move by 1, never snap.
  const keyboardSlide = useRef(false);

  const create = useCreateProject();
  const update = useUpdateProject(project?.id ?? '');
  const resetCreate = create.reset;
  const resetUpdate = update.reset;
  // A form kept alive by the router (hidden, then shown again) must not keep the
  // "saving" state of an earlier save. Effects re-run when it is shown again.
  useEffect(() => {
    resetCreate();
    resetUpdate();
  }, [resetCreate, resetUpdate]);
  useEffect(() => {
    const pending = timers.current;
    return () => Object.values(pending).forEach((id) => clearTimeout(id));
  }, []);
  // Stay disabled after success: the page is about to change.
  const saving = create.isPending || update.isPending || create.isSuccess || update.isSuccess;

  const start = parseThaiDateInput(values.startDate);
  const end = parseThaiDateInput(values.endDate);
  const today = todayIso();
  const expected = expectedProgress(start, end, today);
  const actual = parseProgress(values.progress);

  function setFieldError(key: FieldKey, code: string | undefined) {
    setErrors((prev) => {
      if (prev[key] === code) return prev;
      const next = { ...prev };
      if (code) next[key] = code;
      else delete next[key];
      return next;
    });
  }

  function set<K extends FieldKey>(key: K, value: FormValues[K]) {
    const next = { ...values, [key]: value };
    setValues(next);
    setFormError(null);
    clearTimeout(timers.current[key]);
    if (COUNTED.includes(key)) {
      // Only the length error shows while typing; "required" waits for blur or submit.
      const code = validateForm(next)[key];
      setFieldError(key, code?.endsWith('Length') ? code : undefined);
    } else if (DEBOUNCED.includes(key)) {
      // Clear the old error at once, show the new one after a pause. An empty
      // field is not an error until the user leaves it.
      setFieldError(key, undefined);
      if (String(value).trim() !== '') {
        timers.current[key] = setTimeout(
          () => setFieldError(key, validateForm(next)[key]),
          LIVE_DELAY_MS,
        );
      }
    } else {
      setFieldError(key, undefined);
    }
  }

  /** Check one field when the user leaves it. */
  function onBlurCheck(key: FieldKey) {
    return () => {
      clearTimeout(timers.current[key]);
      if (key === 'progress' && values.progress.trim() === '') return;
      setFieldError(key, validateForm(values)[key]);
    };
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
    if (project) {
      update.mutate(body, {
        onSuccess: (saved) => router.push(`/projects/${saved.id}`),
        onError: onFailure,
      });
    } else {
      create.mutate(body, {
        onSuccess: (saved) => router.replace(afterCreatePath(saved)),
        onError: onFailure,
      });
    }
  }

  const sliderValue = Math.min(100, Math.round(actual ?? 0));
  const progressErrorId = 'project-progress-error';

  return (
    <form
      className="grid grid-cols-1 items-start gap-6 xl:grid-cols-12"
      onSubmit={submit}
      noValidate
    >
      <div className="grid min-w-0 gap-4 xl:col-span-8">
        {formError && (
          <p
            className="m-0 rounded-control border border-error-border bg-error-bg px-4 py-3 text-error"
            role="alert"
          >
            {formError}
          </p>
        )}
        <section
          className="box-border rounded-card border border-border bg-white"
          aria-labelledby="project-basic"
        >
          <div className="grid gap-5 p-5 md:gap-6 md:p-8">
            <h2 id="project-basic" className="m-0 text-h3 font-semibold text-navy-900">
              {t('sectionBasic')}
            </h2>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="min-w-0 md:col-span-2">
                <Input
                  id="project-name"
                  label={t('name')}
                  placeholder={t('namePlaceholder')}
                  value={values.name}
                  onChange={(e) => set('name', e.target.value)}
                  onBlur={onBlurCheck('name')}
                  maxLength={NAME_MAX}
                  helper={<Counter text={values.name} max={NAME_MAX} units />}
                  error={error('name')}
                  required
                />
              </div>
              <Input
                id="project-nickname"
                label={t('nickname')}
                placeholder={t('nicknamePlaceholder')}
                helper={
                  <Counter
                    text={values.nickname}
                    max={NICKNAME_MAX}
                    note={t('nicknameHelper')}
                    units
                  />
                }
                maxLength={NICKNAME_MAX}
                value={values.nickname}
                onChange={(e) => set('nickname', e.target.value)}
                onBlur={onBlurCheck('nickname')}
                error={error('nickname')}
                required
              />
            </div>

            <ChipGroup
              id="project-islandCode"
              legend={t('island')}
              name="island"
              columns="md:grid-cols-4"
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
                onBlur={onBlurCheck('islandOther')}
                maxLength={OTHER_MAX}
                helper={<Counter text={values.islandOther} max={OTHER_MAX} units />}
                error={error('islandOther')}
                required
              />
            )}

            <ChipGroup
              id="project-typeCode"
              legend={t('type')}
              name="type"
              columns="md:grid-cols-3"
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
                onBlur={onBlurCheck('typeOther')}
                maxLength={OTHER_MAX}
                helper={<Counter text={values.typeOther} max={OTHER_MAX} units />}
                error={error('typeOther')}
                required
              />
            )}

            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <IconField
                id="project-value"
                label={t('value')}
                placeholder={t('valuePlaceholder')}
                inputMode="decimal"
                icon={IconCurrencyBaht}
                value={values.value}
                onChange={(e) => set('value', e.target.value)}
                onBlur={onBlurCheck('value')}
                error={error('value')}
                required
              />
              <DatePicker
                id="project-startDate"
                label={t('startDate')}
                placeholder={t('datePlaceholder')}
                helper={t('dateHelper')}
                labels={dateLabels}
                value={start ?? ''}
                max={end ? addDays(end, -1) : undefined}
                onTextChange={(text) => set('startDate', text)}
                onChange={noop}
                error={error('startDate')}
                required
              />
              <DatePicker
                id="project-endDate"
                label={t('endDate')}
                placeholder={t('datePlaceholder')}
                helper={
                  start && end && durationDays(start, end) > 0
                    ? t('afterStart', { days: formatNumber(durationDays(start, end)) })
                    : t('dateHelper')
                }
                labels={dateLabels}
                value={end ?? ''}
                min={start ? addDays(start, 1) : undefined}
                onTextChange={(text) => set('endDate', text)}
                onChange={noop}
                error={error('endDate')}
                required
              />
            </div>

            <div className="grid gap-2">
              <div>
                <label htmlFor="project-progress" className="text-body font-medium text-text">
                  {t('progress')}
                </label>
                <p className="m-0 text-caption text-text-muted">{t('progressDefault')}</p>
              </div>
              <div className="flex items-start gap-4 md:gap-6">
                <div className="relative w-28 shrink-0">
                  <input
                    id="project-progress"
                    type="text"
                    inputMode="numeric"
                    className={`${controlClass} pe-10`}
                    value={values.progress}
                    onChange={(e) => set('progress', e.target.value)}
                    onBlur={onBlurCheck('progress')}
                    aria-invalid={errors.progress ? true : undefined}
                    aria-describedby={errors.progress ? progressErrorId : undefined}
                  />
                  <span className="pointer-events-none absolute inset-y-0 end-3 flex items-center text-body text-text-muted">
                    {tUnits('percent')}
                  </span>
                </div>
                <div className="min-w-0 flex-1 pb-6">
                  <Slider.Root
                    className="relative flex h-hit w-full touch-none select-none items-center"
                    value={[sliderValue]}
                    onKeyDown={() => {
                      keyboardSlide.current = true;
                    }}
                    onPointerDown={() => {
                      keyboardSlide.current = false;
                    }}
                    onValueChange={([v]) =>
                      set(
                        'progress',
                        String(keyboardSlide.current ? v : snapProgress(v, expected?.pct ?? null)),
                      )
                    }
                    min={0}
                    max={100}
                    step={1}
                  >
                    <Slider.Track className="relative box-border h-2 grow rounded-pill border border-field-border bg-blue-100">
                      <Slider.Range className="absolute h-full rounded-pill bg-primary" />
                    </Slider.Track>
                    {expected && (
                      <PlannedMarker
                        pct={expected.pct}
                        label={t('expectedBadge', { pct: expected.pct })}
                      />
                    )}
                    <Slider.Thumb
                      aria-label={t('progressSlider')}
                      aria-valuetext={t('progressValueText', { pct: sliderValue })}
                      className="focus-ring block size-5 rounded-pill border-2 border-primary bg-white"
                    />
                  </Slider.Root>
                </div>
              </div>
              {errors.progress && (
                <p id={progressErrorId} className="m-0 text-caption text-error" role="alert">
                  {error('progress')}
                </p>
              )}
              <p className="m-0 text-small text-text-secondary">
                {expected
                  ? t('expectedHelper', {
                      today: formatDate(today),
                      pct: expected.pct,
                      elapsed: formatNumber(expected.elapsed),
                      days: formatNumber(expected.duration),
                    })
                  : t('expectedNone')}
              </p>
            </div>

            <div className="flex flex-col gap-1">
              <label htmlFor="project-description" className="text-body font-medium text-text">
                {t('description')}
                <span className="ms-2 text-caption font-normal text-text-muted">
                  {tUi('optional')}
                </span>
              </label>
              <textarea
                id="project-description"
                className={`${controlClass} resize-y`}
                rows={4}
                placeholder={t('descriptionPlaceholder')}
                value={values.description}
                onChange={(e) => set('description', e.target.value)}
                onBlur={onBlurCheck('description')}
                aria-invalid={errors.description ? true : undefined}
                aria-describedby="project-description-note"
              />
              <p
                id="project-description-note"
                className="m-0 flex flex-wrap justify-between gap-x-3 text-caption"
              >
                {errors.description ? (
                  <span className="text-error" role="alert">
                    {error('description')}
                  </span>
                ) : (
                  <span />
                )}
                <CounterText text={values.description} max={DESCRIPTION_MAX} />
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-3 border-0 border-t border-solid border-border p-5 md:flex-row-reverse md:justify-start md:px-8">
            <Button type="submit" size="lg" disabled={saving} className="w-full md:w-auto">
              {saving ? (
                t('submitting')
              ) : (
                <>
                  {editing ? t('submitEdit') : t('submitCreate')}
                  {!editing && <Icon icon={IconArrowRight} size={20} />}
                </>
              )}
            </Button>
            <Link
              href={project ? `/projects/${project.id}` : '/dashboard'}
              className="focus-ring box-border inline-flex min-h-control-lg w-full items-center justify-center rounded-control border border-field-border bg-white px-4 text-body font-medium text-text no-underline hover:bg-subtle md:w-auto"
            >
              {t('cancel')}
            </Link>
          </div>
        </section>
      </div>

      <aside
        className="grid min-w-0 gap-4 xl:sticky xl:top-[calc(var(--nav-height)+var(--space-4))] xl:col-span-4"
        aria-label={t('preview.title')}
      >
        <Preview values={values} expectedPct={expected?.pct ?? null} actual={actual} />
        <div className="rounded-card border border-info-border bg-info-bg p-4">
          <p className="m-0 font-semibold text-info">{t('editLaterTitle')}</p>
          <p className="m-0 mt-1 text-small text-text-secondary">{t('editLaterText')}</p>
        </div>
      </aside>
    </form>
  );
}

/**
 * "n / max" for a text field; red once over the limit. A field with `maxLength` counts UTF-16
 * code units (`units`), the way the browser cuts typing and pasting, so the counter reaches
 * max / max exactly when the input stops. A Thai tone mark or vowel is one unit, like the server's
 * code point; an emoji is two units, which only makes the client stricter.
 */
function CounterText({ text, max, units }: { text: string; max: number; units?: boolean }) {
  const count = units ? text.length : typedLength(text);
  return (
    <span className={`ms-auto tabular-nums ${count > max ? 'text-error' : 'text-text-muted'}`}>
      {formatNumber(count)} / {formatNumber(max)}
    </span>
  );
}

/** Helper line under a field: an optional note on the left, the counter on the right. */
function Counter({
  text,
  max,
  note,
  units,
}: {
  text: string;
  max: number;
  note?: string;
  units?: boolean;
}) {
  return (
    <span className="flex flex-wrap justify-between gap-x-3">
      {note && <span>{note}</span>}
      <CounterText text={text} max={max} units={units} />
    </span>
  );
}

/** Width of the slider thumb in px (`size-5`): the thumb centre stays inside the track. */
const THUMB_PX = 20;

/** Where the plan stands today, drawn on the slider track (BR-24, from `expectedProgress`). */
function PlannedMarker({ pct, label }: { pct: number; label: string }) {
  const left = `calc(${pct}% + ${((50 - pct) / 100) * THUMB_PX}px)`;
  // Near the ends the label hangs inside the track instead of past the card edge.
  const atEdge = pct < 12 || pct > 88;
  const align = pct < 12 ? 'start-0' : pct > 88 ? 'end-0' : '-translate-x-1/2';
  return (
    <>
      <span
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 h-5 w-0.5 -translate-x-1/2 -translate-y-1/2 bg-navy-900"
        style={{ left }}
      />
      <span
        aria-hidden="true"
        className={`pointer-events-none absolute top-full whitespace-nowrap text-caption font-semibold text-text ${align}`}
        style={atEdge ? undefined : { left }}
      >
        {label}
      </span>
    </>
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
  const plan = actual !== null && expectedPct !== null ? planState(actual, expectedPct) : null;
  const barPct = Math.min(100, Math.max(0, actual ?? 0));
  // Start at 0 on first show so the bar grows to the value; later changes slide from the old width.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(barPct));
    return () => cancelAnimationFrame(frame);
  }, [barPct]);

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
    <div className="grid min-w-0 gap-3 rounded-card border border-border bg-white p-5 [overflow-wrap:anywhere]">
      <p className="m-0 flex items-center justify-between text-small text-text-muted">
        <span>{t('title')}</span>
        <span className="rounded-pill bg-blue-50 px-3 py-0.5 text-caption text-blue-700">
          {t('live')}
        </span>
      </p>
      <div className="flex min-w-0 items-start gap-3">
        <span className="shrink-0 whitespace-nowrap rounded-pill bg-navy-900 px-3 py-0.5 text-small font-bold text-white">
          {values.nickname.trim() || t('placeholderNickname')}
        </span>
        <div className="min-w-0">
          <p className="m-0 font-semibold text-text [overflow-wrap:anywhere]">
            {values.name.trim() || t('placeholderName')}
          </p>
          <p className="m-0 text-small text-text-muted">
            {values.islandCode ? labels.island(values.islandCode, values.islandOther) : '–'}
          </p>
        </div>
      </div>
      <dl className="m-0 grid gap-3 border-0 border-t border-solid border-divider pt-3">
        {rows.map(([term, detail]) => (
          <div key={term} className="grid grid-cols-[auto_minmax(0,1fr)] gap-3 text-small">
            <dt className="text-text-muted">{term}</dt>
            <dd className="m-0 min-w-0 text-end [overflow-wrap:anywhere] font-semibold text-text">
              {detail}
            </dd>
          </div>
        ))}
      </dl>
      <div className="grid gap-2">
        <p className="m-0 flex flex-wrap justify-between gap-x-3 text-small">
          <span className="text-text-muted">{t('progress')}</span>
          <span className="font-semibold text-text">
            {actual !== null ? t('actual', { pct: actual }) : '–'}
            {expectedPct !== null && <> · {t('expected', { pct: expectedPct })}</>}
          </span>
        </p>
        <div
          className="relative box-border h-2 rounded-pill border border-field-border bg-blue-100"
          aria-hidden="true"
        >
          <div
            className="h-full rounded-pill bg-primary transition-[width] duration-[600ms] ease-out motion-reduce:transition-none"
            // At least as wide as the bar is high, so the end stays round at 1 %.
            style={{ width: `${shown}%`, minWidth: shown > 0 ? '0.5rem' : undefined }}
          />
          {expectedPct !== null && (
            <span
              className="absolute top-1/2 h-4 w-0.5 -translate-y-1/2 bg-navy-900"
              style={{ left: `${expectedPct}%` }}
            />
          )}
        </div>
        {plan && (
          <p
            className={`m-0 text-small font-semibold ${plan.kind === 'behind' ? 'text-warning' : 'text-success'}`}
          >
            {plan.kind === 'behind'
              ? t('behind', { pct: plan.points })
              : plan.kind === 'ahead'
                ? t('ahead', { pct: plan.points })
                : t('onPlan')}
          </p>
        )}
      </div>
    </div>
  );
}

function ChipGroup({
  id,
  legend,
  name,
  columns,
  options,
  value,
  onChange,
  error,
}: {
  id: string;
  legend: string;
  name: string;
  /** Column count from the `md` width up, e.g. `md:grid-cols-4`; two columns below. */
  columns: string;
  options: { value: string; label: string }[];
  value: string;
  onChange: (value: string) => void;
  error?: string;
}) {
  const errorId = useId();
  return (
    <fieldset
      className="m-0 min-w-0 border-0 p-0"
      aria-describedby={error ? errorId : undefined}
      aria-invalid={error ? true : undefined}
    >
      <legend className="mb-2 p-0 text-body font-medium text-text">
        {legend}
        <span className="ms-1 text-error" aria-hidden="true">
          *
        </span>
      </legend>
      <div className={`grid grid-cols-2 gap-3 ${columns}`} id={id} tabIndex={-1}>
        {options.map((o) => {
          const selected = value === o.value;
          return (
            <label key={o.value} className="relative block min-w-0">
              <input
                type="radio"
                name={name}
                value={o.value}
                checked={selected}
                onChange={() => onChange(o.value)}
                className="peer absolute inset-0 m-0 size-full cursor-pointer opacity-0"
              />
              <span
                className={`box-border flex min-h-control-lg items-center justify-center gap-2 rounded-pill border px-4 text-center text-body peer-focus-visible:shadow-[var(--focus-ring)] ${
                  selected
                    ? 'border-primary bg-blue-50 font-semibold text-blue-700'
                    : 'border-field-border bg-white text-text'
                }`}
              >
                {selected && <Icon icon={IconCheck} size={16} />}
                {o.label}
              </span>
            </label>
          );
        })}
      </div>
      {error && (
        <p id={errorId} className="m-0 mt-2 text-caption text-error" role="alert">
          {error}
        </p>
      )}
    </fieldset>
  );
}
