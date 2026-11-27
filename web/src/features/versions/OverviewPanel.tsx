'use client';

import { IconChartPie, IconEdit, IconEye, IconShieldCheck } from '@tabler/icons-react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';

import {
  Button,
  DataTable,
  EmptyState,
  Icon,
  LevelBadge,
  type DataTableColumn,
} from '@/components/ui';
import { ReportButton } from '@/features/reports/ReportButton';
import { formatDate, formatDateTime, formatNumber } from '@/lib/format/locale';
import { timeZone } from '@/lib/i18n/config';

import type { Project, VersionSummary } from './api';
import {
  hvhDelta,
  latestVersion,
  levelParts,
  newestFirst,
  periodDays,
  planState,
  projectPaths,
  recentVersions,
} from './rules';
import styles from './versions.module.css';

type Props = {
  project: Project;
  versions: VersionSummary[];
  onCreate: (trigger: HTMLElement | null) => void;
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
  onCreate: (trigger: HTMLElement | null) => void;
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
          action={<Button onClick={(e) => onCreate(e.currentTarget)}>{tList('create')}</Button>}
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
          <SubmittedLine
            at={formatShortDateTime(latest.submitted_at)}
            scored={latest.scored_count}
            indicatorTotal={indicatorTotal}
          />
          <LevelSummary projectId={projectId} version={latest} />
          <p className={styles.stats}>
            {tList('columns.averageRm')}{' '}
            <strong>
              {latest.average_rm === null
                ? tList('none')
                : formatNumber(latest.average_rm, undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
            </strong>
            {latest.high_count !== null && latest.very_high_count !== null && (
              <>
                {' · '}
                {t('latest.hvh')}{' '}
                <strong>{formatNumber(latest.high_count + latest.very_high_count)}</strong>
                {delta !== null && (
                  <>
                    {' '}
                    <span
                      className={
                        delta.delta < 0 ? styles.deltaGood : delta.delta > 0 ? styles.deltaBad : ''
                      }
                    >
                      {delta.delta === 0
                        ? t('latest.deltaSame', { from: delta.fromNo })
                        : t(delta.delta < 0 ? 'latest.deltaDown' : 'latest.deltaUp', {
                            value: formatNumber(Math.abs(delta.delta)),
                            from: delta.fromNo,
                          })}
                    </span>
                  </>
                )}
              </>
            )}
            {latest.strategies_chosen != null && latest.strategies_needed != null && (
              <>
                {' · '}
                {t('latest.strategies')}{' '}
                <strong>
                  {formatNumber(latest.strategies_chosen)} /{' '}
                  {formatNumber(latest.strategies_needed)}
                </strong>
              </>
            )}
          </p>
        </>
      ) : (
        <p className={styles.muted}>{t('latest.draftHint')}</p>
      )}
      <div className={styles.latestActions}>
        {submitted && (
          <Link className={styles.primaryLink} href={projectPaths.results(projectId, latest.id)}>
            <Icon icon={IconChartPie} size={18} />
            {tList('actions.results')}
          </Link>
        )}
        <Link className={styles.secondaryLink} href={projectPaths.assessment(projectId, latest.id)}>
          <Icon icon={latest.editable ? IconEdit : IconEye} size={18} />
          {latest.editable ? t('latest.editAnswers') : tList('actions.viewAnswers')}
        </Link>
        {submitted && (
          <Link className={styles.secondaryLink} href={projectPaths.plan(projectId, latest.id)}>
            <Icon icon={IconShieldCheck} size={18} />
            {t('latest.plan')}
          </Link>
        )}
        <ReportButton
          projectId={projectId}
          versionId={latest.id}
          submitted={submitted}
          className={styles.secondaryLink}
        />
      </div>
      <p className={styles.newVersion}>
        {t('latest.newPrompt')}{' '}
        <button type="button" className={styles.link} onClick={(e) => onCreate(e.currentTarget)}>
          {tList('create')}
        </button>{' '}
        <span className={styles.muted}>{t('latest.newNote', { no: latest.version_no })}</span>
      </p>
    </section>
  );
}

/** A level chip that links to the advice tab. The hint is read as the description, not a tooltip. */
function AdviceLink({ href, hint, children }: { href: string; hint: string; children: ReactNode }) {
  const hintId = useId();
  return (
    <Link className={styles.levelLink} href={href} aria-describedby={hintId}>
      {children}
      <span id={hintId} className={styles.srOnly}>
        {hint}
      </span>
    </Link>
  );
}

