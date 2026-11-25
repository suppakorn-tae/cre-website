import { describe, expect, it } from 'vitest';

import shell from '../../../messages/th/shell.json';

import { accountMenuLinks, roleKey } from './account-menu';

describe('accountMenuLinks', () => {
  it('lists the account link for everyone and the admin link for admins only', () => {
    expect(accountMenuLinks({ isAdmin: false }, '/dashboard').map((l) => l.key)).toEqual([
      'myAccount',
    ]);
    expect(accountMenuLinks({ isAdmin: true }, '/dashboard').map((l) => [l.key, l.href])).toEqual([
      ['myAccount', '/account'],
      ['admin', '/admin/users'],
    ]);
  });

  it('marks the item of the page the user is on', () => {
    const current = (path: string) =>
      accountMenuLinks({ isAdmin: true }, path)
        .filter((l) => l.current)
        .map((l) => l.key);
    expect(current('/account')).toEqual(['myAccount']);
    expect(current('/admin/audit')).toEqual(['admin']);
    expect(current('/projects')).toEqual([]);
  });
});

describe('roleKey', () => {
  it('names the role in the catalogue', () => {
    expect(shell.account[roleKey({ isAdmin: false })]).toBe('บทบาท: ผู้ประเมิน');
    expect(shell.account[roleKey({ isAdmin: true })]).toBe('บทบาท: ผู้ดูแลระบบ');
  });
});
