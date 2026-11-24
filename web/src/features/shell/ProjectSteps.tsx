import { useTranslations } from 'next-intl';

import { Stepper } from '@/components/ui';

export const PROJECT_STEP_IDS = ['project', 'assessment', 'results', 'strategy', 'report'] as const;
export type ProjectStepId = (typeof PROJECT_STEP_IDS)[number];

/** Step indicator for project pages; earlier steps show as done. */
export function ProjectSteps({ current }: { current: ProjectStepId }) {
  const t = useTranslations('shell.steps');
  return (
    <Stepper
      label={t('label')}
      doneLabel={t('done')}
      current={PROJECT_STEP_IDS.indexOf(current)}
      steps={PROJECT_STEP_IDS.map((id) => ({ id, label: t(id) }))}
    />
  );
}
