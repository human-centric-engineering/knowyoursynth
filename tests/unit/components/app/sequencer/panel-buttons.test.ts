/**
 * The sequencer synths' buttons (`f-step-sequencer` t-85): which presses the sequencer takes, the lamps the panel is
 * drawn with, and each definition's map naming buttons it really has.
 *
 * @see components/app/sequencer/panel-buttons.ts
 */

import { beforeAll, describe, expect, it } from 'vitest';
import {
  noteInOctave,
  seqButtonFor,
  seqLamps,
  type LampState,
} from '@/components/app/sequencer/panel-buttons';
import { newPattern, type Pattern } from '@/lib/app/sequencer/pattern';
import type { SynthDef } from '@/lib/app/synths/contract';
import { getSynthDef, SYNTH_DEFS } from '@/lib/app/synths/defs';
import { loadSynthDef } from '@/lib/app/synths/defs/load';

let tb303: SynthDef;
let b1: SynthDef;
beforeAll(async () => {
  await loadSynthDef('tb-303');
  await loadSynthDef('donner-b1');
  const a = getSynthDef('tb-303');
  const b = getSynthDef('donner-b1');
  if (!a || !b) throw new Error('the sequencer synths are not registered');
  tb303 = a;
  b1 = b;
});

/** 16 steps: step 1 C2 accented and slid, ratcheting 3; step 2 E3 muted; the rest rests. */
function pattern(): Pattern {
  const p = newPattern(16);
  p.parts[0].steps[0] = {
    on: true,
    notes: [{ note: 36, gate: 1 }],
    accent: true,
    slide: true,
    ratchet: 3,
  };
  p.parts[0].steps[1] = { on: false, notes: [{ note: 52, gate: 1 }] };
  return p;
}

const state = (over: Partial<LampState> = {}): LampState => ({
  open: true,
  playing: false,
  keys: 'edit',
  hold: false,
  pattern: pattern(),
  chosen: { part: 0, step: 0, page: 0 },
  pageSize: 16,
  ...over,
});

describe('every definition’s sequencer buttons', () => {
  it('name buttons the synth has, and only the three sequencer synths map any', () => {
    const mapped = SYNTH_DEFS.filter((d) => d.seqButtons).map((d) => d.id);
    expect(mapped.sort()).toEqual(['donner-b1', 'tb-303', 'td-3']);
    for (const d of SYNTH_DEFS) {
      for (const id of Object.keys(d.seqButtons ?? {})) {
        const c = d.controls.find((x) => x.id === id);
        expect(c?.type, `${d.id} maps ${id}`).toBe('button');
      }
    }
  });

  it('give the B1 its 16 white keys as steps 1–16 and the 303 its 13 keys as C to upper C', () => {
    const b1Steps = Object.values(b1.seqButtons ?? {}).filter(
      (b) => typeof b === 'object' && 'step' in b
    );
    expect(b1Steps).toEqual(Array.from({ length: 16 }, (_, step) => ({ step })));
    const tbNotes = Object.values(tb303.seqButtons ?? {}).filter(
      (b) => typeof b === 'object' && 'note' in b
    );
    expect(tbNotes).toEqual(Array.from({ length: 13 }, (_, note) => ({ note })));
  });
});

describe('seqButtonFor', () => {
  it('takes a panel-mode button whether the sequencer is open or not', () => {
    expect(seqButtonFor(tb303, 'seq.run', false)).toBe('run');
    expect(seqButtonFor(tb303, 'seq.time', false)).toBe('toggle');
    expect(seqButtonFor(b1, 'kbd.keyC2', false)).toEqual({ step: 1 });
  });

  it('takes a button that changes the sound (ACCENT, SLIDE) only while the sequencer is open', () => {
    expect(seqButtonFor(tb303, 'seq.accent', true)).toBe('accent');
    expect(seqButtonFor(tb303, 'seq.accent', false)).toBeNull();
    expect(seqButtonFor(b1, 'seq.slide', false)).toBeNull();
  });

  it('leaves a button the map does not name, and every button on a synth with no map', () => {
    expect(seqButtonFor(tb303, 'seq.mode', true)).toBeNull();
    expect(seqButtonFor(b1, 'seq.save', true)).toBeNull();
    const plain = SYNTH_DEFS.find((d) => d.id === 'model-d');
    expect(plain && seqButtonFor(plain, 'seq.run', true)).toBeNull();
  });
});

