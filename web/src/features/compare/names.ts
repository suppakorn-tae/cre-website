import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { browserApi } from '@/lib/api/client';

type Names = { indicators: Map<string, string>; factors: Map<string, string> };

/** Thai names of indicators and factors from GET /catalogue. */
export async function fetchNames(): Promise<Names> {
  const { data } = await browserApi().GET('/catalogue');
  const names: Names = { indicators: new Map(), factors: new Map() };
  for (const d of data?.dimensions ?? []) {
    for (const f of d.factors) {
      names.factors.set(f.code, f.name);
      for (const i of f.indicators) names.indicators.set(i.code, i.name);
    }
  }
  return names;
}

/** Name lookups; until the catalogue arrives (or for an unknown code) shows a neutral Thai word, never the code. */
export function useNames() {
  const t = useTranslations('compare');
  const query = useQuery({
    queryKey: ['compare', 'catalogue-names'],
    queryFn: fetchNames,
    staleTime: Infinity,
  });
  return {
    indicator: (code: string) => query.data?.indicators.get(code) ?? t('unnamed'),
    factor: (code: string) => query.data?.factors.get(code) ?? t('unnamed'),
  };
}
