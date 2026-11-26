import { NextIntlClientProvider } from 'next-intl';
import { setupServer } from 'msw/node';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import assessment from '../../../messages/th/assessment.json';

vi.mock('@/lib/api/client', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client')>();
  const client = original.createApiClient({
    baseUrl: 'http://localhost/api/v1',
    fetch: (input, init) => globalThis.fetch(input, init),
  });
  return { ...original, browserApi: () => client };
});

import { browserApi } from '@/lib/api/client';

import { saveAnswers } from './api';
import { CardList } from './CardList';
import { GroupList } from './GroupList';
import { LetterChoiceList } from './LetterChoiceList';
import { Toolbar } from './Toolbar';
import { createAnswerHandlers } from './mocks';
import { emptyDraft } from './rules';

const catalogue = {
  locale: 'th',
  ri_e_options: [
    { code: 'A', label: 'ไม่มีผลกระทบ', is_exclusive: true },
    { code: 'B', label: 'ผลกระทบเล็กน้อย', is_exclusive: false },
  ],
  dimensions: [
    {
      code: 'EC',
      name: 'ด้านเศรษฐกิจ',
      factors: [
        {
          code: 'EC-MG',
          name: 'การจัดการ',
          indicators: [
            {
              code: 'EC-MG-1',
              name: 'การประสานงานไม่ดี',
              unit: 'ครั้ง/เดือน',
              question_x: 'เกิดบ่อยแค่ไหน',
              question_y1: 'ต้นทุนเพิ่มเท่าไร',
              question_y2: 'เวลาเพิ่มเท่าไร',
              question_y3: null,
            },
            {
              code: 'EC-MG-2',
              name: 'การวางแผนไม่ดี',
              unit: '%',
              question_x: null,
              question_y1: null,
              question_y2: null,
              question_y3: null,
            },
          ],
        },
      ],
    },
  ],
};

const server = setupServer(...createAnswerHandlers(['v-old']));
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers(...createAnswerHandlers(['v-old'])));
afterAll(() => server.close());

const render = (disabled: boolean, complete = false, factor?: string) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ assessment }}>
      <GroupList
        catalogue={catalogue}
        disabled={disabled}
        factor={factor}
        onChange={vi.fn()}
        drafts={
          complete
            ? {
                'EC-MG-1': {
                  x: '6',
                  y1: { amount: '100', unit: 'baht' },
                  y2: { amount: '5', unit: 'day' },
                  y3: ['B'],
                },
              }
            : { 'EC-MG-2': emptyDraft() }
        }
      />
    </NextIntlClientProvider>,
  );

describe('GroupList', () => {
  it('groups by dimension and factor with progress', () => {
    const html = render(false, true);
    expect(html).toContain('ด้านเศรษฐกิจ');
    expect(html).toContain('EC-MG การจัดการ');
    expect(html).toContain('ตอบครบ 1/2');
    expect(html).toContain('ตอบแล้ว 1');
    expect(html).toContain('ตอบครบ</span>');
    expect(html).toContain('ยังไม่ตอบ');
  });
  it('shows the catalogue questions and Thai labels only', () => {
    const html = render(false);
    expect(html).toContain('เกิดบ่อยแค่ไหน');
    // The X unit is under the input only, not in the question.
    expect(html.match(/ครั้ง\/เดือน/g)).toHaveLength(1);
    expect(html).toContain('บาท');
    expect(html).toContain('วัน');
  });
  it('disables every control in read-only mode', () => {
    const html = render(true);
    expect(html).not.toMatch(/<input(?![^>]*disabled)[^>]*type="text"/);
    expect(html).toContain('disabled');
  });
});

