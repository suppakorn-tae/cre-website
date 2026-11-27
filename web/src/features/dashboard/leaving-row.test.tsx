// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import common from '../../../messages/th/common.json';
import dashboard from '../../../messages/th/dashboard.json';
import ui from '../../../messages/th/ui.json';

import { ProjectRiskChart } from './Charts';
import { seedSummary } from './mocks';

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
      'setTimeout',
      'clearTimeout',
    ],
  });
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const chart = (risks: typeof seedSummary.project_risks) => (
  <NextIntlClientProvider locale="th" messages={{ dashboard, common, ui }}>
    <ProjectRiskChart risks={risks} />
  </NextIntlClientProvider>
);

describe('ProjectRiskChart leaving rows', () => {
  it('keeps a removed project for a moment, hidden from assistive technology, then drops it', () => {
    const [first, second] = seedSummary.project_risks;
    const { container, rerender } = render(chart([first, second]));
    expect(container.querySelectorAll('[data-leaving]')).toHaveLength(0);

    rerender(chart([first]));
    const leaving = container.querySelector('li[data-leaving]');
    expect(leaving).not.toBeNull();
    expect(leaving?.getAttribute('aria-hidden')).toBe('true');
    expect(leaving?.textContent).toContain(second.name);

    act(() => void vi.advanceTimersByTime(400));
    expect(container.querySelector('li[data-leaving]')).toBeNull();
    expect(container.textContent).not.toContain(second.name);
  });
});
