'use client';

import { useTranslations } from 'next-intl';
import { useMemo } from 'react';

import type { CheckboxOption } from '@/components/ui';

import type { Catalogue } from './api';
import styles from './assessment.module.css';
import type { ServerErrors } from './fieldErrors';
import { IndicatorCard } from './IndicatorCard';
import { countGroup, emptyDraft, type Draft } from './rules';

type Props = {
  catalogue: Catalogue;
  drafts: Record<string, Draft | undefined>;
  disabled: boolean;
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

/** Dimensions and factors as collapsible groups with per-group progress. */
export function GroupList({ catalogue, drafts, disabled, serverErrors, onChange }: Props) {
  const y3Options = useMemo<CheckboxOption[]>(
    () =>
      catalogue.ri_e_options.map((o) => ({
        value: o.code,
        label: `${o.code} ${o.label}`,
        exclusive: o.is_exclusive,
      })),
    [catalogue],
  );
  const codesOf = (factors: { indicators: { code: string }[] }[]) =>
    factors.flatMap((f) => f.indicators.map((i) => i.code));

  return (
    <div className={styles.groups}>
      {catalogue.dimensions.map((dimension) => (
        <details key={dimension.code} className={styles.dimension} open>
          <summary className={styles.dimensionHead}>
            <span className={styles.groupName}>{dimension.name}</span>
            <Progress codes={codesOf(dimension.factors)} drafts={drafts} />
          </summary>
          {dimension.factors.map((factor) => (
            <details key={factor.code} className={styles.factor} open>
              <summary className={styles.factorHead}>
                <span className={styles.groupName}>
                  {factor.code} {factor.name}
                </span>
                <Progress codes={codesOf([factor])} drafts={drafts} />
              </summary>
              <ul className={styles.indicators}>
                {factor.indicators.map((indicator) => (
                  <IndicatorCard
                    key={indicator.code}
                    indicator={indicator}
                    draft={drafts[indicator.code] ?? emptyDraft()}
                    y3Options={y3Options}
                    disabled={disabled}
                    serverErrors={serverErrors?.[indicator.code]}
                    onChange={(draft) => onChange(indicator.code, draft)}
                  />
                ))}
              </ul>
            </details>
          ))}
        </details>
      ))}
    </div>
  );
}
