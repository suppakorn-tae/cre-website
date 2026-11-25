import { describe, expect, it } from 'vitest';

import { pageTitle, versionContext } from './title';

describe('pageTitle', () => {
  it('joins page and context with a middle dot', () => {
    expect(pageTitle('แก้ไขโครงการ', 'ABC')).toBe('แก้ไขโครงการ · ABC');
  });
  it('leaves the context out when there is none', () => {
    expect(pageTitle('บัญชีของฉัน')).toBe('บัญชีของฉัน');
    expect(pageTitle('บัญชีของฉัน', '')).toBe('บัญชีของฉัน');
    expect(pageTitle('บัญชีของฉัน', '  ')).toBe('บัญชีของฉัน');
    expect(pageTitle('บัญชีของฉัน', null)).toBe('บัญชีของฉัน');
  });
});

describe('versionContext', () => {
  it('writes nickname and version number', () => {
    expect(versionContext('ABC', 3)).toBe('ABC v3');
  });
});
