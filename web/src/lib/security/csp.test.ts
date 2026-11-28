import { describe, expect, it } from 'vitest';

import { buildCsp, createNonce } from './csp';

/** The policy as a map of directive name to its sources. */
function parse(policy: string): Map<string, string[]> {
  return new Map(
    policy.split('; ').map((d) => {
      const [name, ...sources] = d.split(' ');
      return [name!, sources];
    }),
  );
}

const NONCE = 'AAAAAAAAAAAAAAAAAAAAAA==';
const prod = parse(buildCsp({ nonce: NONCE, mode: 'production' }));
const dev = parse(buildCsp({ nonce: NONCE, mode: 'development' }));

describe('content security policy (IO-264)', () => {
  it('allows scripts only from this origin with the nonce, and their own chunks', () => {
    expect(prod.get('script-src')).toEqual(["'self'", `'nonce-${NONCE}'`, "'strict-dynamic'"]);
  });

  it('never allows eval or inline scripts in production', () => {
    const scripts = prod.get('script-src')!.join(' ');
    expect(scripts).not.toContain('unsafe-eval');
    expect(scripts).not.toContain('unsafe-inline');
  });

  it('adds eval in dev only, for React error stacks', () => {
    expect(dev.get('script-src')).toContain("'unsafe-eval'");
    expect(dev.get('script-src')).toContain(`'nonce-${NONCE}'`);
  });

  it('needs the nonce for <style> tags and allows inline style attributes only', () => {
    expect(prod.get('style-src')).toEqual(["'self'", `'nonce-${NONCE}'`]);
    expect(prod.get('style-src-attr')).toEqual(["'unsafe-inline'"]);
  });

  it('loads everything else from this origin only', () => {
    expect(prod.get('default-src')).toEqual(["'self'"]);
    expect(prod.get('img-src')).toEqual(["'self'", 'data:', 'blob:']);
    expect(prod.get('font-src')).toEqual(["'self'"]);
    expect(prod.get('connect-src')).toEqual(["'self'"]);
    expect(prod.get('worker-src')).toEqual(["'self'"]);
  });

  it('blocks framing, plugins, base and foreign form targets', () => {
    expect(prod.get('frame-ancestors')).toEqual(["'none'"]);
    expect(prod.get('object-src')).toEqual(["'none'"]);
    expect(prod.get('base-uri')).toEqual(["'self'"]);
    expect(prod.get('form-action')).toEqual(["'self'"]);
  });

  it('allows no Google script or frame: Google sign-in is a server redirect', () => {
    const policy = buildCsp({ nonce: NONCE, mode: 'production' });
    expect(policy).not.toMatch(/google|https?:/);
    expect(prod.has('frame-src')).toBe(false);
  });

  it('upgrades insecure requests in production only', () => {
    expect(prod.has('upgrade-insecure-requests')).toBe(true);
    expect(dev.has('upgrade-insecure-requests')).toBe(false);
  });
});

describe('createNonce', () => {
  it('makes a new base64 value of 128 bits each time', () => {
    const a = createNonce();
    const b = createNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/]{22}==$/);
  });
});
