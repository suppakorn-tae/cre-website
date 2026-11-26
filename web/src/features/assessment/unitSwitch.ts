import { useTranslations } from 'next-intl';

import { useToaster } from '@/components/ui';

import { useUnitBasis, type AnswerInput } from './api';
import { emptyDraft, switchSharedUnit, toInput, type Draft, type UnitBasis } from './rules';

type Drafts = Record<string, Draft | undefined>;
type UnitField = 'y1' | 'y2';

/**
 * Switches the rows to `unit`, converting each amount with `basis`, and queues a save for
 * each converted row. Queued in one go, they leave in one batch request.
 */
export function commitUnitSwitch(
  codes: string[],
  drafts: Drafts,
  field: UnitField,
  unit: string,
  basis: UnitBasis | undefined,
  queue: (input: AnswerInput) => void,
): { drafts: Drafts; changed: string[]; skipped: string[] } {
  const result = switchSharedUnit(codes, drafts, field, unit, basis);
  for (const code of result.changed) queue(toInput(code, result.drafts[code] ?? emptyDraft()));
  return result;
}

/**
 * The global unit switch of a version: converts the typed amounts with the version's
 * project value and duration, saves them, and says so once in a toast.
 */
export function useUnitSwitch(
  projectId: string,
  versionId: string,
  queue: (input: AnswerInput) => void,
) {
  const t = useTranslations('assessment');
  const toaster = useToaster();
  const basis = useUnitBasis(projectId, versionId).data;
  return (codes: string[], drafts: Drafts, field: UnitField, unit: string) => {
    const result = commitUnitSwitch(codes, drafts, field, unit, basis, queue);
    if (result.changed.length > 0) {
      toaster.show({
        id: 'assessment-unit',
        title: t('toolbar.unitConverted'),
        tone: 'success',
        duration: 4000,
      });
    }
    return result;
  };
}
