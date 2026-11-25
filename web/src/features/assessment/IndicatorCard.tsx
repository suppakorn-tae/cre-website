'use client';

import { useTranslations } from 'next-intl';

import { CheckboxGroup, Input, UnitPicker, type CheckboxOption } from '@/components/ui';

import type { Catalogue } from './api';
import styles from './assessment.module.css';
import { COST_UNITS, TIME_UNITS, isAnswered, isComplete, parseAmount, type Draft } from './rules';

type Indicator = Catalogue['dimensions'][number]['factors'][number]['indicators'][number];

type Props = {
  indicator: Indicator;
  draft: Draft;
  y3Options: CheckboxOption[];
  disabled: boolean;
  onChange: (draft: Draft) => void;
};

/** One indicator: X, y1, y2 and y3, each with the question from the catalogue. */
export function IndicatorCard({ indicator, draft, y3Options, disabled, onChange }: Props) {
  const t = useTranslations('assessment');
  const tUnits = useTranslations('assessment.units');
  const done = isComplete(draft);
  const state = done ? 'complete' : isAnswered(draft) ? 'partial' : 'empty';

  const numberError = (text: string, max?: number) =>
    text.trim() !== '' && parseAmount(text, max) === null
      ? t(max === undefined ? 'errors.number' : 'errors.percent')
      : undefined;
  const maxFor = (unit: string) => (unit === 'percent' ? 100 : undefined);

  return (
    <li className={styles.card} data-state={state}>
      <div className={styles.cardHead}>
        <span className={styles.code}>{indicator.code}</span>
        <h4 className={styles.name}>{indicator.name}</h4>
        <span className={styles.badge} data-state={state}>
          {t(`indicator.${state}`)}
        </span>
      </div>
      <div className={styles.fields}>
        <Input
          label={t('fields.x')}
          inputMode="decimal"
          value={draft.x}
          disabled={disabled}
          helper={[indicator.question_x, t('fields.xUnit', { unit: indicator.unit })]
            .filter(Boolean)
            .join(' · ')}
          error={numberError(draft.x)}
          onChange={(e) => onChange({ ...draft, x: e.target.value })}
        />
        <UnitPicker
          label={t('fields.y1')}
          unitsLabel={t('fields.unitsLabel')}
          units={COST_UNITS.map((u) => ({ value: u, label: tUnits(u) }))}
          value={draft.y1}
          disabled={disabled}
          helper={indicator.question_y1 ?? undefined}
          error={numberError(draft.y1.amount, maxFor(draft.y1.unit))}
          onChange={(y1) => onChange({ ...draft, y1 })}
        />
        <UnitPicker
          label={t('fields.y2')}
          unitsLabel={t('fields.unitsLabel')}
          units={TIME_UNITS.map((u) => ({ value: u, label: tUnits(u) }))}
          value={draft.y2}
          disabled={disabled}
          helper={indicator.question_y2 ?? undefined}
          error={numberError(draft.y2.amount, maxFor(draft.y2.unit))}
          onChange={(y2) => onChange({ ...draft, y2 })}
        />
        <CheckboxGroup
          legend={t('fields.y3')}
          options={y3Options}
          value={draft.y3}
          disabled={disabled}
          helper={indicator.question_y3 ?? t('fields.y3Helper')}
          onChange={(y3) => onChange({ ...draft, y3 })}
        />
      </div>
    </li>
  );
}
