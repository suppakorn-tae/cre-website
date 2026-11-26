'use client';

import { IconCheck, IconFileTypePdf, IconRefresh } from '@tabler/icons-react';
import { skipToken, useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { Icon, Spinner, Stepper, type StepItem } from '@/components/ui';
import { planPath } from '@/features/plan/rules';
import { useReportDownload } from '@/features/reports/useReportDownload';
import type { ResultsResponse } from '@/features/results/overview/api';
import { projectPaths } from '@/features/versions/rules';

import { useStepState } from './useStepState';

export const PROJECT_STEP_IDS = ['project', 'assessment', 'results', 'strategy', 'report'] as const;
export type ProjectStepId = (typeof PROJECT_STEP_IDS)[number];

type Props = {
  current: ProjectStepId;
  /** Missing on the new-project page: nothing exists yet but the form. */
  projectId?: string;
  /** Missing on the project form: the steps then point at the latest version. */
  versionId?: string;
};

/**
 * Step indicator of the project pages. Steps 1 to 4 are links while they can be
 * reached; step 5 builds the report in place and shares its state with the
 * results page's button (one state per version).
 */
export function ProjectSteps({ current, projectId, versionId }: Props) {
  const t = useTranslations('shell.steps');
  const state = useStepState(projectId, versionId);
  const vid = versionId ?? state.data?.versionId;
  const index = PROJECT_STEP_IDS.indexOf(current);
  // The results and plan pages show only a submitted version.
  const submitted = index === 2 || index === 3 ? true : (state.data?.submitted ?? false);
  // The plan page changes strategies in the cache; follow it without asking again.
  const cached = useQuery<ResultsResponse>({
    queryKey: ['projects', projectId, 'versions', vid, 'results'],
    queryFn: skipToken,
    enabled: false,
  });
  const chosen = cached.data
    ? cached.data.items.some((item) => item.strategy)
    : (state.data?.chosen ?? false);

  const report = useReportDownload(projectId ?? '', vid ?? '');
  const canReport = projectId !== undefined && vid !== undefined && submitted;
  const needProject = projectId === undefined ? t('needProject') : undefined;
  const needSubmit = !submitted ? t('needSubmit') : undefined;

  const reportIcon = {
    idle: <Icon icon={IconFileTypePdf} size={16} />,
    building: <Spinner size={16} />,
    ready: <Icon icon={IconCheck} size={16} />,
    failed: <Icon icon={IconRefresh} size={16} />,
  }[report.state];
  const reportLabel = t(`reportState.${report.state}`);

  const steps: StepItem[] = [
    {
      id: 'project',
      label: t('project'),
      href: projectId ? projectPaths.edit(projectId) : undefined,
      done: projectId !== undefined,
    },
    {
      id: 'assessment',
      label: t('assessment'),
      href: projectId && vid ? projectPaths.assessment(projectId, vid) : undefined,
      disabled: !projectId || !vid,
      reason: needProject,
      done: submitted,
    },
    {
      id: 'results',
      label: t('results'),
      href: projectId && vid && submitted ? projectPaths.results(projectId, vid) : undefined,
      disabled: !canReport,
      reason: needProject ?? needSubmit,
      done: submitted,
    },
    {
      id: 'strategy',
      label: t('strategy'),
      href: projectId && vid && submitted ? planPath(projectId, vid) : undefined,
      disabled: !canReport,
      reason: needProject ?? needSubmit,
      done: chosen,
    },
    {
      id: 'report',
      label: canReport ? reportLabel : t('report'),
      onClick: canReport ? report.start : () => undefined,
      disabled: !canReport,
      reason: needProject ?? needSubmit,
      icon: canReport ? reportIcon : undefined,
      busy: report.state === 'building',
      failed: report.state === 'failed',
      done: false,
    },
  ];

  return (
    <Stepper
      label={t('label')}
      doneLabel={t('done')}
      current={index}
      steps={steps}
      position={({ no, total, label }) => t('position', { no, total, label })}
      status={report.observed && canReport && report.state !== 'idle' ? reportLabel : ''}
    />
  );
}
