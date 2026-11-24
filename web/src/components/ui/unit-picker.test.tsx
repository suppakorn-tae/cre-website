import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { UnitPicker, withUnit } from './UnitPicker';

const units = [
  { value: 'baht', label: 'บาท' },
  { value: 'percent', label: '%' },
];

describe('UnitPicker', () => {
  it('renders the amount, every unit and marks the selected one', () => {
    const html = renderToStaticMarkup(
      <UnitPicker
        label="y1 ผลกระทบด้านต้นทุน"
        units={units}
        value={{ amount: '1250000', unit: 'baht' }}
        onChange={() => {}}
        helper="หรือ % ของมูลค่าโครงการ"
      />,
    );
    expect(html).toContain('value="1250000"');
    expect(html).toContain('role="radiogroup"');
    expect(html).toMatch(/aria-checked="true"[^>]*>บาท</);
    expect(html).toMatch(/aria-checked="false"[^>]*>%</);
    expect(html).toContain('หรือ % ของมูลค่าโครงการ');
  });

  it('exposes the error to assistive technology', () => {
    const html = renderToStaticMarkup(
      <UnitPicker
        label="y2"
        units={units}
        value={{ amount: '120', unit: 'percent' }}
        onChange={() => {}}
        error="ค่า % ต้องอยู่ระหว่าง 0–100"
      />,
    );
    expect(html).toContain('aria-invalid="true"');
    expect(html).toContain('role="alert"');
    expect(html).toContain('ค่า % ต้องอยู่ระหว่าง 0–100');
  });

  it('keeps the typed amount when the unit changes', () => {
    expect(withUnit({ amount: '45', unit: 'days' }, 'percent')).toEqual({
      amount: '45',
      unit: 'percent',
    });
  });
});