describe('seqLamps', () => {
  it('lights RUN while the pattern plays, and ARP, REC and HOLD while they are on', () => {
    const off = seqLamps(b1, b1.init, state());
    expect([off['seq.play'], off['seq.arp'], off['seq.rec'], off['kbd.hold']]).toEqual([
      false,
      false,
      false,
      false,
    ]);
    expect(seqLamps(b1, b1.init, state({ playing: true }))['seq.play']).toBe(true);
    expect(seqLamps(b1, b1.init, state({ keys: 'arp' }))['seq.arp']).toBe(true);
    expect(seqLamps(b1, b1.init, state({ keys: 'step' }))['seq.rec']).toBe(true);
    expect(seqLamps(b1, b1.init, state({ hold: true }))['kbd.hold']).toBe(true);
  });

  it('shows the chosen step’s accent, slide and ratchet, and turns them off on a plain step', () => {
    const on = seqLamps(b1, b1.init, state());
    expect([on['seq.accent'], on['seq.slide'], on['seq.ratchet']]).toEqual([true, true, true]);
    const plain = seqLamps(b1, b1.init, state({ chosen: { part: 0, step: 2, page: 0 } }));
    expect([plain['seq.accent'], plain['seq.slide'], plain['seq.ratchet']]).toEqual([
      false,
      false,
      false,
    ]);
  });

  it('lights a B1 step key while its step plays: not a muted step, not a rest', () => {
    const lamps = seqLamps(b1, b1.init, state());
    expect(lamps['kbd.keyB1']).toBe(true); // step 1
    expect(lamps['kbd.keyC2']).toBe(false); // step 2, muted
    expect(lamps['kbd.keyD2']).toBe(false); // step 3, a rest
  });

  it('reads the step keys from the page on show', () => {
    const p = newPattern(32);
    p.parts[0].steps[17] = { on: true, notes: [{ note: 40, gate: 1 }] };
    const lamps = seqLamps(
      b1,
      b1.init,
      state({ pattern: p, chosen: { part: 0, step: 17, page: 1 } })
    );
    expect(lamps['kbd.keyC2']).toBe(true); // key 2 of page 2 is step 18
    expect(lamps['kbd.keyB1']).toBe(false);
  });

  it('lights the 303 key of the chosen step’s note, and TIME MODE while the step plays', () => {
    const lamps = seqLamps(tb303, tb303.init, state());
    expect(lamps['seq.keyC']).toBe(true);
    expect(lamps['seq.keyD']).toBe(false);
    expect(lamps['seq.time']).toBe(true);
    const muted = seqLamps(tb303, tb303.init, state({ chosen: { part: 0, step: 1, page: 0 } }));
    expect(muted['seq.keyE']).toBe(false);
    expect(muted['seq.time']).toBe(false);
  });

  it('with the sequencer closed, leaves ACCENT and SLIDE showing the panel’s own live values', () => {
    const values = { ...b1.init, 'seq.accent': true, 'seq.slide': false };
    const lamps = seqLamps(b1, values, state({ open: false }));
    expect(lamps['seq.accent']).toBe(true);
    expect(lamps['seq.slide']).toBe(false);
    // and the step lamps go dark, with no step chosen on show
    expect(lamps['kbd.keyB1']).toBe(false);
    expect(lamps['seq.ratchet']).toBe(false);
  });

  it('hands back the values unchanged for a synth with no map', () => {
    const plain = SYNTH_DEFS.find((d) => d.id === 'model-d');
    if (!plain) throw new Error('model-d is not registered');
    expect(seqLamps(plain, plain.init, state())).toBe(plain.init);
  });
});

describe('noteInOctave', () => {
  it('puts the semitone in the octave of the step’s first note', () => {
    expect(noteInOctave({ on: true, notes: [{ note: 43, gate: 1 }] }, 60, 4)).toBe(40);
    expect(noteInOctave({ on: true, notes: [{ note: 36, gate: 1 }] }, 60, 12)).toBe(48);
  });

  it('takes the octave of the nearby note on a rest, and stays inside MIDI', () => {
    expect(noteInOctave({ on: true, notes: [] }, 62, 7)).toBe(67);
    expect(noteInOctave({ on: true, notes: [{ note: 125, gate: 1 }] }, 60, 11)).toBe(127);
  });
});
