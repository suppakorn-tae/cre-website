'use client';

import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { useLeaving, useSweep, useTween } from '@/components/ui/chartMotion';
import { formatNumber } from '@/lib/format/locale';

import type { TrendPoint } from './api';
import { useBoxWidth } from './chartBox';
import styles from './compare.module.css';
import { DistributionCard } from './DistributionCard';
import { InlineSelect } from './InlineSelect';
import { barAxis, linePath, RM_BANDS, visiblePoints, type TrendFilter } from './rules';

const HEIGHT = 280;
const M = { left: 44, right: 44, top: 28, bottom: 52 };
const RM_TICKS = [1, 2, 3, 4, 5];

type Props = {
  points: TrendPoint[];
  /** Progress at submit per version id, for the label under each version. */
  progress?: Record<string, number>;
};

/** The two cross-version cards of the summary view: the trend and the level distribution. */
export function TrendCharts({ points, progress }: Props) {
  return (
    <>
      <TrendCard points={points} progress={progress} />
      <DistributionCard points={points} />
    </>
  );
}

/** Bars for H + VH on the left axis and a line for the average RM on the right axis. */
function TrendCard({ points, progress }: Props) {
  const t = useTranslations('compare.trend');
  const titleId = useId();
  const [filter, setFilter] = useState<TrendFilter>('all');
  const [boxRef, boxWidth] = useBoxWidth();
  const shown = visiblePoints(points, filter);

  const plotW = Math.max(boxWidth - M.left - M.right, 1);
  const plotH = HEIGHT - M.top - M.bottom;
  // A version taken out by the filter stays for a moment and fades out, in its slot.
  const rows = useLeaving(shown, (p) => p.version_id);
  const drawn = rows.map((r) => r.item);
  const leaving = new Set(rows.filter((r) => r.leaving).map((r) => r.item.version_id));
  const slot = plotW / Math.max(drawn.length, 1);
  const barW = Math.min(56, slot * 0.5);
  const axis = barAxis(Math.max(0, ...shown.map((p) => p.h_vh_count ?? 0)));
  // Bars and points move as shares of their axis, so a resize never animates and a change glides
  // from what is on screen. Bars grow in from the axis on load; the line is drawn left to right.
  const barShare = useTween(
    Object.fromEntries(shown.map((p) => [p.version_id, (p.h_vh_count ?? 0) / axis.top])),
    { enter: 'zero' },
  );
  const rmShare = useTween(
    Object.fromEntries(
      shown.map((p) => [
        p.version_id,
        ((p.avg_rm ?? RM_BANDS.min) - RM_BANDS.min) / (RM_BANDS.max - RM_BANDS.min),
      ]),
    ),
  );
  const draw = useSweep();
  const yBar = (v: number) => M.top + plotH - (v / axis.top) * plotH;
  const yShare = (share: number) => M.top + plotH - share * plotH;
  const clipId = `${titleId}-draw`;
  const centre = (i: number) => M.left + slot * (i + 0.5);
  const rmY = (p: TrendPoint) =>
    yShare(
      rmShare[p.version_id] ??
        ((p.avg_rm ?? RM_BANDS.min) - RM_BANDS.min) / (RM_BANDS.max - RM_BANDS.min),
    );
  const dots = drawn.map((p, i) => (p.avg_rm === null ? undefined : { x: centre(i), y: rmY(p) }));
  // The line joins the versions that stay; one that is leaving only fades its dot.
  const lineDots = dots.filter((_, i) => !leaving.has(drawn[i].version_id));
  const rm = (v: number) =>
    formatNumber(v, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <section aria-labelledby={titleId} className={styles.card}>
      <div className={styles.cardHead}>
        <h2 id={titleId} className={styles.cardTitle}>
          {t('title')}
        </h2>
        <InlineSelect
          label={t('show')}
          value={filter}
          onChange={(v) => setFilter(v as TrendFilter)}
          options={[
            { value: 'all', label: t('filter.all') },
            { value: 'submitted', label: t('filter.submitted') },
          ]}
        />
      </div>
      <ul className={styles.keys}>
        <li>
          <span className={styles.keyBar} aria-hidden="true" />
          {t('legendBars')}
        </li>
        <li>
          <span className={styles.keyLine} aria-hidden="true" />
          {t('legendLine')}
        </li>
        <li>
          <span className={styles.keyEmpty} aria-hidden="true" />
          {t('legendEmpty')}
        </li>
      </ul>
      <figure className={styles.figure}>
        <div ref={boxRef} className={styles.plot}>
          <svg
            width={boxWidth}
            height={HEIGHT}
            viewBox={`0 0 ${boxWidth} ${HEIGHT}`}
            role="img"
            aria-label={t('chartLabel')}
          >
            {axis.ticks.map((tick, i) => {
              const y = yBar(tick);
              return (
                <g key={tick}>
                  <line x1={M.left} x2={M.left + plotW} y1={y} y2={y} className={styles.grid} />
                  <text x={M.left - 8} y={y + 4} textAnchor="end" className={styles.axis}>
                    {formatNumber(tick)}
                  </text>
                  <text x={M.left + plotW + 8} y={y + 4} textAnchor="start" className={styles.axis}>
                    {RM_TICKS[i]}
                  </text>
                </g>
              );
            })}
            {drawn.map((p, i) => {
              const x = centre(i);
              const submitted = p.h_vh_count !== null;
              const share = progress?.[p.version_id];
              const barTop = yShare(barShare[p.version_id] ?? (p.h_vh_count ?? 0) / axis.top);
              return (
                <g
                  key={p.version_id}
                  className={leaving.has(p.version_id) ? styles.leaving : undefined}
                  aria-hidden={leaving.has(p.version_id) ? true : undefined}
                >
                  {submitted ? (
                    <>
                      <rect
                        x={x - barW / 2}
                        y={barTop}
                        width={barW}
                        height={M.top + plotH - barTop}
                        rx="4"
                        className={styles.bar}
                      />
                      <text x={x} y={barTop - 6} textAnchor="middle" className={styles.barValue}>
                        {formatNumber(p.h_vh_count ?? 0)}
                      </text>
                    </>
                  ) : (
                    <>
                      <rect
                        x={x - Math.max(barW, 44) / 2}
                        y={M.top}
                        width={Math.max(barW, 44)}
                        height={plotH}
                        rx="6"
                        className={styles.emptySlot}
                      />
                      <text
                        x={x}
                        y={M.top + plotH / 2 - 2}
                        textAnchor="middle"
                        className={styles.emptyText}
                      >
                        {t('notSent')}
                      </text>
                      <text
                        x={x}
                        y={M.top + plotH / 2 + 14}
                        textAnchor="middle"
                        className={styles.emptyText}
                      >
                        {t('noResult')}
                      </text>
                    </>
                  )}
                  <text x={x} y={HEIGHT - 26} textAnchor="middle" className={styles.axisStrong}>
                    {t('versionShort', { no: p.version_no })}
                  </text>
                  {share !== undefined && submitted && (
                    <text x={x} y={HEIGHT - 8} textAnchor="middle" className={styles.axis}>
                      {t('progress', { value: formatNumber(share) })}
                    </text>
                  )}
                </g>
              );
            })}
            <clipPath id={clipId}>
              <rect x="0" y="0" width={boxWidth * draw} height={HEIGHT} />
            </clipPath>
            <g clipPath={draw < 1 ? `url(#${clipId})` : undefined}>
              <path d={linePath(lineDots)} className={styles.rmLine} fill="none" />
              {dots.map((d, i) =>
                d ? (
                  <g
                    key={drawn[i].version_id}
                    className={leaving.has(drawn[i].version_id) ? styles.leaving : undefined}
                    aria-hidden={leaving.has(drawn[i].version_id) ? true : undefined}
                  >
                    <circle cx={d.x} cy={d.y} r="4.5" className={styles.rmDot} />
                    <text x={d.x + 10} y={d.y - 8} className={styles.rmValue}>
                      {rm(drawn[i].avg_rm ?? 0)}
                    </text>
                  </g>
                ) : null,
              )}
            </g>
          </svg>
        </div>
        <VisuallyHidden.Root asChild>
          <div>
            <table>
              <caption>{t('tableCaption')}</caption>
              <thead>
                <tr>
                  <th scope="col">{t('columns.version')}</th>
                  <th scope="col">{t('columns.hvh')}</th>
                  <th scope="col">{t('columns.rm')}</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((p) => (
                  <tr key={p.version_id}>
                    <th scope="row">{t('versionShort', { no: p.version_no })}</th>
                    <td>{p.h_vh_count === null ? t('notSent') : formatNumber(p.h_vh_count)}</td>
                    <td>{p.avg_rm === null ? t('noResult') : rm(p.avg_rm)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </VisuallyHidden.Root>
      </figure>
    </section>
  );
}
