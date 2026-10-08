/**
 * @see components/app/synth/with-notes.ts
 */

import { describe, it, expect } from 'vitest';
import { withNotes } from '@/components/app/synth/with-notes';
import { getSynthDef } from '@/lib/app/synths/defs';
import type { SynthDef } from '@/lib/app/synths/contract';

const def = (): SynthDef => {
  const d = getSynthDef('model-d');
  if (!d) throw new Error('model-d is not registered');
  return d;
};

describe('withNotes', () => {
  it('sets each note on the control, jack or area its id names', () => {
    const d = def();
    const control = d.controls[0];
    const jack = d.jacks[0];
    const area = d.areas?.[0];
    if (!area) throw new Error('model-d has no areas');

    const out = withNotes(d, {
      [control.id]: 'control note',
      [jack.id]: 'jack note',
      [area.id]: 'area note',
    });

    expect(out.controls.find((c) => c.id === control.id)?.unusual).toBe('control note');
    expect(out.jacks.find((j) => j.id === jack.id)?.unusual).toBe('jack note');
    expect(out.areas?.find((a) => a.id === area.id)?.unusual).toBe('area note');
    // Only the three named items gained a note.
    const noted =
      out.controls.filter((c) => c.unusual).length +
      out.jacks.filter((j) => j.unusual).length +
      (out.areas ?? []).filter((a) => a.unusual).length;
    expect(noted).toBe(3);
  });

  it('returns items with no note as the very same objects', () => {
    const d = def();
    const first = d.controls[0];
    const out = withNotes(d, { [first.id]: 'note' });

    expect(out.controls[0]).not.toBe(first);
    expect(out.controls[1]).toBe(d.controls[1]);
    expect(out.jacks[0]).toBe(d.jacks[0]);
    expect(out.areas?.[0]).toBe(d.areas?.[0]);
  });

  it('keeps everything else about a noted item', () => {
    const d = def();
    const first = d.controls[0];
    const out = withNotes(d, { [first.id]: 'note' });
    expect(out.controls[0]).toEqual({ ...first, unusual: 'note' });
  });

  it('does not mutate the input definition', () => {
    const d = def();
    const first = d.controls[0];
    const before = first.unusual;
    const controls = d.controls;

    withNotes(d, { [first.id]: 'note' });

    expect(first.unusual).toBe(before);
    expect(d.controls).toBe(controls);
  });

  it('ignores notes for ids the synth does not have, and empty notes', () => {
    const d = def();
    const first = d.controls[0];
    const out = withNotes(d, { 'no.such.id': 'lost', [first.id]: '' });
    expect(out.controls.every((c, i) => c === d.controls[i])).toBe(true);
  });

  it('adds no areas when the definition has none', () => {
    const { areas: _areas, ...rest } = def();
    const d = rest as unknown as SynthDef;
    expect(withNotes(d, {}).areas).toBeUndefined();
  });
});
