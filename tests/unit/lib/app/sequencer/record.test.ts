/**
 * Playing notes into a pattern (`f-step-sequencer` t-86): what step record writes (chords, rests, ties) and where live
 * record places a note, quantised and not.
 *
 * @see lib/app/sequencer/record.ts
 */

import { describe, it, expect } from 'vitest';
import {
  MIN_LIVE_GATE,
  liveGate,
  nextStep,
  placeHit,
  playedVelocity,
  recordNote,
  restAt,
  tieOver,
  writeChord,
} from '@/lib/app/sequencer/record';
import { MAX_CHORD, PatternSchema, newPattern, type Step } from '@/lib/app/sequencer/pattern';

const note = (n: number, gate = 1): Step => ({ on: true, notes: [{ note: n, gate }] });
const rest = (): Step => ({ on: true, notes: [] });

describe('step record', () => {
  it('writes a chord on the step, one of each pitch, and keeps the step’s other values', () => {
    const s = writeChord(
      { on: false, notes: [{ note: 40, gate: 3 }], accent: true, mod: { cutoff: 0.5 } },
      [{ note: 48 }, { note: 52, velocity: 0.4 }, { note: 48 }]
    );
    expect(s).toEqual({
      on: true,
      notes: [
        { note: 48, gate: 1 },
        { note: 52, gate: 1, velocity: 0.4 },
      ],
      accent: true,
      mod: { cutoff: 0.5 },
    });
  });

  it('keeps a chord to six notes', () => {
    const s = writeChord(
      rest(),
      [48, 50, 52, 53, 55, 57, 59].map((n) => ({ note: n }))
    );
    expect(s.notes.map((n) => n.note)).toEqual([48, 50, 52, 53, 55, 57]);
    expect(s.notes).toHaveLength(MAX_CHORD);
  });

  it('makes a rest, keeping the step’s lane values', () => {
    const steps = [note(48), { ...note(50), mod: { cutoff: 0.2 } }];
    expect(restAt(steps, 1)).toEqual([note(48), { on: true, notes: [], mod: { cutoff: 0.2 } }]);
  });

  it('ties the notes before over the step, across rests and further ties', () => {
    let steps = [note(48), note(50), rest(), rest()];
    steps = tieOver(steps, 2);
    expect(steps[1].notes[0].gate).toBe(2);
    expect(steps[2].notes).toEqual([]);
    steps = tieOver(steps, 3);
    expect(steps[1].notes[0].gate).toBe(3);
    // a longer note is not cut short, and the step before the one held is untouched
    expect(tieOver([note(48, 5), rest()], 1)[0].notes[0].gate).toBe(5);
    expect(steps[0]).toEqual(note(48));
  });

  it('ties with nothing before it as a rest', () => {
    expect(tieOver([note(48), rest()], 0)).toEqual([rest(), rest()]);
    expect(tieOver([rest(), note(50)], 1)).toEqual([rest(), rest()]);
  });

  it('moves to the next step, and round from the last', () => {
    expect(nextStep(3, 16)).toBe(4);
    expect(nextStep(15, 16)).toBe(0);
  });

  it('makes steps the pattern accepts', () => {
    const p = newPattern(4);
    p.parts[0].steps = tieOver(
      [writeChord(rest(), [{ note: 48 }, { note: 55, velocity: 0.9 }]), rest(), rest(), rest()],
      2
    );
    expect(PatternSchema.safeParse(p).success).toBe(true);
  });
});

describe('live record: where a note goes', () => {
  it('quantised, goes on the nearest step, early or late, with no nudge', () => {
    expect(placeHit(4.4, 16, 50, true)).toEqual({ slot: 4, nudge: 0 });
    expect(placeHit(4.6, 16, 50, true)).toEqual({ slot: 5, nudge: 0 });
    expect(placeHit(0.1, 16, 50, true)).toEqual({ slot: 0, nudge: 0 });
  });

  it('quantised late in the last step, goes on the first step of the next loop', () => {
    expect(placeHit(15.7, 16, 50, true)).toEqual({ slot: 0, nudge: 0 });
    // an odd length's last slot is swung, but the next loop's first is not
    expect(placeHit(14.8, 15, 75, true)).toEqual({ slot: 0, nudge: 0 });
  });

  it('unquantised, goes on the step it falls in and keeps how late it was', () => {
    expect(placeHit(4.6, 16, 50, false)).toEqual({ slot: 4, nudge: 0.6 });
    expect(placeHit(0, 16, 50, false)).toEqual({ slot: 0, nudge: 0 });
  });

  it('reads swing: a swung step starts late, so a note just before it is the step before’s', () => {
    // at 75 every second step starts half a step late: step 2 (slot 1) at 1.5
    expect(placeHit(1.4, 16, 75, false)).toEqual({ slot: 0, nudge: 0.99 });
    expect(placeHit(1.7, 16, 75, false)).toEqual({ slot: 1, nudge: 0.2 });
    expect(placeHit(1.3, 16, 75, true)).toEqual({ slot: 1, nudge: 0 });
    expect(placeHit(0.7, 16, 75, true)).toEqual({ slot: 0, nudge: 0 });
  });

  it('writes the length played: whole steps quantised, as played if not, never nothing', () => {
    expect(liveGate(1.4, true)).toBe(1);
    expect(liveGate(2.6, true)).toBe(3);
    expect(liveGate(0.2, true)).toBe(1);
    expect(liveGate(1.4, false)).toBe(1.4);
    expect(liveGate(0, false)).toBe(MIN_LIVE_GATE);
  });

  it('keeps a velocity a MIDI key gave, and none at the default', () => {
    expect(playedVelocity(undefined)).toBeUndefined();
    expect(playedVelocity(0.85)).toBeUndefined();
    expect(playedVelocity(100 / 127)).toBe(0.787);
  });
});

describe('live record: what a note does to the step', () => {
  const n = (x: number) => ({ note: x, gate: 1 });

  it('overdub adds to the step’s notes, and a pitch played again takes its own place', () => {
    expect(recordNote(note(48), n(52), 'overdub', false).notes.map((x) => x.note)).toEqual([
      48, 52,
    ]);
    expect(recordNote(note(48, 3), n(48), 'overdub', false).notes).toEqual([n(48)]);
    expect(recordNote(rest(), n(52), 'overdub', false)).toEqual({ on: true, notes: [n(52)] });
  });

  it('replace puts the note in place of the step’s, unless it is struck with another', () => {
    const replaced = recordNote({ ...note(48), on: false }, n(52), 'replace', false);
    expect(replaced).toEqual({ on: true, notes: [n(52)] });
    expect(recordNote(replaced, n(55), 'replace', true).notes.map((x) => x.note)).toEqual([52, 55]);
  });

  it('keeps a step already playing six', () => {
    const full: Step = { on: true, notes: [48, 50, 52, 53, 55, 57].map(n) };
    expect(recordNote(full, n(59), 'overdub', false)).toBe(full);
  });
});
