'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { CheckboxOption } from '@/components/ui';

import type { Catalogue } from './api';
import styles from './assessment.module.css';
import type { ServerErrors } from './fieldErrors';
import { IndicatorRow } from './IndicatorRow';
import { countGroup, emptyDraft, sharedUnit, type Draft } from './rules';

type Props = {
  catalogue: Catalogue;
  drafts: Record<string, Draft | undefined>;
  disabled: boolean;
  /** Factor code to show alone; all factors when unset. */
  factor?: string;
  serverErrors?: ServerErrors;
  onChange: (code: string, draft: Draft) => void;
};

function Progress({ codes, drafts }: { codes: string[]; drafts: Props['drafts'] }) {
  const t = useTranslations('assessment.progress');
  const { total, answered, complete } = countGroup(codes, drafts);
  return (
    <span className={styles.progress}>
      {t('group', { complete, total })} · {t('answered', { answered })}
    </span>
  );
}

const codesOf = (factors: { indicators: { code: string }[] }[]) =>
  factors.flatMap((f) => f.indicators.map((i) => i.code));

/** All indicators as one table: dimension and factor group rows, then one row per indicator. */
export function GroupList({ catalogue, drafts, disabled, factor, serverErrors, onChange }: Props) {
  const t = useTranslations('assessment');
  const tUnits = useTranslations('assessment.units');
  const y3Options = useMemo<CheckboxOption[]>(
    () =>
      catalogue.ri_e_options.map((o) => ({
        value: o.code,
        label: `${o.code} ${o.label}`,
        exclusive: o.is_exclusive,
      })),
    [catalogue],
  );
  const all = codesOf(catalogue.dimensions.flatMap((d) => d.factors));
  const header = (field: 'y1' | 'y2') => {
    const unit = sharedUnit(all, drafts, field);
    return t('table.withUnit', {
      name: t(`table.${field}`),
      unit: unit === null ? t('table.mixedUnit') : tUnits(unit),
    });
  };

  return (
    <table className={styles.table}>
      <caption className={styles.srOnly}>{t('table.label')}</caption>
      <thead>
        <tr>
          <th scope="col">{t('table.code')}</th>
          <th scope="col">{t('table.indicator')}</th>
          <th scope="col">{t('table.x')}</th>
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