describe('assessment table', () => {
  it('is one table with a header row, group rows and one row per indicator', () => {
    const html = render(false);
    expect(html.match(/<table/g)).toHaveLength(1);
    expect(html).toContain('<th scope="col">รหัส</th>');
    expect(html).toContain('y1 ต้นทุน (บาท)');
    expect(html).toContain('y2 เวลา (วัน)');
    expect(html.match(/<tr class="[^"]*row/g)).toHaveLength(2);
    expect(html).toContain('colSpan');
  });
  it('keeps the question of each field in the page and points the field at it', () => {
    const html = render(false);
    expect(html).toContain('คำถาม · EC-MG-1 · X ความถี่ของเหตุการณ์');
    const input = /<input[^>]*aria-label="X ความถี่ของเหตุการณ์ EC-MG-1"[^>]*>/.exec(html)?.[0];
    const id = /aria-describedby="([^"]+)"/.exec(input ?? '')?.[1];
    expect(id).toBeTruthy();
    const hint = new RegExp(`<span id="${id}"[^>]*>([^<]*)</span>`).exec(html)?.[1];
    expect(hint).toContain('เกิดบ่อยแค่ไหน');
    expect(hint).not.toContain('ครั้ง/เดือน');
  });
  it('has no hover-driven hint markup', () => {
    expect(render(false)).not.toContain('role="tooltip"');
  });
  it('has one table with a header, a column group, the X unit as text and a y3 button', () => {
    const html = render(false);
    expect(html.match(/<thead>/g)).toHaveLength(1);
    expect(html.match(/<col[ /]/g)).toHaveLength(7);
    expect(html).toContain('X ความถี่ (หน่วยตามตัวชี้วัด)');
    expect(html).toMatch(/<span class="[^"]*unitText[^"]*">ครั้ง\/เดือน<\/span>/);
    expect(html).not.toContain('placeholder=');
    expect(html).toContain('aria-haspopup="dialog"');
  });
  it('shows only the chosen factor', () => {
    expect(render(false, false, 'EC-MG')).toContain('EC-MG-2');
    expect(render(false, false, 'SO-CL')).not.toContain('EC-MG-2');
  });
  it('names the unit as mixed when rows differ', () => {
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="th" messages={{ assessment }}>
        <GroupList
          catalogue={catalogue}
          disabled={false}
          onChange={vi.fn()}
          drafts={{ 'EC-MG-1': { ...emptyDraft(), y1: { amount: '5', unit: 'percent' } } }}
        />
      </NextIntlClientProvider>,
    );
    expect(html).toContain('y1 ต้นทุน (หน่วยต่างกัน)');
  });
});

describe('CardList (phone)', () => {
  const cards = (drafts = {}, factor?: string) =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="th" messages={{ assessment }}>
        <CardList
          catalogue={catalogue}
          drafts={drafts}
          y3Options={[{ value: 'A', label: 'A' }]}
          disabled={false}
          factor={factor}
          onChange={vi.fn()}
        />
      </NextIntlClientProvider>,
    );
  const answered = {
    'EC-MG-1': {
      x: '6',
      y1: { amount: '100', unit: 'baht' },
      y2: { amount: '5', unit: 'day' },
      y3: ['B'],
    },
  };
  it('is one collapsed card per indicator, with no table, input or question', () => {
    const html = cards();
    expect(html).not.toContain('<table');
    expect(html.match(/data-answer=/g)).toHaveLength(2);
    expect(html.match(/aria-expanded="false"/g)).toHaveLength(2);
    expect(html).not.toContain('<input');
    expect(html).not.toContain('เกิดบ่อยแค่ไหน');
    expect(html).not.toContain('คำถาม ·');
  });
  it('shows the code, name, status and answered count in each header', () => {
    const html = cards(answered);
    expect(html).toContain('EC-MG-1');
    expect(html).toContain('การประสานงานไม่ดี');
    expect(html).toContain('ตอบครบ</span>');
    expect(html).toContain('ตอบแล้ว 4/4');
    expect(html).toContain('ยังไม่ตอบ');
    expect(html).toContain('ตอบแล้ว 0/4');
  });
  it('has headings for the dimension, the factor and every card', () => {
    const html = cards(answered);
    expect(html).toMatch(/<h2[^>]*>.*ด้านเศรษฐกิจ.*ตอบครบ 1\/2/);
    expect(html).toMatch(/<h3[^>]*>.*EC-MG การจัดการ/);
    expect(html.match(/<h4/g)).toHaveLength(2);
  });
  it('shows only the chosen factor', () => {
    expect(cards({}, 'EC-MG')).toContain('EC-MG-2');
    expect(cards({}, 'SO-CL')).not.toContain('EC-MG-2');
  });
});

