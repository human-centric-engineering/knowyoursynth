// @vitest-environment happy-dom

/**
 * The panel search, run against the real Model D definition.
 *
 * @see components/app/synth/search.tsx
 */

import { describe, it, expect, afterEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { Search } from '@/components/app/synth/search';
import { findStore, focusStore } from '@/components/app/synth/stores';
import { getSynthDef } from '@/lib/app/synths/defs';
import { buildIndex, searchIndex } from '@/lib/app/synths/lib/areas';
import type { SynthDef } from '@/lib/app/synths/contract';

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def: SynthDef = found;

afterEach(() => {
  findStore.set(null);
  focusStore.set(null);
});

function setup() {
  const utils = render(<Search def={def} />);
  const input = screen.getByRole('combobox');
  if (!(input instanceof HTMLInputElement)) throw new Error('combobox is not an input');
  return { ...utils, input };
}

function type(input: HTMLInputElement, value: string) {
  fireEvent.focus(input);
  fireEvent.change(input, { target: { value } });
}

/** What the index says the search should list for a query: the search is driven by the real index. */
const expected = (q: string) => searchIndex(buildIndex(def), q);

describe('Search', () => {
  it('starts empty with no list and nothing lit', () => {
    const { input } = setup();
    expect(input.value).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(findStore.get()).toBeNull();
    expect(screen.getByLabelText(/Find a knob, jack or section on the Model D/)).toBe(input);
  });

  it('lists the matches for what is typed, best first, with their kind and place', () => {
    const { input } = setup();
    type(input, 'cutoff');

    const rows = expected('cutoff');
    expect(rows.length).toBeGreaterThan(1);
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(rows.length);
    expect(options.map((o) => o.id)).toEqual(rows.map((r) => `kys-find-${r.kind}-${r.id}`));
    // The knob is listed under its panel name, with its type and the section it sits in.
    const knob = options.find((o) => o.id === 'kys-find-control-filter.cutoff');
    expect(knob?.textContent).toContain('Knob');
    expect(knob?.textContent).toContain('Filter and filter contour');
    expect(input.getAttribute('aria-expanded')).toBe('true');
  });

  it('lights the current match in findStore, and moves the light with ArrowDown', () => {
    const { input } = setup();
    type(input, 'cutoff');
    const rows = expected('cutoff');
    expect(findStore.get()).toEqual({ kind: rows[0].kind, id: rows[0].id });
    expect(screen.getAllByRole('option')[0].getAttribute('aria-selected')).toBe('true');

    fireEvent.keyDown(input, { key: 'ArrowDown' });

    expect(findStore.get()).toEqual({ kind: rows[1].kind, id: rows[1].id });
    expect(input.getAttribute('aria-activedescendant')).toBe(
      `kys-find-${rows[1].kind}-${rows[1].id}`
    );
    expect(screen.getAllByRole('option')[1].getAttribute('aria-selected')).toBe('true');
  });

  it('moves back up with ArrowUp and stops at the first and last match', () => {
    const { input } = setup();
    type(input, 'cutoff');
    const rows = expected('cutoff');

    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(findStore.get()).toEqual({ kind: rows[0].kind, id: rows[0].id });

    for (let i = 0; i < rows.length + 3; i++) fireEvent.keyDown(input, { key: 'ArrowDown' });
    const last = rows[rows.length - 1];
    expect(findStore.get()).toEqual({ kind: last.kind, id: last.id });
  });

  it('chooses the current match on Enter: it is lit and focused, and its name fills the box', () => {
    const { input } = setup();
    type(input, 'cutoff');
    const rows = expected('cutoff');
    fireEvent.keyDown(input, { key: 'ArrowDown' });

    fireEvent.keyDown(input, { key: 'Enter' });

    const chosen = rows[1];
    expect(findStore.get()).toEqual({ kind: chosen.kind, id: chosen.id });
    expect(focusStore.get()).toEqual({
      kind: chosen.kind,
      id: chosen.id,
      x: 0,
      y: 0,
      tip: false,
    });
    expect(input.value).toBe(chosen.name);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('chooses an option on mouse press, before the input blurs', () => {
    const { input } = setup();
    type(input, 'cutoff');
    const option = screen.getAllByRole('option').find((o) => o.id === 'kys-find-area-filter');
    if (!option) throw new Error('the Filter section is not listed for "cutoff"');
    // `fireEvent.mouseDown` returns false when the handler prevented the default (which keeps focus in the input).
    const notPrevented = fireEvent.mouseDown(option);

    expect(notPrevented).toBe(false);
    expect(focusStore.get()).toEqual({ kind: 'area', id: 'filter', x: 0, y: 0, tip: false });
    expect(findStore.get()).toEqual({ kind: 'area', id: 'filter' });
    expect(input.value).toBe('Filter and filter contour');
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('lights whichever option the pointer enters', () => {
    const { input } = setup();
    type(input, 'cutoff');
    const rows = expected('cutoff');

    fireEvent.pointerEnter(screen.getAllByRole('option')[2]);

    expect(findStore.get()).toEqual({ kind: rows[2].kind, id: rows[2].id });
  });

  it('says so when nothing matches, and lights nothing', () => {
    const { input } = setup();
    type(input, 'zzzqq');

    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(screen.getByText(/Nothing on the Model D panel matches “zzzqq”/)).toBeTruthy();
    expect(findStore.get()).toBeNull();
  });

  it('does not choose anything on Enter when there is no match', () => {
    const { input } = setup();
    type(input, 'zzzqq');
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(focusStore.get()).toBeNull();
    expect(input.value).toBe('zzzqq');
  });

  it('clears the query on Escape when there is one, and blurs on a second Escape', () => {
    const { input } = setup();
    input.focus();
    type(input, 'cutoff');

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input.value).toBe('');
    expect(findStore.get()).toBeNull();
    expect(document.activeElement).toBe(input);

    fireEvent.keyDown(input, { key: 'Escape' });
    expect(document.activeElement).not.toBe(input);
  });

  it('clears with the × button: empties the box, un-lights the panel and refocuses the input', () => {
    const { input } = setup();
    type(input, 'cutoff');
    expect(findStore.get()).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Clear search' }));

    expect(input.value).toBe('');
    expect(findStore.get()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Clear search' })).toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it('un-lights the panel when the box is emptied by hand', () => {
    const { input } = setup();
    type(input, 'cutoff');
    fireEvent.change(input, { target: { value: '  ' } });
    expect(findStore.get()).toBeNull();
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('closes the list on blur', () => {
    const { input } = setup();
    type(input, 'cutoff');
    fireEvent.blur(input);
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  it('starts again when it is given a new definition', () => {
    const { input, rerender } = setup();
    type(input, 'cutoff');
    expect(input.value).toBe('cutoff');

    rerender(<Search def={{ ...def, controls: [...def.controls] }} />);

    expect(input.value).toBe('');
    expect(screen.queryByRole('listbox')).toBeNull();
    expect(findStore.get()).toBeNull();
  });

  it('finds a jack by its panel name', () => {
    const { input } = setup();
    type(input, 'loud cv');
    expect(findStore.get()).toEqual({ kind: 'jack', id: 'j.loudCv' });
  });
});
