import { describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  redirect: (to: string) => {
    throw new Error(`REDIRECT:${to}`);
  },
}));

import Home from './page';

describe('root page', () => {
  it('redirects to the dashboard, which guards the session', () => {
    expect(() => Home()).toThrow('REDIRECT:/dashboard');
  });
});
