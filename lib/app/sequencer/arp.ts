/**
 * Arp mode (`f-step-sequencer` t-86): the keys held down play through the pattern's steps, one note a step.
 *
 * The pattern keeps the rhythm. Every step that would play (on, with notes, its condition and chance passing) plays the
 * arp's next note in place of its own, with its own gate, velocity, nudge, accent, slide and ratchet: a sequenced arp.
 * The arp lives in the sequencer, not the voice, so it plays on every synth through the pattern player and nothing is
 * added to the engine (the engine's own arpeggiator is poly-only).
 *
 * The order and octaves are how the keys are played, not part of the pattern: they are not saved with it. A saved
 * pattern can't hold the keys either, so an arp saved in one would play nothing when opened.
 *
 * Shapes and pure functions only. The rules are in `.context/app/sequencer.md`.
 */

/** The orders an arp plays the held notes in. `played` is the order the keys went down. */
export const ARP_ORDERS = ['up', 'down', 'upDown', 'played', 'random'] as const;
export type ArpOrder = (typeof ARP_ORDERS)[number];

/** How many octaves the held notes are played over. */
export const MAX_ARP_OCTAVES = 4;

export interface ArpSettings {
  order: ArpOrder;
  /** 1 to {@link MAX_ARP_OCTAVES}. */
  octaves: number;
}

export const DEFAULT_ARP: ArpSettings = { order: 'up', octaves: 1 };

/**
 * What the arp plays, in order, before `random` draws from it: the held notes (in the order they were pressed) over
 * `octaves` octaves, each octave 12 semitones above the one before. Notes past the top of MIDI are left out.
 *
 * - `up`: low to high, octave by octave. `down`: the same, back to front.
 * - `upDown`: up and down again, without playing either end twice in a row: C E G C' G E, then round to C.
 * - `played`: the order the keys went down, octave by octave.
 * - `random`: the `up` notes, which compiling draws from one step at a time.
 */
export function arpSequence(held: readonly number[], settings: ArpSettings): number[] {
  const octaves = Math.max(1, Math.min(MAX_ARP_OCTAVES, Math.round(settings.octaves)));
  const unique = held.filter((n, i) => held.indexOf(n) === i);
  const base = settings.order === 'played' ? unique : [...unique].sort((a, b) => a - b);
  const spread: number[] = [];
  for (let o = 0; o < octaves; o++)
    for (const n of base) if (n + o * 12 <= 127) spread.push(n + o * 12);
  switch (settings.order) {
    case 'down':
      return spread.reverse();
    case 'upDown':
      return spread.length > 2 ? [...spread, ...spread.slice(1, -1).reverse()] : spread;
    default:
      return spread;
  }
}

/**
 * The keys the arp is playing from. `down` is the keys down now, in the order they went down; `held` is what the arp
 * plays. Without Hold they are the same. With Hold, keys let go keep playing: a press with every key up starts a fresh
 * set, and a press while others are down joins it, as Hold does on the page's keyboard.
 */
export interface ArpKeys {
  down: number[];
  held: number[];
}

export const NO_ARP_KEYS: ArpKeys = { down: [], held: [] };

const without = (ns: readonly number[], n: number) => ns.filter((x) => x !== n);

export function arpPress(k: ArpKeys, n: number, hold: boolean): ArpKeys {
  const down = [...without(k.down, n), n];
  if (!hold) return { down, held: down };
  return { down, held: k.down.length === 0 ? [n] : [...without(k.held, n), n] };
}

export function arpRelease(k: ArpKeys, n: number, hold: boolean): ArpKeys {
  const down = without(k.down, n);
  return { down, held: hold ? k.held : down };
}

/** Hold turned on keeps what is held; turned off, the arp plays only the keys still down. */
export function arpHold(k: ArpKeys, hold: boolean): ArpKeys {
  return hold ? k : { down: k.down, held: k.down };
}

/** What compiling a loop needs of the arp: the notes it plays in order, and where the loop before left off. */
export interface ArpInput {
  notes: readonly number[];
  random: boolean;
  /** The index of the note the loop's first played step plays. */
  from?: number;
}
