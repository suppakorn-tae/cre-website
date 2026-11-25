import { useCallback, useState } from 'react';

/** Room kept left and right of the plot so a centred label never clips. */
export const PAD_X = 44;
export const PLOT_H = 140;
export const BOX_H = PLOT_H + 36;
const DEFAULT_WIDTH = 640;

/** Plot width inside a box of the given width; never below one pixel. */
export function plotWidth(boxWidth: number): number {
  return Math.max(boxWidth - PAD_X * 2, 1);
}

/** Measures the width of an element so a chart is drawn at its real size, not scaled. */
export function useBoxWidth(): [(node: HTMLElement | null) => void, number] {
  const [width, setWidth] = useState(DEFAULT_WIDTH);
  const ref = useCallback((node: HTMLElement | null) => {
    if (!node) return;
    const update = () => setWidth(Math.round(node.getBoundingClientRect().width) || DEFAULT_WIDTH);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}
