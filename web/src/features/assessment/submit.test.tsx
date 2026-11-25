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

import { ApiError } from '@/lib/api/errors';

import { saveAnswers } from './api';
import { fieldErrorsOf, fieldMessageKey, mapFieldErrors } from './fieldErrors';
import { IndicatorCard } from './IndicatorCard';
import { createAnswerHandlers } from './mocks';
import { emptyDraft } from './rules';
import { SubmitBar } from './SubmitBar';
import { classifySubmitFailure, resultsPath, submitVersion } from './submit';

const server = setupServer(...createAnswerHandlers(['v-old']));
beforeAll(() => server.listen());
afterEach(() => server.resetHandlers(...createAnswerHandlers(['v-old'])));
afterAll(() => server.close());

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ assessment }}>
      {node}
    </NextIntlClientProvider>,
  );

const bar = (over: Partial<React.ComponentProps<typeof SubmitBar>> = {}) =>
  wrap(
    <SubmitBar
      complete={2}
      total={11}
      editable
      open={false}
      busy={false}
      failure={null}
      onOpen={vi.fn()}
      onCancel={vi.fn()}
      onConfirm={vi.fn()}
      {...over}
    />,
  );

describe('SubmitBar and confirm dialog', () => {
  it('enables the button and explains the dialog with the counts', () => {
    const html = bar();
    expect(html).not.toMatch(/<button[^>]*disabled[^>]*>ส่งผลการประเมิน/);
    expect(html).toContain('ส่งผลการประเมินหรือไม่');
    expect(html).toContain('คำนวณคะแนนจาก 2 ตัวชี้วัดที่ตอบครบ จากทั้งหมด 11 ตัวชี้วัด');
    expect(html).toContain('ยกเลิก');
    expect(html).toContain('role="alertdialog"');
  });
  it('disables the button and says why when no indicator is complete', () => {
    const html = bar({ complete: 0 });
    expect(html).toMatch(/<button[^>]*disabled[^>]*>ส่งผลการประเมิน/);
    expect(html).toContain('ต้องมีอย่างน้อย 1 ตัวชี้วัดที่ตอบครบทั้ง 4 ข้อ');
  });
  it('disables the button in read-only mode and while submitting', () => {
    expect(bar({ editable: false })).toMatch(/<button[^>]*disabled/);
    expect(bar({ busy: true })).toContain('กำลังส่ง…');
  });
  it.each([
    ['conflict', 'มีเวอร์ชันใหม่กว่า'],
    ['noComplete', 'ส่งผลการประเมินไม่ได้'],
    ['invalid', 'แก้ไขช่องที่ไม่ถูกต้อง'],
    ['unknown', 'ส่งผลการประเมินไม่สำเร็จ'],
  ] as const)('shows the %s failure as an alert', (failure, text) => {
    const html = bar({ failure });
    expect(html).toContain('role="alert"');
    expect(html).toContain(text);
  });
});

describe('submit api', () => {
  it('posts the submit and lands on the results route', async () => {
    await saveAnswers('p1', 'v1', [
      {
        indicator_code: 'EC-MG-1',
        x: 3,
        y1: { value: 10, unit: 'baht' },
        y2: { value: 2, unit: 'day' },
        y3: ['B'],
      },
    ]);
    const res = await submitVersion('p1', 'v1');
    expect(res.status).toBe('submitted');
    expect(res.summary.scored_count).toBe(1);
    expect(resultsPath('p1', 'v1')).toBe('/projects/p1/versions/v1/results');
  });
  it('maps 422 no_complete_indicator and 409', async () => {
    const none = await submitVersion('p1', 'v2').catch((e) => e);
    expect(none).toBeInstanceOf(ApiError);
    expect(classifySubmitFailure(none)).toBe('noComplete');
    const old = await submitVersion('p1', 'v-old').catch((e) => e);
    expect(classifySubmitFailure(old)).toBe('conflict');
  });
  it('classifies other failures', () => {
    expect(classifySubmitFailure(new ApiError(422, 'validation_failed', 'x'))).toBe('invalid');
    expect(classifySubmitFailure(new ApiError(500, 'internal', 'x'))).toBe('unknown');
    expect(classifySubmitFailure(new TypeError('offline'))).toBe('unknown');
  });
});

describe('422 field errors', () => {
  const codes = ['EC-MG-1', 'EC-MG-2', 'EC-MG-3'];
  it('maps batch pointers to indicator and field', () => {
    expect(
      mapFieldErrors(codes, [
        { field: '/answers/0/x', code: 'out_of_range' },
        { field: '/answers/2/y1/value', code: 'out_of_range' },
        { field: '/answers/2/y1/unit', code: 'invalid_unit' },
        { field: '/answers/1/y3/1', code: 'duplicate_option' },
        { field: '/answers/1/y3', code: 'exclusive_option' },
        { field: '/answers/1/indicator_code', code: 'unknown_indicator' },
        { field: '/answers/9/x', code: 'out_of_range' },
        { field: '/other', code: 'x' },
      ]),
    ).toEqual({
      'EC-MG-1': { x: 'out_of_range' },
      'EC-MG-2': { y3: 'duplicate_option', code: 'unknown_indicator' },
      'EC-MG-3': { y1: 'out_of_range' },
    });
  });
  it('reads them from an ApiError that kept its fields', async () => {
    server.use(
      (await import('msw')).http.patch('*/api/v1/projects/:p/versions/:v/answers', () =>
        Response.json(
          {
            error: {
              code: 'validation_failed',
              message: 'bad',
              fields: [{ field: '/answers/0/x', code: 'out_of_range' }],
            },
          },
          { status: 422 },
        ),
      ),
    );
    const error = await saveAnswers('p', 'v', [{ indicator_code: 'EC-MG-1', x: 1 }]).catch(
      (e) => e,
    );
    expect(error).toBeInstanceOf(ApiError);
    expect(fieldErrorsOf(error, ['EC-MG-1'])).toEqual({ 'EC-MG-1': { x: 'out_of_range' } });
    expect(fieldErrorsOf(new ApiError(500, 'x', 'x'), ['EC-MG-1'])).toEqual({});
  });
  it('falls back to the unknown message', () => {
    expect(fieldMessageKey('out_of_range')).toBe('errors.server.out_of_range');
    expect(fieldMessageKey('something_new')).toBe('errors.server.unknown');
  });
  it('shows the server message next to the input', () => {
    const html = wrap(
      <IndicatorCard
        indicator={{
          code: 'EC-MG-1',
          name: 'n',
          unit: 'u',
          question_x: null,
          question_y1: null,
          question_y2: null,
          question_y3: null,
        }}
        draft={emptyDraft()}
        y3Options={[{ value: 'A', label: 'A' }]}
        disabled={false}
        serverErrors={{ x: 'out_of_range', y3: 'exclusive_option' }}
        onChange={vi.fn()}
      />,
    );
    expect(html).toContain('ค่านี้อยู่นอกช่วงที่กำหนด');
    expect(html).toContain('ข้อ A ใช้เดี่ยวเท่านั้น เลือกร่วมกับข้ออื่นไม่ได้');
    expect(html).toContain('aria-invalid="true"');
  });
});
