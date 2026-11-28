// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ApiError } from '@/lib/api/errors';

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

// The api answers 422 with a field error on the nickname, as the backend does.
const post = vi.fn();
vi.mock('@/lib/api/client', () => ({ browserApi: () => ({ POST: post }) }));

import { ProjectForm } from './ProjectForm';

afterEach(cleanup);

const duplicate = () =>
  new ApiError(422, 'validation_failed', 'one or more fields are invalid', undefined, [
    { field: '/nickname', code: 'duplicate' },
  ]);

const change = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } });
const nickname = () => screen.getByLabelText(/^ชื่อเล่นโครงการ/) as HTMLInputElement;

function fillValidForm() {
  change(screen.getByLabelText(/^ชื่อโครงการ/), 'ท่าเรือ');
  change(nickname(), 'KT2');
  fireEvent.click(screen.getAllByRole('radio', { name: 'เกาะเต่า' })[0]);
  fireEvent.click(screen.getAllByRole('radio', { name: 'ท่าเรือ' })[0]);
  change(screen.getByLabelText(/^มูลค่าโครงการ/), '1,000,000');
  change(screen.getByLabelText(/วันเริ่มโครงการ/), '01/01/2570');
  change(screen.getByLabelText(/วันสิ้นสุดโครงการ/), '31/12/2570');
}

describe('duplicate nickname', () => {
  it('shows the Thai message on the nickname field, not a form-wide message', async () => {
    post.mockRejectedValue(duplicate());
    render(
      <NextIntlClientProvider locale="th" messages={{ projects, common, ui }}>
        <QueryClientProvider client={new QueryClient()}>
          <ProjectForm />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );
    fillValidForm();
    fireEvent.click(screen.getByRole('button', { name: projects.form.submitCreate }));

    const message = projects.form.errors.nicknameDuplicate;
    await waitFor(() => expect(screen.getByText(message)).toBeTruthy());
    expect(nickname().getAttribute('aria-invalid')).toBe('true');
    expect(screen.queryByText(common.errors.validation_failed)).toBeNull();

    // The message stays when the user leaves the field, and goes when they edit it.
    fireEvent.blur(nickname());
    expect(screen.getByText(message)).toBeTruthy();
    change(nickname(), 'KT3');
    expect(screen.queryByText(message)).toBeNull();
  });
});
