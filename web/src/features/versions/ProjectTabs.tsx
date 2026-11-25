'use client';

import { useTranslations } from 'next-intl';

import { Tabs } from '@/components/ui';

export const PROJECT_TAB_PREFIX = 'project';
export type ProjectTab = 'overview' | 'versions';

type Props = { value: ProjectTab; count: number; onChange: (tab: ProjectTab) => void };

/** Overview and Versions tabs of the project page. The caller renders the tabpanel. */
export function ProjectTabs({ value, count, onChange }: Props) {
  const t = useTranslations('versions.tabs');
  return (
    <Tabs
      label={t('label')}
      idPrefix={PROJECT_TAB_PREFIX}
      value={value}
      onChange={(id) => onChange(id as ProjectTab)}
      items={[
        { id: 'overview', label: t('overview') },
        { id: 'versions', label: t('versions'), count },
      ]}
    />
  );
}
