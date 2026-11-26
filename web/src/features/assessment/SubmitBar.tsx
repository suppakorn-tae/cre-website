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
  /** False when the page shows the notes itself, above the bar (a phone). */
  showNotes?: boolean;
  /** A taller button for a touch screen. */
  large?: boolean;
};

/** Why the submit button is off, or why the last submit failed. */
export function SubmitNotes({
  complete,
  editable,
  failure,
}: Pick<Props, 'complete' | 'editable' | 'failure'>) {
  const t = useTranslations('assessment.submit');
  return (
    <>
      {editable && complete === 0 && failure === null && <p role="note">{t('needOne')}</p>}
      {failure !== null && <p role="alert">{t(`errors.${failure}`)}</p>}
    </>
  );
}

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
  showNotes = true,
  large,
}: Props) {
  const t = useTranslations('assessment.submit');
  const blocked = complete === 0;
  return (
    <div className={styles.submit}>
      <Button size={large ? 'lg' : 'md'} disabled={!editable || blocked || busy} onClick={onOpen}>
        {t('button')}
      </Button>
      {showNotes && <SubmitNotes complete={complete} editable={editable} failure={failure} />}
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
