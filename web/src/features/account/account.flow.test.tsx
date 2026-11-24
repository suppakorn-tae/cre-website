import createClient from 'openapi-fetch';
import { NextIntlClientProvider } from 'next-intl';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import account from '../../../messages/th/account.json';
import auth from '../../../messages/th/auth.json';
import ui from '../../../messages/th/ui.json';
import { authHandlers, mockAccount } from '@/mocks/auth';
import type { paths } from '@/lib/api/generated/schema';

import { classifyDeleteFailure, classifyPasswordFailure } from './account';
import { AuthApiError, createAccountApi } from './api';

vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn() }) }));

import { DeleteSection } from './DeleteSection';
import { MethodsSection } from './MethodsSection';

const server = setupServer(...authHandlers);
beforeAll(() => server.listen({ onUnhandledFrame: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const api = createAccountApi(
  createClient<paths>({ baseUrl: 'http://localhost/api/v1', fetch: (request) => fetch(request) }),
  async () => {},
);

describe('account api against the MSW mocks', () => {
  it('reads the account and saves the organisation', async () => {
    expect((await api.get()).email).toBe(mockAccount.email);
    expect((await api.updateOrganisation('กรมทางหลวงชนบท')).organisation).toBe('กรมทางหลวงชนบท');
    expect((await api.updateOrganisation('')).organisation).toBeNull();
  });

  it('shows the wrong current password as a field error', async () => {
    const error = await api
      .changePassword({
        current_password: 'ผิด',
        new_password: 'รหัสผ่านใหม่-2569',
        new_password_confirmation: 'รหัสผ่านใหม่-2569',
      })
      .catch((e) => e);
    expect(error).toBeInstanceOf(AuthApiError);
    expect(classifyPasswordFailure(error)).toEqual({
      kind: 'fields',
      errors: { current: 'currentIncorrect' },
    });
  });

  it('changes the password with the right current one', async () => {
    await expect(
      api.changePassword({
        current_password: 'รหัสผ่านทดสอบ-2569',
        new_password: 'รหัสผ่านใหม่-2569',
        new_password_confirmation: 'รหัสผ่านใหม่-2569',
      }),
    ).resolves.toBeUndefined();
  });

  it('deletes with a password or after a Google re-authentication', async () => {
    let body: unknown;
    const { http, HttpResponse } = await import('msw');
    server.use(
      http.delete('*/api/v1/account', async ({ request }) => {
        body = await request.clone().json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    await api.deleteAccount('รหัสผ่านทดสอบ-2569');
    expect(body).toEqual({ current_password: 'รหัสผ่านทดสอบ-2569' });
    await api.deleteAccount();
    expect(body).toEqual({});
  });

  it('keeps the error code of a rejected delete', async () => {
    const { http, HttpResponse } = await import('msw');
    server.use(
      http.delete('*/api/v1/account', () =>
        HttpResponse.json(
          { error: { code: 'reauth_required', message: 'reauth' } },
          { status: 403 },
        ),
      ),
    );
    const error = await api.deleteAccount().catch((e) => e);
    expect(classifyDeleteFailure(error)).toBe('reauthRequired');
  });

  it('starts Google for link and reauth', async () => {
    expect(await api.startGoogle('link')).toContain('accounts.google.com');
  });
});

describe('MethodsSection', () => {
  const render = (methods: { password: boolean; google: boolean }) =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="th" messages={{ account, auth, ui }}>
        <QueryClientProvider client={new QueryClient()}>
          <MethodsSection account={{ ...mockAccount, sign_in_methods: methods }} />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

  it('disables unlink with the reason for a Google-only account', () => {
    const html = render({ password: false, google: true });
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*>ยกเลิกการเชื่อมต่อ<\/button>/);
    expect(html).toContain('ยกเลิกการเชื่อมต่อไม่ได้เพราะเป็นวิธีเข้าสู่ระบบเดียว');
    expect(html).not.toContain('<strong>อีเมลและรหัสผ่าน</strong>');
  });

  it('enables unlink when a password exists and offers link otherwise', () => {
    expect(render({ password: true, google: true })).not.toMatch(
      /<button[^>]*disabled=""[^>]*>ยกเลิกการเชื่อมต่อ<\/button>/,
    );
    expect(render({ password: true, google: false })).toContain('เชื่อมต่อบัญชี Google');
  });
});

describe('DeleteSection dialog', () => {
  const render = (methods: { password: boolean; google: boolean }, reauthenticated = false) =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="th" messages={{ account, auth, ui }}>
        <QueryClientProvider client={new QueryClient()}>
          <DeleteSection
            account={{ ...mockAccount, sign_in_methods: methods }}
            reauthenticated={reauthenticated}
          />
        </QueryClientProvider>
      </NextIntlClientProvider>,
    );

  it('explains what is kept and asks a password account for it', () => {
    const html = render({ password: true, google: false });
    expect(html).toContain('โครงการยังเก็บไว้เพื่อการวิจัย (นิรนาม)');
    expect(html).toContain('สมัครใหม่ด้วยอีเมลเดิมได้ แต่เป็นบัญชีใหม่');
    expect(html).toContain('type="password"');
    expect(html).not.toContain('ยืนยันด้วย Google');
  });

  it('asks a Google-only account to re-authenticate with Google', () => {
    expect(render({ password: false, google: true })).toContain('ยืนยันด้วย Google');
    const verified = render({ password: false, google: true }, true);
    expect(verified).toContain('ยืนยันตัวตนด้วย Google แล้ว');
    expect(verified).not.toContain('type="password"');
  });
});
