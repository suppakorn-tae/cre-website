import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { CSP_HEADER, NONCE_HEADER, config, proxy } from './proxy';

const nonceOf = (policy: string | null) => /'nonce-([^']+)'/.exec(policy ?? '')?.[1];

describe('proxy: content security policy per request (IO-264)', () => {
  it('sends the policy on the response and hands its nonce to the render', () => {
    const response = proxy(new NextRequest('https://localhost/login'));
    const policy = response.headers.get(CSP_HEADER);
    expect(policy).toContain("frame-ancestors 'none'");
    const nonce = nonceOf(policy);
    expect(nonce).toBeTruthy();
    // NextResponse.next({ request }) forwards overridden request headers this way.
    expect(response.headers.get(`x-middleware-request-${NONCE_HEADER}`)).toBe(nonce);
    expect(response.headers.get(`x-middleware-request-${CSP_HEADER.toLowerCase()}`)).toBe(policy);
  });

  it('makes a new nonce for every request', () => {
    const a = nonceOf(proxy(new NextRequest('https://localhost/')).headers.get(CSP_HEADER));
    const b = nonceOf(proxy(new NextRequest('https://localhost/')).headers.get(CSP_HEADER));
    expect(a).not.toBe(b);
  });

  it('runs on pages but not on the api, static files or the MSW worker', () => {
    const source = new RegExp(`^${config.matcher[0]!.source}$`);
    for (const page of ['/', '/login', '/dashboard', '/projects/p1/versions/v1/results'])
      expect(source.test(page), page).toBe(true);
    for (const skip of [
      '/api/v1/auth/me',
      '/_next/static/chunks/a.js',
      '/favicon.ico',
      '/mockServiceWorker.js',
      '/healthz',
    ])
      expect(source.test(skip), skip).toBe(false);
  });
});
