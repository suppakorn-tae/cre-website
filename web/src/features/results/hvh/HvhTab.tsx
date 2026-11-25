'use client';

import { useTranslations } from 'next-intl';

import { EmptyState, LevelBadge } from '@/components/ui';

import { AdviceLists } from '../advice/AdviceLists';
import type { IndicatorName, ResultsResponse } from '../overview/api';
import { formatRm, formatScore, subscript } from '../overview/format';
import overview from '../overview/results.module.css';
import { useSetStrategy } from '../strategy/api';
import { StrategyPicker } from '../strategy/StrategyPicker';
import styles from './hvh.module.css';
import { highRisks } from './rules';

type Props = {
  projectId: string;
  versionId: string;
  results: ResultsResponse;
  names: Map<string, IndicatorName>;
};

/**
 * H / VH view (UC-10): each high-risk indicator with its advice lists and a
 * strategy picker. Strategies can change only while `editable` (latest version).
 */
export function HvhTab({ projectId, versionId, results, names }: Props) {
  const t = useTranslations('advice.hvh');
  const tUi = useTranslations('ui');
  const setStrategy = useSetStrategy(projectId, versionId);
  const rows = highRisks(results.items);
  const { VH, H } = results.summary.level_counts;

  if (rows.length === 0) {
    return <EmptyState title={t('emptyTitle')} description={t('emptyText')} />;
  }
  const scores = [
    ['rl', 'rl'],
    ['riC', 'ri_c'],
    ['riT', 'ri_t'],
    ['riE', 'ri_e'],
  ] as const;

  return (
    <section aria-labelledby="hvh-title" className={overview.panelBody}>
      <h2 id="hvh-title" className={overview.sectionTitle}>
        {t('title')}
      </h2>
      <p role="status" className={overview.muted}>
        {t('summary', { count: rows.length, vh: VH, h: H })}
      </p>
      <ol className={styles.cards}>
        {rows.map((row) => {
          const meta = names.get(row.indicator_code);
          return (
            <li key={row.indicator_code} className={styles.card}>
              <header className={styles.head}>
                <LevelBadge level={row.level} variant="solid" label={tUi(`levels.${row.level}`)} />
                <div className={styles.name}>
                  <h3 className={styles.heading}>
                    {row.indicator_code} {meta?.name ?? ''}
                  </h3>
                  {meta && <p className={overview.muted}>{meta.factorName}</p>}
                </div>
                <p className={styles.rm}>
                  {t('rm')} <strong>{formatRm(row.rm)}</strong>
                </p>
              </header>
              <dl className={styles.scores}>
                {scores.map(([key, field]) => (
                  <div key={key}>
                    <dt>{t.rich(`scores.${key}`, subscript)}</dt>
                    <dd>{formatScore(row[field])}</dd>
                  </div>
                ))}
              </dl>
              <AdviceLists advice={row.advice} />
              <StrategyPicker
                code={row.indicator_code}
                value={row.strategy}
                updatedAt={row.strategy_updated_at}
                editable={results.editable}
                saving={setStrategy.isPending}
                onChange={(strategy) =>
                  setStrategy.mutateAsync({ code: row.indicator_code, strategy })
                }
              />
            </li>
          );
        })}
      </ol>
    </section>
  );
}
