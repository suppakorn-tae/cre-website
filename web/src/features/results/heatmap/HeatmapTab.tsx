'use client';

import { useTranslations } from 'next-intl';

import { LEVELS } from '@/components/ui';
import { formatNumber } from '@/lib/format/locale';

import type { IndicatorName, IndicatorResult } from '../overview/api';
import { formatRm } from '../overview/format';
import overview from '../overview/results.module.css';
import styles from './heatmap.module.css';
import { heatRows } from './rules';

type Props = { items: IndicatorResult[]; names: Map<string, IndicatorName> };

/**
 * Heat map (FR-47): one cell per indicator, one row per factor. One hue,
 * light (VL) to dark (VH); each cell prints its level code and RM, so colour
 * is never the only cue.
 */
export function HeatmapTab({ items, names }: Props) {
  const t = useTranslations('advice.heatmap');
  const tUi = useTranslations('ui');
  const rows = heatRows(items, names);

  return (
    <div className={overview.panelBody}>
      <section aria-labelledby="heatmap-title" className={overview.card}>
        <h2 id="heatmap-title" className={overview.cardTitle}>
          {t('title')}
        </h2>
        <ul className={styles.legend} aria-label={t('legendLabel')}>
          {[...LEVELS].reverse().map((level) => (
            <li key={level}>
              <span className={`${styles.swatch} ${styles[level]}`} aria-hidden="true" />
              {level} · {tUi(`levels.${level}`)}
            </li>
          ))}
          <li>
            <span className={`${styles.swatch} ${styles.none}`} aria-hidden="true" />
            {t('notAssessed')}
          </li>
        </ul>
        <div className={styles.scroll}>
          <table className={styles.grid}>
            <caption className={overview.srOnly}>{t('caption')}</caption>
            <tbody>
              {rows.map((row) => (
                <tr key={row.factorCode}>
                  <th scope="row" className={styles.factor}>
                    <span className={styles.factorCode}>{row.factorCode}</span> {row.factorName}
                  </th>
                  {row.cells.map(({ code, name, item }) => (
                    <td
                      key={code}
                      className={`${styles.cell} ${item ? styles[item.level] : styles.none}`}
                      title={`${code} ${name}`}
                      aria-label={
                        item
                          ? t('cell', {
                              code,
                              name,
                              level: tUi(`levels.${item.level}`),
                              rm: formatRm(item.rm),
                            })
                          : t('cellNone', { code, name })
                      }
                    >
                      <span className={styles.code}>{code}</span>
                      <span>{item ? `${item.level} · ${formatRm(item.rm)}` : '–'}</span>
                    </td>
                  ))}
                  <td className={styles.sum}>
                    {t('factorSummary', { vh: formatNumber(row.vh), h: formatNumber(row.h) })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
