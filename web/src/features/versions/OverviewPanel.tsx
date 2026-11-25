'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';

import { Button, DataTable, EmptyState, LevelBadge, type DataTableColumn } from '@/components/ui';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format/locale';

import type { Project, VersionSummary } from './api';
import {
  hvhDelta,
  latestVersion,
  levelParts,
  newestFirst,
  periodDays,
  projectPaths,
  recentVersions,
} from './rules';
import styles from './versions.module.css';

type Props = {
  project: Project;
  versions: VersionSummary[];
  onCreate: () => void;
  onShowVersions: () => void;
  /** Indicators in the catalogue; undefined until it has loaded. */
  indicatorTotal?: number;
};

/** Overview tab: latest version, project information and recent versions (UC-05, UC-06). */
export function OverviewPanel({
  project,
  versions,
  onCreate,
  onShowVersions,
  indicatorTotal,
}: Props) {
  const latest = latestVersion(versions) ?? newestFirst(versions)[0];
  return (
    <div className={styles.overview}>
      <div className={styles.overviewGrid}>
        <LatestVersionCard
          projectId={project.id}
          versions={versions}
          latest={latest}
          onCreate={onCreate}
          indicatorTotal={indicatorTotal}
        />
        <ProjectInfoCard project={project} />
      </div>
      <RecentVersions versions={versions} onShowVersions={onShowVersions} />
    </div>
  );
}

