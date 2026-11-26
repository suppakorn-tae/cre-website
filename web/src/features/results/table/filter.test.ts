import { describe, expect, it } from 'vitest';

import type { IndicatorName } from '../overview/api';
import { mockResultItems } from '../overview/mocks';
import { filterRows } from './filter';

const items = mockResultItems();
const names = new Map<string, IndicatorName>();

describe('filterRows with several levels', () => {
  it('keeps only the rows at H or VH when both are picked', () => {
    const rows = filterRows(items, names, '', ['H', 'VH']);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.level === 'H' || r.level === 'VH')).toBe(true);
    expect(rows).toHaveLength(items.filter((i) => i.level === 'H' || i.level === 'VH').length);
  });

  it('treats an empty pick as no level filter and keeps the single level form', () => {
    expect(filterRows(items, names, '', [])).toHaveLength(items.length);
    expect(filterRows(items, names, '', 'VH').every((r) => r.level === 'VH')).toBe(true);
  });
});
