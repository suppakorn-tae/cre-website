'use client';

import { useEffect, type RefObject } from 'react';

/**
 * Keeps `--bar-height` on the page equal to the real height of the fixed bar (its padding,
 * border and the home-indicator inset included), so the padding and scroll margin follow it when
 * the buttons wrap. Until this runs, the CSS fallback in the stylesheet applies.
 */
export function useBarHeight(
  page: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useEffect(() => {
    const pageEl = page.current;
    const barEl = bar.current;
    if (!pageEl || !barEl || !active || typeof ResizeObserver === 'undefined') return;
    const apply = () => pageEl.style.setProperty('--bar-height', `${barEl.offsetHeight}px`);
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(barEl);
    return () => {
      observer.disconnect();
      pageEl.style.removeProperty('--bar-height');
    };
  }, [page, bar, active]);
}
