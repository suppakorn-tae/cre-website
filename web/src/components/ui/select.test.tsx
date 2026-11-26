// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import axe from 'axe-core';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MultiSelect } from './MultiSelect';
import { Select } from './Select';

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverStub);
afterEach(cleanup);

const options = [
  { value: 'a', label: 'ต้นทุน' },
  { value: 'b', label: 'เวลา' },
  { value: 'c', label: 'คุณภาพ', disabled: true },
  { value: 'd', label: 'ความปลอดภัย' },
];

function One({ onValue }: { onValue?: (v: string) => void }) {
  const [v, setV] = useState('');
  return (
    <Select
      label="ปัจจัย"
      placeholder="เลือกปัจจัย"
      options={options}
      value={v}
      onValueChange={(next) => {
        setV(next);
        onValue?.(next);
      }}
    />
  );
}

function Many({ onValue }: { onValue?: (v: string[]) => void }) {
  const [v, setV] = useState<string[]>([]);
  return (
    <MultiSelect
      label="มิติ"
      placeholder="เลือกมิติ"
      options={options}
      value={v}
      allLabel="ทั้งหมด"
      countLabel={(n) => `${n} รายการ`}
      onChange={(next) => {
        setV(next);
        onValue?.(next);
      }}
    />
  );
}

const trigger = (name: string) => screen.getByRole('combobox', { name });
const list = () => screen.getByRole('listbox');
const active = () => list().getAttribute('aria-activedescendant');
const activeText = () => document.getElementById(active() ?? '')?.textContent;

describe('Select', () => {
  it('is a labelled combobox showing the placeholder', () => {
    render(<One />);
    expect(trigger('ปัจจัย').textContent).toBe('เลือกปัจจัย');
    expect(trigger('ปัจจัย').getAttribute('aria-expanded')).toBe('false');
    expect(document.querySelector('select')).toBeNull();
  });

  it('opens with Enter, Space and ArrowDown', async () => {
    render(<One />);
    for (const key of ['Enter', ' ', 'ArrowDown']) {
      const t = trigger('ปัจจัย');
      if (key === 'ArrowDown') fireEvent.keyDown(t, { key });
      else fireEvent.click(t); // a button turns Enter and Space into a click
      expect(await screen.findByRole('listbox')).toBeTruthy();
      expect(t.getAttribute('aria-expanded')).toBe('true');
      fireEvent.keyDown(list(), { key: 'Escape' });
      await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    }
  });

  it('moves with arrows, Home and End, skipping disabled options', async () => {
    render(<One />);
    fireEvent.click(trigger('ปัจจัย'));
    await screen.findByRole('listbox');
    // The first row is the placeholder row (empty value).
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    expect(activeText()).toBe('ต้นทุน');
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    expect(activeText()).toBe('เวลา');
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    expect(activeText()).toBe('ความปลอดภัย'); // คุณภาพ is disabled
    fireEvent.keyDown(list(), { key: 'Home' });
    expect(activeText()).toBe('เลือกปัจจัย');
    fireEvent.keyDown(list(), { key: 'End' });
    expect(activeText()).toBe('ความปลอดภัย');
    fireEvent.keyDown(list(), { key: 'ArrowUp' });
    expect(activeText()).toBe('เวลา');
  });

  it('jumps to a label by typing its first letters', async () => {
    render(<One />);
    fireEvent.click(trigger('ปัจจัย'));
    await screen.findByRole('listbox');
    fireEvent.keyDown(list(), { key: 'เ' });
    expect(activeText()).toBe('เวลา');
  });

  it('selects with Enter, closes and gives focus back to the trigger', async () => {
    const onValue = vi.fn();
    render(<One onValue={onValue} />);
    fireEvent.click(trigger('ปัจจัย'));
    await screen.findByRole('listbox');
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    fireEvent.keyDown(list(), { key: 'Enter' });
    expect(onValue).toHaveBeenCalledWith('b');
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    expect(trigger('ปัจจัย').textContent).toBe('เวลา');
    await waitFor(() => expect(document.activeElement).toBe(trigger('ปัจจัย')));
  });

  it('selects with a click and marks the chosen option', async () => {
    render(<One />);
    fireEvent.click(trigger('ปัจจัย'));
    fireEvent.click(await screen.findByRole('option', { name: 'ต้นทุน' }));
    expect(trigger('ปัจจัย').textContent).toBe('ต้นทุน');
    fireEvent.click(trigger('ปัจจัย'));
    const chosen = await screen.findByRole('option', { name: 'ต้นทุน' });
    expect(chosen.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByRole('option', { name: 'เวลา' }).getAttribute('aria-selected')).toBe(
      'false',
    );
  });

  it('does not select a disabled option', async () => {
    const onValue = vi.fn();
    render(<One onValue={onValue} />);
    fireEvent.click(trigger('ปัจจัย'));
    fireEvent.click(await screen.findByRole('option', { name: 'คุณภาพ' }));
    expect(onValue).not.toHaveBeenCalled();
  });

  it('keeps the native onChange call shape for existing forms', async () => {
    const onChange = vi.fn();
    render(<Select label="บทบาท" options={options} value="" onChange={onChange} />);
    fireEvent.click(trigger('บทบาท'));
    fireEvent.click(await screen.findByRole('option', { name: 'เวลา' }));
    expect(onChange).toHaveBeenCalledWith({ target: { value: 'b', name: undefined } });
  });

  it('shows group headers around grouped options', async () => {
    render(
      <Select
        label="ปัจจัย"
        options={[
          { value: 'a', label: 'หนึ่ง', group: 'มิติ ก' },
          { value: 'b', label: 'สอง', group: 'มิติ ข' },
        ]}
        value=""
      />,
    );
    fireEvent.click(trigger('ปัจจัย'));
    await screen.findByRole('listbox');
    expect(screen.getByRole('group', { name: 'มิติ ก' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'มิติ ข' })).toBeTruthy();
    expect(screen.getAllByRole('option')).toHaveLength(2);
  });
});

