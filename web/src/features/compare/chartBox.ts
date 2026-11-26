import { useCallback, useState } from 'react';

const DEFAULT_WIDTH = 640;

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
