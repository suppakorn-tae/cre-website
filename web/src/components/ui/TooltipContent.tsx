import * as Tooltip from '@radix-ui/react-tooltip';
import type { ComponentProps } from 'react';

import styles from './display.module.css';

type Props = ComponentProps<typeof Tooltip.Content> & {
  /** Render in place instead of in a portal, so it also shows inside a modal dialog. */
  inline?: boolean;
};

/**
 * The shared tooltip popup: sized to its text (one line when it fits, wrapping at the
 * viewport edge), at most 70vh tall and scrolling inside, fading and scaling in over
 * `--motion-fast` (no motion under prefers-reduced-motion). Use it inside `Tooltip.Root`.
 */
export function TooltipContent({ inline, className, sideOffset = 6, ...rest }: Props) {
  const content = (
    <Tooltip.Content
      sideOffset={sideOffset}
      collisionPadding={16}
      className={className ? `${styles.tooltip} ${className}` : styles.tooltip}
      {...rest}
    />
  );
  return inline ? content : <Tooltip.Portal>{content}</Tooltip.Portal>;
}
