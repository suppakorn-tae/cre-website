'use client';

import { useSweep } from '@/components/ui/chartMotion';
import { formatNumber } from '@/lib/format/locale';

/** A whole number that counts up from 0 on mount. The final text is the stored value. */
export function CountUp({ value }: { value: number }) {
  const progress = useSweep();
  return <>{formatNumber(Math.round(value * progress))}</>;
}
