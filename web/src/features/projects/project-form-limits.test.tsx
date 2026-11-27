// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Activity, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import common from '../../../messages/th/common.json';
import projects from '../../../messages/th/projects.json';
import ui from '../../../messages/th/ui.json';

const push = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

// The save succeeds without a network: the mutation state is what is under test.
vi.mock('@/lib/api/client', () => ({
  browserApi: () => ({ PATCH: async () => ({ data: { id: 'saved' } }) }),
}));

import { ProjectForm } from './ProjectForm';
import { getProjectStore, resetProjectStore } from './mocks';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const client = new QueryClient();
function wrap(node: ReactNode) {
  return (
    <NextIntlClientProvider locale="th" messages={{ projects, common, ui }}>
      <QueryClientProvider client={client}>{node}</QueryClientProvider>
    </NextIntlClientProvider>
  );
}

const field = (re: RegExp) => screen.getByLabelText(re) as HTMLInputElement;
const change = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });

describe('text limits', () => {
  it('shows an n / max counter under each text field', () => {
    render(wrap(<ProjectForm />));
    expect(screen.getAllByText('0 / 120')).toHaveLength(1);
    expect(screen.getAllByText('0 / 4')).toHaveLength(1);
    expect(screen.getAllByText('0 / 1,000')).toHaveLength(1);
    change(field(/^ชื่อโครงการ/), 'ท่าเรือ');
    expect(screen.getByText('7 / 120')).toBeTruthy();
    change(field(/^ชื่อเล่นโครงการ/), 'เต่า');
    expect(screen.getByText('4 / 4')).toBeTruthy();
  });

  it('counts code points like the server', () => {
    render(wrap(<ProjectForm />));
    change(field(/^ชื่อโครงการ/), 'ก่ก่');
    expect(screen.getByText('4 / 120')).toBeTruthy();
  });

  it('stops the nickname input at 4 characters', () => {
    render(wrap(<ProjectForm />));
    expect(field(/^ชื่อเล่นโครงการ/).maxLength).toBe(4);
  });

  it('counts the other island field to 60', () => {
    render(wrap(<ProjectForm />));
    fireEvent.click(screen.getAllByRole('radio', { name: 'อื่น ๆ' })[0]);
    expect(screen.getByText('0 / 60')).toBeTruthy();
    change(field(/^ระบุเกาะ/), 'ก'.repeat(61));
    expect(screen.getByText('61 / 60')).toBeTruthy();
    expect(screen.getByText('เกาะ / สถานที่ยาวได้ไม่เกิน 60 ตัวอักษร')).toBeTruthy();
  });

  it('shows the length error at once when the name or description is too long', () => {
    render(wrap(<ProjectForm />));
    change(field(/^ชื่อโครงการ/), 'ก'.repeat(121));
    expect(screen.getByText('121 / 120')).toBeTruthy();
    expect(screen.getByText('ชื่อโครงการยาวได้ไม่เกิน 120 ตัวอักษร')).toBeTruthy();
    change(field(/^ชื่อโครงการ/), 'ก'.repeat(120));
    expect(screen.queryByText('ชื่อโครงการยาวได้ไม่เกิน 120 ตัวอักษร')).toBeNull();

    const description = screen.getByLabelText(/^รายละเอียดโครงการ/);
    change(description, 'ก'.repeat(1001));
    expect(screen.getByText('1,001 / 1,000')).toBeTruthy();
    expect(screen.getByText('รายละเอียดยาวได้ไม่เกิน 1,000 ตัวอักษร')).toBeTruthy();
  });
});

describe('live validation', () => {
  it('shows the value error after a pause in typing, not at once', () => {
    vi.useFakeTimers();
    render(wrap(<ProjectForm />));
    change(field(/^มูลค่าโครงการ/), 'abc');
    expect(screen.queryByText(/กรอกมูลค่าเป็นตัวเลข/)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(299);
    });
    expect(screen.queryByText(/กรอกมูลค่าเป็นตัวเลข/)).toBeNull();
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(screen.getByText(/กรอกมูลค่าเป็นตัวเลข/)).toBeTruthy();
    change(field(/^มูลค่าโครงการ/), '1,000');
    expect(screen.queryByText(/กรอกมูลค่าเป็นตัวเลข/)).toBeNull();
  });

  it('shows the progress error while typing, including a decimal', () => {
    vi.useFakeTimers();
    render(wrap(<ProjectForm />));
    const box = field(/^% ความก้าวหน้าปัจจุบัน/);
    const message = 'ความก้าวหน้าต้องเป็นจำนวนเต็มระหว่าง 0–100 %';
    change(box, '12.3');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText(message)).toBeTruthy();
    change(box, '120');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText(message)).toBeTruthy();
    change(box, '12');
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.queryByText(message)).toBeNull();
  });

  it('checks the value on blur, and says required for an empty field', () => {
    render(wrap(<ProjectForm />));
    const value = field(/^มูลค่าโครงการ/);
    fireEvent.blur(value);
    expect(screen.getByText('กรอกมูลค่าโครงการ')).toBeTruthy();
    change(value, '0');
    fireEvent.blur(value);
    expect(screen.getByText('มูลค่าต้องมากกว่า 0')).toBeTruthy();
  });
});

describe('saving state after a save (regression)', () => {
  beforeEach(() => {
    resetProjectStore();
    push.mockClear();
  });

  it('starts clean when the form opens again after a save', async () => {
    const project = getProjectStore()[0];
    const tree = (mode: 'visible' | 'hidden') =>
      wrap(
        <Activity mode={mode}>
          <ProjectForm project={project} />
        </Activity>,
      );
    const { rerender } = render(tree('visible'));
    fireEvent.click(screen.getByRole('button', { name: 'บันทึกการแก้ไข' }));
    await waitFor(() => expect(push).toHaveBeenCalled());
    const stuck = await screen.findByRole('button', { name: 'กำลังบันทึก…' });
    expect((stuck as HTMLButtonElement).disabled).toBe(true);

    // The router hides the page and shows it again: same component, new visit.
    rerender(tree('hidden'));
    rerender(tree('visible'));
    const again = await screen.findByRole('button', { name: 'บันทึกการแก้ไข' });
    expect((again as HTMLButtonElement).disabled).toBe(false);
  });
});
