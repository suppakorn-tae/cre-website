import { NextResponse, type NextRequest } from 'next/server';

import { buildCsp, createNonce } from '@/lib/security/csp';

export const CSP_HEADER = 'Content-Security-Policy';
export const NONCE_HEADER = 'x-nonce';

/**
 * Sends a nonce-based Content Security Policy with every page (IO-264). The
 * policy also goes on the request, where Next.js reads the nonce and adds it
 * to its scripts; `x-nonce` hands it to our own inline script (ThemeScript).
 */
export function proxy(request: NextRequest) {
  const nonce = createNonce();
  const policy = buildCsp({
    nonce,
    mode: process.env.NODE_ENV === 'development' ? 'development' : 'production',
  });

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set(NONCE_HEADER, nonce);
  requestHeaders.set(CSP_HEADER, policy);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set(CSP_HEADER, policy);
  return response;
}

export const config = {
  matcher: [
    {
      // Pages only: not the api (Caddy gives it its own policy), static files,
      // icons, the MSW worker script, or the health probe.
      source:
        '/((?!api/|_next/static|_next/image|favicon.ico|icon.png|apple-icon.png|brand/|mockServiceWorker.js|healthz).*)',
      // Prefetches return RSC payloads, not HTML, so they need no policy.
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
