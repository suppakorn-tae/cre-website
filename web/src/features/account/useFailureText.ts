'use client';

import { useTranslations } from 'next-intl';

import { waitParts } from './account';
import { AuthApiError } from './api';

/** Message for a failure that no form field owns: network, rate limit or unknown. */
export function useFailureText() {
  const t = useTranslations('account');
  return (error: unknown, fallback?: string): string => {
    if (error instanceof TypeError) return t('network');
    if (error instanceof AuthApiError && error.status === 429) {
      const w = waitParts(error.retryAfter);
      return t(`wait.${w.unit}`, { value: w.value });
    }
    return fallback ?? t('unknown');
  };
}