/** Level chips VL to VH, the stacked bar and "scored/total indicators" from the stored counts. */
function LevelSummary({ projectId, version }: { projectId: string; version: VersionSummary }) {
  const t = useTranslations('versions.overview.latest');
  const tUi = useTranslations('ui');
  const levels = levelParts(version);
  if (!levels) {
    return <p className={styles.muted}>{t('noLevels')}</p>;
  }
  // Highest level first, as in the hi-fi; a level with no indicator has no chip and no segment.
  const parts = levels.filter((p) => p.count > 0).reverse();
  return (
    <div className={styles.levelSummary}>
      <div className={styles.levelRow}>
        {parts.map((p) => {
          const badge = (
            <LevelBadge
              key={p.level}
              level={p.level}
              count={p.count}
              label={tUi(`levels.${p.level}`)}
            />
          );
          // H and VH open the advice tab of the results page.
          return p.level === 'H' || p.level === 'VH' ? (
            <AdviceLink
              key={p.level}
              href={`${projectPaths.results(projectId, version.id)}?tab=hvh`}
              hint={t('adviceLink', { level: tUi(`levels.${p.level}`), count: p.count })}
            >
              {badge}
            </AdviceLink>
          ) : (
            badge
          );
        })}
      </div>
      <div role="img" aria-label={t('barLabel')} className={styles.levelBar}>
        {parts.map((p) => (
          <span
            key={p.level}
            className={styles.levelBarPart}
            data-level={p.level}
            style={{ flexGrow: p.count }}
          />
        ))}
      </div>
    </div>
  );
}

/** "ส่งล่าสุด 14 พ.ย. 69 16:40 · 55 / 55 ตัวชี้วัดที่ประเมิน", from the stored scored count. */
function SubmittedLine({
  at,
  scored,
  indicatorTotal,
}: {
  at: string;
  scored: number | null | undefined;
  indicatorTotal?: number;
}) {
  const t = useTranslations('versions.overview.latest');
  const text =
    scored === null || scored === undefined
      ? t('submittedAt', { at })
      : indicatorTotal
        ? t('submittedScoredOfTotal', {
            at,
            scored: formatNumber(scored),
            total: formatNumber(indicatorTotal),
          })
        : t('submittedScored', { at, scored: formatNumber(scored) });
  return <p className={styles.submittedLine}>{text}</p>;
}

/** 14 พ.ย. 69 16:40: Buddhist year in two digits, Bangkok time. */
function formatShortDateTime(value: string): string {
  return new Intl.DateTimeFormat('th-TH-u-ca-buddhist', {
    day: 'numeric',
    month: 'short',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone,
  }).format(new Date(value));
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
  const state = planState(project.progress_pct, project.expected_progress_pct);
  const planText =
    state.kind === 'onPlan' ? t('onPlan') : t(state.kind, { value: formatNumber(state.points) });
  const rows: [string, ReactNode][] = [
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
      <ProgressBlock
        key="progress"
        actual={project.progress_pct}
        expected={project.expected_progress_pct}
        planText={planText}
        behind={state.kind === 'behind'}
      />,
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

/** Entered progress against the expected progress: a bar with a tick at the plan. */
function ProgressBlock({
  actual,
  expected,
  planText,
  behind,
}: {
  actual: number;
  expected: number;
  planText: string;
  behind: boolean;
}) {
  const t = useTranslations('versions.detail');
  const clamp = (n: number) => Math.min(100, Math.max(0, n));
  return (
    <div className={styles.progress}>
      <div
        className={styles.bar}
        role="img"
        aria-label={`${t('actual', { value: formatNumber(actual) })} · ${t('expected', { value: formatNumber(expected) })}`}
      >
        <span className={styles.barActual} style={{ width: `${clamp(actual)}%` }} />
        <span className={styles.barExpected} style={{ insetInlineStart: `${clamp(expected)}%` }} />
      </div>
      <p className={styles.progressText}>
        {t('actual', { value: formatNumber(actual) })}
        {' · '}
        {t('expected', { value: formatNumber(expected) })}
        {' · '}
        <span className={behind ? styles.behind : undefined}>{planText}</span>
      </p>
    </div>
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
