// @vitest-environment happy-dom

/**
 * A select in the sequencer's readout (`f-step-sequencer` t-80): a combobox whose list is drawn by the page, chosen
 * from with a press or from the keyboard, and closed by a choice, Escape, Tab or a press outside it.
 *
 * @see components/app/sequencer/select.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { SeqSelect } from '@/components/app/sequencer/select';

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
