'use client';

import * as VisuallyHidden from '@radix-ui/react-visually-hidden';
import { useTranslations } from 'next-intl';
import { useId } from 'react';

import { useLeaving, useSweep, useTween } from '@/components/ui/chartMotion';
import { formatNumber } from '@/lib/format/locale';

import { useBoxWidth } from './chartBox';
import styles from './compare.module.css';
import { linePath, RM_BANDS } from './rules';

export type RmSeries = {
  code: string;
  name: string;
  /** Position among the drawn indicators: picks the colour and the marker shape. */
  index: number;
  /** Odd factors are drawn dashed, so two factors differ by more than colour. */
  dashed: boolean;
  /** One RM per entry of `versions`; null where the version has none. */
  values: (number | null)[];
};

export type RmVersion = { id: string; no: number; submitted: boolean; progress?: number };

const HEIGHT = 300;
const M = { left: 40, right: 44, top: 16, bottom: 52 };
const TICKS = [1, 2, 3, 4, 5];
export const SERIES_COUNT = 6;

/** Marker for series `index`: circle, square, diamond or triangle, centred on (x, y). */
function Marker({ x, y, index }: { x: number; y: number; index: number }) {
  const props = { className: styles.marker, 'data-series': index % SERIES_COUNT };
  switch (index % 4) {
    case 1:
      return <rect x={x - 4.5} y={y - 4.5} width="9" height="9" {...props} />;
    case 2:
      return <path d={`M${x} ${y - 6}L${x + 6} ${y}L${x} ${y + 6}L${x - 6} ${y}Z`} {...props} />;
    case 3:
      return <path d={`M${x} ${y - 6}L${x + 6} ${y + 5}L${x - 6} ${y + 5}Z`} {...props} />;
    default:
      return <circle cx={x} cy={y} r="5" {...props} />;
  }
}

