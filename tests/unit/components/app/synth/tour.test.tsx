// @vitest-environment happy-dom

/**
 * The orientation tour, over the real Model D definition and the "Unusual on…" notes the read layer serves.
 *
 * The definition is passed bare, with no note attached, so every note the tour shows has come from the `notes` prop:
 * the API's rows, not the definition module.
 *
 * @see components/app/synth/tour.tsx
 */

import { describe, it, expect, vi, beforeAll, afterEach } from 'vitest';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Tour } from '@/components/app/synth/tour';
import { findStore, focusStore, highlightStore } from '@/components/app/synth/stores';
import { getSynthDetail } from '@/lib/app/catalogue/read';
import { getSynthDef } from '@/lib/app/synths/defs';
import { buildTour } from '@/lib/app/synths/lib/tour';
import type { TourStop } from '@/lib/app/synths/lib/tour';
import type { UnusualNotes } from '@/lib/app/synths/contract';
import { modelDRows } from '@/tests/helpers/model-d-detail';

vi.mock('@/lib/db/client', () => ({
  prisma: { synth: { findFirst: vi.fn() }, synthNote: { findMany: vi.fn() } },
}));

const found = getSynthDef('model-d');
if (!found) throw new Error('model-d is not registered');
const def = found;

let notes: UnusualNotes = {};
let stops: TourStop[] = [];

beforeAll(async () => {
  const { prisma } = await import('@/lib/db/client');
  const { stored, noteRows } = modelDRows();
  vi.mocked(prisma.synth.findFirst).mockResolvedValue(stored as never);
  vi.mocked(prisma.synthNote.findMany).mockResolvedValue(noteRows as never);
  const detail = await getSynthDetail('model-d');
  if (!detail) throw new Error('no Model D detail');
  notes = detail.notes.unusual;
  stops = buildTour(def, notes);
});

afterEach(() => {
  act(() => {
    findStore.set(null);
    focusStore.set(null);
    highlightStore.set([]);
  });
});

function setup() {
  const onClose = vi.fn();
  const utils = render(<Tour def={def} notes={notes} onClose={onClose} />);
  return { ...utils, onClose };
}

const dialog = () => screen.getByRole('dialog', { name: 'Orientation tour of the Model D' });
const title = () => within(dialog()).getByRole('heading', { level: 2 }).textContent;
const stopIndex = (kind: TourStop['kind']) => stops.findIndex((s) => s.kind === kind);
const goTo = (i: number) =>
  fireEvent.click(screen.getByRole('button', { name: `Stop ${i + 1}: ${stops[i].title}` }));

describe('Tour', () => {
  it('has the Model D’s notes to show, or the note checks below prove nothing', () => {
    expect(def.controls.some((c) => c.unusual)).toBe(false);
    expect(Object.keys(notes).length).toBeGreaterThan(0);
    expect(stopIndex('naming')).toBeGreaterThan(0);
  });

  it('opens on the first stop, with the panel’s counts, and numbers the stops', () => {
    setup();
    const first = stops[0];
    if (first.kind !== 'intro') throw new Error('the tour does not open on its intro');
    expect(title()).toBe(first.title);
    expect(within(dialog()).getByText(`1 / ${stops.length}`)).toBeTruthy();
    expect(
      within(dialog()).getByText(
        new RegExp(`${first.counts.controls} knobs and switches, ${first.counts.jacks} sockets`)
      )
    ).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Back' }).hasAttribute('disabled')).toBe(true);
  });

  it('shows the catalogue’s naming notes and rings every control they talk about', () => {
    setup();
    const i = stopIndex('naming');
    goTo(i);
    const stop = stops[i];
    if (stop.kind !== 'naming') throw new Error('not the naming stop');
    expect(title()).toBe(stop.title);
    for (const n of stop.notes) {
      expect(notes[n.id]).toBe(n.text);
      expect(within(dialog()).getByText(n.text)).toBeTruthy();
    }
    expect(highlightStore.get()).toEqual(stop.notes.flatMap((n) => n.ids));
  });

  it('lights a section’s areas on the panel, and keeps them lit when the faceplate clears the spotlight', () => {
    setup();
    const i = stopIndex('module');
    goTo(i);
    const stop = stops[i];
    if (stop.kind !== 'module') throw new Error('not a module stop');
    expect(findStore.get()).toEqual({ kind: 'areas', ids: stop.areaIds });
    act(() => findStore.set(null));
    expect(findStore.get()).toEqual({ kind: 'areas', ids: stop.areaIds });
  });

  it('finds a section’s control on the panel and opens it in the inspector from its chip', () => {
    setup();
    const i = stops.findIndex((s) => s.kind === 'module' && s.controls.length > 0);
    goTo(i);
    const stop = stops[i];
    if (stop.kind !== 'module') throw new Error('not a module stop');
    const c = stop.controls[0];
    const chips = within(dialog()).getByText(/What is in here/).parentElement;
    if (!chips) throw new Error('no chips');
    fireEvent.click(within(chips).getAllByRole('button')[0]);
    expect(findStore.get()).toEqual({ kind: 'control', id: c.id });
    expect(focusStore.get()).toMatchObject({ kind: 'control', id: c.id, tip: false });
  });

  it('moves with Next, Back and the arrow keys, and leaves the note keys alone', () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(title()).toBe(stops[1].title);
    fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(title()).toBe(stops[2].title);
    fireEvent.keyDown(window, { key: 'ArrowLeft' });
    fireEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(title()).toBe(stops[0].title);
    fireEvent.keyDown(window, { key: 'a' });
    expect(title()).toBe(stops[0].title);
    expect(onClose).not.toHaveBeenCalled();
  });

  it('closes on Escape, on ×, and on Finish at the last stop', () => {
    const { onClose } = setup();
    fireEvent.keyDown(window, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'End the tour' }));
    goTo(stops.length - 1);
    fireEvent.click(screen.getByRole('button', { name: 'Finish' }));
    expect(onClose).toHaveBeenCalledTimes(3);
  });

  it('does not point at the sound map’s switches, which are not on the page yet', () => {
    setup();
    goTo(stops.length - 1);
    expect(dialog().textContent).not.toMatch(/Dim unused parts|Show sensitive controls/);
    expect(within(dialog()).getByText('Explain sections')).toBeTruthy();
  });

  it('clears the spotlight and highlight when it closes', () => {
    const { unmount } = setup();
    goTo(stopIndex('module'));
    expect(findStore.get()).not.toBeNull();
    unmount();
    expect(findStore.get()).toBeNull();
    expect(highlightStore.get()).toEqual([]);
  });
});
