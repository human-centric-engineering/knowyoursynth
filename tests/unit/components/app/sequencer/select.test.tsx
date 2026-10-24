// @vitest-environment happy-dom

/**
 * A select in the sequencer's readout (`f-step-sequencer` t-80): a combobox whose list is drawn by the page, chosen
 * from with a press or from the keyboard, and closed by a choice, Escape, Tab or a press outside it. And the list
 * without its cell (`SeqPicker`), opened by another control (a lane's tab), which takes the keys itself and hands focus
 * back to that control.
 *
 * @see components/app/sequencer/select.tsx
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SeqPicker, SeqSelect } from '@/components/app/sequencer/select';

const OPTIONS = [
  ['forward', 'Forward'],
  ['reverse', 'Reverse'],
  ['pendulum', 'Pendulum'],
  ['random', 'Random'],
  ['brownian', 'Brownian'],
] as const;

function select(value = 'forward') {
  const onChange = vi.fn();
  render(
    <SeqSelect
      label="Direction"
      help="The order the steps play in."
      value={value}
      options={OPTIONS}
      onChange={onChange}
    />
  );
  return { onChange, cell: screen.getByRole('combobox', { name: 'Direction' }) };
}
const active = (cell: HTMLElement) => {
  const id = cell.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id)?.textContent : null;
};

describe('SeqSelect', () => {
  it('shows its value in the cell, and its options in a list when pressed, the value marked selected', () => {
    const { cell } = select('reverse');
    expect(cell.textContent).toContain('Reverse');
    expect(cell.getAttribute('aria-expanded')).toBe('false');
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(cell);
    expect(cell.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(
      OPTIONS.map(([, l]) => l)
    );
    expect(screen.getByRole('option', { name: 'Reverse' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(active(cell)).toBe('Reverse');
  });

  it('chooses with a press, closes, and keeps focus on the cell', () => {
    const { cell, onChange } = select();
    fireEvent.click(cell);
    fireEvent.click(screen.getByRole('option', { name: 'Pendulum' }));
    expect(onChange).toHaveBeenCalledWith('pendulum');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(cell);
  });

  it('sends nothing when the value chosen is the one it has', () => {
    const { cell, onChange } = select();
    fireEvent.click(cell);
    fireEvent.click(screen.getByRole('option', { name: 'Forward' }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('opens from the keyboard, moves with the arrows, Home and End, jumps to a letter, and chooses with Enter', () => {
    const { cell, onChange } = select();
    fireEvent.keyDown(cell, { key: 'ArrowDown' });
    expect(screen.getByRole('listbox')).toBeTruthy();
    fireEvent.keyDown(cell, { key: 'ArrowDown' });
    expect(active(cell)).toBe('Reverse');
    fireEvent.keyDown(cell, { key: 'End' });
    expect(active(cell)).toBe('Brownian');
    fireEvent.keyDown(cell, { key: 'ArrowDown' });
    expect(active(cell)).toBe('Brownian');
    fireEvent.keyDown(cell, { key: 'Home' });
    fireEvent.keyDown(cell, { key: 'ArrowUp' });
    expect(active(cell)).toBe('Forward');
    // R: Reverse, then Random, then round to Reverse.
    fireEvent.keyDown(cell, { key: 'r' });
    expect(active(cell)).toBe('Reverse');
    fireEvent.keyDown(cell, { key: 'r' });
    expect(active(cell)).toBe('Random');
    fireEvent.keyDown(cell, { key: 'z' });
    expect(active(cell)).toBe('Random');
    fireEvent.keyDown(cell, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('random');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('keeps the letters it uses from reaching the page, which plays notes from them', () => {
    const { cell } = select();
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    fireEvent.keyDown(cell, { key: 'Enter' });
    fireEvent.keyDown(cell, { key: 'p' });
    window.removeEventListener('keydown', outside);
    expect(outside).not.toHaveBeenCalled();
  });

  it('closes on Escape, Tab and a press outside it, choosing nothing', () => {
    const { cell, onChange } = select();
    fireEvent.keyDown(cell, { key: ' ' });
    fireEvent.keyDown(cell, { key: 'Escape' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.keyDown(cell, { key: 'ArrowUp' });
    fireEvent.keyDown(cell, { key: 'Tab' });
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(cell);
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
    fireEvent.click(cell);
    fireEvent.click(cell);
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
  });

  it('follows the pointer over the options', () => {
    const { cell } = select();
    fireEvent.click(cell);
    fireEvent.pointerEnter(screen.getByRole('option', { name: 'Brownian' }));
    expect(active(cell)).toBe('Brownian');
  });

  it('opens downward when there is no room above the cell', () => {
    const { cell } = select();
    vi.spyOn(cell, 'getBoundingClientRect').mockReturnValue({ top: 40 } as DOMRect);
    fireEvent.click(cell);
    expect(screen.getByRole('listbox').hasAttribute('data-down')).toBe(true);
  });
});

describe('SeqPicker', () => {
  // The anchors are the test's own, outside what render mounts.
  afterEach(() => document.querySelectorAll('body > button').forEach((b) => b.remove()));

  function picker(value = 'forward', top = 400) {
    const onChange = vi.fn();
    const onClose = vi.fn();
    const anchor = document.createElement('button');
    anchor.textContent = 'Cutoff';
    document.body.appendChild(anchor);
    vi.spyOn(anchor, 'getBoundingClientRect').mockReturnValue({ top } as DOMRect);
    const view = render(
      <SeqPicker
        label="Move the lane to"
        value={value}
        options={OPTIONS}
        anchor={{ current: anchor }}
        onChange={onChange}
        onClose={onClose}
      />
    );
    const list = screen.getByRole('listbox', { name: 'Move the lane to' });
    const active = () =>
      document.getElementById(list.getAttribute('aria-activedescendant') ?? '')?.textContent;
    return { onChange, onClose, anchor, list, active, view };
  }

  it('opens on its value, with focus in the list, upward when there is room above', () => {
    const { list, active } = picker('pendulum');
    expect(document.activeElement).toBe(list);
    expect(active()).toBe('Pendulum');
    expect(screen.getByRole('option', { name: 'Pendulum' }).getAttribute('aria-selected')).toBe(
      'true'
    );
    expect(list.hasAttribute('data-down')).toBe(false);
  });

  it('opens on the first option when its value is not one of them', () => {
    const { active } = picker('nowhere');
    expect(active()).toBe('Forward');
  });

  it('opens downward when there is no room above what opened it', () => {
    const { list } = picker('forward', 40);
    expect(list.getAttribute('data-down')).toBe('true');
  });

  it('moves with the arrows, Home and End, jumps to a letter, and chooses with Enter, focus back on the anchor', () => {
    const { list, active, onChange, onClose, anchor } = picker();
    fireEvent.keyDown(list, { key: 'ArrowUp' });
    expect(active()).toBe('Forward');
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(active()).toBe('Reverse');
    fireEvent.keyDown(list, { key: 'End' });
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    expect(active()).toBe('Brownian');
    fireEvent.keyDown(list, { key: 'Home' });
    expect(active()).toBe('Forward');
    // R: Reverse, then Random; a letter no option starts with stays put.
    fireEvent.keyDown(list, { key: 'r' });
    fireEvent.keyDown(list, { key: 'R' });
    expect(active()).toBe('Random');
    fireEvent.keyDown(list, { key: 'z' });
    expect(active()).toBe('Random');
    fireEvent.keyDown(list, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('random');
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(anchor);
  });

  it('chooses with Space and with a press, sending nothing for the value it has', () => {
    const a = picker('reverse');
    fireEvent.keyDown(a.list, { key: ' ' });
    expect(a.onChange).not.toHaveBeenCalled();
    expect(a.onClose).toHaveBeenCalledTimes(1);
    a.view.unmount();
    const b = picker('reverse');
    fireEvent.pointerEnter(screen.getByRole('option', { name: 'Brownian' }));
    expect(b.active()).toBe('Brownian');
    fireEvent.click(screen.getByRole('option', { name: 'Brownian' }));
    expect(b.onChange).toHaveBeenCalledWith('brownian');
    expect(document.activeElement).toBe(b.anchor);
  });

  it('keeps the keys it uses from the page, and lets others through', () => {
    const { list } = picker();
    const outside = vi.fn();
    window.addEventListener('keydown', outside);
    fireEvent.keyDown(list, { key: 'ArrowDown' });
    fireEvent.keyDown(list, { key: 'p' });
    fireEvent.keyDown(list, { key: 'z' });
    fireEvent.keyDown(list, { key: 'Shift' });
    window.removeEventListener('keydown', outside);
    expect(outside.mock.calls.map(([e]) => (e as KeyboardEvent).key)).toEqual(['z', 'Shift']);
  });

  it('closes on Escape, handing focus back, and on Tab, leaving it to move on', () => {
    const a = picker();
    fireEvent.keyDown(a.list, { key: 'Escape' });
    expect(a.onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(a.anchor);
    a.view.unmount();
    const b = picker();
    fireEvent.keyDown(b.list, { key: 'Tab' });
    expect(b.onClose).toHaveBeenCalledTimes(1);
    expect(document.activeElement).not.toBe(b.anchor);
    expect(b.onChange).not.toHaveBeenCalled();
  });

  it('closes on a press outside it and its anchor, but not on one inside either', () => {
    const { list, anchor, onClose } = picker();
    fireEvent.pointerDown(screen.getByRole('option', { name: 'Reverse' }));
    fireEvent.pointerDown(anchor);
    expect(onClose).not.toHaveBeenCalled();
    expect(list.isConnected).toBe(true);
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
