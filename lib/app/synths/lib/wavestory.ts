// Why the oscilloscope trace looks the way it does: the voice as the panel has it set now, and which controls
// shape which part of the picture.
//
// Nothing here is written per synth. The words are read back from the EngineParams that `toEngine()` produces,
// and the attribution is worked out the same way the sound map works it out: move one control, turn the panel into
// EngineParams again, and see which parameters changed. A control whose every move leaves the parameters alone is
// not part of this picture; a control whose every move only switches something on from nothing is not in it yet.
//
// Transliterated from `prototype/src/lib/wavestory.js` (decision D3).
import {
  cablesToEngine,
  cleanLabel,
  displayName,
  formatValue,
  jackMap,
  type CableLike,
} from '@/lib/app/synths/lib/patch';
import { NUDGE, WHEEL, onlyFromZero } from '@/lib/app/synths/lib/soundmap';
import type {
  Control,
  ControlValue,
  ControlValues,
  EngineParams,
  EnvParams,
  OscParams,
  SynthDef,
  SynthModule,
} from '@/lib/app/synths/contract';

const round = (x: number) => Math.round(x * 1000) / 1000;

/** EngineParams with the routings and cables keyed by what they connect (see `engineOf`). */
type StoryParams = Omit<EngineParams, 'routes' | 'cables'> & {
  routes: Record<string, number>;
  cables: Record<string, number>;
};

/** Panel state → EngineParams, exactly as the app does it for the live voice. */
function engineOf(
  def: SynthDef,
  values: ControlValues,
  cables: CableLike[],
  wheel: number
): StoryParams {
  const patched = Object.fromEntries(
    cables.flatMap((c) => [
      [c.to, true],
      [c.from, true],
    ])
  );
  const p = def.toEngine(values, { wheel, patched });
  // Routings go in keyed by what they connect, not by their place in the list: a depth knob brought up from zero adds
  // a routing, and as a list that shifted every later entry along, which read as a change to all of them.
  return {
    ...p,
    wheel,
    routes: keyed(p.routes),
    cables: keyed(cablesToEngine(def, cables, values)),
  };
}

/** [{ src, dst, amt }] → { 'src>dst': total depth }. Two routings of the same pair add up, as they do in the engine. */
function keyed(
  list: { src: string; dst: string; amt: number }[] | undefined
): Record<string, number> {
  const out: Record<string, number> = {};
  (list || []).forEach((r) => {
    const k = `${r.src}>${r.dst}`;
    out[k] = (out[k] || 0) + (r.amt || 0);
  });
  return out;
}

// ── which part of the picture each engine parameter belongs to ───────────────
// In signal-chain order: sources, then what the filter does to them, then the shape of each note, then movement.

type StageId =
  'shape' | 'pitch' | 'width' | 'mix' | 'filter' | 'amp' | 'move' | 'dirt' | 'level' | 'other';

const STAGES: [StageId, string, string[]][] = [
  [
    'shape',
    'The shape itself',
    ['osc.mix', 'osc.morph', 'osc.syncTo', 'noise.color', 'noise.tone', 'ring'],
  ],
  [
    'pitch',
    'How often it repeats',
    [
      'osc.semi',
      'osc.kbd',
      'osc.fixedNote',
      'tune',
      'glide',
      'paraphonic',
      'oscAssign',
      'duo',
      'poly',
      'arp',
      'drift',
    ],
  ],
  ['width', 'Pulse width', ['osc.pw']],
  [
    'mix',
    'How much of each source',
    ['osc.level', 'noise.level', 'noise.gain', 'ext.level', 'preamp'],
  ],
  ['filter', 'What the filter takes off', ['filter', 'hpf', 'post']],
  ['amp', 'Swell and fall of each note', ['env1', 'env2', 'env3', 'vca', 'trig']],
  [
    'move',
    'Movement while you watch',
    ['lfo', 'lfo2', 'routes', 'cables', 'normals', 'wheel', 'sh', 'slew', 'att', 'envf'],
  ],
  ['dirt', 'Overdrive, chorus, echo and reverb', ['od', 'delay', 'rev', 'chorus']],
  ['level', 'Overall height', ['volume', 'a440']],
  ['other', 'Elsewhere in the voice', []],
];

