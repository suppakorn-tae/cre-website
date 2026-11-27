// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { useState } from 'react';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import assessment from '../../../messages/th/assessment.json';

import type { AnswerInput } from './api';
import type { Indicator } from './indicatorFields';
import { IndicatorRow } from './IndicatorRow';
import { emptyDraft, toInput, type Draft } from './rules';
import { useAutosave } from './useAutosave';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeAll(() => {
  vi.stubGlobal('ResizeObserver', ResizeObserverStub);
  // The table, not the phone cards.
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
});
afterEach(cleanup);

const indicator: Indicator = {
  code: 'EC-MG-1',
  name: 'การประสานงานไม่ดี',
  unit: 'ครั้งต่อเดือน',
  question_x: 'เกิดบ่อยแค่ไหน',
  question_y1: 'ต้นทุนเพิ่มเท่าไร',
  question_y2: 'เวลาเพิ่มเท่าไร',
  question_y3: 'กระทบสิ่งแวดล้อมแบบใด',
};
const y3Options = ['A', 'B', 'C'].map((v) => ({ value: v, label: `ตัวเลือก ${v}` }));

/** One row wired like the page: a change updates the draft and queues an autosave. */
function Row({
  save,
  start = emptyDraft(),
}: {
  save: (items: AnswerInput[]) => Promise<void>;
  start?: Draft;
}) {
  const [draft, setDraft] = useState(start);
  const { queue } = useAutosave(save);
  return (
    <NextIntlClientProvider locale="th" messages={{ assessment }}>
      <table>
        <tbody>
          <IndicatorRow
            indicator={indicator}
            draft={draft}
            y3Options={y3Options}
            disabled={false}
            onChange={(next) => {
              setDraft(next);
              queue(toInput(indicator.code, next));
            }}
          />
        </tbody>
      </table>
    </NextIntlClientProvider>
  );
}

const xInput = () => screen.getByLabelText('X ความถี่ของเหตุการณ์ EC-MG-1');
const type = (input: HTMLElement, text: string) => {
  for (let i = 1; i <= text.length; i += 1)
    fireEvent.change(input, { target: { value: text.slice(0, i) } });
};
const settle = (ms = 20) => act(() => new Promise((r) => setTimeout(r, ms)));

describe('number fields save on blur', () => {
  it('sends nothing while typing 12345 and one request on blur', async () => {
    const save = vi.fn(() => Promise.resolve());
    render(<Row save={save} />);
    type(xInput(), '12345');
    // Longer than any debounce: typing alone never saves.
    await settle(1000);
    expect(save).not.toHaveBeenCalled();
    fireEvent.blur(xInput());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith([{ indicator_code: 'EC-MG-1', x: 12345 }]);
  });
  it('saves on Enter, and not again on blur when nothing changed', async () => {
    const save = vi.fn(() => Promise.resolve());
    render(<Row save={save} />);
    type(xInput(), '7');
    fireEvent.keyDown(xInput(), { key: 'Enter' });
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    fireEvent.blur(xInput());
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
  });
  it('keeps invalid text with its error and saves nothing', async () => {
    const save = vi.fn(() => Promise.resolve());
    render(<Row save={save} />);
    type(xInput(), '-3');
    fireEvent.blur(xInput());
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect((xInput() as HTMLInputElement).value).toBe('-3');
    expect(screen.getByText('กรอกตัวเลขตั้งแต่ 0 ขึ้นไป')).toBeTruthy();
  });
  it('shows the X unit under the input only, not in the question', () => {
    render(<Row save={vi.fn(() => Promise.resolve())} />);
    expect(screen.getAllByText('ครั้งต่อเดือน')).toHaveLength(1);
  });
});

