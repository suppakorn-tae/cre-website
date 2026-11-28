/**
 * The Content Security Policy for every page (IO-264). `proxy.ts` makes a new
 * nonce per request and sends this policy; Next.js reads the nonce back from
 * the request header and puts it on its own scripts.
 *
 * Fonts are self-hosted and the api is on the same origin (Caddy routes
 * `/api/v*`), so nothing is loaded from another origin. Google sign-in is a
 * top-level navigation to the URL the api returns, which no directive covers.
 */
export type CspMode = 'production' | 'development';

export interface CspOptions {
  nonce: string;
  mode: CspMode;
}

/** A fresh, unguessable nonce (128 random bits, base64). */
export function createNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes));
}

export function buildCsp({ nonce, mode }: CspOptions): string {
  const dev = mode === 'development';
  const directives: [string, ...string[]][] = [
    ['default-src', "'self'"],
    // 'strict-dynamic' lets the nonced Next.js scripts load their chunks.
    // React needs eval in dev only, to rebuild server error stacks.
    [
      'script-src',
      "'self'",
      `'nonce-${nonce}'`,
      "'strict-dynamic'",
      ...(dev ? ["'unsafe-eval'"] : []),
    ],
    // <style> elements need the nonce. Dev injects unnonced <style> tags for
    // hot reload, so it allows inline styles instead (a nonce would void them).
    ['style-src', "'self'", ...(dev ? ["'unsafe-inline'"] : [`'nonce-${nonce}'`])],
    // style="" attributes only (Radix popper and slider positions, chart bar
    // widths, the scroll lock). They cannot carry a nonce and cannot run script.
    ['style-src-attr', "'unsafe-inline'"],
    ['img-src', "'self'", 'data:', 'blob:'],
    ['font-src', "'self'"],
    ['connect-src', "'self'"],
    // The MSW service worker in mock mode (dev only).
    ['worker-src', "'self'"],
    ['object-src', "'none'"],
    ['base-uri', "'self'"],
    ['form-action', "'self'"],
    ['frame-ancestors', "'none'"],
  ];
  const policy = directives.map((d) => d.join(' '));
  if (!dev) policy.push('upgrade-insecure-requests');
  return policy.join('; ');
}
