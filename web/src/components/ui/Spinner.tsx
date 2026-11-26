import { IconLoader2 } from '@tabler/icons-react';

import { cx } from './cx';
import styles from './feedback.module.css';
import { Icon, type IconSize } from './Icon';

/** A turning arc for work in progress. Decorative: the text next to it says what is happening. */
export function Spinner({ size = 20, className }: { size?: IconSize; className?: string }) {
  return <Icon icon={IconLoader2} size={size} className={cx(styles.spin, className)} />;
}
