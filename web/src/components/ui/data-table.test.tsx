import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { DataTable, type DataTableColumn } from './DataTable';

type Row = { id: string; name: string; value: string };

const columns: DataTableColumn<Row>[] = [
  { key: 'name', header: 'โครงการ', primary: true, render: (r) => r.name },
  { key: 'value', header: 'มูลค่า', align: 'end', render: (r) => r.value },
];
const rows: Row[] = [
  { id: '1', name: 'ท่าเรือเกาะเต่า', value: '48.5M' },
  { id: '2', name: 'ถนนเกาะเต่า', value: '35M' },
];

describe('DataTable', () => {
  it('renders a real table with column headers', () => {
    const html = renderToStaticMarkup(
      <DataTable caption="โครงการทั้งหมด" columns={columns} rows={rows} rowKey={(r) => r.id} />,
    );
    expect(html).toContain('<table');
    expect(html).toContain('<caption');
    expect(html.match(/<th scope="col"/g)).toHaveLength(2);
    expect(html.match(/<tbody>.*<\/tbody>/)?.[0].match(/<tr/g)).toHaveLength(2);
  });

  it('labels every cell so the small-screen card layout can show it', () => {
    const html = renderToStaticMarkup(
      <DataTable caption="โครงการ" columns={columns} rows={rows} rowKey={(r) => r.id} />,
    );
    // The primary column is the card title, the others get their header as label.
    expect(html.match(/data-primary="true"/g)).toHaveLength(2);
    expect(html.match(/data-label="มูลค่า"/g)).toHaveLength(2);
    expect(html).toContain('data-label="โครงการ"');
  });

  it('shows the empty state instead of rows', () => {
    const html = renderToStaticMarkup(
      <DataTable
        caption="โครงการ"
        columns={columns}
        rows={[]}
        rowKey={(r) => r.id}
        empty={<p>ยังไม่มีโครงการ</p>}
      />,
    );
    expect(html).toContain('ยังไม่มีโครงการ');
    expect(html).not.toContain('<tbody>');
  });
});
