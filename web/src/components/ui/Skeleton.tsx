import type { CSSProperties } from 'react';

import styles from './display.module.css';

type Props = {
  width?: CSSProperties['width'];
  height?: CSSProperties['height'];
};

/** Placeholder block. Put `aria-busy` on the region it stands in for. */
export function Skeleton({ width = '100%', height }: Props) {
  return <span className={styles.skeleton} style={{ width, height }} aria-hidden="true" />;
}
