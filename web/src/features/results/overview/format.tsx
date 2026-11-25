import type { ReactNode } from 'react';

import { formatNumber } from '@/lib/format/locale';

/** For `t.rich`: renders `<sub>` in catalogue text, e.g. RI<sub>C</sub>. */
export const subscript = { sub: (chunks: ReactNode) => <sub>{chunks}</sub> };

export const formatScore = (value: number) =>
  formatNumber(value, undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatRm = (value: number) =>
  formatNumber(value, undefined, { minimumFractionDigits: 3, maximumFractionDigits: 3 });
