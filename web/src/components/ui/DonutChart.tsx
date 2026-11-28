'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { formatNumber } from '@/lib/format/locale';

import { useReducedMotion, useSweep, useTween } from './chartMotion';
import styles from './display.module.css';
import { TooltipContent } from './TooltipContent';

export type DonutSegment = {
  key: string;
  value: number;
  /** Any CSS colour, normally a token such as `var(--level-h)`. */
  color: string;
};

/** Text of one segment's tooltip. `title` is the name line, `detail` the numbers line. */
export type DonutSegmentDetail = { title: string; detail: string };

export type DonutArc = DonutSegment & { length: number; offset: number };

/** The ring has a circumference of 100, so a segment's length is its share in percent. */
const RADIUS = 15.9155;
const STROKE = 6;
/** Stroke of an arc while it is hovered or focused (see `.donutArc[data-active]`). */
export const ACTIVE_STROKE = 7.6;
/** Keyboard focus ring: a card-coloured halo, then the ring, both outside the grown arc. */
const HALO = 0.5;
const RING = 1;
/** The viewBox has room for the ring outside the radius, so it is never clipped. */
const VIEW_PAD = 2;
const VIEW = 40 + 2 * VIEW_PAD;
/** Gap between neighbouring segments: about 2 degrees of the ring (100 = 360 degrees). */
export const GAP = (2 / 360) * 100;

/** Arcs on the ring, one per non-empty segment, in the order given. Empty when the total is 0. */
export function donutArcs(segments: DonutSegment[]): DonutArc[] {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.value), 0);
  if (total === 0) return [];
  let offset = 0;
  const arcs: DonutArc[] = [];
  for (const s of segments) {
    if (s.value <= 0) continue;
    const length = (s.value / total) * 100;
    arcs.push({ ...s, length, offset });
    offset += length;
  }
  return arcs;
}

/**
 * The dash that is drawn for an arc: the arc less a gap, centred on its slot, so neighbours
 * are GAP apart. A lone segment is a full ring and keeps no gap. Never shorter than a sliver.
 */
export function drawnArc(arc: DonutArc, count: number): { length: number; offset: number } {
  if (count < 2) return { length: arc.length, offset: arc.offset };
  const length = Math.max(arc.length - GAP, 0.01);
  return { length, offset: arc.offset + (arc.length - length) / 2 };
}

/** Centre of an arc as a share (0 to 100) of the viewBox width and height, for anchoring a popup. */
export function arcAnchor(arc: DonutArc): { x: number; y: number } {
  const angle = ((arc.offset + arc.length / 2) / 100) * 2 * Math.PI - Math.PI / 2;
  return {
    x: ((VIEW_PAD + 20 + RADIUS * Math.cos(angle)) / VIEW) * 100,
    y: ((VIEW_PAD + 20 + RADIUS * Math.sin(angle)) / VIEW) * 100,
  };
}

/** Pause before a tooltip closes, so the pointer can cross to the popup (WCAG 1.4.13 hoverable). */
const CLOSE_DELAY = 150;

/** Motion runs only when asked for and not switched off in the system settings. */
export function shouldAnimate(animate: boolean, reducedMotion: boolean): boolean {
  return animate && !reducedMotion;
}

/** Whole number shown in the hole, or null when the centre is not a plain count. */
export function centreCount(centre: ReactNode): number | null {
  if (typeof centre === 'number') return Number.isInteger(centre) ? centre : null;
  if (typeof centre === 'string' && /^\d{1,3}(,\d{3})*$|^\d+$/.test(centre)) {
    return Number(centre.replace(/,/g, ''));
  }
  return null;
}

/** True when the browser shows a focus ring for this element (keyboard, not a mouse click). */
function focusVisible(el: Element): boolean {
  try {
    return el.matches(':focus-visible');
  } catch {
    return false;
  }
}

type Props = {
  segments: DonutSegment[];
  /** Text alternative of the ring. The numbers should also be in text next to it (a legend). */
  label: string;
  /** Big text in the hole, e.g. the total. */
  centre: ReactNode;
  /** Small text under it, e.g. the unit. */
  caption?: ReactNode;
  /** Id of an element that describes the chart, such as its legend. */
  describedBy?: string;
  /** Sweep the ring in on mount and move the slices when values change. None under reduced motion. */
  animate?: boolean;
  /**
   * Tooltip text per segment key. A segment listed here grows on hover or focus and shows a
   * tooltip (also on keyboard focus and touch; Escape dismisses it). Without it the ring is plain.
   */
  details?: Record<string, DonutSegmentDetail>;
};

/**
 * Generic donut. It draws the ring only: colour never carries the meaning alone, so the
 * caller prints each segment's name and value as text (the legend).
 */
