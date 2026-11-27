import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import reports from '../../../messages/th/reports.json';
import ui from '../../../messages/th/ui.json';
import versions from '../../../messages/th/versions.json';
import { mockProject, mockVersions } from './mocks';
import { OverviewPanel } from './OverviewPanel';
import { ProjectTabs } from './ProjectTabs';
import { hvhDelta, periodDays, recentVersions } from './rules';

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <NextIntlClientProvider locale="th" messages={{ versions, ui, reports }}>
        {node}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );

const panel = (items = mockVersions(), indicatorTotal?: number) =>
  wrap(
    <OverviewPanel
      project={mockProject}
      versions={items}
      onCreate={vi.fn()}
      onShowVersions={vi.fn()}
      indicatorTotal={indicatorTotal}
    />,
  );

const v3 = '/versions/0193a5c2-0000-7000-8000-000000000103';

describe('overview rules', () => {
  it('counts the days between the project dates', () => {
    expect(periodDays('2025-12-01', '2027-11-30')).toBe(729);
    expect(periodDays('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('compares H+VH of the latest submitted version with the one before', () => {
    expect(hvhDelta(mockVersions())).toEqual({ delta: 13 - 18, fromNo: 2 });
    expect(hvhDelta(mockVersions().slice(1))).toBeNull();
    expect(hvhDelta([])).toBeNull();
  });

  it('keeps the newest versions', () => {
    expect(recentVersions(mockVersions(), 2).map((v) => v.version_no)).toEqual([3, 2]);
  });
});

describe('ProjectTabs', () => {
  it('renders an accessible tablist with the version count and one selected tab', () => {
    const html = wrap(<ProjectTabs value="overview" count={3} onChange={vi.fn()} />);
    expect(html).toContain('role="tablist"');
    expect(html.match(/role="tab"/g)).toHaveLength(2);
    expect(html).toContain('ภาพรวม');
    expect(html).toContain('เวอร์ชัน');
    expect(html).toContain('>3<');
    expect(html.match(/aria-selected="true"/g)).toHaveLength(1);
  });
});

describe('OverviewPanel', () => {
  it('shows the latest version card with chips, delta and actions', () => {
    const html = panel();
    expect(html).toContain('เวอร์ชันล่าสุด');
    expect(html).toContain('ส่งแล้ว');
    expect(html).toContain('VH');
    expect(html).toContain('RM เฉลี่ย');
    expect(html).toContain('2.71');
    expect(html).toContain('▼ 5 จาก v2');
    expect(html).toContain(`${v3}/results`);
    expect(html).toContain(`${v3}/assess`);
    // The report is built in place: a button, not a page.
    expect(html).toContain(reports.action.label);
    expect(html).not.toContain('/report');
  });

  it('has four actions with the plan link, and the prompt to start a new round', () => {
    const html = panel();
    expect(html).toContain(`${v3}/plan`);
    expect(html).toContain('คำแนะนำ &amp; กลยุทธ์');
    expect(html).toContain('แก้ไขคำตอบ');
    expect(html).toContain('ต้องการประเมินรอบใหม่?');
    expect(html).toContain('(v3 จะเป็นแบบอ่านอย่างเดียว)');
  });

  it('links the H and VH chips to the advice tab of the results page', () => {
    const html = panel();
    const links = html.match(/<a [^>]*href="[^"]*\/results\?tab=hvh"[^>]*>/g) ?? [];
    expect(links).toHaveLength(2);
    expect(html).toContain('ดูคำแนะนำของตัวชี้วัดความเสี่ยงสูงมาก');
    expect(html).toContain('ดูคำแนะนำของตัวชี้วัดความเสี่ยงสูง ');
  });

  it('shows the project information card', () => {
    const html = panel();
    expect(html).toContain('ข้อมูลโครงการ');
    expect(html).toContain('เกาะเต่า');
    expect(html).toContain('ท่าเรือ');
    expect(html).toContain('48,500,000 บาท');
    expect(html).toContain('729 วัน');
    expect(html).toContain('ขยายท่าเทียบเรือโดยสาร');
  });

  it('holds the progress bar, which moved here from the header', () => {
    const html = panel();
    expect(html).toContain('จริง 45 % · ตามแผน 48 %');
    expect(html).toContain('ช้ากว่าแผน 3 %');
    expect(html).toContain('width:45%');
  });

  it('lists recent versions with a button to the versions tab', () => {
    const html = panel();
    expect(html).toContain('ประวัติเวอร์ชันล่าสุด');
    expect(html).toContain('ดูทั้งหมดในแท็บเวอร์ชัน');
    expect(html).toContain('3.03');
  });

  it('offers no results for a draft latest version and disables the PDF with the reason', () => {
    const html = panel([{ ...mockVersions()[2], editable: true }]);
    expect(html).toContain('ฉบับร่าง');
    expect(html).not.toContain('/results');
    expect(html).not.toContain('/plan');
    expect(html).toContain('/assess');
    expect(html).toContain('aria-disabled="true"');
    expect(html).toContain(reports.action.draftReason);
  });

  it('asks to create the first version when there is none', () => {
    const html = panel([]);
    expect(html).toContain('ยังไม่มีเวอร์ชัน');
    expect(html).toContain('ข้อมูลโครงการ');
  });
});

describe('latest version card levels', () => {
  it('shows chips VH to VL with their stored counts and the stacked bar', () => {
    const html = panel(mockVersions(), 55);
    const chips = ['VH<span>2<', 'H<span>11<', 'M<span>20<', 'L<span>14<', 'VL<span>8<'].map((c) =>
      html.indexOf(c),
    );
    expect(chips.every((i) => i >= 0)).toBe(true);
    expect(chips).toEqual([...chips].sort((a, b) => a - b));
    expect(html).toContain('role="img"');
    expect(html.match(/data-level="/g)).toHaveLength(5);
    expect(html).toContain('flex-grow:20');
    // The bar starts with the highest level, like the chips.
    expect(html.indexOf('data-level="VH"')).toBeLessThan(html.indexOf('data-level="VL"'));
  });

  it('skips the levels without a count', () => {
    const [first, ...rest] = mockVersions();
    const html = panel([{ ...first, level_counts: { VL: 0, L: 14, M: 41, H: 0, VH: 0 } }, ...rest]);
    expect(html.match(/data-level="/g)).toHaveLength(2);
    expect(html).not.toContain('VL<span>0<');
  });

  it('prints the submit time with a short year and the scored count in one line', () => {
    expect(panel(mockVersions(), 55)).toContain('ส่งล่าสุด 14 พ.ย. 69 16:40 · 55 / 55 ตัวชี้วัดที่ประเมิน');
    expect(panel(mockVersions(), 60)).toContain('55 / 60 ตัวชี้วัดที่ประเมิน');
  });

  it('prints the average RM and H+VH with the change from the earlier version', () => {
    const html = panel(mockVersions(), 55);
    expect(html).toMatch(/RM เฉลี่ย[\s\S]*<strong>2\.71<\/strong>/);
    expect(html).toMatch(/H\+VH[\s\S]*<strong>13<\/strong>/);
    expect(html).toContain('▼ 5 จาก v2');
  });

  it('prints only the scored count while the catalogue total is unknown', () => {
    const html = panel(mockVersions());
    expect(html).toContain('55 ตัวชี้วัดที่ประเมิน');
    expect(html).not.toContain('55 / ');
  });

  it('shows the draft state and no chips or bar while level_counts is null', () => {
    const html = panel(mockVersions().slice(2), 55);
    expect(html).toContain('ยังเป็นฉบับร่าง');
    expect(html).not.toContain('data-level="');
    expect(html).not.toContain(' / 55');
  });
});
