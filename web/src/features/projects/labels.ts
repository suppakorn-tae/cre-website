import { useTranslations } from 'next-intl';

import type { Project } from './validation';

/** Thai names of the island and type of a project; "other" shows the typed text. */
export function useProjectLabels() {
  const t = useTranslations('projects');
  return {
    island: (code: Project['island_code'], other?: string | null) =>
      code === 'other' && other ? other : t(`islands.${code}`),
    type: (code: Project['type_code'], other?: string | null) =>
      code === 'other' && other ? other : t(`types.${code}`),
  };
}