/** RM (1 to 5) of the chosen indicators over the versions, with the H and VH bands. Plain SVG. */
export function IndicatorRmChart({
  versions,
  series,
}: {
  versions: RmVersion[];
  series: RmSeries[];
}) {
  const t = useTranslations('compare.rm');
  const tt = useTranslations('compare.trend');
  const [boxRef, boxWidth] = useBoxWidth();
  const plotW = Math.max(boxWidth - M.left - M.right, 1);
  const plotH = HEIGHT - M.top - M.bottom;
  const slot = plotW / Math.max(versions.length, 1);
  const yRm = (rm: number) =>
    M.top + plotH - ((rm - RM_BANDS.min) / (RM_BANDS.max - RM_BANDS.min)) * plotH;
  // Points move as shares of the RM axis, so a resize never animates and a filter change glides
  // from what is on screen. On load the lines are drawn left to right and the markers fade in.
  const share = useTween(
    Object.fromEntries(
      series.flatMap((s) =>
        s.values.map((v, i) => [
          `${s.code}:${i}`,
          ((v ?? RM_BANDS.min) - RM_BANDS.min) / (RM_BANDS.max - RM_BANDS.min),
        ]),
      ),
    ),
  );
  const draw = useSweep();
  // An indicator taken out by a filter stays for a moment and fades out where it was.
  const rows = useLeaving(series, (s) => s.code);
  const norm = (v: number | null) =>
    ((v ?? RM_BANDS.min) - RM_BANDS.min) / (RM_BANDS.max - RM_BANDS.min);
  const clipId = `${useId()}-draw`;
  const yShare = (value: number) => M.top + plotH - value * plotH;
  const centre = (i: number) => M.left + slot * (i + 0.5);
  const empty = Math.min(88, slot * 0.7);
  const rm = (v: number | null) =>
    v === null
      ? t('noValue')
      : formatNumber(v, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <figure className={styles.figure}>
      <div ref={boxRef} className={styles.plot}>
        <svg
          width={boxWidth}
          height={HEIGHT}
          viewBox={`0 0 ${boxWidth} ${HEIGHT}`}
          role="img"
          aria-label={t('chartLabel')}
        >
          <rect
            x={M.left}
            y={yRm(RM_BANDS.max)}
            width={plotW}
            height={yRm(RM_BANDS.vh) - yRm(RM_BANDS.max)}
            className={styles.bandVh}
          />
          <rect
            x={M.left}
            y={yRm(RM_BANDS.vh)}
            width={plotW}
            height={yRm(RM_BANDS.h) - yRm(RM_BANDS.vh)}
            className={styles.bandH}
          />
          <text
            x={M.left + plotW + 8}
            y={(yRm(RM_BANDS.max) + yRm(RM_BANDS.vh)) / 2 + 4}
            className={styles.bandVhLabel}
          >
            {t('bandVh')}
          </text>
          <text
            x={M.left + plotW + 8}
            y={(yRm(RM_BANDS.vh) + yRm(RM_BANDS.h)) / 2 + 4}
            className={styles.bandHLabel}
          >
            {t('bandH')}
          </text>
          {TICKS.map((tick) => (
            <g key={tick}>
              <line
                x1={M.left}
                x2={M.left + plotW}
                y1={yRm(tick)}
                y2={yRm(tick)}
                className={styles.grid}
              />
              <text x={M.left - 8} y={yRm(tick) + 4} textAnchor="end" className={styles.axis}>
                {tick}
              </text>
            </g>
          ))}
          {versions.map((v, i) => (
            <g key={v.id}>
              {!v.submitted && (
                <>
                  <rect
                    x={centre(i) - empty / 2}
                    y={M.top}
                    width={empty}
                    height={plotH}
                    rx="6"
                    className={styles.emptySlot}
                  />
                  <text
                    x={centre(i)}
                    y={M.top + plotH / 2 - 2}
                    textAnchor="middle"
                    className={styles.emptyText}
                  >
                    {t('noResult')}
                  </text>
                  <text
                    x={centre(i)}
                    y={M.top + plotH / 2 + 14}
                    textAnchor="middle"
                    className={styles.emptyText}
                  >
                    {t('left')}
                  </text>
                </>
              )}
              <text x={centre(i)} y={HEIGHT - 26} textAnchor="middle" className={styles.axisStrong}>
                {tt('versionShort', { no: v.no })}
              </text>
              <text x={centre(i)} y={HEIGHT - 8} textAnchor="middle" className={styles.axis}>
                {v.submitted
                  ? v.progress === undefined
                    ? ''
                    : tt('progress', { value: formatNumber(v.progress) })
                  : t('notSent')}
              </text>
            </g>
          ))}
          <clipPath id={clipId}>
            <rect x="0" y="0" width={boxWidth * draw} height={HEIGHT} />
          </clipPath>
          <g clipPath={draw < 1 ? `url(#${clipId})` : undefined}>
            {rows.map(({ item: s, leaving }) => {
              const y = (v: number | null, i: number) => yShare(share[`${s.code}:${i}`] ?? norm(v));
              return (
                <g
                  key={s.code}
                  className={leaving ? `${styles.series} ${styles.leaving}` : styles.series}
                  data-series={s.index % SERIES_COUNT}
                  aria-hidden={leaving ? true : undefined}
                >
                  <path
                    d={linePath(
                      s.values.map((v, i) =>
                        v === null ? undefined : { x: centre(i), y: y(v, i) },
                      ),
                    )}
                    fill="none"
                    strokeDasharray={s.dashed ? '6 4' : undefined}
                  />
                  {s.values.map((v, i) =>
                    v === null ? null : (
                      <Marker key={i} x={centre(i)} y={y(v, i)} index={s.index} />
                    ),
                  )}
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <VisuallyHidden.Root asChild>
        <div>
          <table>
            <caption>{t('tableCaption')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('columns.indicator')}</th>
                {versions.map((v) => (
                  <th key={v.id} scope="col">
                    {tt('versionShort', { no: v.no })}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.map((s) => (
                <tr key={s.code}>
                  <th scope="row">{s.name}</th>
                  {s.values.map((v, i) => (
                    <td key={versions[i].id}>{rm(v)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </VisuallyHidden.Root>
    </figure>
  );
}
