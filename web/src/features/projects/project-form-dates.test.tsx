// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import common from '../../../messages/th/common.json';
import projects from '../../../messages/th/projects.json';
import ui from '../../../messages/th/ui.json';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }));
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

import { ProjectForm } from './ProjectForm';

afterEach(cleanup);

function renderForm() {
  return render(
    <NextIntlClientProvider locale="th" messages={{ projects, common, ui }}>
      <QueryClientProvider client={new QueryClient()}>
        <ProjectForm />
      </QueryClientProvider>
    </NextIntlClientProvider>,
  );
}

const start = () => screen.getByLabelText(/วันเริ่มโครงการ/) as HTMLInputElement;
const end = () => screen.getByLabelText(/วันสิ้นสุดโครงการ/) as HTMLInputElement;
const calendarButtons = () => screen.getAllByRole('button', { name: 'เปิดปฏิทิน' });
const cell = (iso: string) => document.querySelector(`[data-iso="${iso}"]`) as HTMLElement;
const opened = () => waitFor(() => screen.getByRole('grid'));
const firstDay = () => document.querySelector('[data-iso]') as HTMLElement;

describe('ProjectForm dates', () => {
  it('opens a calendar from the icon on the start date and fills the field', async () => {
    renderForm();
    fireEvent.click(calendarButtons()[0]);
    await opened();
    const first = firstDay();
    fireEvent.click(first);
    const [y, m, d] = (first.dataset.iso as string).split('-');
    expect(start().value).toBe(`${d}/${m}/${Number(y) + 543}`);
  });

  it('opens the end date calendar with Alt+Down and fills the field', async () => {
    renderForm();
    fireEvent.keyDown(end(), { key: 'ArrowDown', altKey: true });
    await opened();
    fireEvent.click(firstDay());
    expect(end().value).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it('does not allow days before the start date in the end calendar', async () => {
    renderForm();
    fireEvent.change(start(), { target: { value: '15/01/2569' } });
    // The calendar opens on the month of the current value.
    fireEvent.change(end(), { target: { value: '20/01/2569' } });
    fireEvent.click(calendarButtons()[1]);
    await opened();
    expect(cell('2026-01-14').getAttribute('aria-disabled')).toBe('true');
    fireEvent.click(cell('2026-01-14'));
    expect(end().value).toBe('20/01/2569');
    expect(cell('2026-01-15').getAttribute('aria-disabled')).toBe('true');
    expect(cell('2026-01-16').getAttribute('aria-disabled')).toBeNull();
  });

  it('does not allow days after the end date in the start calendar', async () => {
    renderForm();
    fireEvent.change(end(), { target: { value: '15/01/2569' } });
    fireEvent.click(calendarButtons()[0]);
    await opened();
    expect(cell('2026-01-15').getAttribute('aria-disabled')).toBe('true');
    expect(cell('2026-01-14').getAttribute('aria-disabled')).toBeNull();
  });

  it('still rejects a typed end date before the start date on submit', async () => {
    renderForm();
    fireEvent.change(start(), { target: { value: '15/01/2569' } });
    fireEvent.change(end(), { target: { value: '01/01/2569' } });
    fireEvent.submit(start().closest('form') as HTMLFormElement);
    await waitFor(() => expect(screen.getAllByText('วันสิ้นสุดต้องอยู่หลังวันเริ่ม').length).toBe(1));
  });

  it('shows the invalid-date message, not required, for a date that does not exist', async () => {
    renderForm();
    fireEvent.change(start(), { target: { value: '31/02/2569' } });
    fireEvent.submit(start().closest('form') as HTMLFormElement);
    await waitFor(() =>
      expect(screen.getAllByText('วันที่ไม่ถูกต้อง กรอกเป็น วว/ดด/ปปปป').length).toBe(1),
    );
    expect(screen.queryByText('กรอกวันเริ่มโครงการ')).toBeNull();
    expect(start().value).toBe('31/02/2569');
  });

  it('keeps the duration hint under the end date', () => {
    renderForm();
    fireEvent.change(start(), { target: { value: '01/01/2569' } });
    fireEvent.change(end(), { target: { value: '31/12/2569' } });
    expect(screen.getByText('หลังวันเริ่ม · ระยะเวลา 364 วัน')).toBeTruthy();
  });
});
