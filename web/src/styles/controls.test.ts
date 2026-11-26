import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const tokens = readFileSync(path.join(__dirname, 'tokens.css'), 'utf8');
const forms = readFileSync(path.join(__dirname, '../components/ui/forms.module.css'), 'utf8');

const px = (name: string) => {
  const m = new RegExp(`--${name}:\\s*(\\d+)px;`).exec(tokens);
  if (!m) throw new Error(`--${name} not found`);
  return Number(m[1]);
};

// Hi-fi 00 Foundations, note "แก้ไข 26 พ.ย. 2569".
describe('control sizes', () => {
  it('are 30 / 36 / 44 px', () => {
    expect([px('control-sm'), px('control-md'), px('control-lg')]).toEqual([30, 36, 44]);
  });

  it('give inputs the medium height', () => {
    expect(tokens).toMatch(/--field-height:\s*var\(--control-md\);/);
  });

  it('keep the large step at the 44 px touch target', () => {
    expect(px('control-lg')).toBeGreaterThanOrEqual(44);
  });

  it('lift a primary button to the touch target on phones', () => {
    const block = /@media \(max-width: 767px\)\s*\{\s*\.btn\.primary[^{]*\{([^}]*)\}/.exec(forms);
    expect(block?.[1]).toMatch(/min-height:\s*var\(--control-lg\)/);
  });
});

describe('input radius', () => {
  it('is 6 px', () => {
    expect(px('radius-input')).toBe(6);
  });

  it('is used by the text control, the segmented unit switch and the chips', () => {
    for (const sel of ['.control', '.segmented', '.chipFace']) {
      const block = new RegExp(`${sel.replace('.', '\\.')}\\s*\\{([^}]*)\\}`).exec(forms)?.[1];
      expect(block, sel).toMatch(/border-radius:\s*var\(--radius-input\)/);
    }
  });
});

describe('motion', () => {
  it('has a fast and a chart duration, both off for reduced motion', () => {
    expect(tokens).toMatch(/--motion-fast:\s*150ms;/);
    expect(tokens).toMatch(/--motion-chart:\s*700ms;/);
    expect(tokens).toMatch(/--motion-ease:\s*ease-out;/);
    const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{\s*:root\s*\{([^}]*)\}/.exec(
      tokens,
    )?.[1];
    expect(reduced).toMatch(/--motion-fast:\s*0ms;/);
    expect(reduced).toMatch(/--motion-chart:\s*0ms;/);
  });
});