/** `osc.0.mix.saw` → `osc.mix.saw`: the index of an oscillator does not change which part of the picture it is. */
const strip = (path: string) =>
  path
    .split('.')
    .filter((s) => !/^\d+$/.test(s))
    .join('.');

function stageOf(path: string): StageId {
  const p = strip(path);
  for (const [id, , prefixes] of STAGES) {
    if (prefixes.some((x) => p === x || p.startsWith(`${x}.`))) return id;
  }
  return 'other';
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null;

/** Every leaf parameter that differs between two EngineParams, as dotted paths. */
function diffPaths(a: unknown, b: unknown, prefix: string, out: Set<string>): void {
  if (a === b) return;
  if (!isObj(a) || !isObj(b)) {
    out.add(prefix);
    return;
  }
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  for (const k of keys) diffPaths(a[k], b[k], prefix ? `${prefix}.${k}` : k, out);
}

// A parameter that nothing can hear as the panel stands, because the part it belongs to is turned down or switched
// off: a control that changes only these is not shaping anything you can see. This is the cheap half of the test —
// the panel's "Dim unused parts" does the thorough one, by listening.
const GATES: [string[], (p: StoryParams) => boolean][] = [
  [['noise.color', 'noise.tone'], (p) => !(p.noise && p.noise.level > 0)],
  [['od.drive', 'od.tone', 'od.level'], (p) => !(p.od && p.od.on)],
  [['delay.time', 'delay.fb', 'delay.mix'], (p) => !(p.delay && p.delay.on)],
  [['rev.mix', 'rev.decay', 'rev.damp'], (p) => !(p.rev && p.rev.on)],
];

/** True if this parameter belongs to a source or a unit that is off, so changing it cannot show on the trace. */
function gated(path: string, p: StoryParams): boolean {
  const m = /^osc\.(\d+)\.(mix|pw|semi|kbd|fixedNote|syncTo)/.exec(path);
  if (m) {
    const o = (p.osc || [])[Number(m[1])];
    return !o || !(o.level > 0);
  }
  const q = strip(path);
  return GATES.some(
    ([leaves, off]) => leaves.some((x) => q === x || q.startsWith(`${x}.`)) && off(p)
  );
}

// ── the words ───────────────────────────────────────────────────────────────

const WAVES = ['saw', 'rsaw', 'pulse', 'tri', 'shark', 'sine', 'tmod'] as const;
const WAVE_WORD: Record<string, string> = {
  saw: 'a sawtooth',
  rsaw: 'a reverse sawtooth',
  tri: 'a triangle',
  shark: 'a triangle-saw',
  sine: 'a sine',
  tmod: 'a tone-modulated wave',
};
const pulseWord = (pw: number | undefined) =>
  Math.abs((pw == null ? 0.5 : pw) - 0.5) < 0.02 ? 'a square' : 'a pulse';

const COUNT = ['no', 'one', 'two', 'three', 'four', 'five', 'six'];
const count = (n: number) => COUNT[n] || String(n);
/** Each bit is a sentence of its own, and some of them start with a name the SynthDef supplied in lower case. */
const cap = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const sentences = (bits: (string | false | null | undefined)[]) =>
  bits
    .filter((b): b is string => !!b)
    .map(cap)
    .join(' ');

const hz = (f: number) =>
  f >= 1000 ? `${(f / 1000).toFixed(f < 10000 ? 2 : 1)} kHz` : `${Math.round(f)} Hz`;
const secs = (s: number) =>
  s < 0.01
    ? `${Math.round(s * 1000)} ms`
    : s < 1
      ? `${Math.round(s * 1000)} ms`
      : `${s.toFixed(2)} s`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const list = (xs: string[]) =>
  xs.length < 2 ? xs[0] || '' : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`;
const cents = (semi: number) => `${Math.round(Math.abs(semi) * 100)} cents`;

const oscName = (def: SynthDef, i: number) =>
  (def.signalNames && def.signalNames[`osc${i + 1}`]) || `oscillator ${i + 1}`;
const envName = (def: SynthDef, key: string) =>
  (def.signalNames && def.signalNames[key]) ||
  (key.startsWith('env1') ? 'envelope 1' : 'envelope 2');

/** A morphing oscillator (EngineParams `osc.morph`, the Kobol's WAVEFORM knob) at position m, in words. */
const morphWord = (m: number) =>
  m < 0.08
    ? 'a triangle wave'
    : m < 0.42
      ? 'a lopsided ramp, part way from triangle to sawtooth'
      : m < 0.58
        ? 'a sawtooth wave'
        : m < 0.64
          ? 'part way from sawtooth to square'
          : m < 0.7
            ? 'a square wave'
            : 'a narrowing pulse wave';

interface Source {
  i: number;
  o: OscParams;
  name: string;
  waves: string[];
  words: string[];
}

/** The oscillators that reach the mixer, with the waveforms each of them is putting out. */
function sources(def: SynthDef, p: StoryParams): Source[] {
  const out: Source[] = [];
  (p.osc || []).forEach((o, i) => {
    if (!o || !(o.level > 0)) return;
    if (o.morph != null) {
      out.push({ i, o, name: oscName(def, i), waves: ['morph'], words: [morphWord(o.morph)] });
      return;
    }
    const mix = o.mix || {};
    const waves = WAVES.filter((k) => (mix[k] ?? 0) > 0);
    if (!waves.length) return;
    out.push({
      i,
      o,
      name: oscName(def, i),
      waves: [...waves],
      words: waves.map((k) => (k === 'pulse' ? pulseWord(o.pw) : WAVE_WORD[k])),
    });
  });
  return out;
}

function shapeText(def: SynthDef, p: StoryParams): string {
  const src = sources(def, p);
  const noise = p.noise && p.noise.level > 0;
  if (!src.length && !noise)
    return 'Nothing is reaching the mixer, so the trace is a flat line. Turn an oscillator or the noise up.';
  const parts = src.map((s) => `${s.name} is ${list(s.words)}`);
  let text =
    src.length === 0
      ? ''
      : src.length === 1
        ? `One source is in the mixer: ${parts[0]}. Its shape is what you see, once the filter and the amplifier have had it.`
        : `${count(src.length)} sources are added together in the mixer — ${list(parts)} — so the trace is their sum, not any one of them.`;
  if (noise) {
    const kind =
      p.noise.tone != null
        ? p.noise.tone > 0.66
          ? 'white'
          : p.noise.tone < 0.33
            ? 'low'
            : 'pink'
        : p.noise.color || 'white';
    text += `${text ? ' ' : ''}${kind === 'low' ? 'low-frequency' : kind === 'pink' ? 'pink' : 'white'} noise is mixed in as well: it has no repeating shape, so it shows as fuzz on the line.`;
  }
  return cap(text);
}

function pitchText(def: SynthDef, p: StoryParams): string {
  const src = sources(def, p);
  if (!src.length) return '';
  const held = src.filter((s) => s.o.kbd !== false);
  const bits: string[] = [];
  if (held.length < src.length) {
    const fixed = src.filter((s) => s.o.kbd === false);
    bits.push(
      `${list(fixed.map((s) => s.name))} ${fixed.length === 1 ? 'ignores' : 'ignore'} the keyboard and ${fixed.length === 1 ? 'sits' : 'sit'} on a fixed pitch, so ${fixed.length === 1 ? 'that part of the trace' : 'those parts'} stays put as you play up the keyboard.`
    );
  }
  if (src.length > 1) {
    const semis = src.map((s) => s.o.semi || 0);
    const spread = Math.max(...semis) - Math.min(...semis);
    // The smallest gap between any two of them: a gap under a semitone is beating, and beating is the thing you see.
    let beat = 0;
    for (let i = 0; i < semis.length; i++) {
      for (let k = i + 1; k < semis.length; k++) {
        const d = Math.abs(semis[i] - semis[k]);
        if (d > 0 && d < 0.6 && (!beat || d < beat)) beat = d;
      }
    }
    if (spread === 0)
      bits.push(
        'every oscillator is on the same pitch, so their shapes line up and add into one steady wave.'
      );
    else if (Math.abs(spread - 12) < 0.6 || Math.abs(spread - 24) < 0.6)
      bits.push(
        `they span ${spread > 18 ? 'two octaves' : 'an octave'}, so the higher one puts a ripple inside each cycle of the lower one.`
      );
    else if (spread >= 0.6)
      bits.push(
        `they span ${Math.round(spread)} semitones, so the shape they add up to repeats over a longer stretch than any one of them alone.`
      );
    if (beat)
      bits.push(
        `two of them are only ${cents(beat)} apart: that is the slow swelling you see, the two shapes drifting in and out of step, adding up and then cancelling as they go.`
      );
  }
  const sync = src.find((s) => (s.o.syncTo ?? -1) >= 0);
  if (sync)
    bits.push(
      `${sync.name} is hard-synced: it is restarted by its master every cycle, so its shape is cut off part-way through and the trace keeps a fixed number of cycles across the screen however far you tune it.`
    );
  if (p.glide && p.glide.time > 0.01)
    bits.push(
      `glide is set to ${secs(p.glide.time)}, so after a new note the cycles take that long to settle at their new width.`
    );
  return sentences(bits);
}

function widthText(def: SynthDef, p: StoryParams): string {
  const src = sources(def, p).filter((s) => s.waves.includes('pulse'));
  if (!src.length) return '';
  const each = src.map((one) => `${one.name} at ${pct(one.o.pw == null ? 0.5 : one.o.pw)}`);
  return sentences([
    `${list(each)}: that is how much of each cycle the pulse spends high, the rest of it low.`,
    'At 50% it is a square, which has only odd harmonics; the further off 50% it goes, the thinner the pulse looks and the more harmonics come with it.',
  ]);
}

function mixText(def: SynthDef, p: StoryParams): string {
  const src = sources(def, p);
  const levels = src.map((s) => `${s.name} at ${pct(s.o.level)}`);
  if (p.noise && p.noise.level > 0) levels.push(`noise at ${pct(p.noise.level)}`);
  if (p.ext && p.ext.level > 0) levels.push(`the external input at ${pct(p.ext.level)}`);
  if (!levels.length) return '';
  const total = src.reduce((s, x) => s + x.o.level, 0) + (p.noise ? p.noise.level : 0);
  return sentences([
    `${list(levels)}.`,
    total > 1.2
      ? 'together that is more than the filter wants, so the peaks are being squashed flat — that is the overload, and it is part of the shape you see.'
      : levels.length === 1
        ? 'that is how much of it reaches the filter, and so how tall the trace is.'
        : 'that sets how much each one counts towards the height of the trace.',
  ]);
}

const MODE_WORD: Record<string, string | undefined> = {
  lp: 'low-pass',
  hp: 'high-pass',
  bp: 'band-pass',
  notch: 'set to a notch',
};

function filterText(def: SynthDef, p: StoryParams): string {
  const f = p.filter;
  if (!f) return '';
  // `morph` (the SEM's NOTCH knob) reads as whichever end it is nearer, or as a notch in the middle
  const morph = f.morph ?? NaN;
  const fm = f.mode === 'morph' ? (morph < 0.3 ? 'lp' : morph > 0.7 ? 'hp' : 'notch') : f.mode;
  const mode = MODE_WORD[fm] || fm;
  const kind = f.type === 'ladder' ? '24 dB ladder' : 'state-variable';
  const bits = [`The ${kind} filter is ${mode} at ${hz(f.cutoff)}.`];
  if (fm === 'lp')
    bits.push(
      'Every corner in the wave is made of high harmonics, so a low-pass setting rounds the corners off: the lower the cutoff, the rounder the trace.'
    );
  else if (fm === 'hp')
    bits.push(
      'A high-pass setting throws away the slow part of the wave, so the flat stretches sag back towards the middle line and only the edges survive.'
    );
  else if (fm === 'notch')
    bits.push(
      'A notch takes out a band of harmonics around the cutoff and keeps everything above and below it, so the trace keeps its outline but changes its detail as the notch moves.'
    );
  else
    bits.push(
      'A band-pass setting keeps a slice around the cutoff, so the trace tends towards a plain wave at that pitch.'
    );
  if (f.res >= 0.95)
    bits.push(
      `Resonance is at ${f.res.toFixed(2)} — at or past self-oscillation, so the filter is adding a tone of its own at the cutoff.`
    );
  else if (f.res > 0.25)
    bits.push(
      `Resonance is at ${f.res.toFixed(2)}: that is the ringing you see after each edge, a wobble at the cutoff pitch that dies away across the cycle.`
    );
  if (f.envAmt)
    bits.push(
      `${envName(def, f.envSrc || 'env1')} moves the cutoff by ${Math.abs(f.envAmt).toFixed(1)} octaves ${f.envAmt > 0 ? 'up' : 'down'} on each note, so hold a note and watch the corners ${f.envAmt > 0 ? 'sharpen and then soften' : 'soften'} as the envelope moves.`
    );
  if (p.hpf) bits.push(`there is also a high-pass stage before it, at ${hz(p.hpf.cutoff)}.`);
  return sentences(bits);
}

/** The envelope an EnvSignal names (`env1v` / `env2v` are the same envelopes scaled by velocity). */
const envFor = (p: StoryParams, src: string): EnvParams =>
  src.startsWith('env2') ? p.env2 : p.env1;

function ampText(def: SynthDef, p: StoryParams): string {
  const src = p.vca && p.vca.envSrc;
  // `env1v` / `env2v` are the same envelopes scaled by velocity
  const e = src && src !== 'none' ? envFor(p, src) : null;
  const bits: string[] = [];
  if (e && src) {
    bits.push(
      `${envName(def, src)} sets the height of the trace over time: attack ${secs(e.a)}, decay ${secs(e.d)}, sustain ${pct(e.s)}, release ${secs(e.r)}.`
    );
    bits.push(
      e.a > 0.15
        ? 'The attack is slow enough to watch: press a key and the wave grows from nothing to full height over that time.'
        : 'The attack is short, so the wave is at full height almost as soon as you press a key.'
    );
    if (e.s === 0)
      bits.push(
        'Sustain is at zero, so the trace falls back to a flat line while the key is still down.'
      );
  }
  if (p.vca && p.vca.bias > 0)
    bits.push(
      `The amplifier is held ${pct(p.vca.bias)} open with no key down (a drone), so there is a trace on screen even when you are not playing.`
    );
  if (p.trig && p.trig.repeat)
    bits.push('the envelopes are being retriggered by the LFO, so the height pulses on its own.');
  return sentences(bits);
}

/** Every modulation routing with a depth, panel routings and cables together, back out of the keyed form. */
function routings(p: StoryParams): { src: string; dst: string; amt: number }[] {
  const sum: Record<string, number> = {};
  [p.routes, p.cables].forEach((m) =>
    Object.entries(m || {}).forEach(([k, amt]) => {
      sum[k] = (sum[k] || 0) + amt;
    })
  );
  return Object.entries(sum)
    .filter(([, amt]) => amt)
    .map(([k, amt]) => {
      const [src, dst] = k.split('>');
      return { src, dst, amt };
    });
}

const LFO_WORD: Record<string, string | undefined> = {
  tri: 'triangle',
  saw: 'sawtooth',
  rsaw: 'reverse sawtooth',
  sq: 'square',
  sine: 'sine',
};
const MOVED: Record<string, string | undefined> = {
  pitchAll: 'pitch',
  pitch1: 'pitch',
  pitch2: 'pitch',
  pitch3: 'pitch',
  pw1: 'pulse width',
  pw2: 'pulse width',
  pw3: 'pulse width',
  cutoff: 'the filter cutoff',
  res: 'resonance',
  amp: 'loudness',
};

function moveText(_def: SynthDef, p: StoryParams): string {
  const bits: string[] = [];
  const routes = routings(p);
  const lfoUsed = routes.some((r) => /^lfo/.test(r.src));
  if (p.lfo && lfoUsed) {
    const shapes = Object.entries(p.lfo.mix || {})
      .filter(([, g]) => (g ?? 0) > 0)
      .map(([k]) => LFO_WORD[k] || k);
    bits.push(
      `The LFO is running at ${p.lfo.rate.toFixed(2)} Hz${shapes.length ? ` on ${list(shapes)}` : ''}. At that rate the trace takes about ${secs(1 / p.lfo.rate)} to go through one sweep, so let the note run and watch it move rather than trying to read it from a still picture.`
    );
  }
  const named = [...new Set(routes.map((r) => MOVED[r.dst]).filter((x): x is string => !!x))];
  if (named.length)
    bits.push(
      `${list(named)} ${named.length > 1 ? 'are' : 'is'} being moved as the note plays, not just set once, so the picture does not sit still.`
    );
  if ((p.wheel ?? 0) > 0.02)
    bits.push(
      `the mod wheel is up at ${pct(p.wheel ?? 0)}, so whatever it feeds is part of what you see.`
    );
  if (!bits.length)
    return 'Nothing is modulating the voice, so the trace stands still for as long as the note is held.';
  return sentences(bits);
}

function dirtText(_def: SynthDef, p: StoryParams): string {
  const bits: string[] = [];
  if (p.od && p.od.on)
    bits.push(
      `The overdrive is on with drive at ${pct(p.od.drive ?? NaN)}: it flattens the peaks, which squares the trace off and adds the harmonics that come with a hard corner.`
    );
  if (p.delay && p.delay.on)
    bits.push(
      `The echo is on (${secs(p.delay.time ?? NaN)}, ${pct(p.delay.mix ?? NaN)} mix): each repeat lands on top of what is already there, so the wave does not repeat exactly.`
    );
  if (p.rev && p.rev.on)
    bits.push(
      `the spring reverb is on at ${pct(p.rev.mix)}, which adds a wash that shows as a thickening of the line.`
    );
  return sentences(bits);
}

function levelText(_def: SynthDef, p: StoryParams): string {
  if (p.volume == null) return '';
  return `Output volume is at ${pct(p.volume)}. It scales the whole trace up and down without changing its shape — turn it up for a clearer picture, not a different sound.`;
}

const TEXT: Record<StageId, (def: SynthDef, p: StoryParams) => string> = {
  shape: shapeText,
  pitch: pitchText,
  width: widthText,
  mix: mixText,
  filter: filterText,
  amp: ampText,
  move: moveText,
  dirt: dirtText,
  level: levelText,
  other: () => '',
};

// ── who is responsible ──────────────────────────────────────────────────────

/** The moves that ask "does this control matter?": a slight adjustment each way, or the other positions of a switch. */
function movesOf(c: Control, cur: ControlValue | undefined): [ControlValue[], ControlValue[]] {
  if (c.kind === 'cont') {
    const n = Number(cur);
    const span = c.max - c.min;
    const near = [n - span * NUDGE, n + span * NUDGE]
      .filter((x) => x >= c.min && x <= c.max)
      .map(round);
    const ends = [c.max, c.min].filter((x) => x !== cur);
    return [near, ends];
  }
  if (c.kind === 'bool') return [[!cur], []];
  return [c.options.map((o) => o.v).filter((x) => x !== cur), []];
}

/** One control, cable or the mod wheel, listed under a stage. */
export interface StoryEntry {
  key: string;
  kind: 'control' | 'cable' | 'wheel';
  name: string;
  value: string;
  module: SynthModule;
}

type Filed = Partial<Record<StageId, StoryEntry[]>>;

/**
 * Which controls, cables and the mod wheel shape which part of the picture.
 * → { on: { stageId: [entry] }, zero: { stageId: [entry] } } with entry = { key, name, value, module }.
 * `on` is in the picture now; `zero` can be heard if it is moved, but as it stands everything it feeds is zero or off.
 * A control whose every move leaves the engine parameters alone is left out altogether — it has nothing to do with this trace.
 */
function attribute(
  def: SynthDef,
  values: ControlValues,
  cables: CableLike[],
  wheel: number,
  base: StoryParams
): { on: Filed; zero: Filed } {
  const baseJson = JSON.stringify(base);
  const on: Filed = {};
  const zero: Filed = {};
  const file = (entry: StoryEntry, stages: StageId[], state: 'on' | 'zero') => {
    const into = state === 'zero' ? zero : on;
    stages.forEach((s) => {
      (into[s] = into[s] || []).push(entry);
    });
  };
  const test = (variants: (() => StoryParams)[]) => {
    const paths = new Set<string>();
    let live = false;
    let fromZero = true;
    for (const make of variants) {
      let p: StoryParams;
      try {
        p = make();
      } catch {
        continue;
      }
      if (JSON.stringify(p) === baseJson) continue;
      live = true;
      diffPaths(base, p, '', paths);
      if (!onlyFromZero(base, p)) fromZero = false;
    }
    const heard = [...paths].filter((x) => !gated(x, base));
    return { live: live && heard.length > 0, fromZero, stages: [...new Set(heard.map(stageOf))] };
  };

  for (const c of def.controls) {
    if (c.ui) continue;
    const cur = values[c.id];
    const [near, ends] = movesOf(c, cur);
    const withValue = (x: ControlValue) => () =>
      engineOf(def, { ...values, [c.id]: x }, cables, wheel);
    let r = test(near.map(withValue));
    // A control that a slight adjustment does not move at all (a two-position knob, a stepped switch): try its ends.
    if (!r.live && ends.length) r = test(ends.map(withValue));
    if (!r.live) continue;
    // A many-position switch is never "off": a position that happens to feed the engine a 0 is still a choice.
    const state = c.kind !== 'enum' && r.fromZero ? 'zero' : 'on';
    file(
      {
        key: c.id,
        kind: 'control',
        name: displayName(def, c),
        value: formatValue(c, cur),
        module: c.module,
      },
      r.stages,
      state
    );
  }

  const jm = jackMap(def);
  cables.forEach((cb) => {
    const r = test([
      () =>
        engineOf(
          def,
          values,
          cables.filter((x) => x !== cb),
          wheel
        ),
    ]);
    if (!r.live) return;
    const from = jm[cb.from];
    const to = jm[cb.to];
    const name = `${(from && (from.name || cleanLabel(from))) || cb.from} → ${(to && (to.name || cleanLabel(to))) || cb.to}`;
    file(
      { key: `${cb.from}>${cb.to}`, kind: 'cable', name, value: 'patched', module: 'patch' },
      r.stages,
      'on'
    );
  });

  const wheelTest = test([() => engineOf(def, values, cables, wheel > 0.5 ? 0 : 1)]);
  if (wheelTest.live)
    file(
      { key: WHEEL, kind: 'wheel', name: 'Mod wheel', value: pct(wheel), module: 'mod' },
      wheelTest.stages,
      wheel > 0.02 ? 'on' : 'zero'
    );

  return { on, zero };
}

const byName = (a: StoryEntry, b: StoryEntry) => a.name.localeCompare(b.name);

/** One stage of the story: what this part of the picture is, and who is shaping it. */
export interface StoryStage {
  id: StageId;
  title: string;
  text: string;
  on: StoryEntry[];
  zero: StoryEntry[];
}

/** Everything the scope panel says in words. `error` is set (and `stages` empty) when the panel cannot be read. */
export interface WaveStory {
  error: string;
  stages: StoryStage[];
  cutoff: number | null;
}

/**
 * Everything the scope panel says in words: what the picture is, and stage by stage what makes it look like that
 * and which controls are doing it. Pure, and cheap enough to run whenever the panel changes (no audio is rendered).
 */
export function waveStory(
  def: SynthDef,
  values: ControlValues,
  cables: CableLike[],
  wheel: number
): WaveStory {
  let base: StoryParams;
  try {
    base = engineOf(def, values, cables, wheel);
  } catch (err) {
    return { error: err instanceof Error ? err.message : String(err), stages: [], cutoff: null };
  }
  const { on, zero } = attribute(def, values, cables, wheel, base);
  const stages = STAGES.map(([id, title]) => {
    const text = TEXT[id](def, base);
    const onList = (on[id] || []).sort(byName);
    const zeroList = (zero[id] || []).sort(byName);
    return { id, title, text, on: onList, zero: zeroList };
  }).filter((s) => s.text);
  return {
    error: '',
    stages,
    cutoff: base.filter ? base.filter.cutoff : null,
  };
}

/** The note name nearest a frequency, with how far off it is. → { name: 'A2', cents: -12 } or null. */
const NOTES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'B♭', 'B'];
export function noteAt(freq: number | null | undefined): { name: string; cents: number } | null {
  if (!freq || freq < 20 || freq > 8000) return null;
  const midi = 69 + 12 * Math.log2(freq / 440);
  const near = Math.round(midi);
  return {
    name: `${NOTES[((near % 12) + 12) % 12]}${Math.floor(near / 12) - 1}`,
    cents: Math.round((midi - near) * 100),
  };
}
