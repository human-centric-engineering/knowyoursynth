// Small mapping helpers shared by every SynthDef's toEngine().
//
// Transliterated from `prototype/src/lib/maps.js` (decision D3).
import type { Phrase, PhraseNote, UnusualNotes } from '@/lib/app/synths/contract';

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x);

/** 0..1 → min..max on an exponential curve (equal ratios per step). */
export const expMap = (t: number, min: number, max: number): number =>
  min * Math.pow(max / min, clamp(t, 0, 1));

/** 0..1 → min..max linear. */
export const linMap = (t: number, min: number, max: number): number =>
  min + (max - min) * clamp(t, 0, 1);

/** A point of a piecewise curve: `[x, y]`. */
export type CurvePoint = [x: number, y: number];

/** Piecewise interpolation through [[x, y], …] (x ascending). `log` interpolates y in the log domain. */
export function pwl(x: number, pts: CurvePoint[], log = false): number {
  if (x <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (x <= pts[i][0]) {
      const [x0, y0] = pts[i - 1];
      const [x1, y1] = pts[i];
      const t = (x - x0) / (x1 - x0);
      return log ? y0 * Math.pow(y1 / y0, t) : y0 + (y1 - y0) * t;
    }
  }
  return pts[pts.length - 1][1];
}

/** Panel 0–10 level knob → linear gain with an audio-ish taper. */
export const level10 = (v: number, max = 1): number => Math.pow(clamp(v, 0, 10) / 10, 1.7) * max;

export function fmtTime(s: number): string {
  if (s < 0.0995) return `${Math.round(s * 1000)} ms`;
  if (s < 1) return `${Math.round(s * 100) * 10} ms`;
  return `${s < 10 ? s.toFixed(1) : Math.round(s)} s`;
}

export function fmtHz(hz: number): string {
  if (hz < 10) return `${hz.toFixed(2)} Hz`;
  if (hz < 1000) return `${Math.round(hz)} Hz`;
  return `${(hz / 1000).toFixed(hz < 10000 ? 1 : 0)} kHz`;
}

export const fmtSemi = (s: number): string => {
  const r = Math.round(s * 10) / 10;
  return `${r > 0 ? '+' : ''}${r} st`;
};

/** Anything an unusual note can be attached to: a control, a jack or an area. */
export interface Annotatable {
  id: string;
  unusual?: string;
}

/**
 * Attach the "unusual on this synth" notes (src/synths/unusual/<id>.js) to the controls, jacks and areas they name.
 * An id that matches nothing is a typo, so it throws rather than being dropped silently.
 */
export function annotate(notes: UnusualNotes, ...lists: Annotatable[][]): void {
  const byId = new Map(lists.flat().map((x) => [x.id, x]));
  for (const [id, text] of Object.entries(notes)) {
    const item = byId.get(id);
    if (!item) throw new Error(`unusual note for unknown id "${id}"`);
    item.unusual = text;
  }
}

const NOTE_OF: Record<string, number> = {
  C: 0,
  'C#': 1,
  D: 2,
  'D#': 3,
  E: 4,
  F: 5,
  'F#': 6,
  G: 7,
  'G#': 8,
  A: 9,
  'A#': 10,
  B: 11,
};

/**
 * A TB-303-style pattern → a riff (Preset `phrase`). One token per sixteenth: `C2` a note (MIDI octave numbers, C4 = 60,
 * `#` for sharps), `.` a rest, `-` a tie (the note before carries on through this step). Suffix `a` = accented (the
 * step's velocity is 1; other steps play at 0.8), `s` = slide: the note is held over the start of the next one, so the
 * pitch glides and the envelopes are not started again. A slide on the last step does not wrap round to the first.
 * `gate` is how much of a step an ordinary note is held (the 303 lets go about half way).
 */
export function acidPhrase(bpm: number, pattern: string, gate = 0.55): Phrase {
  const toks = pattern.trim().split(/\s+/);
  const total = toks.length * 0.25;
  // The prototype hung `slide` on the note array itself; here it rides alongside.
  const steps: { note: PhraseNote; slide: boolean }[] = [];
  let cur: { note: PhraseNote; slide: boolean } | null = null;
  toks.forEach((t, i) => {
    const b = i * 0.25;
    if (t === '.') {
      cur = null;
      return;
    }
    if (t === '-') {
      if (cur) {
        const n: PhraseNote = cur.note;
        n[2] = Math.min(b + (cur.slide ? 0.28 : 0.25 * gate) - n[0], total - n[0] - 0.01);
      }
      return;
    }
    const m = /^([A-G]#?)(\d)([as]*)$/.exec(t);
    if (!m) throw new Error(`acidPhrase: bad step "${t}"`);
    const slide = m[3].includes('s');
    const note: PhraseNote = [
      b,
      12 * (Number(m[2]) + 1) + NOTE_OF[m[1]],
      0,
      m[3].includes('a') ? 1 : 0.8,
    ];
    note[2] = Math.min(slide ? 0.28 : 0.25 * gate, total - b - 0.01);
    cur = { note, slide };
    steps.push(cur);
  });
  return { bpm, loop: true, steps: steps.map((s) => s.note) };
}
