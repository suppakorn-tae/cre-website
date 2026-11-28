import { describe, expect, it } from 'vitest';

import account from '../../../../messages/th/account.json';
import auth from '../../../../messages/th/auth.json';

function collect(node: unknown, key: string, out: string[] = []): string[] {
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      if (k === key && typeof v === 'string') out.push(v);
      else collect(v, key, out);
    }
  }
  return out;
}

describe('common password messages', () => {
  it('has a Thai message for password_too_common on sign-up, reset and change', () => {
    const signupAndReset = collect(auth, 'passwordTooCommon');
    expect(signupAndReset).toHaveLength(2);
    const change = collect(account, 'tooCommon');
    expect(change).toHaveLength(1);
    for (const m of [...signupAndReset, ...change]) expect(m).toMatch(/^[฀-๿ ]+$/);
  });
});
