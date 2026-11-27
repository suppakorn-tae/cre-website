import { IconBan, IconEye, IconShield, IconArrowsExchange } from '@tabler/icons-react';

import { Icon } from '@/components/ui';
import { cx } from '@/components/ui/cx';

import type { Strategy } from './api';
import { strategyStyle } from './strategy';

/** One icon per strategy; the codes stay untranslated. */
export const STRATEGY_ICONS = {
  REDUCE: IconShield,
  TRANSFER: IconArrowsExchange,
  AVOID: IconBan,
  ACCEPT: IconEye,
} as const;

type Props = {
  value?: Strategy;
  /** Text of the grey chip when nothing is chosen. */
  unsetLabel: string;
  /** Prefix before the code, e.g. "กลยุทธ์:". */
  prefix?: string;
  className?: string;
};

/** The chosen strategy with its icon in its own colour, or a grey "not chosen" chip. */
export function StrategyChip({ value, unsetLabel, prefix, className }: Props) {
  return (
    <span
      style={value ? strategyStyle(value) : undefined}
      className={cx(
        'inline-flex shrink-0 items-center gap-1 rounded-badge px-2 py-1 text-small font-semibold',
        value
          ? 'bg-(--strategy-tint) text-(--strategy-solid)'
          : 'bg-subtle font-normal text-text-secondary',
        className,
      )}
    >
      {value ? (
        <>
          <Icon icon={STRATEGY_ICONS[value]} size={16} />
          {prefix ? `${prefix} ${value}` : value}
        </>
      ) : (
        unsetLabel
      )}
    </span>
  );
}
