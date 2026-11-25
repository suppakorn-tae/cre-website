import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { Alert } from './Alert';
import { PasswordInput, PasswordInputView } from './PasswordInput';

const labels = { show: 'แสดงรหัสผ่าน', hide: 'ซ่อนรหัสผ่าน' };
const view = (visible: boolean) =>
  renderToStaticMarkup(
    <PasswordInputView
      id="p"
      value="secret"
      onChange={() => {}}
      visible={visible}
      onToggle={() => {}}
      labels={labels}
    />,
  );

describe('PasswordInputView', () => {
  it('hides the password; the toggle is named "show" and is not pressed', () => {
    const html = view(false);
    expect(html).toContain('type="password"');
    expect(html).toMatch(/<button[^>]*aria-label="แสดงรหัสผ่าน"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"/);
    expect(html).toContain('tabler-icon-eye"');
  });

  it('shows the password; the toggle is named "hide" and is pressed', () => {
    const html = view(true);
    expect(html).toContain('type="text"');
    expect(html).toMatch(/<button[^>]*aria-label="ซ่อนรหัสผ่าน"/);
    expect(html).toMatch(/<button[^>]*aria-pressed="true"/);
    expect(html).toContain('tabler-icon-eye-off');
  });

  it('has a decorative lock icon and no visible text on the toggle', () => {
    const html = view(false);
    expect(html).toContain('tabler-icon-lock');
    expect(html).not.toContain('>แสดง<');
  });
});

describe('PasswordInput', () => {
  it('starts hidden', () => {
    const html = renderToStaticMarkup(
      <PasswordInput id="p" value="" onChange={() => {}} labels={labels} />,
    );
    expect(html).toContain('type="password"');
    expect(html).toContain('aria-pressed="false"');
  });
});

describe('Alert', () => {
  it.each([
    ['info', 'tabler-icon-info-circle', 'status'],
    ['success', 'tabler-icon-circle-check', 'status'],
    ['warning', 'tabler-icon-alert-triangle', 'status'],
    ['error', 'tabler-icon-alert-circle', 'alert'],
  ] as const)('%s shows its icon and role', (tone, icon, role) => {
    const html = renderToStaticMarkup(<Alert tone={tone}>ข้อความ</Alert>);
    expect(html).toContain(icon);
    expect(html).toContain(`role="${role}"`);
    expect(html).toContain('aria-hidden="true"');
  });

  it('shows a named close button only when asked to', () => {
    expect(renderToStaticMarkup(<Alert>x</Alert>)).not.toContain('<button');
    const html = renderToStaticMarkup(
      <Alert onClose={() => {}} closeLabel="ปิดการแจ้งเตือน">
        x
      </Alert>,
    );
    expect(html).toMatch(/<button[^>]*aria-label="ปิดการแจ้งเตือน"/);
  });
});
