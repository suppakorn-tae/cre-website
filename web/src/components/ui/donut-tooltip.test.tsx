// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { DonutChart, arcAnchor, donutArcs } from './DonutChart';

afterEach(cleanup);

const segments = [
  { key: 'VH', value: 2, color: 'red' },
  { key: 'L', value: 98, color: 'green' },
];
const details = {
  VH: { title: 'VH - ความเสี่ยงสูงมาก', detail: 'จำนวน: 2 (2%)' },
  L: { title: 'L - ความเสี่ยงต่ำ', detail: 'จำนวน: 98 (98%)' },
};

const setup = () =>
  render(
    <DonutChart segments={segments} label="สรุป" centre="100" details={details} animate={false} />,
  );
const arc = (name: RegExp) => screen.getByRole('img', { name });

describe('DonutChart tooltip', () => {
  it('names each arc with its level, count and share, and makes it focusable', () => {
    setup();
    const vh = arc(/VH - ความเสี่ยงสูงมาก จำนวน: 2 \(2%\)/);
    expect(vh.getAttribute('tabindex')).toBe('0');
    expect(screen.getByRole('group', { name: 'สรุป' })).toBeTruthy();
  });

  it('grows the arc and shows the tooltip on hover, and hides it when the pointer leaves', () => {
    setup();
    const vh = arc(/VH/);
    expect(vh.hasAttribute('data-active')).toBe(false);
    fireEvent.pointerEnter(vh, { pointerType: 'mouse' });
    expect(vh.hasAttribute('data-active')).toBe(true);
    expect(screen.getAllByText('จำนวน: 2 (2%)').length).toBeGreaterThan(0);
  });

  it('shows the same tooltip on keyboard focus and dismisses it with Escape', () => {
    setup();
    const vh = arc(/VH/);
    act(() => vh.focus());
    expect(vh.hasAttribute('data-active')).toBe(true);
    expect(screen.getAllByText('VH - ความเสี่ยงสูงมาก').length).toBeGreaterThan(0);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(vh.hasAttribute('data-active')).toBe(false);
  });

  it('shows one tooltip at a time and closes on blur', () => {
    setup();
    act(() => arc(/VH/).focus());
    act(() => arc(/L - /).focus());
    expect(arc(/VH/).hasAttribute('data-active')).toBe(false);
    expect(arc(/L - /).hasAttribute('data-active')).toBe(true);
    act(() => arc(/L - /).blur());
    expect(arc(/L - /).hasAttribute('data-active')).toBe(false);
  });

  it('stays a plain image without details', () => {
    render(<DonutChart segments={segments} label="สรุป" centre="100" animate={false} />);
    expect(screen.getByRole('img', { name: 'สรุป' })).toBeTruthy();
    expect(document.querySelector('[tabindex]')).toBeNull();
  });

  it('anchors the popup on the middle of the arc', () => {
    const [vh, l] = donutArcs(segments);
    const a = arcAnchor(vh);
    expect(a.x).toBeGreaterThan(50); // 2% from 12 o'clock: just right of the top
    expect(a.y).toBeLessThan(15);
    expect(arcAnchor(l).y).toBeGreaterThan(85); // 98%: its middle is at the bottom
  });
});

describe('donut arc styles', () => {
  const css = readFileSync(join(__dirname, 'display.module.css'), 'utf8');
  it('grows the active arc and only animates it when motion is allowed', () => {
    expect(css).toMatch(/\.donutArc\[data-active\]\s*\{\s*stroke-width:\s*7\.6/);
    expect(css).toMatch(
      /@media \(prefers-reduced-motion: no-preference\)\s*\{\s*\.donutArc\s*\{\s*transition:\s*stroke-width/,
    );
  });
});
