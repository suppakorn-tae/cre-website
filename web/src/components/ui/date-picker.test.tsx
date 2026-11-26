// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { DatePicker, type DatePickerLabels } from './DatePicker';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
afterEach(cleanup);

const labels: DatePickerLabels = {
  open: 'เปิดปฏิทิน',
  calendar: 'เลือกวันที่',
  previousMonth: 'เดือนก่อนหน้า',
  nextMonth: 'เดือนถัดไป',
  previousYears: 'ปีก่อนหน้า',
  nextYears: 'ปีถัดไป',
  outOfRange: 'วันที่อยู่นอกช่วงที่เลือกได้',
};

function Harness({
  initial = '',
  min,
  max,
  onValue,
}: {
  initial?: string;
  min?: string;
  max?: string;
  onValue?: (v: string) => void;
}) {
  const [v, setV] = useState(initial);
  return (
    <DatePicker
      label="วันเริ่มโครงการ"
      value={v}
      min={min}
      max={max}
      labels={labels}
      today="2026-11-24"
      onChange={(next) => {
        setV(next);
        onValue?.(next);
      }}
    />
  );
}

const input = () => screen.getByLabelText('วันเริ่มโครงการ') as HTMLInputElement;
const openCalendar = () => fireEvent.click(screen.getByRole('button', { name: 'เปิดปฏิทิน' }));
const cell = (iso: string) => document.querySelector(`[data-iso="${iso}"]`) as HTMLElement;
const opened = () => waitFor(() => screen.getByRole('grid'));

describe('DatePicker', () => {
  it('accepts typed dd/mm/yyyy in the Buddhist era and reports the ISO date', () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    fireEvent.change(input(), { target: { value: '01/12/2568' } });
    expect(onValue).toHaveBeenLastCalledWith('2025-12-01');
    fireEvent.change(input(), { target: { value: '31/02/2568' } });
    expect(onValue).toHaveBeenLastCalledWith('');
    expect(input().value).toBe('31/02/2568');
  });

  it('shows the value as a Buddhist-era date and opens on its month', async () => {
    render(<Harness initial="2025-12-01" />);
    expect(input().value).toBe('01/12/2568');
    openCalendar();
    await opened();
    expect(screen.getByRole('button', { name: 'ธันวาคม' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2568' })).toBeTruthy();
    expect(cell('2025-12-01').getAttribute('aria-selected')).toBe('true');
  });

  it('marks today and names months, years and weekdays from the formatter', async () => {
    render(<Harness />);
    openCalendar();
    await opened();
    expect(screen.getByRole('button', { name: 'พฤศจิกายน' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2569' })).toBeTruthy();
    expect(cell('2026-11-24').getAttribute('aria-current')).toBe('date');
    expect(screen.getAllByRole('columnheader')).toHaveLength(7);
  });

  it('picks a day with the mouse, fills the field and closes', async () => {
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    openCalendar();
    await opened();
    fireEvent.click(cell('2026-11-15'));
    expect(onValue).toHaveBeenLastCalledWith('2026-11-15');
    expect(input().value).toBe('15/11/2569');
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull());
  });

  it('moves by day and month with the keyboard, selects with Enter', async () => {
    const onValue = vi.fn();
    render(<Harness initial="2026-11-24" onValue={onValue} />);
    openCalendar();
    await opened();
    expect(document.activeElement).toBe(cell('2026-11-24'));
    fireEvent.keyDown(cell('2026-11-24'), { key: 'ArrowRight' });
    expect(document.activeElement).toBe(cell('2026-11-25'));
    fireEvent.keyDown(cell('2026-11-25'), { key: 'ArrowDown' });
    expect(document.activeElement).toBe(cell('2026-12-02'));
    fireEvent.keyDown(cell('2026-12-02'), { key: 'PageUp' });
    expect(document.activeElement).toBe(cell('2026-11-02'));
    fireEvent.keyDown(cell('2026-11-02'), { key: 'Enter' });
    expect(onValue).toHaveBeenLastCalledWith('2026-11-02');
  });

  it('closes on Escape and returns focus to the calendar button', async () => {
    render(<Harness />);
    openCalendar();
    await opened();
    fireEvent.keyDown(document.activeElement as Element, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('grid')).toBeNull());
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'เปิดปฏิทิน' }));
  });

  it('disables days outside min and max and does not pick them', async () => {
    const onValue = vi.fn();
    render(<Harness initial="2026-11-24" min="2026-11-20" max="2026-11-28" onValue={onValue} />);
    openCalendar();
    await opened();
    expect(cell('2026-11-19').getAttribute('aria-disabled')).toBe('true');
    expect(cell('2026-11-29').getAttribute('aria-disabled')).toBe('true');
    expect(cell('2026-11-20').getAttribute('aria-disabled')).toBeNull();
    fireEvent.click(cell('2026-11-19'));
    expect(onValue).not.toHaveBeenCalled();
    // Keys stop at the limits.
    fireEvent.keyDown(cell('2026-11-24'), { key: 'PageDown' });
    expect(document.activeElement).toBe(cell('2026-11-28'));
    expect((screen.getByRole('button', { name: 'เดือนถัดไป' }) as HTMLButtonElement).disabled).toBe(
      true,
    );
  });

  it('flags a date outside min / max', () => {
    render(<Harness initial="2026-11-10" min="2026-11-20" />);
    expect(screen.getByRole('alert').textContent).toContain('วันที่อยู่นอกช่วงที่เลือกได้');
    expect(input().getAttribute('aria-invalid')).toBe('true');
  });

  it('navigates months and years', async () => {
    render(<Harness initial="2026-11-24" />);
    openCalendar();
    await opened();
    fireEvent.click(screen.getByRole('button', { name: 'เดือนถัดไป' }));
    expect(screen.getByRole('button', { name: 'ธันวาคม' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: '2569' }));
    fireEvent.click(screen.getByRole('button', { name: '2570' }));
    fireEvent.click(screen.getByRole('button', { name: 'มีนาคม' }));
    expect(screen.getByRole('button', { name: 'มีนาคม' })).toBeTruthy();
    expect(screen.getByRole('button', { name: '2570' })).toBeTruthy();
    expect(cell('2027-03-01')).toBeTruthy();
  });

  it('has no axe violations while open', async () => {
    render(<Harness initial="2026-11-24" />);
    openCalendar();
    await opened();
    const result = await axe.run(document.body, { rules: { region: { enabled: false } } });
    expect(result.violations.map((v) => v.id)).toEqual([]);
  });
});
