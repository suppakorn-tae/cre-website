import { IconAlertTriangle, IconCheck } from '@tabler/icons-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Icon } from './Icon';

describe('Icon', () => {
  it('is decorative by default: hidden from assistive technology', () => {
    const html = renderToStaticMarkup(<Icon icon={IconCheck} />);
    expect(html).toContain('aria-hidden="true"');
    expect(html).not.toContain('role=');
    expect(html).not.toContain('aria-label');
  });

  it('with a label it is an image with that name and is not hidden', () => {
    const html = renderToStaticMarkup(<Icon icon={IconAlertTriangle} label="คำเตือน" />);
    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="คำเตือน"');
    expect(html).not.toContain('aria-hidden');
  });

  it('uses 20px and a 1.75 stroke unless told otherwise', () => {
    const html = renderToStaticMarkup(<Icon icon={IconCheck} />);
    expect(html).toContain('width="20"');
    expect(html).toContain('height="20"');
    expect(html).toContain('stroke-width="1.75"');
  });

  it.each([16, 18, 20, 24] as const)('renders at %ipx', (size) => {
    const html = renderToStaticMarkup(<Icon icon={IconCheck} size={size} />);
    expect(html).toContain(`width="${size}"`);
    expect(html).toContain(`height="${size}"`);
    expect(html).toContain('stroke-width="1.75"');
  });

  it('passes a class name to the svg and keeps it out of the tab order', () => {
    const html = renderToStaticMarkup(<Icon icon={IconCheck} className="text-primary" />);
    expect(html).toMatch(/^<svg[^>]*class="[^"]*text-primary/);
    expect(html).toContain('focusable="false"');
  });
});
