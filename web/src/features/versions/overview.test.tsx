import { NextIntlClientProvider } from 'next-intl';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import versions from '../../../messages/th/versions.json';
import { mockProject, mockVersions } from './mocks';
import { OverviewPanel } from './OverviewPanel';
import { ProjectTabs } from './ProjectTabs';
import { hvhDelta, periodDays, recentVersions } from './rules';

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="th" messages={{ versions }}>
      {node}
    </NextIntlClientProvider>,
  );

const panel = (items = mockVersions()) =>
  wrap(
    <OverviewPanel
      project={mockProject}
      versions={items}
      onCreate={vi.fn()}
      onShowVersions={vi.fn()}
    />,
  );

const v3 = '/versions/0193a5c2-0000-7000-8000-000000000103';

describe('overview rules', () => {
  it('counts the days between the project dates', () => {
    expect(periodDays('2025-12-01', '2027-11-30')).toBe(729);
    expect(periodDays('2026-01-01', '2026-01-01')).toBe(0);
  });

  it('compares H+VH of the latest submitted version with the one before', () => {
    expect(hvhDelta(mockVersions())).toBe(13 - 18);
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
    expect(html).toContain('ลดลง 5 จากเวอร์ชันก่อน');
    expect(html).toContain(`${v3}/results`);
    expect(html).toContain(`${v3}/assess`);
    expect(html).toContain(`${v3}/report`);
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

  it('lists recent versions with a button to the versions tab', () => {
    const html = panel();
    expect(html).toContain('ประวัติเวอร์ชันล่าสุด');
    expect(html).toContain('ดูทั้งหมดในแท็บเวอร์ชัน');
    expect(html).toContain('3.03');
  });

  it('offers no results or PDF for a draft latest version', () => {
    const html = panel([{ ...mockVersions()[2], editable: true }]);
    expect(html).toContain('ฉบับร่าง');
    expect(html).not.toContain('/results');
    expect(html).not.toContain('/report');
    expect(html).toContain('/assess');
  });

  it('asks to create the first version when there is none', () => {
    const html = panel([]);
    expect(html).toContain('ยังไม่มีเวอร์ชัน');
    expect(html).toContain('ข้อมูลโครงการ');
  });
});
