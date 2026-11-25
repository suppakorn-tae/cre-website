'use client';

import { useTranslations } from 'next-intl';

import { Button, ConfirmDialog } from '@/components/ui';

import styles from './assessment.module.css';
import type { SubmitFailure } from './submit';

type Props = {
  complete: number;
  total: number;
  /** False in read-only mode. */
  editable: boolean;
  open: boolean;
  busy: boolean;
  failure: SubmitFailure | null;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
};

/** Submit button, its reason when disabled, the confirm dialog and the failure message. */
export function SubmitBar({
  complete,
  total,
  editable,
  open,
  busy,
  failure,
  onOpen,
  onCancel,
  onConfirm,
}: Props) {
  const t = useTranslations('assessment.submit');
  const blocked = complete === 0;
  return (
    <div className={styles.submit}>
      <Button disabled={!editable || blocked || busy} onClick={onOpen}>
        {t('button')}
      </Button>
      {editable && blocked && failure === null && <p role="note">{t('needOne')}</p>}
      {failure !== null && <p role="alert">{t(`errors.${failure}`)}</p>}
      <ConfirmDialog
        open={open}
        title={t('dialogTitle')}
        confirmLabel={busy ? t('submitting') : t('confirm')}
        cancelLabel={t('cancel')}
        onConfirm={onConfirm}
        onCancel={busy ? () => undefined : onCancel}
      >
        <p>{t('dialogBody', { complete, total })}</p>
        <p>{t('dialogNote')}</p>
      </ConfirmDialog>
    </div>
  );
}
