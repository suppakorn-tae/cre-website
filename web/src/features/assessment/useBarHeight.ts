'use client';

import { useEffect, type RefObject } from 'react';

import styles from './assessment.module.css';

/**
 * Keeps the page clear of what sticks to its edges, so a focused control never sits under it:
 *
 * - `--bar-height` on the page (narrow only) equals the real height of the fixed bar, padding,
 *   border and home-indicator inset included, so the padding and scroll margin follow it when the
 *   buttons wrap. Until this runs, the CSS fallback in the stylesheet applies.
 * - `--scroll-pad-top` and `--scroll-pad-bottom` on the root are the heights of the sticky heads
 *   (app header, table header or dimension and factor heads) and of the submit bar. `html` turns
 *   them into `scroll-padding`, so the browser scrolls a focused control into the free area.
 */
export function useBarHeight(
  page: RefObject<HTMLElement | null>,
  bar: RefObject<HTMLElement | null>,
  narrow: boolean,
) {
  useEffect(() => {
    const pageEl = page.current;
    const barEl = bar.current;
    if (!pageEl || !barEl || typeof ResizeObserver === 'undefined') return;
    const root = document.documentElement;
    const read = (name: string) => parseFloat(getComputedStyle(root).getPropertyValue(name)) || 0;
    const gap = read('--space-2');
    const nav = read('--nav-height');
    const height = (el: Element | null) => el?.getBoundingClientRect().height ?? 0;
    const apply = () => {
      if (narrow) pageEl.style.setProperty('--bar-height', `${barEl.offsetHeight}px`);
      root.style.setProperty('--scroll-pad-bottom', `${barEl.offsetHeight + gap}px`);
      // Sticky under the app header: the table header (wide), or a dimension and a factor head.
      const thead = pageEl.querySelector('thead');
      const heads = thead
        ? height(thead)
        : height(pageEl.querySelector(`.${styles.dimensionHead}`)) +
          height(pageEl.querySelector(`.${styles.factorHead}`));
      root.style.setProperty('--scroll-pad-top', `${nav + heads + gap}px`);
    };
    apply();
    const observer = new ResizeObserver(apply);
    observer.observe(barEl);
    return () => {
      observer.disconnect();
      pageEl.style.removeProperty('--bar-height');
      root.style.removeProperty('--scroll-pad-top');
      root.style.removeProperty('--scroll-pad-bottom');
    };
  }, [page, bar, narrow]);
}
