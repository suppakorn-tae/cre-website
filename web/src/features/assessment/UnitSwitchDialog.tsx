'use client';

import { useTranslations } from 'next-intl';

import { Button, ConfirmDialog } from '@/components/ui';

import styles from './assessment.module.css';
import type { PendingSwitch } from './unitSwitch';

type Props = {
  pending: PendingSwitch | null;
  onAll: () => void;
  onEmptyOnly: () => void;
  onCancel: () => void;
};

/** Asks before a global unit switch changes the unit of saved amounts. */
export function UnitSwitchDialog({ pending, onAll, onEmptyOnly, onCancel }: Props) {
  const t = useTranslations('assessment.unitConfirm');
  const tUnits = useTranslations('assessment.units');
  const tBar = useTranslations('assessment.toolbar');
  return (
    <ConfirmDialog
      open={pending !== null}
      title={t('title')}
      confirmLabel={t('all')}
      cancelLabel={t('cancel')}
      onConfirm={onAll}
      onCancel={onCancel}
    >
      {pending && (
        <>
          <p>
            {t('body', {
              count: pending.count,
              field: tBar(pending.field === 'y1' ? 'costUnit' : 'timeUnit'),
              unit: tUnits(pending.unit),
            })}
          </p>
          <p>{t('note')}</p>
          <div className={styles.dialogExtra}>
            <Button variant="secondary" onClick={onEmptyOnly}>
              {t('emptyOnly')}
            </Button>
          </div>
        </>
      )}
    </ConfirmDialog>
  );
}
