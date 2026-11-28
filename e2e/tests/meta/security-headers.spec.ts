import { expect, test } from '../../helpers/test';
import { authText } from '../auth/support';

// Security headers through Caddy (IO-264), as `curl -sI` would see them. The
// e2e stack runs deploy/compose/Caddyfile: the production headers without HSTS.
// Every spec also fails on a CSP violation (helpers/test.ts).
test.beforeEach(({}, info) => {
  test.skip(info.project.name !== 'desktop', 'headers do not depend on the viewport');
});

const FRAMING = {
  'x-frame-options': 'DENY',
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'cross-origin-opener-policy': 'same-origin',
};

test('a page has the nonce-based policy and the framing headers', async ({ request }) => {
  const response = await request.get('/login');
  expect(response.status()).toBe(200);
  const headers = response.headers();
  expect(headers).toMatchObject(FRAMING);
  const policy = headers['content-security-policy'] ?? '';
  expect(policy).toMatch(/script-src 'self' 'nonce-[^']+' 'strict-dynamic'(;|$)/);
  expect(policy).toMatch(/style-src 'self' 'nonce-[^']+'(;|$)/);
  expect(policy).not.toContain('unsafe-eval');
  for (const directive of [
    "default-src 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    'upgrade-insecure-requests',
  ])
    expect(policy).toContain(directive);
  // A fresh nonce for every request.
  const again = (await request.get('/login')).headers()['content-security-policy'];
  expect(again).not.toBe(policy);
});

test('the api has a deny-all policy and the framing headers', async ({ request }) => {
  const response = await request.get('/api/v1/healthz');
  expect(response.status()).toBe(200);
  expect(response.headers()).toMatchObject({
    ...FRAMING,
    'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  });
});

test('Google sign-in still leaves for accounts.google.com', async ({ page }) => {
  // The e2e stack has no Google client, so stand in for the api's answer and
  // for Google. What is tested is the browser leaving under the page policy.
  await page.route('**/api/v1/auth/google/start', (route) =>
    route.fulfill({
      json: { authorization_url: 'https://accounts.google.com/o/oauth2/v2/auth?client_id=e2e' },
    }),
  );
  await page.route('https://accounts.google.com/**', (route) =>
    route.fulfill({ contentType: 'text/html', body: '<!doctype html><title>Google</title>' }),
  );
  await page.goto('/login');
  await page.getByRole('button', { name: authText('login.google') }).click();
  await page.waitForURL(/^https:\/\/accounts\.google\.com\//);
});
