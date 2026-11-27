'use client';

import * as Tooltip from '@radix-ui/react-tooltip';
import type { Icon as TablerIcon } from '@tabler/icons-react';
import type { ButtonHTMLAttributes } from 'react';

import { cx } from './cx';
import { Icon, type IconSize } from './Icon';
import { TooltipContent } from './TooltipContent';

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label' | 'children'> & {
  icon: TablerIcon;
  /** The Thai accessible name. It is also the tooltip text on hover and focus. */
  label: string;
  size?: IconSize;
};

/**
 * A button that holds only an icon. The name is required, and Radix shows it as
 * a tooltip on hover and keyboard focus. The tooltip is not portalled, so it
 * also shows inside a modal dialog (which sits in the top layer).
 */
export function IconButton({ icon, label, size = 20, type = 'button', className, ...rest }: Props) {
  return (
    <Tooltip.Provider delayDuration={200} skipDelayDuration={100}>
      <Tooltip.Root>
        <Tooltip.Trigger asChild>
          <button
            type={type}
            aria-label={label}
            className={cx(
              'focus-ring inline-flex size-control-md shrink-0 cursor-pointer items-center justify-center rounded-control border-0 bg-transparent p-0 text-text-muted hover:bg-subtle hover:text-text disabled:cursor-not-allowed disabled:text-disabled',
              className,
            )}
            {...rest}
          >
            <Icon icon={icon} size={size} />
          </button>
        </Tooltip.Trigger>
        <TooltipContent inline>{label}</TooltipContent>
      </Tooltip.Root>
    </Tooltip.Provider>
  );
}
