import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { EmptyState } from './EmptyState';
import { KpiCard } from './KpiCard';

describe('KpiCard', () => {
  it('shows a chevron on a clickable card and the tag on the selected one', () => {
    const open = renderToStaticMarkup(
      <KpiCard
        label="โครงการ"
        value="3"
        icon={<i />}
        onSelect={() => {}}
        selectedLabel="กำลังแสดง"
      />,
    );
    expect(open).toContain('aria-pressed="false"');
    expect(open).toContain('<svg');
    expect(open).not.toContain('กำลังแสดง');
    const shown = renderToStaticMarkup(
      <KpiCard label="โครงการ" value="3" selected onSelect={() => {}} selectedLabel="กำลังแสดง" />,
    );
    expect(shown).toContain('aria-pressed="true"');
    expect(shown).toContain('กำลังแสดง');
    expect(shown).not.toContain('<svg');
  });

  it('stays a plain box without onSelect, and the icon tile is decoration', () => {
    const html = renderToStaticMarkup(<KpiCard label="มูลค่า" value="203.5" icon={<i />} />);
    expect(html).not.toContain('<button');
    expect(html).toContain('aria-hidden="true"');
  });
});

describe('EmptyState', () => {
  it('shows the icon tile only when an icon is given', () => {
    expect(renderToStaticMarkup(<EmptyState title="ว่าง" />)).not.toContain('aria-hidden');
    expect(renderToStaticMarkup(<EmptyState title="ว่าง" icon={<i />} />)).toContain(
      'aria-hidden="true"',
    );
  });
});
