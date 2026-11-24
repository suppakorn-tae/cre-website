import { type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

import type { components, paths } from '@/lib/api/generated/schema';

const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

type Account = components['schemas']['Account'];
type AuthSession = components['schemas']['AuthSession'];

/** Realistic Thai sample account returned by the auth and account mocks. */
export const mockAccount: Account = {
  id: '0193a5c2-7b1e-7c3a-9d4f-2a6b8e1f5c70',
  email: 'somchai.k@example.co.th',
  role: 'user',
  organisation: 'บริษัท สยามก่อสร้าง จำกัด',
  sign_in_methods: { password: true, google: false },
  terms_accepted_at: '2026-11-20T03:14:07Z',
  created_at: '2026-11-20T03:14:07Z',
};

export const mockAuthSession: AuthSession = {
  user: mockAccount,
  expires_at: '2026-12-20T03:14:07Z',
  keep_logged_in: true,
};

/** The OTP every mock accepts. */
export const mockOtp = '482915';

const otpChallenge = { expires_in_seconds: 600, resend_available_in_seconds: 60 };

function fieldError(field: string, code: string) {
  return {
    error: {
      code: 'validation_failed',
      message: 'request failed validation',
      fields: [{ field, code }],
    },
  };
}

function errorBody(code: string, message: string) {
  return { error: { code, message } };
}

export const authHandlers: HttpHandler[] = [
  http.get('/auth/csrf', ({ response }) =>
    response(200).json({ csrf_token: '9f2c1d7a4be84c6f8a0e3b5d71c2a946' }),
  ),
  http.post('/auth/register/start', async ({ request, response }) => {
    const body = await request.clone().json();
    if (body.password !== body.password_confirmation) {
      return response(422).json(fieldError('/password_confirmation', 'password_mismatch'));
    }
    if (body.email === mockAccount.email) {
      return response(409).json(errorBody('email_taken', 'e-mail already registered'));
    }
    return response(200).json(otpChallenge);
  }),
  http.post('/auth/register/verify', async ({ request, response }) => {
    const body = await request.clone().json();
    if (body.otp !== mockOtp) return response(422).json(fieldError('/otp', 'otp_invalid'));
    return response(201).json({ ...mockAuthSession, user: { ...mockAccount, email: body.email } });
  }),
  http.post('/auth/register/resend', ({ response }) => response(200).json(otpChallenge)),
  http.post('/auth/login', async ({ request, response }) => {
    const body = await request.clone().json();
    if (body.email !== mockAccount.email || body.password !== 'รหัสผ่านทดสอบ-2569') {
      return response(401).json(errorBody('invalid_credentials', 'invalid credentials'));
    }
    return response(200).json({ ...mockAuthSession, keep_logged_in: body.keep_logged_in ?? false });
  }),
  http.post('/auth/logout', ({ response }) => response(204).empty()),
  http.get('/auth/me', ({ response }) => response(200).json(mockAuthSession)),
  http.post('/auth/password/forgot', ({ response }) => response(200).json(otpChallenge)),
  http.post('/auth/password/reset', async ({ request, response }) => {
    const body = await request.clone().json();
    if (body.otp !== mockOtp) return response(422).json(fieldError('/otp', 'otp_invalid'));
    return response(204).empty();
  }),
  http.post('/auth/google/start', ({ response }) =>
    response(200).json({
      authorization_url:
        'https://accounts.google.com/o/oauth2/v2/auth?client_id=example&response_type=code&scope=openid%20email&state=4f1c9a&nonce=b27e5d&code_challenge=Zx81&code_challenge_method=S256',
    }),
  ),
  http.get('/auth/google/pending', ({ response }) =>
    response(200).json({ email: 'somchai.k@example.co.th', expires_in_seconds: 540 }),
  ),
  http.post('/auth/google/complete', async ({ request, response }) => {
    const body = await request.clone().json();
    if (!body.retention_accepted)
      return response(422).json(fieldError('/retention_accepted', 'retention_not_accepted'));
    if (!body.terms_accepted)
      return response(422).json(fieldError('/terms_accepted', 'terms_not_accepted'));
    return response(201).json({
      ...mockAuthSession,
      user: {
        ...mockAccount,
        organisation: body.organisation ?? null,
        sign_in_methods: { password: false, google: true },
      },
    });
  }),

  http.get('/account', ({ response }) => response(200).json(mockAccount)),
  http.patch('/account', async ({ request, response }) => {
    const body = await request.clone().json();
    return response(200).json({ ...mockAccount, organisation: body.organisation || null });
  }),
  http.delete('/account', ({ response }) => response(204).empty()),
  http.put('/account/password', async ({ request, response }) => {
    const body = await request.clone().json();
    if (body.current_password !== 'รหัสผ่านทดสอบ-2569') {
      return response(422).json(fieldError('/current_password', 'current_password_incorrect'));
    }
    return response(204).empty();
  }),
  http.delete('/account/google', ({ response }) => response(200).json(mockAccount)),
];
