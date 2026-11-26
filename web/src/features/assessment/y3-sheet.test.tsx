// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { Activity } from 'react';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import assessment from '../../../messages/th/assessment.json';

import { Y3Picker } from './Y3Picker';

// A phone, so the picker is the bottom sheet. jsdom has no modal dialogs: track the open
// flag and mark the page the way a modal does, so a sheet left open shows up.
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: true,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
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
  document.documentElement.style.overflow = '';
});

const options = ['A', 'B', 'C'].map((v) => ({ value: v, label: v, exclusive: v === 'A' }));

const picker = (mode: 'visible' | 'hidden') => (
  <NextIntlClientProvider locale="th" messages={{ assessment }}>
    <Activity mode={mode}>
      <Y3Picker
        code="EC-MG-1"
        question={null}
        options={options}
        value={[]}
        disabled={false}
        onChange={() => {}}
      />
    </Activity>
  </NextIntlClientProvider>
);

function openSheet() {
  fireEvent.click(screen.getByRole('button', { expanded: false }));
  const sheet = document.querySelector('dialog')!;
  expect(sheet.open).toBe(true);
  expect(document.documentElement.style.overflow).toBe('hidden');
  return sheet;
}

/** The page behind is free: no open modal, no scroll lock. */
function expectPageFree(sheet: HTMLDialogElement) {
  expect(sheet.open).toBe(false);
  expect(document.body.hasAttribute('data-modal')).toBe(false);
  expect(document.documentElement.style.overflow).toBe('');
  expect(document.querySelector('[inert]')).toBeNull();
}

describe('Y3Picker bottom sheet', () => {
  it('unmounting it while open leaves no modal or scroll lock', () => {
    const { unmount } = render(picker('visible'));
    const sheet = openSheet();
    unmount();
    expectPageFree(sheet);
  });

  it('closes when its page is hidden but kept, as a client-side navigation does', () => {
    const { rerender } = render(picker('visible'));
    const sheet = openSheet();
    rerender(picker('hidden'));
    expect(sheet.isConnected).toBe(true);
    expectPageFree(sheet);
  });
});
