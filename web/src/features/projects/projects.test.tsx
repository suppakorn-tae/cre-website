import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import common from '../../../messages/th/common.json';
import projects from '../../../messages/th/projects.json';
import ui from '../../../messages/th/ui.json';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));

import { PAGE_SIZE } from './api';
import { ProjectForm } from './ProjectForm';
import { getProjectStore, resetProjectStore, searchProjects } from './mocks';
import { fromProject } from './validation';

const wrap = (node: ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ projects, common, ui }}>
      <QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>
    </NextIntlClientProvider>,
  );

describe('ProjectForm', () => {
  it('shows every field of the spec with Thai labels and the default progress 0', () => {
    const html = wrap(<ProjectForm />);
    for (const text of [
      'ชื่อโครงการ',
      'ชื่อเล่นโครงการ',
      '3–4 ตัวอักษร',
      'เกาะ / สถานที่โครงการ',
      'ประเภทโครงการ',
      'มูลค่าโครงการ (บาท)',
      'วันเริ่มโครงการ',
      'วันสิ้นสุดโครงการ',
      '% ความก้าวหน้าปัจจุบัน',
      'ค่าเริ่มต้น 0 %',
      'รายละเอียดโครงการ',
      'บันทึก และไปขั้นประเมินความเสี่ยง',
    ]) {
      expect(html).toContain(text);
    }
    expect(html).toContain('value="0"');
    // "Other" text fields appear only after choosing อื่นๆ.
    expect(html).not.toContain('ระบุเกาะ / สถานที่');
    expect(html).not.toContain('ระบุประเภทโครงการ');
  });

  it('fills the edit form from the project, with Buddhist era dates', () => {
    const [first] = getProjectStore();
    const html = wrap(<ProjectForm project={first} />);
    expect(html).toContain('บันทึกการแก้ไข');
    expect(html).toContain(`value="${fromProject(first).startDate}"`);
    expect(html).toMatch(/value="\d{2}\/\d{2}\/25\d{2}"/);
  });
});

describe('mock projects api', () => {
  beforeEach(() => resetProjectStore());

  it('searches name, nickname and island, case-insensitively', () => {
    const all = getProjectStore();
    expect(all.length).toBeGreaterThan(PAGE_SIZE);
    expect(searchProjects(all, 'tk2').map((p) => p.nickname)).toContain('TK2');
    expect(searchProjects(all, 'เกาะสมุย').every((p) => p.island_code === 'koh_samui')).toBe(true);
    expect(searchProjects(all, 'เกาะหมาก')).toHaveLength(1);
    expect(searchProjects(all, 'ไม่มีโครงการนี้')).toHaveLength(0);
  });
});
