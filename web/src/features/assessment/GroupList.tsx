'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { CheckboxOption } from '@/components/ui';

import type { Catalogue } from './api';
import styles from './assessment.module.css';
import type { ServerErrors } from './fieldErrors';
import { CardList } from './CardList';
import { codesOf, Progress } from './GroupProgress';
import { IndicatorRow } from './IndicatorRow';
import { emptyDraft, sharedUnit, type Draft } from './rules';
import { useNarrow } from './useNarrow';

type Props = {
  catalogue: Catalogue;
  drafts: Record<string, Draft | undefined>;
  disabled: boolean;
  /** Factor code to show alone; all factors when unset. */
  factor?: string;
  serverErrors?: ServerErrors;
  onChange: (code: string, draft: Draft) => void;
};

/**
 * All indicators: a table on tablet and desktop (dimension and factor group rows, then one row
 * per indicator), a list of collapsible cards on a phone.
 */
export function GroupList({ catalogue, drafts, disabled, factor, serverErrors, onChange }: Props) {
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
    return t('table.withUnit', {
      name: t(`table.${field}`),
      unit: unit === null ? t('table.mixedUnit') : tUnits(unit),
    });
  };

  if (narrow) {
    return (
      <CardList
        catalogue={catalogue}
        drafts={drafts}
        y3Options={y3Options}
        disabled={disabled}
        factor={factor}
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
          <th scope="col">{t('table.withUnit', { name: t('table.x'), unit: t('table.xUnit') })}</th>
          <th scope="col">{header('y1')}</th>
          <th scope="col">{header('y2')}</th>
          <th scope="col">{t('table.y3')}</th>
          <th scope="col">{t('table.status')}</th>
        </tr>
      </thead>
      {catalogue.dimensions.map((dimension) => {
        const factors = dimension.factors.filter((f) => factor === undefined || f.code === factor);
        if (factors.length === 0) return null;
        return (
          <tbody key={dimension.code}>
            <tr className={styles.dimensionRow}>
              <th scope="colgroup" colSpan={7}>
                <div className={styles.groupInner}>
                  <span className={styles.groupName}>{dimension.name}</span>
                  <Progress codes={codesOf(factors)} drafts={drafts} />
                </div>
              </th>
            </tr>
            {factors.map((f) => (
              <GroupRows
                key={f.code}
                factor={f}
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
  drafts,
  y3Options,
  disabled,
  serverErrors,
  onChange,
}: Pick<Props, 'drafts' | 'disabled' | 'serverErrors' | 'onChange'> & {
  factor: Catalogue['dimensions'][number]['factors'][number];
  y3Options: CheckboxOption[];
}) {
  return (
    <>
      <tr className={styles.factorRow}>
        <th scope="colgroup" colSpan={7}>
          <div className={styles.groupInner}>
            <span className={styles.groupName}>
              {factor.code} {factor.name}
            </span>
            <Progress codes={codesOf([factor])} drafts={drafts} />
          </div>
        </th>
      </tr>
      {factor.indicators.map((indicator) => (
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
