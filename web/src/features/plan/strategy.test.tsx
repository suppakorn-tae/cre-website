// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import plan from '../../../messages/th/plan.json';
import ui from '../../../messages/th/ui.json';

import { colourOf, contrast, readTokens } from '@/lib/contrast';
import { dimensionOf } from '@/lib/dimensions';
import { ApiError } from '@/lib/api/errors';

import type { Strategy } from './api';
import { STRATEGY_COLOURS } from './strategy';
import { StrategyPanel } from './StrategyPanel';

const tokens = readTokens();
const token = (name: string) => colourOf(tokens, name);

describe('strategy colours', () => {
  const white = token('color-white');
  const surface = token('color-surface');
  const text = token('color-text-secondary');

  for (const [strategy, { solid, tint }] of Object.entries(STRATEGY_COLOURS)) {
    describe(strategy, () => {
      const s = token(solid);
      const ti = token(tint);
      it('idle: the solid text on its tint is at least 4.5:1', () => {
        expect(contrast(s, ti)).toBeGreaterThanOrEqual(4.5);
      });
      it('idle: the description text on its tint is at least 4.5:1', () => {
        expect(contrast(text, ti)).toBeGreaterThanOrEqual(4.5);
      });
      it('chosen: white text on the solid is at least 4.5:1', () => {
        expect(contrast(white, s)).toBeGreaterThanOrEqual(4.5);
      });
      it('the border (solid) against the card surface is at least 3:1', () => {
        expect(contrast(s, surface)).toBeGreaterThanOrEqual(3);
      });
    });
  }

  it('has four distinct solids', () => {
    const solids = Object.values(STRATEGY_COLOURS).map((c) => token(c.solid));
    expect(new Set(solids).size).toBe(4);
  });

  it('the dimension bar colours stand out from the card surface (3:1)', () => {
    for (const d of ['ec', 'so', 'ev']) {
      expect(contrast(token(`dim-${d}`), surface)).toBeGreaterThanOrEqual(3);
    }
    expect(dimensionOf('EC-HS-2')).toBe('EC');
  });
});

const wrap = (node: React.ReactNode) => (
  <NextIntlClientProvider locale="th" messages={{ plan, ui }}>
    {node}
  </NextIntlClientProvider>
);
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
const ORDER: Strategy[] = ['REDUCE', 'TRANSFER', 'AVOID', 'ACCEPT'];
const radio = (s: Strategy) =>
  screen.getByRole('radio', { name: new RegExp(`^${s} `) }) as HTMLInputElement;

describe('strategy clicks', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it('ten fast clicks send one request with the last choice', async () => {
    const onChange = vi.fn<(s: Strategy) => Promise<void>>(async () => {});
    render(wrap(<StrategyPanel code="EC-HS-2" editable onChange={onChange} />));
    for (let i = 0; i < 10; i++) {
      fireEvent.click(radio(ORDER[i % 4]));
      await tick(50);
    }
    expect(onChange).not.toHaveBeenCalled();
    // The last click was ORDER[1] (TRANSFER); it shows at once.
    expect(radio('TRANSFER').checked).toBe(true);
    await tick(400);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('TRANSFER');
  });

  it('sends at most two requests when clicks pause in between', async () => {
    const onChange = vi.fn<(s: Strategy) => Promise<void>>(async () => {});
    const { rerender } = render(
      wrap(<StrategyPanel code="EC-HS-2" editable onChange={onChange} />),
    );
    for (let i = 0; i < 5; i++) {
      fireEvent.click(radio(ORDER[i % 4]));
      await tick(30);
    }
    await tick(500);
    rerender(wrap(<StrategyPanel code="EC-HS-2" value="REDUCE" editable onChange={onChange} />));
    for (let i = 0; i < 5; i++) {
      fireEvent.click(radio(ORDER[(i + 1) % 4]));
      await tick(30);
    }
    await tick(500);
    expect(onChange.mock.calls.length).toBeLessThanOrEqual(2);
    expect(onChange.mock.calls.at(-1)?.[0]).toBe('TRANSFER');
  });

  it('disables the cards and sets aria-busy while a save is in flight', async () => {
    let done!: () => void;
    const onChange = vi.fn(() => new Promise<void>((r) => (done = r)));
    render(wrap(<StrategyPanel code="EC-HS-2" editable onChange={onChange} />));
    const group = screen.getByRole('radiogroup');
    expect(group.getAttribute('aria-busy')).toBe('false');
    fireEvent.click(radio('AVOID'));
    await tick(400);
    expect(group.getAttribute('aria-busy')).toBe('true');
    for (const s of ORDER) expect(radio(s).disabled).toBe(true);
    fireEvent.click(radio('ACCEPT'));
    await tick(500);
    expect(onChange).toHaveBeenCalledTimes(1);
    done();
    await tick(0);
    expect(group.getAttribute('aria-busy')).toBe('false');
    for (const s of ORDER) expect(radio(s).disabled).toBe(false);
  });

  it('rolls the choice back and calls no second request when the save fails', async () => {
    const onChange = vi.fn(async () => {
      throw new ApiError(500, 'internal', 'x');
    });
    render(wrap(<StrategyPanel code="EC-HS-2" value="REDUCE" editable onChange={onChange} />));
    fireEvent.click(radio('ACCEPT'));
    expect(radio('ACCEPT').checked).toBe(true);
    await tick(400);
    await tick(0);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(radio('REDUCE').checked).toBe(true);
    expect(radio('ACCEPT').checked).toBe(false);
  });

  it('does not send when the choice ends where it started', async () => {
    const onChange = vi.fn(async () => {});
    render(wrap(<StrategyPanel code="EC-HS-2" value="REDUCE" editable onChange={onChange} />));
    fireEvent.click(radio('AVOID'));
    fireEvent.click(radio('REDUCE'));
    await tick(500);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('sends a waiting choice when the card closes', async () => {
    const onChange = vi.fn(async () => {});
    const { unmount } = render(wrap(<StrategyPanel code="EC-HS-2" editable onChange={onChange} />));
    fireEvent.click(radio('AVOID'));
    unmount();
    await tick(0);
    expect(onChange).toHaveBeenCalledWith('AVOID');
    // The timer that was waiting must not send it a second time.
    await tick(1000);
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(within(document.body).queryAllByRole('radio')).toHaveLength(0);
  });

  it('puts the focus back on the chosen radio after the save', async () => {
    let done!: () => void;
    const onChange = vi.fn(() => new Promise<void>((r) => (done = r)));
    const { rerender } = render(
      wrap(<StrategyPanel code="EC-HS-2" editable onChange={onChange} />),
    );
    radio('AVOID').focus();
    fireEvent.click(radio('AVOID'));
    await tick(400);
    // A browser drops the focus from a radio that becomes disabled.
    radio('AVOID').blur();
    expect(document.activeElement).toBe(document.body);
    // The save updates the stored choice (the real page does it in the cache).
    rerender(wrap(<StrategyPanel code="EC-HS-2" value="AVOID" editable onChange={onChange} />));
    await act(async () => done());
    expect(document.activeElement).toBe(radio('AVOID'));
  });
});
