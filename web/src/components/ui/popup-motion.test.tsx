// @vitest-environment jsdom
import * as Tooltip from '@radix-ui/react-tooltip';
import { cleanup, render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { TooltipContent } from './TooltipContent';

afterEach(cleanup);

const read = (file: string) => readFileSync(join(__dirname, file), 'utf8');
/** The body of the first rule whose selector matches. */
const rule = (css: string, selector: string) => {
  const escaped = selector.replace(/[.[\]]/g, '\\$&');
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
};
/** The inside of the `@media (prefers-reduced-motion: reduce)` block. */
const reduced = (css: string) =>
  css.match(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?\n\})/)?.[1] ?? '';

describe('TooltipContent', () => {
  it('renders the text in the shared popup class', () => {
    render(
      <Tooltip.Provider>
        <Tooltip.Root open>
          <Tooltip.Trigger>x</Tooltip.Trigger>
          <TooltipContent>ด้านการจัดการ: RM เฉลี่ย 2.73</TooltipContent>
        </Tooltip.Root>
      </Tooltip.Provider>,
    );
    const el = document.querySelector('[data-radix-popper-content-wrapper] > *');
    expect(el?.textContent).toContain('ด้านการจัดการ');
    expect(el?.className).toMatch(/tooltip/);
  });

  it('fits its content, capped at 70vh with an inner scroll', () => {
    const body = rule(read('display.module.css'), '.tooltip');
    expect(body).toMatch(/width:\s*max-content/);
    expect(body).toMatch(/max-width:\s*min\(/);
    expect(body).toMatch(/max-height:\s*70vh/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  it('fades and scales in with the fast motion token, and is static under reduced motion', () => {
    const css = read('display.module.css');
    expect(rule(css, '.tooltip')).toMatch(/animation:\s*popup-in var\(--motion-fast\)/);
    expect(css).toMatch(/@keyframes popup-in\s*\{[^@]*opacity:\s*0[^@]*scale/);
    expect(reduced(css)).toMatch(/\.tooltip\s*\{[^}]*animation:\s*none/);
  });
});

describe('ConfirmDialog styles', () => {
  const css = read('feedback.module.css');

  it('fits its content, capped at 70vh with an inner scroll', () => {
    const body = rule(css, '.dialog');
    expect(body).toMatch(/max-height:\s*min\(70vh/);
    expect(body).toMatch(/overflow-y:\s*auto/);
  });

  it('fades and scales in only while open, and is static under reduced motion', () => {
    expect(css).toMatch(/\.dialog\[open\]\s*\{[^}]*animation:\s*dialog-in var\(--motion-fast\)/);
    expect(css).toMatch(/@keyframes dialog-in\s*\{[^@]*opacity:\s*0[^@]*scale/);
    expect(reduced(css)).toMatch(/\.dialog\[open\][^{]*\{[^}]*animation:\s*none/);
  });
});