describe('MultiSelect', () => {
  it('lists an all row first and is a multiselectable listbox', async () => {
    render(<Many />);
    expect(trigger('มิติ').textContent).toBe('เลือกมิติ');
    fireEvent.click(trigger('มิติ'));
    await screen.findByRole('listbox');
    expect(list().getAttribute('aria-multiselectable')).toBe('true');
    expect(screen.getAllByRole('option')[0].textContent).toBe('ทั้งหมด');
  });

  it('toggles options with Space and keeps the list open', async () => {
    const onValue = vi.fn();
    render(<Many onValue={onValue} />);
    fireEvent.click(trigger('มิติ'));
    await screen.findByRole('listbox');
    expect(activeText()).toBe('ต้นทุน'); // opens on the first option, not the all row
    fireEvent.keyDown(list(), { key: ' ' });
    expect(onValue).toHaveBeenLastCalledWith(['a']);
    fireEvent.keyDown(list(), { key: 'ArrowDown' });
    fireEvent.keyDown(list(), { key: ' ' });
    expect(onValue).toHaveBeenLastCalledWith(['a', 'b']);
    expect(screen.queryByRole('listbox')).not.toBeNull();
    expect(trigger('มิติ').textContent).toBe('2 รายการ');
    fireEvent.keyDown(list(), { key: ' ' });
    expect(onValue).toHaveBeenLastCalledWith(['a']);
    expect(trigger('มิติ').textContent).toBe('ต้นทุน');
  });

  it('selects everything that can be picked, then clears it, from the all row', async () => {
    const onValue = vi.fn();
    render(<Many onValue={onValue} />);
    fireEvent.click(trigger('มิติ'));
    const all = await screen.findByRole('option', { name: 'ทั้งหมด' });
    fireEvent.click(all);
    expect(onValue).toHaveBeenLastCalledWith(['a', 'b', 'd']); // disabled คุณภาพ stays out
    expect(trigger('มิติ').textContent).toBe('ทั้งหมด (3)');
    expect(all.getAttribute('aria-selected')).toBe('true');
    fireEvent.click(all);
    expect(onValue).toHaveBeenLastCalledWith([]);
    expect(trigger('มิติ').textContent).toBe('เลือกมิติ');
  });

  it('closes with Escape and returns focus to the trigger', async () => {
    render(<Many />);
    fireEvent.click(trigger('มิติ'));
    await screen.findByRole('listbox');
    fireEvent.keyDown(list(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    await waitFor(() => expect(document.activeElement).toBe(trigger('มิติ')));
  });
});

describe('accessibility', () => {
  it('has no axe violations with both pickers, closed and open', async () => {
    render(
      <main>
        <One />
        <Many />
      </main>,
    );
    const run = async () => {
      const result = await axe.run(document.body, {
        // jsdom has no layout, so colour and region checks cannot work.
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
      });
      return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.html).join(' | ')}`);
    };
    expect(await run()).toEqual([]);
    fireEvent.click(trigger('ปัจจัย'));
    await screen.findByRole('listbox');
    expect(await run()).toEqual([]);
    fireEvent.keyDown(list(), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('listbox')).toBeNull());
    fireEvent.click(trigger('มิติ'));
    await screen.findByRole('listbox');
    expect(await run()).toEqual([]);
  });
});
