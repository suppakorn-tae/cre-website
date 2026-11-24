import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { CheckboxGroup, toggleOption, type CheckboxOption } from './CheckboxGroup';

const options: CheckboxOption[] = [
  { value: 'A', label: 'A', exclusive: true },
  { value: 'B', label: 'B' },
  { value: 'C', label: 'C' },
];

describe('toggleOption (exclusive option)', () => {
  it('adds and removes ordinary options', () => {
    expect(toggleOption(options, ['B'], 'C')).toEqual(['B', 'C']);
    expect(toggleOption(options, ['B', 'C'], 'B')).toEqual(['C']);
  });

  it('clears everything else when the exclusive option is picked', () => {
    expect(toggleOption(options, ['B', 'C'], 'A')).toEqual(['A']);
  });

  it('drops the exclusive option when another one is picked', () => {
    expect(toggleOption(options, ['A'], 'B')).toEqual(['B']);
  });

  it('allows unchecking the exclusive option', () => {
    expect(toggleOption(options, ['A'], 'A')).toEqual([]);
  });
});

describe('CheckboxGroup', () => {
  it('renders a labelled group with checked state and the exclusive hint', () => {
    const html = renderToStaticMarkup(
      <CheckboxGroup
        legend="y3 ตัวเลือก"
        options={options}
        value={['B']}
        onChange={() => {}}
        helper="A ใช้ร่วมกับตัวเลือกอื่นไม่ได้"
      />,
    );
    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend');
    expect(html.match(/type="checkbox"/g)).toHaveLength(3);
    expect(html.match(/checked=""/g)).toHaveLength(1);
    expect(html).toContain('A ใช้ร่วมกับตัวเลือกอื่นไม่ได้');
  });

  it('shows the error with role alert', () => {
    const html = renderToStaticMarkup(
      <CheckboxGroup
        legend="y3"
        options={options}
        value={['A', 'B']}
        onChange={() => {}}
        error="เลือก A ร่วมกับตัวเลือกอื่นไม่ได้"
      />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain('aria-invalid="true"');
  });
});
