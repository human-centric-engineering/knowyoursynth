/**
 * Arp mode (`f-step-sequencer` t-86): the order the held notes play in over one and two octaves, the keys it plays
 * from with Hold on and off, and a loop compiled with the arp playing through the pattern's steps.
 *
 * @see lib/app/sequencer/arp.ts
 * @see lib/app/sequencer/compile.ts
 */

import { describe, it, expect } from 'vitest';
import {
  ARP_ORDERS,
  NO_ARP_KEYS,
  arpHold,
  arpPress,
  arpRelease,
  arpSequence,
  type ArpOrder,
} from '@/lib/app/sequencer/arp';
import { compileLoop, seededRng } from '@/lib/app/sequencer/compile';
import { newPattern, type Pattern, type Step } from '@/lib/app/sequencer/pattern';

/** E3, C3, G3: pressed out of order, so `played` differs from `up`. */
const HELD = [52, 48, 55];

describe('arpSequence', () => {
  const cases: Record<Exclude<ArpOrder, 'random'>, [number[], number[]]> = {
    up: [
      [48, 52, 55],
      [48, 52, 55, 60, 64, 67],
    ],
    down: [
      [55, 52, 48],
      [67, 64, 60, 55, 52, 48],
    ],
    // Neither end twice in a row, round again: C E G E | C …
    upDown: [
      [48, 52, 55, 52],
      [48, 52, 55, 60, 64, 67, 64, 60, 55, 52],
    ],
    played: [
      [52, 48, 55],
      [52, 48, 55, 64, 60, 67],
    ],
  };
  for (const [order, [one, two]] of Object.entries(cases)) {
    it(`plays ${order} over one octave and over two`, () => {
      const o = order as ArpOrder;
      expect(arpSequence(HELD, { order: o, octaves: 1 })).toEqual(one);
      expect(arpSequence(HELD, { order: o, octaves: 2 })).toEqual(two);
    });
  }

  it('draws random from the up notes, over one octave and over two', () => {
    expect(arpSequence(HELD, { order: 'random', octaves: 1 })).toEqual([48, 52, 55]);
    expect(arpSequence(HELD, { order: 'random', octaves: 2 })).toEqual([48, 52, 55, 60, 64, 67]);
  });

  it('plays two notes up-down as up, and one note as itself', () => {
    expect(arpSequence([48, 55], { order: 'upDown', octaves: 1 })).toEqual([48, 55]);
    expect(arpSequence([48], { order: 'upDown', octaves: 2 })).toEqual([48, 60]);
  });

  it('leaves out octaves past the top of MIDI, and plays a key held twice once', () => {
    expect(arpSequence([120, 120], { order: 'up', octaves: 3 })).toEqual([120]);
    expect(arpSequence([], { order: 'up', octaves: 2 })).toEqual([]);
  });

  it('knows every order it offers', () => {
    for (const order of ARP_ORDERS)
      expect(arpSequence(HELD, { order, octaves: 1 }).length).toBeGreaterThan(0);
  });
});

describe('the keys the arp plays from', () => {
  it('without Hold, plays the keys down, and nothing once they are let go', () => {
    let k = arpPress(NO_ARP_KEYS, 48, false);
    k = arpPress(k, 52, false);
    expect(k.held).toEqual([48, 52]);
    k = arpRelease(k, 48, false);
    expect(k.held).toEqual([52]);
    k = arpRelease(k, 52, false);
    expect(k.held).toEqual([]);
  });

  it('with Hold, keeps playing keys let go, and a press with every key up starts a fresh set', () => {
    let k = arpPress(NO_ARP_KEYS, 48, true);
    k = arpPress(k, 52, true);
    k = arpRelease(arpRelease(k, 48, true), 52, true);
    expect(k).toEqual({ down: [], held: [48, 52] });
    // a fresh press replaces them; another while it is down joins it
    k = arpPress(k, 55, true);
    expect(k.held).toEqual([55]);
    k = arpPress(k, 59, true);
    expect(k.held).toEqual([55, 59]);
  });

  it('Hold turned off plays only the keys still down', () => {
    let k = arpPress(NO_ARP_KEYS, 48, true);
    k = arpPress(k, 52, true);
    k = arpRelease(k, 48, true);
    expect(arpHold(k, false).held).toEqual([52]);
    expect(arpHold(k, true)).toBe(k);
  });
});

describe('compileLoop with the arp', () => {
  const on = (note = 60, more: Partial<Step> = {}): Step => ({
    on: true,
    notes: [{ note, gate: 0.5, velocity: 0.7, nudge: 0.25 }],
    ...more,
  });
  /** Four sixteenths: a note, a rest, a note with a ratchet of 2 and an accent, a muted note. */
  const pattern = (): Pattern => {
    const p = newPattern(4);
    p.parts[0].steps = [
      on(),
      { on: true, notes: [] },
      on(62, { ratchet: 2, accent: true }),
      on(64, { on: false }),
    ];
    return p;
  };
  const rng = () => seededRng(1);

  it('plays the next note on each step that plays, with the step’s gate, velocity, nudge, ratchet and accent', () => {
    const c = compileLoop(pattern(), {
      loop: 0,
      rng: rng(),
      arp: { notes: [48, 52, 55], random: false },
    });
    expect(c.notes).toEqual([
      // step 1: the first arp note, nudged a quarter step, half a step long, at the step's velocity
      [0.0625, 48, 0.125, 0.7],
      // step 3: the second, ratcheted twice at the accent's velocity; the rest and the muted step play nothing
      [0.53125, 52, 0.0625, 1],
      [0.65625, 52, 0.0625, 1],
    ]);
    expect(c.arpTo).toBe(2);
  });

  it('carries on from where the loop before left off', () => {
    const c = compileLoop(pattern(), {
      loop: 1,
      rng: rng(),
      arp: { notes: [48, 52, 55], random: false, from: 2 },
    });
    expect(c.notes.map((n) => n[1])).toEqual([55, 48, 48]);
    expect(c.arpTo).toBe(1);
  });

  it('plays nothing with no keys held, and the steps’ own notes without the arp', () => {
    expect(
      compileLoop(pattern(), { loop: 0, rng: rng(), arp: { notes: [], random: false } }).notes
    ).toEqual([]);
    expect(compileLoop(pattern(), { loop: 0, rng: rng() }).notes.map((n) => n[1])).toEqual([
      60, 62, 62,
    ]);
  });

  it('draws a random note from the held notes for each step', () => {
    const p = newPattern(16);
    p.parts[0].steps = p.parts[0].steps.map(() => on());
    const notes = compileLoop(p, {
      loop: 0,
      rng: rng(),
      arp: { notes: [48, 52, 55], random: true },
    }).notes.map((n) => n[1]);
    expect(notes).toHaveLength(16);
    expect(new Set(notes)).toEqual(new Set([48, 52, 55]));
  });

  it('keeps the arp’s notes to the pattern’s scale', () => {
    const p = { ...pattern(), scale: 'major' as const };
    // C# is off C major, and goes down to C
    const c = compileLoop(p, { loop: 0, rng: rng(), arp: { notes: [49], random: false } });
    expect(c.notes.map((n) => n[1])).toEqual([48, 48, 48]);
  });
});