describe('y1 in baht is grouped with commas', () => {
  const y1Input = () => screen.getByLabelText('y1 ผลกระทบด้านต้นทุน EC-MG-1') as HTMLInputElement;

  it('groups while typing and saves a plain number on blur', async () => {
    const save = vi.fn(() => Promise.resolve());
    render(<Row save={save} />);
    type(y1Input(), '1250000.50');
    expect(y1Input().value).toBe('1,250,000.50');
    await settle(1000);
    expect(save).not.toHaveBeenCalled();
    fireEvent.blur(y1Input());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith([
      { indicator_code: 'EC-MG-1', y1: { value: 1250000.5, unit: 'baht' } },
    ]);
  });
  it('keeps the caret after a digit typed in the middle', () => {
    render(<Row save={vi.fn(() => Promise.resolve())} />);
    type(y1Input(), '1250000');
    const input = y1Input();
    // The user types 9 after "1,2": the browser reports the new text and caret 4.
    fireEvent.change(input, {
      target: { value: '1,2950,000', selectionStart: 4, selectionEnd: 4 },
    });
    expect(y1Input().value).toBe('12,950,000');
    expect(y1Input().selectionStart).toBe(4);
  });
  it('backspace over a comma deletes the digit before it', () => {
    render(<Row save={vi.fn(() => Promise.resolve())} />);
    type(y1Input(), '1250000');
    y1Input().setSelectionRange(2, 2);
    fireEvent.keyDown(y1Input(), { key: 'Backspace' });
    expect(y1Input().value).toBe('250,000');
    expect(y1Input().selectionStart).toBe(0);
  });
  it('opens a saved answer already grouped', () => {
    const start = { ...emptyDraft(), y1: { amount: '1250000', unit: 'baht' } };
    render(<Row save={vi.fn(() => Promise.resolve())} start={start} />);
    expect(y1Input().value).toBe('1,250,000');
  });
  it('shows an error for more than 2 decimals and saves nothing', async () => {
    const save = vi.fn(() => Promise.resolve());
    render(<Row save={save} />);
    type(y1Input(), '10.555');
    fireEvent.blur(y1Input());
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByText('กรอกจำนวนเงินไม่เกิน 2 ตำแหน่งทศนิยม')).toBeTruthy();
  });
  it('does not group y1 in percent', () => {
    const start = { ...emptyDraft(), y1: { amount: '', unit: 'percent' } };
    render(<Row save={vi.fn(() => Promise.resolve())} start={start} />);
    type(y1Input(), '1234');
    expect(y1Input().value).toBe('1234');
  });
});

describe('useAutosave', () => {
  it('keeps one request in flight and sends the latest value after it', async () => {
    let release = () => {};
    const save = vi.fn<(items: AnswerInput[]) => Promise<void>>(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const { result } = renderHook(() => useAutosave(save));
    act(() => result.current.queue({ indicator_code: 'a', x: 1 }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    act(() => result.current.queue({ indicator_code: 'a', x: 2 }));
    act(() => result.current.queue({ indicator_code: 'a', x: 3 }));
    await settle();
    expect(save).toHaveBeenCalledTimes(1);
    await act(async () => release());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith([{ indicator_code: 'a', x: 3 }]);
    await act(async () => release());
    await waitFor(() => expect(result.current.status).toBe('saved'));
    expect(result.current.savedAt).toBeInstanceOf(Date);
  });
});

describe('y3 picker', () => {
  const open = () =>
    fireEvent.click(screen.getByRole('button', { name: /y3 ผลกระทบด้านสิ่งแวดล้อม EC-MG-1/ }));
  const tick = (letter: string) =>
    fireEvent.click(screen.getByRole('checkbox', { name: new RegExp(`ตัวเลือก ${letter}`) }));
  const done = () => screen.getByRole('button', { name: 'เสร็จ' });

  it('cannot confirm A with B, and says why', () => {
    render(<Row save={vi.fn(() => Promise.resolve())} />);
    open();
    tick('A');
    tick('B');
    expect((done() as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText('A เลือกคู่กับข้ออื่นไม่ได้')).toBeTruthy();
  });
  it('saves nothing when closed with Esc', async () => {
    const save = vi.fn(() => Promise.resolve());
    render(<Row save={save} />);
    open();
    tick('B');
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    await settle();
    expect(save).not.toHaveBeenCalled();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });
  it('saves once on done and then shows only the chips', async () => {
    const save = vi.fn(() => Promise.resolve());
    render(<Row save={save} />);
    expect(screen.getByText('เลือก')).toBeTruthy();
    open();
    tick('B');
    tick('C');
    await settle();
    expect(save).not.toHaveBeenCalled();
    fireEvent.click(done());
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect(save).toHaveBeenCalledWith([{ indicator_code: 'EC-MG-1', y3: ['B', 'C'] }]);
    expect(screen.queryByText('เลือก')).toBeNull();
    expect(screen.getByText('B')).toBeTruthy();
  });
  it('shows no question bubble when the picker opens', () => {
    render(<Row save={vi.fn(() => Promise.resolve())} />);
    open();
    expect(screen.queryByText(/คำถาม · EC-MG-1 · y3/)).toBeNull();
  });
});
