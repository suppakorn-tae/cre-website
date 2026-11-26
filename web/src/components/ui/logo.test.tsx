import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import shell from '../../../messages/th/shell.json';

import { Logo } from './Logo';

const render = (variant: 'header' | 'full') =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ shell }}>
      <Logo variant={variant} />
    </NextIntlClientProvider>,
  );

describe('Logo', () => {
  it('header: decorative mark next to the visible name, CRE for mobile', () => {
    const html = render('header');
    expect(html).toContain('%2Fbrand%2Fcre-logo-mark.png');
    expect(html).toContain('alt=""');
    expect(html).toContain('width="431"');
    expect(html).toContain('height="486"');
    expect(html).toContain('Construction Risk Expert');
    expect(html).toContain('ประเมินความเสี่ยงงานก่อสร้างบนเกาะ');
    expect(html).toContain('CRE');
  });

  it('full: the wordmark image carries the name as its alt', () => {
    const html = render('full');
    expect(html).toContain('%2Fbrand%2Fcre-logo-full.png');
    expect(html).toContain('alt="Construction Risk Expert"');
    expect(html).toContain('width="998"');
    expect(html).toContain('height="486"');
  });
});