describe('LetterChoiceList', () => {
  const options = 'ABCDEFGHI'.split('').map((v) => ({ value: v, label: `ตัวเลือก ${v}` }));
  const list = (over: Partial<React.ComponentProps<typeof LetterChoiceList>> = {}) =>
    renderToStaticMarkup(
      <LetterChoiceList
        legend="y3 ผลกระทบด้านสิ่งแวดล้อม EC-MG-1"
        options={options}
        value={['B']}
        onChange={vi.fn()}
        {...over}
      />,
    );
  it('shows nine checkbox lines with a letter badge in a fieldset with a legend', () => {
    const html = list();
    expect(html).toContain('<fieldset');
    expect(html).toContain('<legend');
    expect(html.match(/type="checkbox"/g)).toHaveLength(9);
    expect(html).toContain('ตัวเลือก I');
    expect(html.match(/data-checked/g)).toHaveLength(1);
  });
  it('shows no error while the choices are fine', () => {
    const html = list();
    expect(html).not.toContain('aria-invalid');
    expect(html).toContain('aria-live="polite"');
  });
  it('links the error to the group, marks the line and announces it', () => {
    const html = list({
      value: ['A', 'B'],
      invalid: ['A'],
      error: 'เลือก A ร่วมกับตัวเลือกอื่นไม่ได้',
    });
    expect(html).toContain('aria-invalid="true"');
    expect(html.match(/data-invalid/g)).toHaveLength(1);
    const id = /<fieldset[^>]*aria-describedby="([^"]+)"/.exec(html)?.[1];
    expect(html).toMatch(new RegExp(`<p id="${id}"[^>]*aria-live="polite"[^>]*>.*เลือก A ร่วมกับ`));
  });
});

describe('Toolbar', () => {
  const bar = (over: Partial<React.ComponentProps<typeof Toolbar>> = {}) =>
    renderToStaticMarkup(
      <NextIntlClientProvider locale="th" messages={{ assessment }}>
        <Toolbar
          firstOption="A"
          lastOption="I"
          complete={6}
          total={55}
          filter="all"
          filterOptions={[
            { value: 'all', label: 'ทั้งหมด (11)' },
            { value: 'EC-MG', label: 'EC-MG การจัดการ' },
          ]}
          costUnit="baht"
          timeUnit={null}
          costUnits={['baht', 'percent']}
          timeUnits={['day', 'percent']}
          disabled={false}
          onFilter={vi.fn()}
          onCostUnit={vi.fn()}
          onTimeUnit={vi.fn()}
          {...over}
        />
      </NextIntlClientProvider>,
    );
  it('shows the legend of X, y1, y2 and y3', () => {
    const html = bar();
    for (const text of ['ความถี่ของเหตุการณ์', 'ผลกระทบด้านต้นทุน', 'ผลกระทบด้านเวลา'])
      expect(html).toContain(text);
    expect(html).toContain('เลือก A–I ได้หลายข้อ · A ใช้เดี่ยวเท่านั้น');
  });
  it('shows progress, the filter and both unit switches', () => {
    const html = bar();
    expect(html).toContain('ตอบครบ 6 จาก 55 ตัวชี้วัด');
    expect(html).toContain('aria-valuenow="6"');
    expect(html).toContain('ทั้งหมด (11)');
    expect(html).toContain('หน่วยต้นทุน');
    expect(html).toContain('หน่วยเวลา');
    expect(html).toContain('(ใช้กับทุกแถว)');
  });
  it('turns on the shared unit only, and none when rows differ', () => {
    const html = bar();
    expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
  });
  it('tells how many rows the unit switch left alone', () => {
    expect(bar()).not.toContain('role="status"');
    const html = bar({ unitSkipped: 2 });
    expect(html).toContain('ไม่ได้เปลี่ยนหน่วย 2 แถว');
    expect(html).toContain('แถวเหล่านี้ยังใช้หน่วยและค่าเดิม');
  });
  it('disables the unit switches in read-only mode', () => {
    expect(bar({ disabled: true }).match(/role="radio"[^>]*disabled/g)).toHaveLength(4);
  });
});

describe('answers api', () => {
  it('saves a batch and reads it back', async () => {
    await saveAnswers('p1', 'v1', [{ indicator_code: 'EC-MG-1', x: 3, y3: ['A'] }]);
    const { data } = await browserApi().GET(
      '/projects/{project_id}/versions/{version_id}/answers',
      {
        params: { path: { project_id: 'p1', version_id: 'v1' } },
      },
    );
    expect(data?.editable).toBe(true);
    expect(data?.items).toMatchObject([{ indicator_code: 'EC-MG-1', x: 3, complete: false }]);
  });
});