function LatestVersionCard({
  projectId,
  versions,
  latest,
  onCreate,
  indicatorTotal,
}: {
  projectId: string;
  versions: VersionSummary[];
  latest: VersionSummary | undefined;
  onCreate: () => void;
  indicatorTotal?: number;
}) {
  const t = useTranslations('versions.overview');
  const tList = useTranslations('versions.list');
  if (!latest) {
    return (
      <section className={styles.card} aria-labelledby="latest-title">
        <h2 id="latest-title" className={styles.cardTitle}>
          {t('latest.title')}
        </h2>
        <EmptyState
          title={tList('empty.title')}
          description={tList('empty.description')}
          action={<Button onClick={onCreate}>{tList('create')}</Button>}
        />
      </section>
    );
  }
  const submitted = latest.status === 'submitted';
  const delta = hvhDelta(versions);
  return (
    <section className={styles.card} aria-labelledby="latest-title">
      <h2 id="latest-title" className={styles.cardTitle}>
        {t('latest.title')}
      </h2>
      <p className={styles.latestHead}>
        <strong className={styles.latestNo}>{tList('versionNo', { no: latest.version_no })}</strong>
        <span className={styles.badges}>
          <span className={submitted ? styles.badgeOk : styles.badgeMuted}>
            {tList(`status.${latest.status}`)}
          </span>
          <span className={latest.editable ? styles.badgeInfo : styles.badgeMuted}>
            {latest.editable ? tList('status.latest') : tList('status.readOnly')}
          </span>
        </span>
      </p>
      {submitted && latest.submitted_at ? (
        <>
          <p className={styles.muted}>
            {t('latest.submittedAt', { at: formatDateTime(latest.submitted_at) })}
          </p>
          <LevelSummary version={latest} indicatorTotal={indicatorTotal} />
          <dl className={styles.stats}>
            <div>
              <dt>{tList('columns.averageRm')}</dt>
              <dd>
                {latest.average_rm === null
                  ? tList('none')
                  : formatNumber(latest.average_rm, undefined, {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
              </dd>
            </div>
            {delta !== null && (
              <div>
                <dt>{t('latest.hvh')}</dt>
                <dd>
                  {delta === 0
                    ? t('latest.deltaSame')
                    : t(delta < 0 ? 'latest.deltaDown' : 'latest.deltaUp', {
                        value: formatNumber(Math.abs(delta)),
                      })}
                </dd>
              </div>
            )}
          </dl>
        </>
      ) : (
        <p className={styles.muted}>{t('latest.draftHint')}</p>
      )}
      <div className={styles.latestActions}>
        {submitted && (
          <Link className={styles.primaryLink} href={projectPaths.results(projectId, latest.id)}>
            {tList('actions.results')}
          </Link>
        )}
        <Link className={styles.secondaryLink} href={projectPaths.assessment(projectId, latest.id)}>
          {latest.editable ? t('latest.editAnswers') : tList('actions.viewAnswers')}
        </Link>
        {submitted && (
          <Link className={styles.secondaryLink} href={projectPaths.report(projectId, latest.id)}>
            {t('latest.pdf')}
          </Link>
        )}
      </div>
      <Button variant="ghost" onClick={onCreate} className={styles.newVersion}>
        {tList('create')}
      </Button>
    </section>
  );
}

/** Level chips VL to VH, the stacked bar and "scored/total indicators" from the stored counts. */
function LevelSummary({
  version,
  indicatorTotal,
}: {
  version: VersionSummary;
  indicatorTotal?: number;
}) {
  const t = useTranslations('versions.overview.latest');
  const tUi = useTranslations('ui');
  const parts = levelParts(version);
  if (!parts) {
    return <p className={styles.muted}>{t('noLevels')}</p>;
  }
  const scored = version.scored_count ?? parts.reduce((sum, p) => sum + p.count, 0);
  return (
    <div className={styles.levelSummary}>
      <div className={styles.levelRow}>
        {parts.map((p) => (
          <LevelBadge
            key={p.level}
            level={p.level}
            count={p.count}
            label={tUi(`levels.${p.level}`)}
          />
        ))}
      </div>
      <div role="img" aria-label={t('barLabel')} className={styles.levelBar}>
        {parts
          .filter((p) => p.count > 0)
          .map((p) => (
            <span
              key={p.level}
              className={styles.levelBarPart}
              data-level={p.level}
              style={{ flexGrow: p.count }}
            />
          ))}
      </div>
      <p className={styles.muted}>
        {indicatorTotal
          ? t('scoredOfTotal', {
              scored: formatNumber(scored),
              total: formatNumber(indicatorTotal),
            })
          : t('scored', { scored: formatNumber(scored) })}
      </p>
    </div>
  );
}

function ProjectInfoCard({ project }: { project: Project }) {
  const t = useTranslations('versions.detail');
  const tInfo = useTranslations('versions.overview.info');
  const island =
    project.island_code === 'other' && project.island_other
      ? project.island_other
      : t(`islands.${project.island_code}`);
  const type =
    project.type_code === 'other' && project.type_other
      ? project.type_other
      : t(`types.${project.type_code}`);
  const rows: [string, string][] = [
    [tInfo('island'), island],
    [tInfo('type'), type],
    [tInfo('value'), t('value', { value: formatNumber(project.value_baht) })],
    [
      tInfo('period'),
      `${t('period', {
        start: formatDate(project.start_date),
        end: formatDate(project.end_date),
      })} (${tInfo('days', { days: formatNumber(periodDays(project.start_date, project.end_date)) })})`,
    ],
    [
      tInfo('progress'),
      `${t('actual', { value: formatNumber(project.progress_pct) })} · ${t('expected', { value: formatNumber(project.expected_progress_pct) })}`,
    ],
  ];
  if (project.description) rows.push([tInfo('description'), project.description]);
  return (
    <section className={styles.card} aria-labelledby="info-title">
      <h2 id="info-title" className={styles.cardTitle}>
        {tInfo('title')}
      </h2>
      <dl className={styles.infoList}>
        {rows.map(([label, value]) => (
          <div key={label} className={styles.infoRow}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function RecentVersions({
  versions,
  onShowVersions,
}: {
  versions: VersionSummary[];
  onShowVersions: () => void;
}) {
  const t = useTranslations('versions.overview.recent');
  const tList = useTranslations('versions.list');
  if (versions.length === 0) return null;
  const none = tList('none');
  const columns: DataTableColumn<VersionSummary>[] = [
    {
      key: 'version',
      header: tList('columns.version'),
      primary: true,
      render: (v) => <strong>{tList('versionNo', { no: v.version_no })}</strong>,
    },
    {
      key: 'status',
      header: tList('columns.status'),
      render: (v) => (
        <span className={v.status === 'submitted' ? styles.badgeOk : styles.badgeMuted}>
          {tList(`status.${v.status}`)}
        </span>
      ),
    },
    {
      key: 'submitted',
      header: tList('columns.submitted'),
      render: (v) => (v.submitted_at ? formatDateTime(v.submitted_at) : tList('neverSubmitted')),
    },
    {
      key: 'levels',
      header: t('hvh'),
      render: (v) =>
        v.very_high_count === null || v.high_count === null ? (
          none
        ) : (
          <span className={styles.badges}>
            <LevelBadge level="VH" count={v.very_high_count} label={tList('levelVeryHigh')} />
            <LevelBadge level="H" count={v.high_count} label={tList('levelHigh')} />
          </span>
        ),
    },
    {
      key: 'averageRm',
      header: tList('columns.averageRm'),
      align: 'end',
      render: (v) =>
        v.average_rm === null
          ? none
          : formatNumber(v.average_rm, undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            }),
    },
  ];
  return (
    <section className={styles.card} aria-labelledby="recent-title">
      <div className={styles.cardHead}>
        <h2 id="recent-title" className={styles.cardTitle}>
          {t('title')}
        </h2>
        <button type="button" className={styles.link} onClick={onShowVersions}>
          {t('viewAll')}
        </button>
      </div>
      <DataTable
        caption={t('caption')}
        columns={columns}
        rows={recentVersions(versions, 3)}
        rowKey={(v) => v.id}
      />
    </section>
  );
}
