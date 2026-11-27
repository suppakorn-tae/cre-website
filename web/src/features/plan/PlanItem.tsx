'use client';

import * as Accordion from '@radix-ui/react-accordion';
import { IconArrowRight, IconChevronDown } from '@tabler/icons-react';
import { useTranslations } from 'next-intl';

import { Icon, LevelBadge } from '@/components/ui';
import { cx } from '@/components/ui/cx';
import type { IndicatorName, IndicatorResult } from '@/features/results/overview/api';
import { formatRm, formatScore, subscript } from '@/features/results/overview/format';

import { dimensionOf, dimensionStyle } from '@/lib/dimensions';

import { AdviceLists } from './AdviceLists';
import { adviceReason, PATH_STEPS } from './rules';
import { StrategyChip } from './StrategyChip';
import { StrategyPanel } from './StrategyPanel';
import type { Strategy } from './api';

type Props = {
  row: IndicatorResult;
  meta?: IndicatorName;
  editable: boolean;
  onStrategy: (code: string, strategy: Strategy) => Promise<unknown>;
};

const CHIP = 'box-border rounded-control border px-2 py-1 text-small font-semibold';

/** One H / VH indicator: a collapsed row that opens into its advice and strategy. */
export function PlanItem({ row, meta, editable, onStrategy }: Props) {
  const t = useTranslations('plan');
  const tUi = useTranslations('ui');
  const code = row.indicator_code;
  const why = adviceReason(row.advice);
  const dimension = dimensionOf(code);

  return (
    <Accordion.Item
      value={code}
      data-dimension={dimension}
      style={dimension ? { borderLeftColor: dimensionStyle(dimension).color } : undefined}
      className={cx(
        'rounded-card border border-border bg-surface data-[state=open]:border-blue-200',
        dimension && 'border-l-4',
      )}
    >
      <Accordion.Header className="m-0 text-body font-normal">
        <Accordion.Trigger className="focus-ring group box-border flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-2 rounded-card border-0 bg-transparent px-4 py-3 text-left font-sans text-text">
          <LevelBadge level={row.level} label={tUi(`levels.${row.level}`)} />
          <span className="min-w-48 flex-1 text-body">
            <span className="font-semibold text-navy-900">{code}</span> {meta?.name ?? ''}
          </span>
          <span className="text-small text-text-secondary">
            {t('item.rm')} <strong className="text-navy-900">{formatRm(row.rm)}</strong>
          </span>
          <StrategyChip value={row.strategy} unsetLabel={t('strategy.unset')} />
          <Icon
            icon={IconChevronDown}
            size={20}
            className="shrink-0 text-text-secondary transition-transform group-data-[state=open]:rotate-180"
          />
        </Accordion.Trigger>
      </Accordion.Header>
      <Accordion.Content className="border-t border-divider">
        <div className="grid grid-cols-1 gap-6 p-4 lg:grid-cols-2">
          <div className="flex min-w-0 flex-col gap-4">
            <section className="flex flex-col gap-2">
              <h3 className="m-0 text-small font-semibold text-text-secondary">
                {t('item.sourceTitle')}
              </h3>
              <ol
                aria-label={t('item.pathLabel')}
                className="m-0 flex list-none flex-wrap items-center gap-x-2 gap-y-2 p-0"
              >
                {PATH_STEPS.map(([key, field], i) => (
                  <li key={key} className="flex items-center gap-1">
                    {i === PATH_STEPS.length - 1 && (
                      <Icon icon={IconArrowRight} size={16} className="shrink-0 text-text-muted" />
                    )}
                    <span className={cx(CHIP, 'border-border bg-surface text-navy-900')}>
                      {t.rich(`path.${key}`, { ...subscript, value: formatScore(row[field]) })}
                    </span>
                  </li>
                ))}
                <li className="flex items-center gap-1">
                  <Icon icon={IconArrowRight} size={16} className="shrink-0 text-text-muted" />
                  <span className={cx(CHIP, 'border-navy-900 bg-navy-900 text-on-solid')}>
                    {t('item.rmChip', { rm: formatRm(row.rm), level: row.level })}
                  </span>
                </li>
              </ol>
              {why && (
                <p className="m-0 box-border rounded-control bg-subtle px-3 py-2 text-small text-text-secondary">
                  {t.rich(`item.${why}`, {
                    ...subscript,
                    rl: formatScore(row.rl),
                    riMax: formatScore(row.ri_max),
                  })}
                </p>
              )}
            </section>
            <AdviceLists advice={row.advice} />
            <p className="m-0 text-caption text-text-muted">{t('item.footnote')}</p>
          </div>
          <StrategyPanel
            code={code}
            value={row.strategy}
            updatedAt={row.strategy_updated_at}
            editable={editable}
            onChange={(strategy) => onStrategy(code, strategy)}
          />
        </div>
      </Accordion.Content>
    </Accordion.Item>
  );
}
