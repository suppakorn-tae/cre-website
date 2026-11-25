import { type HttpHandler } from 'msw';
import { createOpenApiHttp } from 'openapi-msw';

import { mockCatalogue } from '@/mocks/catalogue';
import type { paths } from '@/lib/api/generated/schema';

import { LISTS, MAX_ITEMS, MIN_ITEMS, type AdviceItems, type AdviceList } from './rules';
import type { AdminAdvice } from './api';

// Feature-local mock of the admin advice api (the shared handler list is not
// ours to edit, so `AdviceMocks` adds these to the running worker).
const http = createOpenApiHttp<paths>({ baseUrl: '*/api/v1' });

const item = (th: string) => ({ text: { th } });

const knownCodes = new Set(
  mockCatalogue.dimensions.flatMap((d) =>
    d.factors.flatMap((f) => f.indicators.map((i) => i.code)),
  ),
);

const seedLists: Record<AdviceList, string[]> = {
  RL: [
    'ทบทวนแผนงานและเงื่อนไขหน้างานร่วมกับผู้รับเหมาก่อนเริ่มงาน',
    'กำหนดผู้รับผิดชอบและรอบการติดตามความคืบหน้าทุกสัปดาห์',
    'จัดทำแผนสำรองสำหรับเหตุที่อาจเกิดขึ้นบ่อย',
  ],
  RI_C: ['สำรองงบประมาณฉุกเฉินสำหรับงานที่อาจเปลี่ยนแปลง', 'ตรวจสอบราคาวัสดุและค่าขนส่งทุกเดือน'],
  RI_T: ['เผื่อเวลาในแผนงานสำหรับกิจกรรมที่พึ่งพาสภาพอากาศและเรือขนส่ง'],
  RI_E: [
    'กำหนดขั้นตอนอนุมัติ design change พร้อมประเมินผลกระทบสิ่งแวดล้อม (EIA) ก่อนเริ่มงาน',
    'จัดทำแผนป้องกันตะกอนและน้ำขุ่น (silt curtain) สำหรับงานที่เปลี่ยนตำแหน่งหรือวิธีก่อสร้าง',
    'ติดตามคุณภาพน้ำทะเลและแนวปะการังรอบพื้นที่ทุกเดือน และรายงานต่อเจ้าของโครงการ',
  ],
};

const store = new Map<string, AdminAdvice>();

function seed(code: string): AdminAdvice {
  const lists = Object.fromEntries(
    LISTS.map((l) => [l, seedLists[l].map(item)]),
  ) as AdminAdvice['lists'];
  return { indicator_code: code, lists, updated_at: '2026-11-12T03:00:00Z' };
}

export function resetAdviceStore(): void {
  store.clear();
}

export function getAdvice(code: string): AdminAdvice | undefined {
  if (!knownCodes.has(code)) return undefined;
  if (!store.has(code)) store.set(code, seed(code));
  return store.get(code);
}

/** The contract rule: 1 to 5 items, each with non-blank Thai text. */
export function isValidItems(items: unknown): items is AdviceItems {
  return (
    Array.isArray(items) &&
    items.length >= MIN_ITEMS &&
    items.length <= MAX_ITEMS &&
    items.every((i) => typeof i?.text?.th === 'string' && i.text.th.trim() !== '')
  );
}

const errorBody = (code: string, message: string) => ({ error: { code, message } });

export const adviceHandlers: HttpHandler[] = [
  http.get('/admin/advice/{indicator_code}', ({ params, response }) => {
    const advice = getAdvice(String(params.indicator_code));
    return advice
      ? response(200).json(advice)
      : response(404).json(errorBody('not_found', 'indicator not found'));
  }),
  http.put('/admin/advice/{indicator_code}/{list}', async ({ params, request, response }) => {
    const advice = getAdvice(String(params.indicator_code));
    const list = String(params.list) as AdviceList;
    if (!advice || !LISTS.includes(list)) {
      return response(404).json(errorBody('not_found', 'advice list not found'));
    }
    const body = (await request.json()) as { items?: unknown };
    if (!isValidItems(body.items)) {
      return response(422).json({
        error: {
          code: 'validation_failed',
          message: 'items must be 1 to 5 non-blank',
          fields: [{ field: 'items', code: 'invalid' }],
        },
      });
    }
    const updated: AdminAdvice = {
      ...advice,
      lists: { ...advice.lists, [list]: body.items },
      updated_at: new Date().toISOString(),
    };
    store.set(advice.indicator_code, updated);
    return response(200).json({
      indicator_code: advice.indicator_code,
      list,
      items: body.items,
      updated_at: updated.updated_at,
    });
  }),
];
