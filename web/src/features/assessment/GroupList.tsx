'use client';

import { useTranslations } from 'next-intl';
import { useMemo, type CSSProperties } from 'react';

import type { CheckboxOption } from '@/components/ui';
import { dimensionOf, dimensionStyle } from '@/lib/dimensions';

import type { Catalogue } from './api';
import styles from './assessment.module.css';
import type { ServerErrors } from './fieldErrors';
import { CardList } from './CardList';
import { isDimensionOpen, isFactorOpen, type CollapseState } from './collapse';
import { codesOf, GroupToggle, Progress } from './GroupProgress';
import { IndicatorRow } from './IndicatorRow';
import { emptyDraft, sharedUnit, type Draft } from './rules';
import { useNarrow } from './useNarrow';

type Props = {
  catalogue: Catalogue;
  drafts: Record<string, Draft | undefined>;
  disabled: boolean;
  /** Factor codes to show; all factors when unset. */
  factors?: string[];
  collapse: CollapseState;
  serverErrors?: ServerErrors;
  onChange: (code: string, draft: Draft) => void;
};

/**
 * All indicators: a table on tablet and desktop (dimension and factor group rows, then one row
 * per indicator), a list of collapsible cards on a phone.
 */
export function GroupList({
  catalogue,
  drafts,
  disabled,
  factors: shown,
  collapse,
  serverErrors,
  onChange,
}: Props) {
  const t = useTranslations('assessment');
  const tUnits = useTranslations('assessment.units');
  const y3Options = useMemo<CheckboxOption[]>(
    () =>
      catalogue.ri_e_options.map((o) => ({
        value: o.code,
        label: o.label,
        exclusive: o.is_exclusive,
      })),
    [catalogue],
  );
  const narrow = useNarrow();
  const all = codesOf(catalogue.dimensions.flatMap((d) => d.factors));
  const header = (field: 'y1' | 'y2') => {
    const unit = sharedUnit(all, drafts, field);
    return headLabel(t(`table.${field}`), unit === null ? t('table.mixedUnit') : tUnits(unit));
  };
  // The label stays short; the unit goes on a second, quieter line so the header can grow taller.
  const headLabel = (name: string, unit?: string) => (
    <>
      <span className={styles.headName}>{name}</span>
      {unit !== undefined && <span className={styles.headUnit}>{unit}</span>}
    </>
  );

  if (narrow) {
    return (
      <CardList
        catalogue={catalogue}
        drafts={drafts}
        y3Options={y3Options}
        disabled={disabled}
        factors={shown}
        collapse={collapse}
        serverErrors={serverErrors}
        onChange={onChange}
      />
    );
  }

  return (
    <table className={styles.table}>
      <caption className={styles.srOnly}>{t('table.label')}</caption>
      <colgroup>
        <col className={styles.colCode} />
        <col />
        <col className={styles.colX} />
        <col className={styles.colY1} />
        <col className={styles.colY2} />
        <col className={styles.colY3} />
        <col className={styles.colStatus} />
      </colgroup>
      <thead>
        <tr>
          <th scope="col">{t('table.code')}</th>
          <th scope="col">{t('table.indicator')}</th>
          <th scope="col" className={styles.keyHead}>
            {headLabel(t('table.x'), t('table.xUnit'))}
          </th>
          <th scope="col" className={styles.keyHead}>
            {header('y1')}
          </th>
          <th scope="col" className={styles.keyHead}>
            {header('y2')}
          </th>
          <th scope="col" className={styles.keyHead}>
            {headLabel(t('table.y3'))}
          </th>
          <th scope="col">{t('table.status')}</th>
        </tr>
      </thead>
      {catalogue.dimensions.map((dimension) => {
        const factors = dimension.factors.filter(
          (f) => shown === undefined || shown.includes(f.code),
        );
        if (factors.length === 0) return null;
        const dimensionOpen = isDimensionOpen(collapse.collapsed, dimension.code);
        const code = dimensionOf(dimension.code);
        const colours = code && dimensionStyle(code);
        return (
          <tbody
            key={dimension.code}
            style={
              colours && ({ '--dim': colours.color, '--dim-tint': colours.tint } as CSSProperties)
            }
          >
            <tr className={styles.dimensionRow}>
              <th scope="colgroup" colSpan={7}>
                <div className={styles.groupInner}>
                  <GroupToggle
                    open={dimensionOpen}
                    onToggle={() => collapse.toggleDimension(dimension.code)}
                  >
                    {dimension.name}
                  </GroupToggle>
                  <Progress codes={codesOf(factors)} drafts={drafts} />
                </div>
              </th>
            </tr>
            {dimensionOpen &&
              factors.map((f) => (
                <GroupRows
                  key={f.code}
                  factor={f}
                  open={isFactorOpen(collapse.collapsed, dimension.code, f.code)}
                  onToggle={() => collapse.toggleFactor(f.code)}
                  drafts={drafts}
                  y3Options={y3Options}
                  disabled={disabled}
                  serverErrors={serverErrors}
                  onChange={onChange}
                />
              ))}
          </tbody>
        );
      })}
    </table>
  );
}

function GroupRows({
  factor,
  open,
  onToggle,
  drafts,
  y3Options,
  disabled,
  serverErrors,
  onChange,
}: Pick<Props, 'drafts' | 'disabled' | 'serverErrors' | 'onChange'> & {
  factor: Catalogue['dimensions'][number]['factors'][number];
  open: boolean;
  onToggle: () => void;
  y3Options: CheckboxOption[];
}) {
  return (
    <>
      <tr className={styles.factorRow}>
        <th scope="colgroup" colSpan={7}>
          <div className={styles.groupInner}>
            <GroupToggle open={open} onToggle={onToggle}>
              {factor.code} {factor.name}
            </GroupToggle>
            <Progress codes={codesOf([factor])} drafts={drafts} />
          </div>
        </th>
      </tr>
      {open &&
        factor.indicators.map((indicator) => (
          <IndicatorRow
            key={indicator.code}
            indicator={indicator}
            draft={drafts[indicator.code] ?? emptyDraft()}
            y3Options={y3Options}
            disabled={disabled}
            serverErrors={serverErrors?.[indicator.code]}
            onChange={(draft) => onChange(indicator.code, draft)}
          />
        ))}
    </>
  );
}
