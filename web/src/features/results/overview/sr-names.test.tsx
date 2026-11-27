// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it } from 'vitest';

import { LevelBadge } from '@/components/ui';

import results from '../../../../messages/th/results.json';
import ui from '../../../../messages/th/ui.json';

import { AdviceLink } from '@/features/versions/OverviewPanel';

import { FactorChart } from './FactorChart';

afterEach(cleanup);

const averages = [{ factor_code: 'EC-MG', scored_count: 5, average_rm: 2.78 }];
const wrap = (node: ReactNode) => (
  <NextIntlClientProvider locale="th" messages={{ results, ui }}>
    {node}
  </NextIntlClientProvider>
);

describe('screen-reader names (WCAG 2.5.3)', () => {
  it('a factor bar reads its code once, after the visible value', () => {
    render(wrap(<FactorChart averages={averages} items={[]} names={new Map()} />));
    expect(
      screen.getByRole('button', {
        name: '2.78 EC-MG: RM เฉลี่ย 2.78 ระดับ M (ความเสี่ยงปานกลาง)',
      }),
    ).toBeTruthy();
  });

  it('a factor bar with a catalogue name reads code, then name', () => {
    const names = new Map([
      ['I1', { name: 'x', unit: '', factorCode: 'EC-MG', factorName: 'การบริหาร' }],
    ]);
    render(wrap(<FactorChart averages={averages} items={[]} names={names} />));
    expect(
      screen.getByRole('button', {
        name: '2.78 EC-MG การบริหาร: RM เฉลี่ย 2.78 ระดับ M (ความเสี่ยงปานกลาง)',
      }),
    ).toBeTruthy();
  });

  it('a level link is named by its chip only; the advice hint is its description', () => {
    render(
      <AdviceLink href="/x" hint="ดูคำแนะนำของตัวชี้วัดความเสี่ยงสูง 11 ตัว">
        <LevelBadge level="H" count={11} label="ความเสี่ยงสูง" />
      </AdviceLink>,
    );
    const link = screen.getByRole('link', { name: 'H ความเสี่ยงสูง 11' });
    const id = link.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(id)?.textContent).toBe('ดูคำแนะนำของตัวชี้วัดความเสี่ยงสูง 11 ตัว');
    expect(link.contains(document.getElementById(id))).toBe(false);
  });

  it('a level badge starts with the printed code', () => {
    render(<LevelBadge level="H" count={11} label="ความเสี่ยงสูง" />);
    expect(screen.getByLabelText('H ความเสี่ยงสูง 11').textContent).toBe('H11');
  });
});
