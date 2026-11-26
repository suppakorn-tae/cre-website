import type { useTranslations } from 'next-intl';

import { Spinner, TOAST_ACTION_CLASS, type ToastSpec } from '@/components/ui';

import type { ReportState } from './state';

export const REPORT_TOAST_IDS = ['report-building', 'report-ready', 'report-failed'] as const;
/** The "ready" toast closes after this long; hovering or focusing it holds it open. */
export const READY_TOAST_MS = 8000;

type Actions = { download: () => void; retry: () => void };

/**
 * The toast for a state of the report, or null when there is none (idle).
 * `t` is the `reports.toast` translator.
 */
export function reportToast(
  state: ReportState,
  tooMany: boolean,
  t: ReturnType<typeof useTranslations>,
  actions: Actions,
): ToastSpec | null {
  if (state === 'building') {
    return {
      id: 'report-building',
      tone: 'info',
      icon: <Spinner />,
      title: t('building.title'),
      description: t('building.text'),
    };
  }
  if (state === 'ready') {
    return {
      id: 'report-ready',
      tone: 'success',
      title: t('ready.title'),
      duration: READY_TOAST_MS,
      actionLabel: t('ready.again'),
      action: (
        <button type="button" className={TOAST_ACTION_CLASS} onClick={actions.download}>
          {t('ready.again')}
        </button>
      ),
    };
  }
  if (state === 'failed') {
    return {
      id: 'report-failed',
      tone: 'error',
      title: t('failed.title'),
      description: tooMany ? t('failed.tooMany') : undefined,
      actionLabel: t('failed.retry'),
      action: (
        <button type="button" className={TOAST_ACTION_CLASS} onClick={actions.retry}>
          {t('failed.retry')}
        </button>
      ),
    };
  }
  return null;
}
