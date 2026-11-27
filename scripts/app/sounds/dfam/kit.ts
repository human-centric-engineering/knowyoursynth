/**
 * The DFAM and EDGE sound-writing kit (t-269, t-270): the panel's numbers worked out from what a sound means (a note,
 * a step's interval, a decay in seconds, a cutoff in hertz), so the specs read as music rather than knob positions.
 * Every number here is `defs/dfam-kit.ts`'s own mapping run backwards; the readouts the lessons print are worked out
 * forwards from the definition by `lesson-writer.ts`.
 *
 * A DFAM sound is the synth playing itself (`.context/app/sequencer-synths.md`, "Who plays a sound"): RUN / STOP lit,
 * the riff a held C4, the app's clock running the sequencer locked to the beat. TEMPO then chooses how many steps a
 * beat, so `tempo()` puts it on the rate of that division at the sound's BPM. A few are played from the keys, with
 * the sequencer stopped.
 */
import type { ControlValues } from '@/lib/app/synths/contract';
import { CENTRE_NOTE, EG_SEMI, VCF_EG_OCT } from '@/lib/app/synths/defs/dfam-kit';

const r2 = (v: number): number => Math.round(v * 100) / 100;
const LN1000 = Math.log(1000);

/** MIDI number for a note name (C4 = 60): `G2`, `Bb1`, `F#3`. */
export function midi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  return 12 * (Number(m[3]) + 1) + base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
}

/** A FREQUENCY position for a note, with the key at C4: ten octaves round C3. */
export function freq(name: string): number {
  const v = 5 + (midi(name) - CENTRE_NOTE) / 12;
  if (v < 0 || v > 10) throw new Error(`FREQUENCY does not reach ${name}`);
  return r2(v);
}

/** A PITCH step's position for an interval in semitones: a volt an octave, so 1.0 is an octave up. */
export const step = (st: number): number => r2(st / 12);

/** The eight PITCH knobs, as intervals in semitones from the oscillators' FREQUENCY. */
export function pitches(row: number[]): ControlValues {
  if (row.length !== 8) throw new Error('eight steps');
  const v: ControlValues = {};
  row.forEach((st, i) => {
    v[`seq.pitch${i + 1}`] = step(st);
  });
  return v;
}

/** The eight VELOCITY knobs, 0 to 10: the rhythm and its accents. */
export function vels(row: number[]): ControlValues {
  if (row.length !== 8) throw new Error('eight steps');
  const v: ControlValues = {};
  row.forEach((x, i) => {
    if (x < 0 || x > 10) throw new Error(`velocity ${x}`);
    v[`seq.vel${i + 1}`] = x;
  });
  return v;
}

/** TEMPO's position for `perBeat` steps a beat at `bpm` (0.7 to 700 Hz over the turn). */
export function tempo(bpm: number, perBeat: number): number {
  const hz = (perBeat * bpm) / 60;
  return r2((10 * Math.log(hz / 0.7)) / LN1000);
}

/** TEMPO's position for a clock of `hz`, for a sound whose clock runs free (an oscillator). */
export const tempoHz = (hz: number): number => r2((10 * Math.log(hz / 0.7)) / LN1000);

/** A DECAY position for a decay of `s` seconds (10 ms to 10 s). */
export function decay(s: number): number {
  const v = (10 * Math.log(s / 0.01)) / LN1000;
  if (v < 0 || v > 10) throw new Error(`no decay of ${s} s`);
  return r2(v);
}

/** A CUTOFF position for `hz` (20 Hz to 20 kHz). */
export function cutoff(hz: number): number {
  const v = (10 * Math.log(hz / 20)) / LN1000;
  if (v < 0 || v > 10) throw new Error(`no cutoff of ${hz} Hz`);
  return r2(v);
}

/** A VCO EG AMOUNT for a pitch jump of `st` semitones at full velocity (negative for a dip). */
export function egAmt(st: number): number {
  const v = Math.sign(st) * 5 * Math.sqrt(Math.abs(st) / EG_SEMI);
  return r2(v);
}

/** A VCF EG AMOUNT for a cutoff jump of `oct` octaves at full velocity (negative to close it). */
export const vcfEg = (oct: number): number => r2((oct / VCF_EG_OCT) * 5);

/** RUN / STOP lit: on the app's clock, Play on the bar runs it. */
export const run = (): ControlValues => ({ 'seq.run': true });
