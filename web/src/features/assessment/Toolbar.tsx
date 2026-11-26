'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { IconChevronDown } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';

import { Icon, type SelectOption } from '@/components/ui';

import styles from './assessment.module.css';
import { useNarrow } from './useNarrow';

type UnitSwitchProps = {
  label: string;
  units: readonly string[];
  /** Null when rows use different units: no button is on. */
  value: string | null;
  disabled: boolean;
  onChange: (unit: string) => void;
};

function UnitSwitch({ label, units, value, disabled, onChange }: UnitSwitchProps) {
  const tUnits = useTranslations('assessment.units');
  return (
    <div className={styles.unitSwitch}>
      <span className={styles.unitLabel}>{label}</span>
      <div role="radiogroup" aria-label={label} className={styles.segmented}>
        {units.map((u) => (
          <button
            key={u}
            type="button"
            role="radio"
            aria-checked={u === value}
            disabled={disabled}
            className={styles.segment}
            onClick={() => onChange(u)}
          >
            {tUnits(u)}
          </button>
        ))}
      </div>
    </div>
  );
}

type Props = {
  /** First and last answer option code, for the legend of y3. */
  firstOption: string;
  lastOption: string;
  complete: number;
  total: number;
  filter: string;
  filterOptions: SelectOption[];
  costUnit: string | null;
  timeUnit: string | null;
  costUnits: readonly string[];
  timeUnits: readonly string[];
  disabled: boolean;
  /** Rows the last unit switch left alone because their value is invalid in the new unit. */
  unitSkipped?: number;
  onFilter: (value: string) => void;
  onCostUnit: (unit: string) => void;
  onTimeUnit: (unit: string) => void;
};

const LEGEND = ['x', 'y1', 'y2', 'y3'] as const;

/** Legend of the four fields, overall progress, dimension filter and global unit switches. */
export function Toolbar({
  firstOption,
  lastOption,
  complete,
  total,
  filter,
  filterOptions,
  costUnit,
  timeUnit,
  costUnits,
  timeUnits,
  disabled,
  unitSkipped = 0,
  onFilter,
  onCostUnit,
  onTimeUnit,
}: Props) {
  const t = useTranslations('assessment');
  const narrow = useNarrow();
  const percent = total === 0 ? 0 : Math.round((complete / total) * 100);
  const legend = (
    <ul className={styles.legend} aria-label={narrow ? undefined : t('legend.label')}>
      {LEGEND.map((key) => (
        <li key={key} className={styles.legendItem}>
          <span className={styles.legendKey}>{key === 'x' ? 'X' : key}</span>
          <span className={styles.legendText}>
            <strong>{t(`legend.${key}.title`)}</strong>
            <span>{t(`legend.${key}.hint`, { first: firstOption, last: lastOption })}</span>
          </span>
        </li>
      ))}
    </ul>
  );
  return (
    <>
      {!narrow && legend}
      <div className={styles.toolbar}>
        <div className={styles.overallBlock}>
          <p className={styles.overall}>{t('progress.overall', { complete, total })}</p>
          <div
            role="progressbar"
            aria-label={t('toolbar.progressLabel')}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={complete}
            className={styles.bar}
          >
            <span className={styles.barFill} style={{ width: `${percent}%` }} />
          </div>
        </div>
        <label className={styles.filter}>
          <span className={styles.unitLabel}>{t('toolbar.filterLabel')}</span>
          <select
            value={filter}
            onChange={(e) => onFilter(e.target.value)}
            className={styles.select}
          >
            {filterOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <div className={styles.unitGroup}>
          <UnitSwitch
            label={t('toolbar.costUnit')}
            units={costUnits}
            value={costUnit}
            disabled={disabled}
            onChange={onCostUnit}
          />
          <UnitSwitch
            label={t('toolbar.timeUnit')}
            units={timeUnits}
            value={timeUnit}
            disabled={disabled}
            onChange={onTimeUnit}
          />
          <span className={styles.allRows}>{t('toolbar.allRows')}</span>
        </div>
        {unitSkipped > 0 && (
          <p role="status" className={styles.unitNotice}>
            {t('toolbar.unitSkipped', { count: unitSkipped })}
          </p>
        )}
      </div>
      {narrow && (
        // The four field legends take most of the first screen, so they fold into one row.
        <Accordion.Root type="single" collapsible className={styles.legendFold}>
          <Accordion.Item value="legend">
            <Accordion.Header asChild>
              <h2 className={styles.legendFoldHeading}>
                <Accordion.Trigger className={styles.legendFoldTrigger}>
                  {t('legend.label')}
                  <Icon icon={IconChevronDown} size={20} className={styles.cardChevron} />
                </Accordion.Trigger>
              </h2>
            </Accordion.Header>
            <Accordion.Content className={styles.legendFoldBody}>{legend}</Accordion.Content>
          </Accordion.Item>
        </Accordion.Root>
      )}
    </>
  );
}
