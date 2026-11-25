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
import { GroupList } from './GroupList';
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

const render = (disabled: boolean, complete = false) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ assessment }}>
      <GroupList
        catalogue={catalogue}
        disabled={disabled}
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
    expect(html).toContain('หน่วย: ครั้ง/เดือน');
    expect(html).toContain('บาท');
    expect(html).toContain('วัน');
    expect(html).toContain('A ไม่มีผลกระทบ');
  });
  it('disables every control in read-only mode', () => {
    const html = render(true);
    expect(html).not.toMatch(/<input(?![^>]*disabled)[^>]*type="text"/);
    expect(html).toContain('disabled');
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
