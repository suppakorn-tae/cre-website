import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import legal from '../../../messages/th/legal.json';
import shell from '../../../messages/th/shell.json';
import ui from '../../../messages/th/ui.json';
import { RETENTION_NOTICE_PATH, TERMS_PATH } from '../auth/register/google';

import { LegalDocument, type LegalDocumentKey } from './LegalDocument';

function render(doc: LegalDocumentKey) {
  return renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ legal, shell, ui }}>
      <LegalDocument doc={doc} />
    </NextIntlClientProvider>,
  );
}

describe.each([
  ['retention', 'ประกาศการเก็บรักษาข้อมูลเพื่อการวิจัย', 9],
  ['terms', 'เงื่อนไขการใช้งาน', 12],
] as const)('%s page', (doc, title, sectionCount) => {
  const html = render(doc);

  it('has one h1 with the title and the version line', () => {
    expect(html.match(/<h1[ >]/g)).toHaveLength(1);
    expect(html).toContain(title);
    expect(html).toContain('ฉบับวันที่ 26 พฤศจิกายน 2569');
  });

  it('has one h2 per numbered section, in order', () => {
    const headings = [...html.matchAll(/<h2[^>]*>(.*?)<\/h2>/g)].map((m) => m[1]);
    expect(headings).toHaveLength(sectionCount);
    headings.forEach((heading, i) => expect(heading.startsWith(`${i + 1}. `)).toBe(true));
  });

  it('fills the contact placeholders and links the e-mail', () => {
    expect(html).not.toMatch(/\{(email|controller)\}/);
    expect(html).toContain('href="mailto:admin@conriskexpert.com"');
  });

  it('links back to the sign-up page', () => {
    expect(html).toContain('href="/register"');
  });
});

describe('paths linked from the sign-up form', () => {
  it('match the route group', () => {
    expect([RETENTION_NOTICE_PATH, TERMS_PATH]).toEqual(['/legal/retention', '/legal/terms']);
  });
});