export function DonutChart({
  segments,
  label,
  centre,
  caption,
  describedBy,
  animate = true,
  details,
}: Props) {
  const [active, setActive] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const open = useCallback((key: string) => {
    clearTimeout(closeTimer.current);
    setActive(key);
  }, []);
  const close = useCallback((key: string, delay = 0) => {
    clearTimeout(closeTimer.current);
    const hide = () => setActive((now) => (now === key ? null : now));
    if (delay > 0) closeTimer.current = setTimeout(hide, delay);
    else hide();
  }, []);
  useEffect(() => () => clearTimeout(closeTimer.current), []);
  // The arc that shows the keyboard ring. A mouse click or a tap focuses without it.
  const [ringKey, setRingKey] = useState<string | null>(null);
  const interactive = details !== undefined;
  const maskId = useId();
  const moving = shouldAnimate(animate, useReducedMotion());
  const progress = useSweep(moving);
  const count = centreCount(centre);
  const shownCentre =
    moving && count !== null ? formatNumber(Math.round(count * progress)) : centre;
  // A change of the values moves the slices from where they are; the sweep covers the first draw.
  const tweened = useTween(Object.fromEntries(segments.map((s) => [s.key, s.value])), {
    enabled: moving,
  });
  const arcs = donutArcs(segments.map((s) => ({ ...s, value: tweened[s.key] ?? s.value })));
  return (
    <div
      className="relative mx-auto w-full shrink-0"
      style={{ maxWidth: `${(11 * VIEW) / 40}rem`, aspectRatio: '1 / 1' }}
    >
      <svg
        viewBox={`${-VIEW_PAD} ${-VIEW_PAD} ${VIEW} ${VIEW}`}
        role={interactive ? 'group' : 'img'}
        aria-label={label}
        aria-describedby={describedBy}
        className="block h-full w-full"
      >
        <circle
          cx="20"
          cy="20"
          r={RADIUS}
          fill="none"
          stroke="var(--color-subtle)"
          strokeWidth={STROKE}
        />
        {ringKey !== null &&
          arcs.length > 0 &&
          (() => {
            const arc = arcs.find((a) => a.key === ringKey);
            if (!arc) return null;
            // Longer than the arc by a sliver at each end, so the ends are ringed too; the
            // neighbours are drawn later and cover the overlap.
            const d = drawnArc(arc, arcs.length);
            const pad = arcs.length < 2 ? 0 : GAP / 2;
            const dash = `${d.length + 2 * pad} ${100 - d.length - 2 * pad}`;
            const shared = {
              cx: 20,
              cy: 20,
              r: RADIUS,
              fill: 'none',
              strokeDasharray: dash,
              strokeDashoffset: 25 - d.offset + pad,
              'data-focus-ring': '',
              className: styles.donutRing,
            };
            return (
              <g aria-hidden="true">
                <circle
                  {...shared}
                  stroke="var(--color-blue-600)"
                  strokeWidth={ACTIVE_STROKE + 2 * (HALO + RING)}
                />
                <circle
                  {...shared}
                  stroke="var(--color-card)"
                  strokeWidth={ACTIVE_STROKE + 2 * HALO}
                />
              </g>
            );
          })()}
        {/* A mask, not a paint: white means "show". It stays white in dark mode. */}
        <mask id={maskId}>
          <circle
            cx="20"
            cy="20"
            r={RADIUS}
            fill="none"
            stroke="white"
            strokeWidth={STROKE + 2}
            strokeDasharray="100 100"
            transform="rotate(-90 20 20)"
            className={moving ? styles.donutSweep : undefined}
          />
        </mask>
        <g mask={`url(#${maskId})`}>
          {arcs.map((arc) => {
            const d = drawnArc(arc, arcs.length);
            const detail = details?.[arc.key];
            return (
              <circle
                key={arc.key}
                {...(detail && {
                  role: 'img',
                  tabIndex: 0,
                  'aria-label': `${detail.title} ${detail.detail}`,
                  'data-active': active === arc.key ? '' : undefined,
                  className: styles.donutArc,
                  // Touch has no hover: a tap focuses the arc, and focus shows the tooltip.
                  onPointerEnter: (e) => e.pointerType !== 'touch' && open(arc.key),
                  onPointerLeave: (e) => e.pointerType !== 'touch' && close(arc.key, CLOSE_DELAY),
                  onFocus: (e) => {
                    open(arc.key);
                    setRingKey(focusVisible(e.currentTarget) ? arc.key : null);
                  },
                  onBlur: () => {
                    close(arc.key);
                    setRingKey((now) => (now === arc.key ? null : now));
                  },
                })}
                cx="20"
                cy="20"
                r={RADIUS}
                fill="none"
                stroke={arc.color}
                strokeWidth={STROKE}
                strokeDasharray={`${d.length} ${100 - d.length}`}
                strokeDashoffset={25 - d.offset}
              />
            );
          })}
        </g>
      </svg>
      {details && (
        <Tooltip.Provider>
          {arcs.map((arc) => {
            const detail = details[arc.key];
            if (!detail) return null;
            const { x, y } = arcAnchor(arc);
            return (
              <Tooltip.Root
                key={arc.key}
                open={active === arc.key}
                onOpenChange={(next) => !next && close(arc.key)}
              >
                {/* Only the anchor of the popup; the arc itself takes the pointer and focus. */}
                <Tooltip.Trigger asChild>
                  <span
                    aria-hidden="true"
                    tabIndex={-1}
                    className="pointer-events-none absolute h-px w-px"
                    style={{ left: `${x}%`, top: `${y}%` }}
                  />
                </Tooltip.Trigger>
                <TooltipContent
                  sideOffset={10}
                  onPointerEnter={() => open(arc.key)}
                  onPointerLeave={() => close(arc.key, CLOSE_DELAY)}
                >
                  <span className={styles.donutTipTitle}>
                    <span
                      aria-hidden="true"
                      className={styles.donutTipDot}
                      style={{ background: arc.color }}
                    />
                    {detail.title}
                  </span>
                  <span className={styles.donutTipDetail}>{detail.detail}</span>
                </TooltipContent>
              </Tooltip.Root>
            );
          })}
        </Tooltip.Provider>
      )}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center"
      >
        <span className="text-kpi font-semibold leading-none text-navy-900">{shownCentre}</span>
        {caption !== undefined && (
          <span className="mt-1 text-caption text-text-secondary">{caption}</span>
        )}
      </span>
    </div>
  );
}
