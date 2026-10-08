// @vitest-environment happy-dom

/**
 * The synth chooser: a dropdown listing each synth's name, maker, year and heritage.
 *
 * @see components/app/synth/synth-picker.tsx
 */

import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { SynthPicker } from '@/components/app/synth/synth-picker';

const SYNTHS = [
  { id: 'model-d', name: 'Model D', maker: 'Moog', year: 1970, heritage: 'The original monosynth' },
  { id: 'ob-x', name: 'OB-X', maker: 'Oberheim', year: 1979, heritage: 'Polyphonic and bold' },
  { id: 'cs-80', name: 'CS-80', maker: 'Yamaha', year: 1977, heritage: 'The Blade Runner brass' },
];

function setup(synthId = 'ob-x', onSelect = vi.fn()) {
  const utils = render(<SynthPicker synths={SYNTHS} synthId={synthId} onSelect={onSelect} />);
  const trigger = screen.getByRole('button', { expanded: false });
  return { ...utils, trigger, onSelect };
}

describe('SynthPicker', () => {
  it('shows only the current synth name until it is opened', () => {
    const { trigger } = setup('ob-x');
    expect(trigger.textContent).toContain('OB-X');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(trigger.getAttribute('aria-haspopup')).toBe('listbox');
  });

  it('falls back to the first synth when the id is not in the list', () => {
    const { trigger } = setup('nope');
    expect(trigger.textContent).toContain('Model D');
  });

  it('renders nothing for an empty catalogue', () => {
    const { container } = render(<SynthPicker synths={[]} synthId="x" onSelect={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });

  it('lists every synth with maker, year and heritage, and marks the current one selected', () => {
    const { trigger } = setup('ob-x');
    fireEvent.click(trigger);

    const options = within(screen.getByRole('listbox', { name: 'Choose a synth' })).getAllByRole(
      'option'
    );
    expect(options).toHaveLength(3);
    expect(options[1].textContent).toContain('OB-X');
    expect(options[1].textContent).toContain('Oberheim · 1979');
    expect(options[1].textContent).toContain('Polyphonic and bold');
    expect(options.map((o) => o.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false']);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
  });

  it('puts focus on the current synth when it opens', () => {
    const { trigger } = setup('cs-80');
    fireEvent.click(trigger);
    expect(document.activeElement?.textContent).toContain('CS-80');
  });

  it('toggles closed when the trigger is pressed again', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    fireEvent.click(trigger);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes on Escape and returns focus to the trigger', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);
    expect(document.activeElement).not.toBe(trigger);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByRole('listbox')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes on a pointer press outside, but not on one inside', () => {
    const { trigger } = setup();
    fireEvent.click(trigger);

    fireEvent.pointerDown(screen.getByRole('listbox'));
    expect(screen.getByRole('listbox')).toBeTruthy();

    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('moves focus down and up the list with the arrow keys, wrapping at both ends', () => {
    const { trigger } = setup('cs-80');
    fireEvent.click(trigger);
    const options = screen.getAllByRole('option');

    // Down from the last wraps to the first.
    fireEvent.keyDown(options[2], { key: 'ArrowDown' });
    expect(document.activeElement).toBe(options[0]);

    // Up from the first wraps to the last.
    fireEvent.keyDown(options[0], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(options[2]);

    fireEvent.keyDown(options[2], { key: 'ArrowUp' });
    expect(document.activeElement).toBe(options[1]);
  });

  it('calls onSelect with the chosen id and closes', () => {
    const { trigger, onSelect } = setup('ob-x');
    fireEvent.click(trigger);

    fireEvent.click(screen.getAllByRole('option')[0]);

    expect(onSelect).toHaveBeenCalledExactlyOnceWith('model-d');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('stops handling Escape once closed, so it no longer steals focus', () => {
    const { trigger } = setup();
    const other = document.createElement('input');
    document.body.appendChild(other);
    fireEvent.click(trigger);
    fireEvent.click(screen.getAllByRole('option')[0]);

    other.focus();
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(document.activeElement).toBe(other);
    other.remove();
  });
});
