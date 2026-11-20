/**
 * The Subharmonicon's sound-writing kit (`f-own-sequencer` t-289): the panel's numbers worked out from what a sound
 * means (a note, a semitone step, a divisor move), so the specs read as music rather than knob positions. Every number
 * here is the definition's own mapping run backwards; the readouts the lesson prints are worked out forwards from the
 * definition by `lesson-writer.ts`.
 */
import type { ControlValues, PhraseNote } from '@/lib/app/synths/contract';

const r2 = (v: number): number => Math.round(v * 100) / 100;

/** Semitones above C4 for a note name: `G4` is 7, `C5` 12, `Bb3` −2. */
export function semi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
  if (!m) throw new Error(`not a note: ${name}`);
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1] as 'C'];
  return base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12 * (Number(m[3]) - 4);
}

/** MIDI number for a note name (C4 = 60). */
export const midi = (name: string): number => 60 + semi(name);

/** A VCO FREQ position for a note at or above C4 (four octaves over ten). */
export function freq(name: string): number {
  const s = semi(name);
  if (s < 0 || s > 48) throw new Error(`FREQ reaches C4 to C8, not ${name}`);
  return r2(s / 4.8);
}

/** A STEP position that moves the pitch by `st` semitones at SEQ OCT `oct`. Exact once QUANTIZE snaps it. */
export function step(st: number, oct: 1 | 2 | 5 = 1): number {
  const v = (st / (oct * 12)) * 5;
  if (Math.abs(v) > 5) throw new Error(`${st} semitones is past SEQ OCT ±${oct}`);
  return r2(v);
}

/** A STEP position that lowers an assigned sub's divisor by `n` (raises it for a negative `n`), at SEQ OCT ±5. */
export function div(n: number): number {
  // 1.5 divisors a volt; at ±5 a step's position is its volts
  const v = n / 1.5;
  if (Math.abs(v) > 5) throw new Error(`a step moves a divisor at most 7, not ${n}`);
  // a hair past the middle of the divisor, so the core's rounding never lands on the edge
  return r2(v + Math.sign(v) * 0.05);
}

/** One VCO and its subs: FREQ (a note name), WAVE, the two divisors and the three levels. */
export function vco(
  n: 1 | 2,
  o: {
    note?: string;
    wave?: 'square' | 'pwm' | 'saw';
    subs?: [number, number];
    levels?: [number, number, number];
  }
): ControlValues {
  const v: ControlValues = {};
  if (o.note) v[`vco${n}.freq`] = freq(o.note);
  if (o.wave) v[`vco${n}.wave`] = o.wave;
  if (o.subs) {
    v[`sub${n}1.div`] = o.subs[0];
    v[`sub${n}2.div`] = o.subs[1];
  }
  if (o.levels) {
    v[`mix.vco${n}`] = o.levels[0];
    v[`mix.sub${n}1`] = o.levels[1];
    v[`mix.sub${n}2`] = o.levels[2];
  }
  return v;
}

/** A sequencer's four steps and what they move. */
export function seq(
  n: 1 | 2,
  steps: [number, number, number, number],
  assign: { osc?: boolean; sub1?: boolean; sub2?: boolean } = { osc: true }
): ControlValues {
  const v: ControlValues = {};
  steps.forEach((x, i) => {
    if (x !== 0) v[`seq${n}.step${i + 1}`] = x;
  });
  if (assign.osc) v[`seq${n}.assign_osc`] = true;
  if (assign.sub1) v[`seq${n}.assign_sub1`] = true;
  if (assign.sub2) v[`seq${n}.assign_sub2`] = true;
  return v;
}

/** The rhythm generators: each `[divisor, drives SEQ 1, drives SEQ 2]`, by number. */
export function rhythms(
  r: Partial<Record<1 | 2 | 3 | 4, [number, boolean, boolean]>>
): ControlValues {
  const v: ControlValues = {};
  for (const [k, [d, s1, s2]] of Object.entries(r)) {
    if (d !== Number(k)) v[`rhythm${k}.div`] = d;
    if (s1) v[`rhythm${k}.seq1`] = true;
    if (s2) v[`rhythm${k}.seq2`] = true;
  }
  return v;
}

/** The filter and the two envelopes; only what is given. */
export function shape(o: {
  cutoff?: number;
  res?: number;
  amt?: number;
  fa?: number;
  fd?: number;
  aa?: number;
  ad?: number;
  vol?: number;
}): ControlValues {
  const v: ControlValues = {};
  if (o.cutoff !== undefined) v['vcf.cutoff'] = o.cutoff;
  if (o.res !== undefined) v['vcf.resonance'] = o.res;
  if (o.amt !== undefined) v['vcf_eg.amount'] = o.amt;
  if (o.fa !== undefined) v['vcf_eg.attack'] = o.fa;
  if (o.fd !== undefined) v['vcf_eg.decay'] = o.fd;
  if (o.aa !== undefined) v['vca_eg.attack'] = o.aa;
  if (o.ad !== undefined) v['vca_eg.decay'] = o.ad;
  if (o.vol !== undefined) v['vca.volume'] = o.vol;
  return v;
}

/** PLAY lit, and the EG mode: the last step of a sound the synth plays. */
export const play = (eg: 'on' | 'off' | 'held' = 'on'): ControlValues => ({
  ...(eg !== 'on' && { 'transport.eg': eg }),
  'transport.play': true,
});

/** A riff of notes by name: `[beat, name, beats]`. */
export const notes = (xs: [number, string, number][]): PhraseNote[] =>
  xs.map(([b, n, len]) => [b, midi(n), len]);

/** A key line: each name held for `beats`, one after another (a transposed sound's riff). */
export const keyLine = (names: string[], beats: number): PhraseNote[] =>
  names.map((n, i) => [i * beats, midi(n), beats]);
