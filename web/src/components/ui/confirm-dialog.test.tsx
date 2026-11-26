// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react';
import { Activity } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { ConfirmDialog } from './ConfirmDialog';

// jsdom has no modal dialogs. Track the open flag, and mark the page inert the way a
// modal dialog does, so a dialog left open after it leaves the screen shows up.
beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute('open', '');
    document.body.setAttribute('data-modal', '');
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    this.removeAttribute('open');
    document.body.removeAttribute('data-modal');
  };
});

afterEach(() => {
  cleanup();
  document.body.removeAttribute('data-modal');
});

const dialog = (open: boolean) => (
  <ConfirmDialog
    open={open}
    title="ส่งผลการประเมินหรือไม่"
    confirmLabel="ส่ง"
    cancelLabel="ยกเลิก"
    onConfirm={() => {}}
    onCancel={() => {}}
  >
    <p>ข้อความ</p>
  </ConfirmDialog>
);

/** Nothing on the page is inert, hidden from screen readers or locked from scrolling. */
function expectPageFree() {
  for (const el of [document.documentElement, document.body]) {
    expect(el.hasAttribute('inert')).toBe(false);
    expect(el.hasAttribute('aria-hidden')).toBe(false);
    expect(el.style.overflow).toBe('');
  }
  // Decorative icons are aria-hidden; nothing else may be.
  expect(document.querySelector('[inert], [aria-hidden="true"]:not(svg)')).toBeNull();
  expect(document.body.hasAttribute('data-modal')).toBe(false);
}

describe('ConfirmDialog', () => {
  it('opens as a modal and closes again', () => {
    const { rerender, getByRole } = render(dialog(true));
    expect((getByRole('alertdialog', { hidden: true }) as HTMLDialogElement).open).toBe(true);
    rerender(dialog(false));
    expectPageFree();
  });

  it('unmounting it while open leaves no inert, aria-hidden or scroll lock', () => {
    const { unmount } = render(dialog(true));
    const el = document.querySelector('dialog')!;
    expect(el.open).toBe(true);
    unmount();
    expect(el.open).toBe(false);
    expectPageFree();
  });

  it('closes when its page is hidden but kept, as a client-side navigation does', () => {
    // Next.js keeps the page you leave inside a hidden <Activity>: the element stays
    // in the document, and an open modal there would keep the next page inert.
    const tree = (mode: 'visible' | 'hidden') => <Activity mode={mode}>{dialog(true)}</Activity>;
    const { rerender } = render(tree('visible'));
    const el = document.querySelector('dialog')!;
    expect(el.open).toBe(true);
    rerender(tree('hidden'));
    expect(el.isConnected).toBe(true);
    expect(el.open).toBe(false);
    expectPageFree();
  });
});
