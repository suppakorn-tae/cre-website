'use client';

import { useTranslations } from 'next-intl';

import type { CheckboxOption } from '@/components/ui';

import styles from './assessment.module.css';
import type { FieldKey } from './fieldErrors';
import { NumberField, Y3Field, useIndicatorFields, type Indicator } from './indicatorFields';
import type { Draft } from './rules';

type Props = {
  indicator: Indicator;
  draft: Draft;
  y3Options: CheckboxOption[];
  disabled: boolean;
  /** Error codes the server answered with, per field. */
  serverErrors?: Partial<Record<FieldKey, string>>;
  onChange: (draft: Draft) => void;
};

/** One indicator as a table row (tablet and desktop): X, y1, y2 and y3. */
export function IndicatorRow({
  indicator,
  draft,
  y3Options,
  disabled,
  serverErrors,
  onChange,
}: Props) {
  const t = useTranslations('assessment');
  const f = useIndicatorFields({ indicator, draft, serverErrors, onChange });

  return (
    <tr className={styles.row} data-state={f.state}>
      <th scope="row" className={styles.codeCell}>
        {f.code}
      </th>
      <td className={styles.nameCell}>
        <span className={styles.name}>{indicator.name}</span>
        {f.codeError !== undefined && (
          <p role="alert" className={styles.cellError}>
            {f.codeError}
          </p>
        )}
      </td>
      {(['x', 'y1', 'y2'] as const).map((key) => (
        <td key={key} className={styles.cell}>
          <NumberField {...f[key]} label={undefined} disabled={disabled} />
        </td>
      ))}
      <td className={styles.cell}>
        <Y3Field
          indicator={indicator}
          options={y3Options}
          value={f.y3.value}
          disabled={disabled}
          hint={f.y3.hint}
          error={f.y3.error}
          onChange={f.y3.onChange}
        />
      </td>
      <td className={styles.statusCell}>
        <span className={styles.badge} data-state={f.state}>
          {t(`indicator.${f.state}`)}
        </span>
      </td>
    </tr>
  );
}
