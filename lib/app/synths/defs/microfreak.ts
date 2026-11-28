/**
 * Arturia MicroFreak: the definition. Positions are pixels on the owner's photo of the synth from above,
 * `.context/app/synth-data/microfreak/raw/microfreak.jpg` (1280 × 960, local only), turned into view units by X() / Y()
 * (doubled, offset to the faceplate's top-left corner). The data model is the owner's spec,
 * `.context/app/synth-data/microfreak/microfreak.synth.json` (0.13.0): 18 modules, 123 parameters, 90 connections.
 *
 * The drawing stops under the touch icons. The 25 keys below them are left out: they only play notes, which the app's
 * keyboard under the panel does. What the touch plate has of its own (the Hold and arpeggiator icons, Spice, Dice and
 * Bend, and the strip) is drawn. The decorated band between the panel and the icons, which holds only the maker's
 * mark, is in the full drawing and cut from the compact one the synth opens in.
 *
 * Engine notes. The one digital oscillator is engine oscillator 1; with Paraphonic lit it is four (`oscAssign` with a
 * copy of the VCA's envelope for each note, t-332), one per key, through the one filter. The Chords model plays four at
 * fixed intervals instead, and so turns paraphony off, as on the hardware. Six of the twelve models are the macro
 * oscillator (`mix.macro`, t-331): Wavetable, Harmo, KarplusStr, Formant, Speech and Modal. The other six are built
 * from the engine's shapes (`modelOsc()`): BasicWaves from the pulse, saw and two-saw shapes with the square sub,
 * SuperWave from the super saw, V.Analog from a narrowing pulse and a triangle-to-saw blend, Waveshaper from the
 * folded triangle and saw, Two Op.FM from the two-operator phase modulation, and Chords from four oscillators. What
 * each of those leaves out is said in the knob's help and in the notes.
 *
 * The envelope is Envelope 1: the filter's (Filter Amt) and, with Amp Mod lit, the VCA's; Decay/Rel is its decay and
 * release. With Amp Mod off the VCA follows the key gate, which is Envelope 3 here (a click-free gate). The cycling
 * envelope is Envelope 2: in Env mode a rise, a sustain at Hold/Sustain and a fall, curved by Rise and Fall Shape; in
 * Run and Loop it cycles (`loopAll`, so Hold is a time at the top), freely in Run and from each note in Loop, with its
 * gate held open. The matrix is `routes`: five sources, four fixed destinations and three Assign columns.
 *
 * The spec gives no times for the cycling envelope, no arpeggiator BPM range and no matrix depths (`not_in_source`), so
 * every such range here is this app's choice, set where it is used. Knob values are the spec's 0–100 and the matrix's
 * −100 to 100 (`modelling_gaps`: the manual gives the display scales only through examples). The sequencer, Spice and
 * Dice, the presets and the Utility menus are drawn and explained but not modelled.
 */
import type {
  Area,
  Control,
  ControlCommon,
  ControlOption,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  KnobControl,
  LedColor,
  LfoMix,
  LitWhen,
  MacroOscParams,
  OscParams,
  PanelMark,
  SeqButton,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

// ── Ranges and tapers (this app's choice unless noted: the spec gives none) ─
/** Glide: off at 0, then 5 ms to the spec's 10 s. */
const glideTime = (v: number): number => (v <= 0 ? 0 : expMap(v / 100, 0.005, 10));
/** Cutoff: the spec's about 30 Hz to above 15 kHz. */
const cutoffHz = (v: number): number => expMap(v / 100, 30, 16000);
/** Resonance: self-oscillating at full, as the spec says. */
const resAmt = (v: number): number => (clamp(v, 0, 100) / 100) * 1.05;
/** Filter Amt: the envelope's sweep at ±100, in octaves. */
const FILTER_AMT_OCT = 7;
/** Envelope attack: the spec's 0 ms to 10 s. */
const attackTime = (v: number): number => expMap(v / 100, 0.001, 10);
/** Envelope decay and release: the spec's 0 ms to 13 s. */
const decayTime = (v: number): number => expMap(v / 100, 0.003, 13);
/** Cycling envelope Rise and Fall: 1 ms (an audio-rate cycle) to 10 s. */
const cycTime = (v: number): number => expMap(v / 100, 0.001, 10);
/** Cycling envelope Hold in Run and Loop: none at 0, then 1 ms to 10 s at the top. */
const holdTime = (v: number): number => (v <= 0 ? 0 : expMap(v / 100, 0.001, 10));
/** Rise and Fall Shape, −50 (log) .. 50 (exp), as an engine curve: 0.5 is straight. */
const curveOf = (v: number): number => 0.5 + (clamp(v, -50, 50) / 50) * 0.42;
/** LFO free rate: the spec's 0.06 to 100 Hz. */
const lfoHz = (v: number): number => expMap(v / 100, 0.06, 100);
/** The arpeggiator's free tempo: 20 to 220 BPM, 120 at the centre (the spec's default). */
const arpBpm = (v: number): number => 20 + clamp(v, 0, 100) * 2;
/** The tempo synced rates divide when nothing else sets it: the MicroFreak's default, 120 BPM. */
const CLOCK_BPM = 120;
/** Each oscillator's level into the filter. */
const OSC_LEVEL = 0.6;
/** The Chords model's four oscillators, each. */
const CHORD_LEVEL = 0.3;
/** How far the pitch wheel (the touch strip's Bend) bends: the spec's default Bend Range, 12 semitones each way. */
const BEND_RANGE = 12;

// Matrix depths at ±100 for a source at full (an envelope at its top, the LFO at its peak, full velocity).
/** Pitch: two octaves. */
const MX_PITCH_SEMI = 24;
/** Cutoff: the whole range, about nine octaves. */
const MX_CUTOFF_OCT = 9;
/** Resonance: the whole knob. */
const MX_RES = 1.05;
/** LFO rate: five octaves. */
const MX_LFO_OCT = 5;
/** Decay/Rel: four octaves of time, longer for a positive amount. */
const MX_DECAY_OCT = 4;
/**
 * Key/Arp is the key's distance from middle C. At 100 it adds an octave per octave to the pitch (b03: it scales the
 * built-in tracking), tracks the cutoff and the LFO rate an octave per octave, and moves anything else half its range
 * per octave.
 */
const KEY_PER_OCT = 0.5;

const OX = 55,
  OY = 38; // photo pixel of the view's top-left corner
const K = 2;
const X = (x: number): number => (x - OX) * K;
const Y = (y: number): number => (y - OY) * K;
/** The photo's bottom edge of the panel, the top and bottom of the decorated band, and the bottom of the touch row. */
const PANEL_BOTTOM = 469;
const TOUCH_TOP = 516;
const BOTTOM = 584;
const RIGHT = 1236;

const controls: Control[] = [];
const decor: Decor[] = [];
const marks: PanelMark[] = [];
const INK = '#ecebf1';
const PANEL = '#2b2a2f';
const ORANGE = '#ee8a3e';
const ICON = '#d8772f';
const BLUE = '#79bdf0';
const DARK_CAP = '#323137';
const WINDOW = '#121114';

type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'anchor' | 'rotate' | 'brand' | 'hw'>>;
type Common = Omit<ControlCommon, 'id' | 'x' | 'y'>;

// ── Drawing helpers (photo pixels in, view units out) ──────────────────────
const text = (x: number, y: number, t: string, size = 22, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y) + size * 0.36,
    text: t,
    size,
    anchor: 'middle',
    weight: 600,
    ...rest,
  });
};
const line = (x1: number, y1: number, x2: number, y2: number, w = 3, stroke?: string): void => {
  decor.push({
    t: 'line',
    x1: X(x1),
    y1: Y(y1),
    x2: X(x2),
    y2: Y(y2),
    w,
    ...(stroke ? { stroke } : {}),
  });
};
const led = (x: number, y: number, color: LedColor, litWhen?: LitWhen, r = 5): void => {
  decor.push({ t: 'led', x: X(x), y: Y(y), r, color, ...(litWhen ? { litWhen } : {}) });
};
/** The printed ring round a knob, open at the bottom. */
const ring = (x: number, y: number, r: number): void => {
  decor.push({ t: 'arc', x: X(x), y: Y(y), r: r * K, a0: -142, a1: 142, w: 3 });
};
/** A section heading over its rule. */
const heading = (x0: number, x1: number, y: number, t: string): void => {
  decor.push({
    t: 'rect',
    x: X(x0),
    y: Y(y) - 3,
    w: (x1 - x0) * K,
    h: 6,
    r: 3,
    fill: INK,
  });
  text((x0 + x1) / 2, y - 10, t, 26, { weight: 700 });
};
/** A round button's printed bezel: the app draws the button square inside it. */
const bezel = (x: number, y: number, r: number, stroke = '#55545b'): void => {
  decor.push({ t: 'circle', x: X(x), y: Y(y), r: r * K, fill: '#1c1b1f', stroke, sw: 3 });
};
/** A touch icon's orange outline on the plate. */
const iconBox = (cx: number, cy = 545): void => {
  decor.push({
    t: 'rect',
    x: X(cx - 23.5),
    y: Y(cy - 23.5),
    w: 47 * K,
    h: 47 * K,
    r: 8,
    stroke: ICON,
    sw: 3,
    fill: 'none',
  });
};

type KnobRest = Common & {
  min?: number;
  max?: number;
  def?: number;
  step?: number;
  fmt?: (v: number, values?: ControlValues) => string;
  style?: KnobControl['style'];
  cap?: string;
};
const knob = (id: string, x: number, y: number, r: number, label: string, rest: KnobRest): void => {
  const {
    min = 0,
    max = 100,
    def = 0,
    step = 1,
    fmt,
    style = 'solar',
    cap = DARK_CAP,
    ...common
  } = rest;
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r: r * K,
    style,
    ...(style === 'solar' ? { cap } : {}),
    kind: 'cont',
    min,
    max,
    def,
    step,
    ...(fmt ? { fmt } : {}),
    label,
    labelPos: 'none',
    ...common,
  });
};
/** A square button standing in for the hardware's round one, inside its printed bezel. */
const button = (
  id: string,
  x: number,
  y: number,
  rest: Common &
    (
      | { kind: 'bool'; def: boolean }
      | { kind: 'enum'; options: ControlOption[]; def: string | number }
    ) & {
      lamp?: 'white' | 'blue';
      always?: boolean;
      size?: number;
    }
): void => {
  const { lamp, always, size = 15, ...common } = rest;
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: size * K,
    h: size * K,
    ...(lamp ? { lamp } : {}),
    ...(always ? { lit: 'always' as const } : {}),
    labelPos: 'none',
    ...common,
  });
};
const label = (x: number, y: number, t: string, size = 22): void => text(x, y, t, size);

// ── The twelve oscillator models ───────────────────────────────────────────
type Model =
  | 'basicwaves'
  | 'superwave'
  | 'wavetable'
  | 'harmo'
  | 'karplusstr'
  | 'v_analog'
  | 'waveshaper'
  | 'two_op_fm'
  | 'formant'
  | 'chords'
  | 'speech'
  | 'modal';
/** In the manual's order, with the names Wave, Timbre and Shape take in each (the spec's `osc.type` values). */
const MODELS: { v: Model; label: string; params: [string, string, string] }[] = [
  { v: 'basicwaves', label: 'BasicWaves', params: ['Morph', 'Sym', 'Sub'] },
  { v: 'superwave', label: 'SuperWave', params: ['Wave', 'Detune', 'Volume'] },
  { v: 'wavetable', label: 'Wavetable', params: ['Table', 'Position', 'Chorus'] },
  { v: 'harmo', label: 'Harmo', params: ['Content', 'Sculpting', 'Chorus'] },
  { v: 'karplusstr', label: 'KarplusStr', params: ['Bow', 'Position', 'Decay'] },
  { v: 'v_analog', label: 'V.Analog', params: ['Detune', 'Shape', 'Wave'] },
  { v: 'waveshaper', label: 'Waveshaper', params: ['Wave', 'Amount', 'Asym'] },
  { v: 'two_op_fm', label: 'Two Op.FM', params: ['Ratio', 'Amount', 'Feedback'] },
  { v: 'formant', label: 'Formant', params: ['Interval', 'Formant', 'Shape'] },
  { v: 'chords', label: 'Chords', params: ['Type', 'Inv/Transp', 'Waveform'] },
  { v: 'speech', label: 'Speech', params: ['Type', 'Timbre', 'Word'] },
  { v: 'modal', label: 'Modal', params: ['Inharm', 'Timbre', 'Decay'] },
];
const modelOf = (v: ControlValues): (typeof MODELS)[number] =>
  MODELS.find((m) => m.v === v['osc.type']) || MODELS[0];
/** The six models the macro oscillator plays, by its own model names. */
const MACRO: Partial<Record<Model, MacroOscParams['model']>> = {
  wavetable: 'wavetable',
  harmo: 'harmo',
  karplusstr: 'pluck',
  formant: 'formant',
  speech: 'speech',
  modal: 'modal',
};
/** Two Op.FM's Wave: the modulator's ratio to the carrier, in steps. */
const FM_RATIOS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5, 6, 7, 8];
/** SuperWave's Wave: the waveform it multiplies, a quarter of the turn each. */
const SUPER_WAVES = ['saw', 'square', 'triangle', 'sine'] as const;
/** The Chords model's chord types (Wave), as semitones above the root. The voicings are this app's. */
const CHORDS: { name: string; notes: number[] }[] = [
  { name: 'Oct', notes: [0, 12, 0, 12] },
  { name: '5th', notes: [0, 7, 12, 19] },
  { name: 'sus4', notes: [0, 5, 7, 12] },
  { name: 'm', notes: [0, 3, 7, 12] },
  { name: 'm7', notes: [0, 3, 7, 10] },
  { name: 'm9', notes: [0, 3, 10, 14] },
  { name: 'm11', notes: [0, 3, 10, 17] },
  { name: '6/9', notes: [0, 2, 9, 16] },
  { name: 'M9', notes: [0, 4, 11, 14] },
  { name: 'M7', notes: [0, 4, 7, 11] },
  { name: 'M', notes: [0, 4, 7, 12] },
];
const pick = <T>(list: readonly T[], t: number): T =>
  list[Math.min(list.length - 1, Math.floor(clamp(t, 0, 1) * list.length))];
/** Timbre on Chords: how many times the lowest note moves up an octave (inversions, climbing on into transpositions). */
const chordNotes = (wave: number, timbre: number): number[] => {
  const notes = pick(CHORDS, wave).notes.slice();
  const turns = Math.min(7, Math.floor(clamp(timbre, 0, 1) * 8));
  for (let i = 0; i < turns; i++) {
    const lo = notes.indexOf(Math.min(...notes));
    notes[lo] += 12;
  }
  return notes;
};

/** What Wave, Timbre or Shape reads in the display for this model, for the knobs' readouts. */
const modelReadout = (m: (typeof MODELS)[number], i: 0 | 1 | 2, t: number): string => {
  if (m.v === 'chords' && i === 0) return pick(CHORDS, t).name;
  if (m.v === 'superwave' && i === 0) return pick(SUPER_WAVES, t);
  if (m.v === 'two_op_fm' && i === 0) return `ratio ${pick(FM_RATIOS, t)}`;
  return m.params[i];
};

/**
 * One engine oscillator playing the model at Wave, Timbre and Shape (0..1 each). The macro models are the macro
 * oscillator; the rest are built from the engine's shapes, reasoned from the manual's one line on each (the spec's
 * `osc.type` meanings):
 * - BasicWaves: Wave morphs square → saw (the middle) → two saws; Timbre is the square's width and the second saw's
 *   phase; Shape adds the sub an octave down (a square here; the hardware's is a sine).
 * - SuperWave: the super saw, Timbre its detune and Shape the copies' level. Wave picks the waveform multiplied, and
 *   only the saw is multiplied here: the square, triangle and sine play once.
 * - V.Analog: a pulse narrow at 0 and square by half-way on Timbre, with a triangle that becomes a saw on Shape.
 *   Wave's detune between the two and Timbre's hard-sync top half are not modelled.
 * - Waveshaper: the folded triangle turning into the folded saw on Wave, Timbre the fold, Shape the triangle's lean.
 * - Two Op.FM: Wave steps the ratio, Timbre is the index, Shape the modulator's feedback.
 */
function modelOsc(model: Model, w: number, t: number, s: number, semi: number): OscParams {
  const base = { level: OSC_LEVEL, semi, pw: 0.5, syncTo: -1 };
  const macro = MACRO[model];
  if (macro)
    return { ...base, mix: { macro: 1 }, macro: { model: macro, wave: w, timbre: t, shape: s } };
  switch (model) {
    case 'superwave': {
      const wave = pick(SUPER_WAVES, w);
      if (wave === 'saw') return { ...base, mix: { ssaw: 1 }, ssDetune: t, ssMix: s };
      return {
        ...base,
        mix: wave === 'square' ? { pulse: 1 } : wave === 'triangle' ? { tri: 1 } : { sine: 1 },
      };
    }
    case 'v_analog': {
      const sh = clamp(s, 0, 1);
      return {
        ...base,
        mix: { pulse: 0.5, tri: 0.6 * (1 - sh), saw: 0.5 * sh },
        pw: 0.05 + 0.45 * Math.min(1, clamp(t, 0, 1) * 2),
      };
    }
    case 'waveshaper': {
      const ww = clamp(w, 0, 1);
      return {
        ...base,
        mix: { tfold: 1 - ww, sfold: ww },
        fold: clamp(t, 0, 1),
        skew: 0.5 + 0.45 * clamp(s, 0, 1),
      };
    }
    case 'two_op_fm':
      return {
        ...base,
        mix: { vpm: 1 },
        vpm: {
          carrier: 'sine',
          ratio: pick(FM_RATIOS, w),
          depth: clamp(t, 0, 1),
          fb: clamp(s, 0, 1),
        },
      };
    default: {
      // BasicWaves (and Chords' waves, which `chordOscs()` builds)
      const ww = clamp(w, 0, 1);
      const up = ww > 0.5 ? (ww - 0.5) * 2 : 0;
      const down = ww < 0.5 ? (0.5 - ww) * 2 : 0;
      return {
        ...base,
        mix: { pulse: down, saw: 1 - up - down, tmod: up, sub: clamp(s, 0, 1) * 0.8 },
        pw: 0.5 + 0.45 * clamp(t, 0, 1),
      };
    }
  }
}
/** Chords: four oscillators at the chord's notes, Shape morphing their wave from saw to square to triangle. */
function chordOscs(w: number, t: number, s: number): OscParams[] {
  const sh = clamp(s, 0, 1);
  const a = sh < 0.5 ? sh * 2 : 1;
  const b = sh > 0.5 ? (sh - 0.5) * 2 : 0;
  const mix = { saw: 1 - a, pulse: a - b, tri: b * 1.2 };
  return chordNotes(w, t).map((semi) => ({ level: CHORD_LEVEL, semi, pw: 0.5, syncTo: -1, mix }));
}
/**
 * Where the matrix's Wave, Timbre and Shape go for a model, and how far a full-scale route moves the value there: the
 * macro oscillator's own destinations, or the pulse-width destination where the model's setting rides it. A model
 * with nothing to move for a setting returns null, and its routes are dropped.
 */
function paramDest(
  model: Model,
  i: 0 | 1 | 2,
  w: number
): { dst: 'macro' | 'pw'; scale: number } | null {
  if (MACRO[model]) return { dst: 'macro', scale: 1 };
  if (i !== 1) return null;
  switch (model) {
    case 'basicwaves':
      return { dst: 'pw', scale: 0.45 };
    case 'superwave':
      return pick(SUPER_WAVES, w) === 'saw' ? { dst: 'pw', scale: 1 } : null;
    case 'v_analog':
      return { dst: 'pw', scale: 0.9 };
    case 'waveshaper':
    case 'two_op_fm':
      return { dst: 'pw', scale: 1 };
    default:
      return null;
  }
}
const MACRO_DEST = ['mWave', 'mTimbre', 'mShape'] as const;

// ── The faceplate ──────────────────────────────────────────────────────────
// The decorated band between the panel and the touch plate, with the maker's wordmark in it.
decor.push({
  t: 'rect',
  x: 0,
  y: Y(PANEL_BOTTOM),
  w: (RIGHT - OX) * K,
  h: (TOUCH_TOP - PANEL_BOTTOM) * K,
  fill: 'url(#kysPatWaves)',
  hw: true,
});
text(645, 492, 'ARTURIA', 40, { weight: 700, brand: true });
// the touch plate under the icons
decor.push({
  t: 'rect',
  x: 0,
  y: Y(TOUCH_TOP),
  w: (RIGHT - OX) * K,
  h: (BOTTOM - TOUCH_TOP) * K,
  fill: '#2f2e33',
  hw: true,
});

// ── The matrix ─────────────────────────────────────────────────────────────
const SOURCES = [
  { k: 'cycenv', label: 'CycEnv', name: 'CycEnv', y: 124 },
  { k: 'env', label: 'Env', name: 'Env', y: 139 },
  { k: 'lfo', label: 'LFO', name: 'LFO', y: 154 },
  { k: 'press', label: 'Press', name: 'Press', y: 169 },
  { k: 'key', label: 'Key / Arp', name: 'Key/Arp', y: 184 },
] as const;
const DESTS = [
  { k: 'pitch', label: 'Pitch', x: 142.7 },
  { k: 'wave', label: 'Wave', x: 181 },
  { k: 'timbre', label: 'Timbre', x: 219.3 },
  { k: 'cutoff', label: 'Cutoff', x: 257.7 },
  { k: 'assign1', label: 'Assign 1', x: 296 },
  { k: 'assign2', label: 'Assign 2', x: 334.3 },
  { k: 'assign3', label: 'Assign 3', x: 372.7 },
] as const;
type SourceKey = (typeof SOURCES)[number]['k'];
type DestKey = (typeof DESTS)[number]['k'];
const SOURCE_SAYS: Record<SourceKey, string> = {
  cycenv: 'the cycling envelope, at its Amount',
  env: 'the envelope',
  lfo: 'the LFO',
  press: 'Press (here the key’s velocity, as with the hardware’s Press mode on Velocity)',
  key: 'Key/Arp, the played key’s distance from middle C',
};
const DEST_SAYS: Record<DestKey, string> = {
  pitch: 'the oscillator’s pitch',
  wave: 'Wave',
  timbre: 'Timbre',
  cutoff: 'the filter’s cutoff',
  assign1: 'whatever Assign 1 is set to',
  assign2: 'whatever Assign 2 is set to',
  assign3: 'whatever Assign 3 is set to',
};
for (const s of SOURCES) {
  line(117, s.y, 386, s.y, 2.5, '#bdbcc3');
  text(113, s.y, s.label, 18, { anchor: 'end' });
}
for (const d of DESTS) {
  line(d.x - 19, 184, d.x - 19, 111, 2.5, '#bdbcc3');
  line(d.x - 19, 111, d.x + 17, 79, 2.5, '#bdbcc3');
  text(d.x + 3, 96, d.label, 17, { rotate: -48, weight: 700 });
}
line(386, 124, 386, 184, 2.5, '#bdbcc3');
line(386, 136, 432, 136, 2.5, '#bdbcc3');
// The grid is lamps, as on the hardware: a point lights while its amount is not 0. The Env > Cutoff point is Filter
// Amt, so its lamp lights while that knob is off the centre.
const pointId = (s: SourceKey, d: DestKey): string =>
  s === 'env' && d === 'cutoff' ? 'env.filter_amt' : `mx.${s}.${d}`;
const POINTS: ControlOption[] = [];
for (const s of SOURCES)
  for (const d of DESTS) {
    led(d.x, s.y, 'white', { id: pointId(s.k, d.k), eq: 0, not: true }, 7);
    POINTS.push({
      v: `${s.k}.${d.k}`,
      label: `${s.name} > ${d.label}`,
      x: X(d.x),
      y: Y(s.y),
      point: pointId(s.k, d.k),
    });
  }
// Which point the Matrix encoder sets: the hardware's blinking cursor. A click on a point picks it, and switches it on
// (at +50) when it is off or off when it is already picked and on.
controls.push({
  id: 'mx.sel',
  type: 'select',
  x: X(257.7),
  y: Y(154),
  w: 26,
  h: 26,
  kind: 'enum',
  options: POINTS,
  def: 'cycenv.pitch',
  matrix: { on: 50 },
  ui: true,
  label: 'Matrix point',
  labelPos: 'none',
  module: 'mod',
  help: 'The 35 points of the matrix, each linking a source on the left to a destination along the top; a lit point is in use. Click an unlit point to switch it on at +50, click a lit one to pick it, and click the picked one again to switch it off. The Matrix encoder sets the picked point’s amount.',
});
// The Matrix encoder: the picked point's amount, from −100 to +100. Each point's amount is its own control, shown
// on the encoder while that point is picked. Env > Cutoff is Filter Amt, which keeps its own knob.
for (const s of SOURCES)
  for (const d of DESTS) {
    if (s.k === 'env' && d.k === 'cutoff') continue;
    controls.push({
      id: `mx.${s.k}.${d.k}`,
      type: 'knob',
      x: X(465),
      y: Y(133),
      r: 25 * K,
      style: 'solar',
      cap: '#e4e3ea',
      kind: 'cont',
      min: -100,
      max: 100,
      def: 0,
      step: 1,
      label: `${s.name} > ${d.label}`,
      labelPos: 'none',
      module: 'mod',
      show: { id: 'mx.sel', eq: `${s.k}.${d.k}` },
      help: `How far ${SOURCE_SAYS[s.k]} moves ${DEST_SAYS[d.k]}: up for a positive amount, down for a negative one. Pick the ${s.name} > ${d.label} point in the grid and turn the Matrix encoder; its lamp lights while the amount is not 0.`,
    });
  }
// The Assign columns: each sends its five points to one destination.
const ASSIGN_TARGETS: ControlOption[] = [
  { v: 'none', label: 'None' },
  { v: 'osc_wave', label: 'Wave' },
  { v: 'osc_timbre', label: 'Timbre' },
  { v: 'osc_shape', label: 'Shape' },
  { v: 'cutoff', label: 'Cutoff' },
  { v: 'resonance', label: 'Resonance' },
  { v: 'env_decay', label: 'Decay / Rel' },
  { v: 'lfo_rate', label: 'LFO Rate' },
];
[329.3, 367.7, 405.7].forEach((x, i) => {
  bezel(x, 76.7, 9);
  button(`mx.assign${i + 1}`, x, 76.7, {
    kind: 'enum',
    options: ASSIGN_TARGETS,
    def: 'none',
    lamp: 'white',
    size: 11,
    module: 'mod',
    label: `Assign ${i + 1}`,
    name: `Assign ${i + 1} (destination)`,
    help: `Picks where the matrix’s Assign ${i + 1} column sends its five sources: each press moves on to the next. On the hardware you hold Assign ${i + 1} and move a knob; it can also reach Glide, Type, the envelope’s other knobs, the Arp/Seq rate, the cycling envelope’s knobs or another point’s amount, which the app does not model.`,
  });
});
// the Matrix encoder's ring and face, under the picked point's amount knob
decor.push(
  { t: 'circle', x: X(465), y: Y(133), r: 33 * K, fill: 'none', stroke: INK, sw: 3 },
  { t: 'circle', x: X(465), y: Y(133), r: 25 * K, fill: '#e4e3ea', stroke: '#8d8c93', sw: 2 }
);
label(465, 178, 'Matrix');
marks.push({
  id: 'mx.encoder',
  name: 'Matrix encoder',
  module: 'mod',
  help: 'Sets the amount of the matrix point picked in the grid, from −100 to +100. On the hardware you turn it to move to a point, press it and turn again to set the amount, and hold it to clear the point; here you click the point instead. Env > Cutoff is the Filter Amt knob, so with that point picked the encoder has nothing to set.',
  rect: { x: X(430), y: Y(98), w: 70 * K, h: 90 * K },
});

// ── Paraphonic, Panel, the display and Master ──────────────────────────────
bezel(572.5, 132.5, 22, '#9fd2ff');
button('voice.paraphonic', 572.5, 132.5, {
  kind: 'bool',
  def: false,
  lamp: 'blue',
  size: 28,
  module: 'mode',
  label: 'Paraphonic',
  help: 'Lit: up to four notes at once, each on its own copy of the oscillator with its own loudness envelope, all through the one filter. Unlit: one note at a time. The Chords model plays its own four notes and ignores it.',
});
decor.push({
  t: 'rect',
  x: X(535),
  y: Y(162),
  w: 75 * K,
  h: 19 * K,
  r: 5,
  stroke: INK,
  sw: 2.5,
  fill: 'none',
});
label(572.5, 171.5, 'Paraphonic');
bezel(671.5, 133.5, 18);
label(671.5, 171, 'Panel');
marks.push({
  id: 'ui.panel',
  name: 'Panel',
  module: 'mode',
  help: 'On the hardware a loaded preset keeps its own values until a knob is moved; Panel makes the sound match every knob as it is set. Here the knobs always show the sound, so it has nothing to do.',
  rect: { x: X(650), y: Y(112), w: 44 * K, h: 70 * K },
});
// the display window: the screen, the Preset encoder, Save and Utility
decor.push({
  t: 'rect',
  x: X(722.5),
  y: Y(71),
  w: (1111 - 722.5) * K,
  h: (192.5 - 71) * K,
  r: 10,
  fill: WINDOW,
  stroke: '#3a393e',
  sw: 3,
});
decor.push({
  t: 'lcd',
  x: X(744),
  y: Y(112),
  w: 84 * K,
  h: 42 * K,
  page: 'osc.type',
  titles: Object.fromEntries(MODELS.map((m) => [m.v, m.label])),
  titleH: 34,
});
decor.push(
  { t: 'circle', x: X(882.5), y: Y(132.5), r: 33 * K, fill: 'none', stroke: INK, sw: 3 },
  { t: 'circle', x: X(882.5), y: Y(132.5), r: 25 * K, fill: '#e4e3ea', stroke: '#8d8c93', sw: 2 }
);
label(882.5, 179, 'Preset');
bezel(977.5, 133.5, 22, '#8d8c93');
label(977.5, 171.5, 'Save');
bezel(1061.5, 133.5, 22, '#8d8c93');
label(1061.5, 171.5, 'Utility');
marks.push(
  {
    id: 'ui.display',
    name: 'Display',
    module: 'mode',
    help: 'The hardware’s screen shows the preset, each value as it changes, the matrix and the menus. Here it shows the oscillator’s Type.',
    rect: { x: X(736), y: Y(104), w: 100 * K, h: 58 * K },
  },
  {
    id: 'ui.preset',
    name: 'Preset encoder',
    module: 'mode',
    help: 'Turns through the 256 presets on the hardware: 128 factory sounds, the templates and the user slots. Here the sounds are in the library beside the panel instead.',
    rect: { x: X(845), y: Y(96), w: 76 * K, h: 92 * K },
  },
  {
    id: 'ui.save',
    name: 'Save',
    module: 'mode',
    help: 'Saves the sound into a preset slot on the hardware, with a name and one of eleven categories. Here a sound is saved from the library instead.',
    rect: { x: X(950), y: Y(108), w: 56 * K, h: 74 * K },
  },
  {
    id: 'ui.utility',
    name: 'Utility',
    module: 'mode',
    help: 'Opens the hardware’s menus: the preset’s own settings (LFO retrigger, envelope legato, Press mode, bend range, glide mode, sequence length) and the MIDI, sync, CV and keyboard settings. They are not modelled here.',
    rect: { x: X(1034), y: Y(108), w: 56 * K, h: 74 * K },
  }
);
ring(1165, 130, 33);
knob('out.master', 1165, 130, 22, 'Master', {
  module: 'out',
  def: 80,
  help: 'The overall volume, for the line and headphone outputs. It is not saved with a sound.',
});
label(1165, 178.5, 'Master');

// ── Glide and the digital oscillator ───────────────────────────────────────
ring(130, 265, 32);
knob('glide.amount', 130, 265, 22, 'Glide', {
  module: 'glide',
  def: 0,
  fmt: (v) => (glideTime(v) ? fmtTime(glideTime(v)) : 'off'),
  help: 'Portamento: how long the pitch takes to slide from one note to the next, off at 0 and up to about 10 seconds. On the hardware the Utility menu can make it a synced time or a rate instead.',
});
label(130, 311.5, 'Glide');
heading(200, 545, 216, 'DIGITAL OSCILLATOR');
controls.push({
  id: 'osc.type',
  type: 'knob',
  x: X(250),
  y: Y(265),
  r: 21 * K,
  style: 'solar',
  cap: ORANGE,
  kind: 'enum',
  options: MODELS.map((m) => ({ v: m.v, label: '' })),
  def: 'basicwaves',
  fmt: (v) => MODELS.find((m) => m.v === v)?.label || String(v),
  label: 'Type',
  labelPos: 'none',
  module: 'osc',
  help: 'Chooses the oscillator’s model, shown on the display: BasicWaves, SuperWave, Wavetable, Harmo, KarplusStr, V.Analog, Waveshaper, Two Op.FM, Formant, Chords, Speech or Modal. Wave, Timbre and Shape then mean something different in each, named in their readouts.',
});
label(252, 311.5, 'Type');
const PARAM_HELP = [
  'The model’s first setting (Mutable Instruments’ “Harmonics”): on BasicWaves it morphs square to saw (the middle) to two saws; on SuperWave it picks the wave multiplied; on Wavetable the table; on Two Op.FM the ratio; on Chords the chord; on Speech the voice. Its readout names it for the Type chosen.',
  'The model’s second setting (Mutable Instruments’ “Timbre”), usually the brightness: the pulse width on BasicWaves, the detune on SuperWave, the position in the table on Wavetable, the fold on Waveshaper, the FM amount on Two Op.FM, the inversion on Chords. Its readout names it for the Type chosen.',
  'The model’s third setting (Mutable Instruments’ “Morph”): the sub-oscillator on BasicWaves, the level of the detuned copies on SuperWave, a chorus on Wavetable and Harmo, the decay on KarplusStr and Modal, the vowel on Speech. Its readout names it for the Type chosen.',
];
(['wave', 'timbre', 'shape'] as const).forEach((p, i) => {
  const x = [330, 411, 492.5][i];
  knob(`osc.${p}`, x, 265, 21, ['Wave', 'Timbre', 'Shape'][i], {
    module: 'osc',
    def: i === 0 ? 50 : 0,
    cap: ORANGE,
    fmt: (v, values) => modelReadout(values ? modelOf(values) : MODELS[0], i as 0 | 1 | 2, v / 100),
    help: PARAM_HELP[i],
  });
  label(x, 311.5, ['Wave', 'Timbre', 'Shape'][i]);
});

// ── The analog filter ──────────────────────────────────────────────────────
heading(553, 796, 216, 'ANALOG FILTER');
const FILTER_TYPES: ControlOption[] = [
  { v: 'lpf', label: 'LPF' },
  { v: 'bpf', label: 'BPF' },
  { v: 'hpf', label: 'HPF' },
];
bezel(572.5, 266, 18);
button('vcf.type', 572.5, 266, {
  kind: 'enum',
  options: FILTER_TYPES,
  def: 'lpf',
  size: 20,
  module: 'filter',
  label: 'Type',
  name: 'Filter type',
  help: 'Steps the filter through low-pass (takes away the highs), band-pass (keeps a band around the cutoff) and high-pass (takes away the lows); the lamps show which.',
});
label(572.5, 301, 'Type');
FILTER_TYPES.forEach((o, i) => {
  const y = [248.5, 266.5, 285][i];
  led(606, y, 'white', { id: 'vcf.type', eq: o.v });
  text(614, y, o.label, 15, { anchor: 'start' });
});
ring(672.5, 265, 32);
knob('vcf.cutoff', 672.5, 265, 22, 'Cutoff', {
  module: 'filter',
  def: 100,
  fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'The filter’s cutoff, from about 30 Hz to above 15 kHz: turn it down to make the sound darker (low-pass), thinner (high-pass) or narrower (band-pass).',
});
label(672.5, 311.5, 'Cutoff');
ring(757.5, 265, 32);
knob('vcf.resonance', 757.5, 265, 22, 'Resonance', {
  module: 'filter',
  def: 0,
  help: 'Boosts the frequencies at the cutoff for a sharper, vocal tone; at the top the filter whistles a sine of its own.',
});
label(757.5, 311.5, 'Resonance');

// ── The cycling envelope ───────────────────────────────────────────────────
heading(805, 1222.5, 216, 'CYCLING ENVELOPE');
const CYC_MODES: ControlOption[] = [
  { v: 'env', label: 'Env' },
  { v: 'run', label: 'Run' },
  { v: 'loop', label: 'Loop' },
];
bezel(828.5, 266, 18);
button('cyc.mode', 828.5, 266, {
  kind: 'enum',
  options: CYC_MODES,
  def: 'env',
  size: 20,
  module: 'env',
  label: 'Mode',
  name: 'Cycling envelope mode',
  help: 'Env: one rise, a sustain at Hold/Sustain while the key is held, then the fall. Run: it rises and falls over and over by itself, never restarting. Loop: the same cycle, restarting from each note. The lamps show which.',
});
label(828.5, 301, 'Mode');
CYC_MODES.forEach((o, i) => {
  const y = [248, 267, 286][i];
  led(863, y, 'white', { id: 'cyc.mode', eq: o.v });
  text(871, y, o.label, 15, { anchor: 'start' });
});
/** Rise and Fall Shape's readout: which way the curve bows. */
const shapeName = (v: number): string => (Math.abs(v) < 1 ? 'linear' : v < 0 ? 'log' : 'exp');
const SHIFT_OFF = { id: 'ui.shift', eq: false };
const SHIFT_ON = { id: 'ui.shift', eq: true };
ring(929, 265, 32);
knob('cyc.rise', 929, 265, 22, 'Rise', {
  module: 'env',
  def: 30,
  show: SHIFT_OFF,
  fmt: (v) => fmtTime(cycTime(v)),
  help: 'How long the cycling envelope takes to rise to its top, from a millisecond (a cycle at audio rate) to 10 seconds. Shift turns this knob into Rise Shape.',
});
knob('cyc.rise_shape', 929, 265, 22, 'Shape', {
  name: 'Rise Shape',
  module: 'env',
  min: -50,
  max: 50,
  def: 0,
  show: SHIFT_ON,
  fmt: shapeName,
  help: 'The rise’s curve (Shift + Rise): left bows it out (logarithmic), the centre is a straight line, right bows it in (exponential). Here it shapes the rise in Env mode; in Run and Loop the cycle has fixed curves.',
});
text(910, 311.5, 'Rise /', 22);
text(945, 311.5, 'Shape', 22, { fill: BLUE });
ring(1014, 265, 32);
knob('cyc.fall', 1014, 265, 22, 'Fall', {
  module: 'env',
  def: 50,
  show: SHIFT_OFF,
  fmt: (v) => fmtTime(cycTime(v)),
  help: 'How long the cycling envelope takes to fall back to nothing, from a millisecond to 10 seconds. Shift turns this knob into Fall Shape.',
});
knob('cyc.fall_shape', 1014, 265, 22, 'Shape', {
  name: 'Fall Shape',
  module: 'env',
  min: -50,
  max: 50,
  def: 0,
  show: SHIFT_ON,
  fmt: shapeName,
  help: 'The fall’s curve (Shift + Fall), as Rise Shape is the rise’s. Here it shapes the fall in Env mode; in Run and Loop the cycle has fixed curves.',
});
text(997, 311.5, 'Fall /', 22);
text(1031, 311.5, 'Shape', 22, { fill: BLUE });
ring(1099, 265, 32);
knob('cyc.hold', 1099, 265, 22, 'Hold / Sustain', {
  module: 'env',
  def: 0,
  fmt: (v, values) =>
    values && values['cyc.mode'] !== 'env'
      ? holdTime(v)
        ? `hold ${fmtTime(holdTime(v))}`
        : 'no hold'
      : `sustain ${Math.round(v)}`,
  help: 'In Env mode the level the cycling envelope sustains at while the key is held. In Run and Loop how long it stays at the top before it falls.',
});
label(1099, 311.5, 'Hold / Sustain');
ring(1182.5, 265, 32);
knob('cyc.amount', 1182.5, 265, 22, 'Amount', {
  module: 'env',
  def: 100,
  help: 'The cycling envelope’s level into the matrix: every CycEnv point is scaled by it, so at 0 the cycling envelope moves nothing.',
});
label(1182.5, 311.5, 'Amount');

// ── Octave and Shift ───────────────────────────────────────────────────────
heading(67.5, 215, 350, 'OCTAVE');
decor.push({
  t: 'rect',
  x: X(67.5),
  y: Y(354),
  w: (212.5 - 67.5) * K,
  h: (461 - 354) * K,
  r: 4,
  fill: '#222125',
  hw: true,
});
decor.push({
  t: 'path',
  d: `M${X(110)} ${Y(375)} A${25 * K} ${25 * K} 0 1 0 ${X(110)} ${Y(425)} H${X(170)} A${25 * K} ${25 * K} 0 1 0 ${X(170)} ${Y(375)} Z`,
  w: 3,
  fill: 'none',
});
bezel(110, 400, 17);
bezel(170, 400, 17);
// the arrows under the octave buttons
decor.push(
  {
    t: 'path',
    d: `M${X(103)} ${Y(435)} H${X(117)} M${X(103)} ${Y(435)} l10 -7 v14 Z`,
    w: 3,
    fill: INK,
  },
  {
    t: 'path',
    d: `M${X(163)} ${Y(435)} H${X(177)} M${X(177)} ${Y(435)} l-10 -7 v14 Z`,
    w: 3,
    fill: INK,
  }
);
marks.push({
  id: 'kbd.octave',
  name: 'Octave buttons',
  module: 'mode',
  help: 'Move the keyboard down or up an octave at a time, up to three each way; their lamps blink faster the further from the middle. Here the app’s keyboard below the panel has octave buttons of its own, which do this.',
  rect: { x: X(80), y: Y(368), w: 120 * K, h: 80 * K },
});
bezel(251, 400, 21, BLUE);
button('ui.shift', 251, 400, {
  kind: 'bool',
  def: false,
  lamp: 'blue',
  size: 22,
  ui: true,
  module: 'mode',
  label: 'Shift',
  help: 'Shows the second jobs printed in blue: Rise and Fall become their curves. On the hardware it also reaches Swing (on Rate), the sequencer’s extra functions and more; it changes nothing on its own.',
});
label(251, 434, 'Shift');

// ── Arpeggiator and sequencer ──────────────────────────────────────────────
heading(306.5, 545, 350, 'ARP / SEQ');
bezel(332.5, 401, 18);
button('arp.mode', 332.5, 401, {
  kind: 'enum',
  options: [
    { v: 'off', label: 'Off' },
    { v: 'arp', label: 'Arp' },
    { v: 'seq', label: 'Seq' },
  ],
  def: 'off',
  lamp: 'white',
  size: 20,
  module: 'mode',
  label: 'Arp | Seq',
  name: 'Arp | Seq',
  help: 'Turns the arpeggiator on (Arp): the keys held are played one after another at Rate. On the hardware Shift + this button starts the sequencer (Seq) instead, which plays two recorded sequences of up to 64 steps; the sequences are not modelled here, so Seq plays the keys as they are.',
});
text(318, 434, 'Arp |', 22);
text(345, 434, 'Seq', 22, { fill: BLUE });
bezel(394, 401, 18);
button('arp.octave', 394, 401, {
  kind: 'enum',
  options: [1, 2, 3, 4].map((n) => ({ v: n, label: `${n} oct` })),
  def: 1,
  lamp: 'white',
  always: true,
  size: 20,
  module: 'mode',
  label: 'Oct | Mod',
  name: 'Oct | Mod',
  help: 'How many octaves the arpeggio climbs through, one to four: each press moves on, and the lamps show which. In the sequencer it picks one of the four modulation tracks instead, which are not modelled.',
});
label(394, 434, 'Oct | Mod');
[1, 2, 3, 4].forEach((n, i) => {
  const y = [373.5, 391.5, 410.5, 429.5][i];
  led(427.5, y, 'white', { id: 'arp.octave', eq: n });
  text(440, y, String(n), 15);
});
/** Arp/seq divisions when synced (the spec's list), each as steps of a quarter note. */
const ARP_DIVS: { name: string; beats: number }[] = [
  { name: '1/1', beats: 4 },
  { name: '1/2', beats: 2 },
  { name: '1/2T', beats: 4 / 3 },
  { name: '1/4', beats: 1 },
  { name: '1/4T', beats: 2 / 3 },
  { name: '1/8', beats: 0.5 },
  { name: '1/8T', beats: 1 / 3 },
  { name: '1/16', beats: 0.25 },
  { name: '1/16T', beats: 1 / 6 },
  { name: '1/32', beats: 0.125 },
  { name: '1/32T', beats: 1 / 12 },
];
/** LFO divisions when synced (the spec's list): cycles in quarter notes. */
const LFO_DIVS: { name: string; beats: number }[] = [
  { name: '8/1', beats: 32 },
  { name: '4/1', beats: 16 },
  { name: '2/1', beats: 8 },
  { name: '1/1', beats: 4 },
  { name: '1/2', beats: 2 },
  { name: '1/2T', beats: 4 / 3 },
  { name: '1/4', beats: 1 },
  { name: '1/4T', beats: 2 / 3 },
  { name: '1/8', beats: 0.5 },
  { name: '1/8T', beats: 1 / 3 },
  { name: '1/16', beats: 0.25 },
  { name: '1/16T', beats: 1 / 6 },
  { name: '1/32', beats: 0.125 },
];
/** The tempo the synced rates follow: Rate's own tempo while the arpeggiator runs free, else the default 120 BPM. */
const tempoOf = (v: ControlValues): number =>
  v['arp.sync'] ? CLOCK_BPM : arpBpm(num(v, 'arp.rate'));
/** The arpeggiator's rate as the engine's BPM, which counts sixteenth notes. */
const arpEngineBpm = (v: ControlValues): number => {
  const r = num(v, 'arp.rate');
  if (!v['arp.sync']) return arpBpm(r);
  return CLOCK_BPM / (4 * pick(ARP_DIVS, r / 100).beats);
};
const lfoRateHz = (v: ControlValues): number => {
  const r = num(v, 'lfo.rate');
  if (!v['lfo.sync']) return lfoHz(r);
  return tempoOf(v) / 60 / pick(LFO_DIVS, r / 100).beats;
};
ring(492.5, 395, 32);
knob('arp.rate', 492.5, 395, 22, 'Rate', {
  module: 'mode',
  def: 50,
  style: 'e7',
  fmt: (v, values) =>
    values && values['arp.sync'] ? pick(ARP_DIVS, v / 100).name : `${Math.round(arpBpm(v))} BPM`,
  help: 'How fast the arpeggiator steps: a tempo from 20 to 220 BPM, in sixteenth notes, or with Sync lit a division of the clock. With no clock coming in, that clock is the MicroFreak’s default 120 BPM. Shift + Rate sets the swing on the hardware, which is not modelled.',
});
text(477, 445, 'Rate /', 22);
text(510, 445, 'Swing', 22, { fill: BLUE });
button('arp.sync', 533.5, 372.5, {
  kind: 'bool',
  def: false,
  lamp: 'white',
  size: 9,
  module: 'mode',
  label: 'Sync',
  name: 'Arp/Seq Sync',
  help: 'Lit: Rate picks a division of the clock (1/1 to 1/32 triplets) instead of a free tempo. On the hardware you press the Rate knob.',
});
text(533.5, 360, 'Sync', 14);

// ── LFO ────────────────────────────────────────────────────────────────────
heading(554, 807.5, 350, 'LFO');
const LFO_SHAPES: ControlOption[] = [
  { v: 'sine', label: 'Sine' },
  { v: 'tri', label: 'Triangle' },
  { v: 'saw', label: 'Saw up' },
  { v: 'sq', label: 'Square' },
  { v: 'sh', label: 'Random' },
  { v: 'shg', label: 'Random glide' },
];
bezel(590, 401, 18);
button('lfo.shape', 590, 401, {
  kind: 'enum',
  options: LFO_SHAPES,
  def: 'sine',
  lamp: 'white',
  always: true,
  size: 20,
  module: 'lfo',
  label: 'Shape',
  name: 'LFO shape',
  help: 'Steps the LFO through sine, triangle, rising saw, square, random steps (sample and hold) and random glides; the lamps show which.',
});
label(590, 434, 'Shape');
const LFO_LAMPS: [number, number][] = [
  [625, 380],
  [625, 401],
  [625, 420],
  [671.5, 381.5],
  [671.5, 401.5],
  [671.5, 420],
];
LFO_SHAPES.forEach((o, i) => {
  const [x, y] = LFO_LAMPS[i];
  led(x, y, 'white', { id: 'lfo.shape', eq: o.v });
});
decor.push(
  { t: 'wave', x: X(643), y: Y(380), size: 13, shape: 'sine' },
  { t: 'wave', x: X(643), y: Y(401), size: 13, shape: 'tri' },
  { t: 'wave', x: X(643), y: Y(420), size: 13, shape: 'saw' },
  { t: 'wave', x: X(689), y: Y(381.5), size: 13, shape: 'sq' }
);
// the two random glyphs: steps, and a wobble
decor.push(
  {
    t: 'path',
    d: `M${X(682)} ${Y(404)} H${X(686)} V${Y(397)} H${X(690)} V${Y(406)} H${X(694)} V${Y(400)} H${X(697)}`,
    w: 2.5,
    fill: 'none',
  },
  {
    t: 'path',
    d: `M${X(682)} ${Y(421)} Q${X(685)} ${Y(413)} ${X(688)} ${Y(420)} T${X(694)} ${Y(419)} T${X(698)} ${Y(417)}`,
    w: 2.5,
    fill: 'none',
  }
);
ring(752.5, 397.5, 32);
knob('lfo.rate', 752.5, 397.5, 22, 'Rate', {
  module: 'lfo',
  def: 40,
  style: 'e7',
  fmt: (v, values) =>
    values && values['lfo.sync'] ? pick(LFO_DIVS, v / 100).name : fmtHz(lfoHz(v)),
  help: 'How fast the LFO swings: 0.06 to 100 Hz, or with Sync lit a division of the tempo from eight bars (8/1) to a thirty-second note.',
});
label(752.5, 445, 'Rate');
button('lfo.sync', 796, 372.5, {
  kind: 'bool',
  def: false,
  lamp: 'white',
  size: 9,
  module: 'lfo',
  label: 'Sync',
  name: 'LFO Sync',
  help: 'Lit: the LFO’s Rate picks a division of the tempo: the arpeggiator’s Rate while it runs free, else the default 120 BPM. On the hardware you press the Rate knob.',
});
text(796, 359, 'Sync', 14);

// ── Envelope ───────────────────────────────────────────────────────────────
heading(817.5, 1222.5, 350, 'ENVELOPE');
bezel(845, 400, 18);
button('env.amp_mod', 845, 400, {
  kind: 'bool',
  def: false,
  lamp: 'white',
  size: 20,
  module: 'amp',
  label: 'Amp Mod',
  help: 'Lit: the envelope shapes the loudness of each note. Unlit: the amplifier simply opens while a key is held, so the sound starts and stops with the key (and the arpeggiator’s gate length is heard).',
});
label(845, 434, 'Amp Mod');
ring(925, 397.5, 32);
knob('env.attack', 925, 397.5, 22, 'Attack', {
  module: 'env',
  def: 0,
  fmt: (v) => fmtTime(attackTime(v)),
  help: 'How long the envelope takes to rise when a key is pressed, from nothing to 10 seconds.',
});
label(925, 445, 'Attack');
ring(1010, 397.5, 32);
knob('env.decay', 1010, 397.5, 22, 'Decay / Rel', {
  module: 'env',
  def: 30,
  fmt: (v) => fmtTime(decayTime(v)),
  help: 'How long the envelope takes to fall to the Sustain level, and to fall away after the key is let go: one knob for both, up to 13 seconds.',
});
label(1010, 445, 'Decay / Rel');
ring(1094, 397.5, 32);
knob('env.sustain', 1094, 397.5, 22, 'Sustain', {
  module: 'env',
  def: 100,
  help: 'The level the envelope holds at while the key stays down.',
});
label(1094, 445, 'Sustain');
ring(1179, 397.5, 32);
line(1179, 362, 1179, 366, 3);
knob('env.filter_amt', 1179, 397.5, 22, 'Filter Amt', {
  module: 'filter',
  min: -100,
  max: 100,
  def: 0,
  help: 'How far the envelope moves the filter’s cutoff on each note: up to the right, down to the left, none at the centre. It is the matrix’s Env > Cutoff point, whose lamp lights while it is off the centre.',
});
label(1179, 445, 'Filter Amt');

// ── The touch plate: Hold, the arpeggio icons, Spice, Dice, Bend and the strip ─
iconBox(127.75);
button('kbd.hold', 127.75, 545, {
  kind: 'bool',
  def: false,
  lamp: 'white',
  size: 26,
  ui: true,
  module: 'mode',
  label: 'Hold',
  name: 'Hold (key hold)',
  help: 'Latches the keys: notes keep playing after you let go, and in paraphonic mode new keys are added to them; with the arpeggiator on, it keeps arpeggiating. Here it is the Hold beside the app’s keyboard. In the sequencer it enters ties and rests on the hardware.',
});
text(127.75, 563.5, 'Hold', 14, { fill: ICON });
text(127.75, 576, 'Tie / Rest', 13, { fill: ICON });
line(170, 522, 170, 568, 3, ICON);
const ARP_ICONS: [string, string, number][] = [
  ['up', 'Up', 211],
  ['order', 'Order', 276],
  ['random', 'Random', 340],
  ['pattern', 'Pattern', 405],
];
const ARP_PATTERNS: ControlOption[] = ARP_ICONS.map(([v, lab, x]) => {
  iconBox(x);
  return { v, label: lab, x: X(x), y: Y(541) };
});
controls.push({
  id: 'arp.pattern',
  type: 'select',
  x: X(211),
  y: Y(541),
  w: 26 * K,
  h: 26 * K,
  lamp: 'white',
  kind: 'enum',
  options: ARP_PATTERNS,
  def: 'up',
  module: 'mode',
  label: 'Arp order',
  name: 'Arp order',
  labelPos: 'none',
  help: 'The order the arpeggiator plays the held keys in: Up from the lowest, Order as they were pressed, Random, or Pattern, a generated semi-random pattern (played as Random here). In the sequencer these icons choose sequence A or B, record and play, which are not modelled.',
});
text(211, 563.5, 'Up | A', 14, { fill: ICON });
text(276, 563.5, 'Order | B', 14, { fill: ICON });
text(335, 563.5, 'Random |', 14, { fill: ICON });
text(398, 563.5, 'Pattern |', 14, { fill: ICON });
// the sequencer's record and play marks after them
decor.push(
  { t: 'circle', x: X(356), y: Y(563.5), r: 4.5, fill: ICON, stroke: ICON, sw: 1 },
  {
    t: 'path',
    d: `M${X(416)} ${Y(560)} L${X(421)} ${Y(563.5)} L${X(416)} ${Y(567)} Z`,
    w: 0,
    fill: ICON,
  }
);
line(446.5, 522, 446.5, 568, 3, ICON);
for (const [cx, t] of [
  [488, 'Spice'],
  [553, 'Dice'],
  [618, 'Bend'],
] as const) {
  iconBox(cx);
  text(cx, 563.5, t, 14, { fill: ICON });
}
line(511.5, 545, 529, 545, 3, ICON);
line(576.5, 545, 594, 545, 3, ICON);
line(641.5, 545, 676, 545, 3, ICON);
decor.push({
  t: 'rect',
  x: X(693.5),
  y: Y(521.5),
  w: (1187.5 - 693.5) * K,
  h: (569 - 521.5) * K,
  r: 8,
  stroke: ICON,
  sw: 3,
  fill: '#262529',
});
for (let i = 0; i < 6; i++) {
  const x0 = 760 + i * 80;
  decor.push({
    t: 'path',
    d: `M${X(x0)} ${Y(528)} L${X(x0 - 60)} ${Y(538)} L${X(x0)} ${Y(548)} M${X(x0)} ${Y(545)} L${X(x0 - 60)} ${Y(555)} L${X(x0)} ${Y(565)}`,
    w: 2,
    stroke: '#bdbcc3',
    fill: 'none',
    hw: true,
  });
}
marks.push(
  {
    id: 'strip.spice_dice',
    name: 'Spice and Dice',
    module: 'mode',
    help: 'Spice (touch the strip after it) moves each arpeggio or sequence step’s gate length, and slightly its octave, velocity and release, away from the default towards a random setting; Dice rolls a new random setting. They are not saved with a sound, and are not modelled here.',
    rect: { x: X(462), y: Y(519), w: 116 * K, h: 52 * K },
  },
  {
    id: 'strip.bend',
    name: 'Bend and the touch strip',
    module: 'mode',
    help: 'With Bend lit the strip bends the pitch: the centre is no bend, a touch elsewhere jumps there, a slide bends, and letting go springs back. Here the pitch wheel beside the app’s keyboard does it, 12 semitones each way (the hardware’s default Bend Range). With Spice or Dice lit the strip sets those instead.',
    rect: { x: X(594), y: Y(519), w: (1190 - 594) * K, h: 52 * K },
  }
);

// ── Areas (photo coordinates) ──────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: (x1 - x0) * K,
  h: (y1 - y0) * K,
});
const areas: Area[] = [
  {
    id: 'matrix',
    label: 'Matrix',
    module: 'mod',
    keywords:
      'matrix mod matrix modulation routing sources destinations assign cycenv env lfo press key arp',
    rects: [R(OX, OY, 520, 200)],
    help: 'The modulation matrix: five sources down the side (the cycling envelope, the envelope, the LFO, Press and Key/Arp) and seven destinations across the top. Each point sets how far its source moves its destination, either way, and lights while it is in use. Click a point to pick it (an unlit one switches on at +50) and set its amount on the Matrix encoder. The three Assign columns go wherever their button sets.',
  },
  {
    id: 'voice',
    label: 'Paraphonic and Panel',
    module: 'mode',
    keywords: 'paraphonic paraphony polyphony voices chords mono panel',
    rects: [R(520, OY, 715, 200)],
    help: 'Paraphonic plays up to four notes at once through the one filter, each with its own loudness envelope; unlit, the MicroFreak is monophonic. Panel makes a preset match its knobs on the hardware.',
  },
  {
    id: 'display',
    label: 'Display and presets',
    module: 'mode',
    keywords: 'display oled screen preset save utility menu',
    rects: [R(715, OY, 1120, 200)],
    help: 'The screen, the Preset encoder, Save and Utility: on the hardware these browse, store and set up presets and reach the menus. Here the screen shows the oscillator’s Type, and sounds come from the library.',
  },
  {
    id: 'output',
    label: 'Master',
    module: 'out',
    keywords: 'master volume level output headphones',
    rects: [R(1120, OY, RIGHT, 200)],
    help: 'The overall volume for the line and headphone outputs.',
  },
  {
    id: 'glide',
    label: 'Glide',
    module: 'glide',
    keywords: 'glide portamento slide',
    rects: [R(OX, 200, 200, 330)],
    help: 'How long the pitch slides from one note to the next; off at 0.',
  },
  {
    id: 'osc',
    label: 'Digital oscillator',
    module: 'osc',
    keywords:
      'oscillator digital vco type model wave timbre shape plaits mutable wavetable superwave basicwaves harmo karplus strong formant chords speech modal fm waveshaper analog',
    rects: [R(200, 200, 545, 330)],
    help: 'One digital oscillator running one of twelve models, chosen by Type: classic waves, super saws, wavetables, FM, a plucked string, struck objects, chords and speech. Wave, Timbre and Shape are the model’s three settings; what each does depends on the model, and the display names it.',
  },
  {
    id: 'filter',
    label: 'Analog filter',
    module: 'filter',
    keywords:
      'filter vcf analog cutoff resonance low-pass band-pass high-pass lpf bpf hpf 12 db state variable',
    rects: [R(545, 200, 800, 330)],
    help: 'An analog 12 dB filter after the digital oscillator: low-pass, band-pass or high-pass, with Cutoff and Resonance. It whistles at full resonance. With Paraphonic lit, every note goes through this one filter.',
  },
  {
    id: 'cycenv',
    label: 'Cycling envelope',
    module: 'env',
    keywords: 'cycling envelope function generator rise fall hold sustain amount loop run lfo',
    rects: [R(800, 200, RIGHT, 330)],
    help: 'A second envelope that can also loop like an LFO: Rise, Fall and Hold/Sustain, in Env (once per note), Run (free-running) or Loop (cycling from each note) mode. It is not wired to anything; it reaches the sound through the matrix’s CycEnv row, at Amount.',
  },
  {
    id: 'keys',
    label: 'Octave and Shift',
    module: 'mode',
    keywords: 'octave transpose shift second function',
    rects: [R(OX, 330, 295, PANEL_BOTTOM)],
    help: 'The octave buttons move the keyboard up or down; Shift reaches the second jobs printed in blue, here Rise and Fall Shape.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator and sequencer',
    module: 'mode',
    keywords: 'arpeggiator arp sequencer seq rate tempo bpm sync swing octave range',
    rects: [R(295, 330, 550, PANEL_BOTTOM)],
    help: 'Arp | Seq turns the arpeggiator on: it plays the keys held one after another at Rate, through one to four octaves (Oct | Mod), in the order the touch icons below choose. The sequencer is drawn but not modelled.',
  },
  {
    id: 'lfo',
    label: 'LFO',
    module: 'lfo',
    keywords:
      'lfo low frequency oscillator rate shape sync sine triangle saw square random sample and hold',
    rects: [R(550, 330, 815, PANEL_BOTTOM)],
    help: 'A low-frequency oscillator in six shapes, free from 0.06 to 100 Hz or synced to the tempo. Like the cycling envelope, it reaches the sound only through the matrix’s LFO row.',
  },
  {
    id: 'envelope',
    label: 'Envelope',
    module: 'env',
    keywords: 'envelope adsr attack decay release sustain filter amount amp mod vca',
    rects: [R(815, 330, RIGHT, PANEL_BOTTOM)],
    help: 'The envelope each note starts: Attack, Decay/Rel (one knob for both) and Sustain. Filter Amt sends it to the cutoff, either way; Amp Mod lets it shape the loudness too, where otherwise the key simply opens the amplifier.',
  },
  {
    id: 'touch',
    label: 'Touch strip and icons',
    module: 'mode',
    keywords:
      'touch strip icons hold latch arpeggio pattern up order random spice dice bend pitch bend',
    rects: [R(OX, TOUCH_TOP, RIGHT, BOTTOM)],
    help: 'Touch icons on the keyboard’s plate: Hold latches the keys, the next four pick the arpeggio’s order (or, in the sequencer, its controls), and Spice, Dice and Bend choose what the strip does. Bend is the app’s pitch wheel here; Spice and Dice are not modelled.',
  },
];

// ── Engine mapping ─────────────────────────────────────────────────────────
/** The LFO's shape as the engine's mix: one shape at a time. */
const lfoMix = (shape: string): LfoMix =>
  shape === 'tri'
    ? { tri: 1 }
    : shape === 'saw'
      ? { saw: 1 }
      : shape === 'sq'
        ? { sq: 1 }
        : shape === 'sh'
          ? { sh: 1 }
          : shape === 'shg'
            ? { shg: 1 }
            : { sine: 1 };
const SOURCE_SIGNAL: Record<SourceKey, string> = {
  cycenv: 'env2',
  env: 'env1',
  lfo: 'lfo',
  press: 'vel',
  key: 'kbd',
};
function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const m = modelOf(v);
  const w = clamp(num(v, 'osc.wave'), 0, 100) / 100;
  const t = clamp(num(v, 'osc.timbre'), 0, 100) / 100;
  const s = clamp(num(v, 'osc.shape'), 0, 100) / 100;
  const chords = m.v === 'chords';
  const para = !!v['voice.paraphonic'] && !chords;
  const osc = chords
    ? chordOscs(w, t, s)
    : Array.from({ length: para ? 4 : 1 }, () => modelOsc(m.v, w, t, s, 0));
  const routes: EngineRoute[] = [];
  const cycAmt = clamp(num(v, 'cyc.amount'), 0, 100) / 100;
  /** Route `src` to `dsts` at `amt` each, leaving out amounts too small to hear. */
  const send = (src: string, dsts: readonly string[], amt: number): void => {
    if (Math.abs(amt) < 1e-4) return;
    for (const dst of dsts) routes.push({ src, dst, amt });
  };
  const pwDests = osc.length > 1 ? ['pw1', 'pw2'] : ['pw1'];
  /** A full-scale amount for source `sk` into a destination, given its full-scale depth there. */
  const depth = (
    sk: SourceKey,
    point: number,
    full: number,
    keyFull = full * KEY_PER_OCT
  ): number => (point / 100) * (sk === 'key' ? keyFull : full) * (sk === 'cycenv' ? cycAmt : 1);
  const toParam = (sk: SourceKey, i: 0 | 1 | 2, point: number): void => {
    const d = paramDest(m.v, i, w);
    if (!d) return;
    send(
      SOURCE_SIGNAL[sk],
      d.dst === 'macro' ? [MACRO_DEST[i]] : pwDests,
      depth(sk, point, d.scale)
    );
  };
  for (const { k: sk } of SOURCES) {
    const src = SOURCE_SIGNAL[sk];
    const point = (dk: DestKey): number => num(v, `mx.${sk}.${dk}`) || 0;
    send(src, ['pitchAll'], depth(sk, point('pitch'), MX_PITCH_SEMI, 12));
    toParam(sk, 0, point('wave'));
    toParam(sk, 1, point('timbre'));
    if (sk !== 'env') send(src, ['cutoff'], depth(sk, point('cutoff'), MX_CUTOFF_OCT, 1));
    for (const n of [1, 2, 3] as const) {
      const p = point(`assign${n}`);
      if (!p) continue;
      switch (v[`mx.assign${n}`]) {
        case 'osc_wave':
          toParam(sk, 0, p);
          break;
        case 'osc_timbre':
          toParam(sk, 1, p);
          break;
        case 'osc_shape':
          toParam(sk, 2, p);
          break;
        case 'cutoff':
          send(src, ['cutoff'], depth(sk, p, MX_CUTOFF_OCT, 1));
          break;
        case 'resonance':
          send(src, ['res'], depth(sk, p, MX_RES));
          break;
        case 'env_decay':
          // the engine's decay rate is faster for a positive amount; the hardware's Decay is longer
          send(src, ['env1DecRate'], -depth(sk, p, MX_DECAY_OCT));
          break;
        case 'lfo_rate':
          send(src, ['lfoRate'], depth(sk, p, MX_LFO_OCT, 1));
          break;
        default:
          break;
      }
    }
  }
  const mode = v['cyc.mode'];
  const cycling = mode === 'run' || mode === 'loop';
  const rise = cycTime(num(v, 'cyc.rise'));
  const fall = cycTime(num(v, 'cyc.fall'));
  const decay = decayTime(num(v, 'env.decay'));
  const arp = v['arp.mode'] === 'arp';
  const pattern = v['arp.pattern'];
  const bend = clamp(ctx.bend ?? 0, -1, 1) * BEND_RANGE;
  return {
    osc,
    ...(para ? { oscAssign: { mode: 'poly' as const, env: true } } : {}),
    noise: { level: 0 },
    ext: { level: 0 },
    filter: {
      type: 'svf',
      mode: v['vcf.type'] === 'bpf' ? 'bp' : v['vcf.type'] === 'hpf' ? 'hp' : 'lp',
      cutoff: cutoffHz(num(v, 'vcf.cutoff')),
      res: resAmt(num(v, 'vcf.resonance')),
      envAmt: (clamp(num(v, 'env.filter_amt'), -100, 100) / 100) * FILTER_AMT_OCT,
      envSrc: 'env1',
      kbd: 0,
    },
    // the envelope: attack, then decay to the sustain level; Decay/Rel is also the release
    env1: {
      a: attackTime(num(v, 'env.attack')),
      d: decay,
      s: clamp(num(v, 'env.sustain'), 0, 100) / 100,
      r: decay,
    },
    // the cycling envelope: in Env a curved rise, sustain and fall; in Run and Loop a cycle with a hold at the top
    env2: cycling
      ? {
          a: rise,
          hold: holdTime(num(v, 'cyc.hold')),
          d: fall,
          s: 0,
          r: 0.001,
          loop: true,
          loopAll: true,
          ...(mode === 'run' ? { free: true } : {}),
        }
      : {
          a: rise,
          d: fall,
          s: clamp(num(v, 'cyc.hold'), 0, 100) / 100,
          r: fall,
          curve: {
            a: curveOf(num(v, 'cyc.rise_shape')),
            d: curveOf(num(v, 'cyc.fall_shape')),
            r: curveOf(num(v, 'cyc.fall_shape')),
          },
        },
    // the key gate, which opens the amplifier with Amp Mod off: quick enough not to click
    env3: { a: 0.002, d: 0.01, s: 1, r: 0.008 },
    vca: { envSrc: v['env.amp_mod'] ? 'env1' : 'env3', bias: 0 },
    lfo: { rate: lfoRateHz(v), mix: lfoMix(String(v['lfo.shape'])), keySync: false },
    glide: { time: glideTime(num(v, 'glide.amount')), legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    // Run and Loop hold the cycling envelope's gate open, so it cycles whether a key is down or not
    normals: cycling ? { gate2: 'one' } : {},
    routes,
    od: { on: false },
    delay: { on: false },
    poly: { voices: 1, stack: 1, mono: true },
    arp: {
      on: arp,
      bpm: arpEngineBpm(v),
      // the spec's default gate length, 45 % of a step
      gate: 0.45,
      mode:
        pattern === 'order'
          ? 'played'
          : pattern === 'random' || pattern === 'pattern'
            ? 'random'
            : 'up',
      octaves: clamp(Number(v['arp.octave']) || 1, 1, 4),
      hold: false,
    },
    tune: bend,
    volume: level10(num(v, 'out.master') / 10, 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

/** The panel buttons the app's keyboard takes: Hold is its Hold. */
const seqButtons: Record<string, SeqButton> = { 'kbd.hold': 'hold' };

const microfreak: SynthDef & { version: number } = {
  id: 'microfreak',
  version: 1,
  name: 'MicroFreak',
  maker: 'Arturia',
  year: 2019,
  heritage:
    'An original Arturia design, with seven oscillator models from Mutable Instruments’ Plaits',
  summary:
    'A hybrid synth: one digital oscillator running one of twelve models, through an analog 12 dB filter and amplifier, monophonic or four-voice paraphonic. An envelope, a cycling envelope and an LFO reach the sound through a 5 × 7 modulation matrix, with Press and the key as sources too; an arpeggiator plays the touch keyboard.',
  view: { w: (RIGHT - OX) * K, h: (BOTTOM - OY) * K },
  theme: {
    panel: PANEL,
    panel2: '#1f1e22',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'none',
  },
  signalNames: {
    osc1: 'the oscillator',
    env1: 'the envelope',
    env2: 'the cycling envelope',
    env3: 'the key gate',
    lfo: 'the LFO',
    vel: 'Press (velocity)',
    kbd: 'Key/Arp',
    gate: 'the key gate',
  },
  destNames: {
    pitchAll: 'the oscillator’s pitch',
    mWave: 'Wave',
    mTimbre: 'Timbre',
    mShape: 'Shape',
    pw1: 'Timbre',
    pw2: 'Timbre',
    cutoff: 'the filter’s cutoff',
    res: 'the resonance',
    env1DecRate: 'the envelope’s Decay/Rel',
    lfoRate: 'the LFO’s rate',
    gate2: 'the cycling envelope’s gate',
  },
  decor,
  areas,
  marks,
  controls,
  jacks: [],
  init,
  seqButtons,
  // Compact (`f-compact-panels`), the view it opens in: the decorated band with the maker's wordmark is cut out, and the
  // touch row moves up under the panel. Long is the full drawing.
  compact: {
    pieces: [
      { cut: [0, 0, (RIGHT - OX) * K, Y(PANEL_BOTTOM)], at: [0, 0] },
      { cut: [0, Y(TOUCH_TOP), (RIGHT - OX) * K, Y(BOTTOM)], at: [0, Y(PANEL_BOTTOM)] },
    ],
  },
  // Init is already the Default patch: BasicWaves at its saw, the filter open, the key gate opening the amplifier and
  // nothing modulated. The checklist sets it on the hardware from any state.
  defaultPatch: {
    values: {},
    checklist: [
      {
        title: 'Set the volume, play one note at a time, and switch the arpeggiator off',
        module: 'mode',
        why: 'Master at 80 is the level every patch here assumes. With Paraphonic unlit the MicroFreak plays one note at a time; Glide at 0 lands each note on its pitch at once. Arp | Seq off plays the keys as they are; set its Rate, range, Sync and pattern anyway so your MicroFreak matches when you switch it on.',
        controls: ['out.*', 'voice.*', 'glide.*', 'arp.*'],
      },
      {
        title: 'Choose BasicWaves and turn it into a sawtooth',
        module: 'osc',
        why: 'Type on BasicWaves gives the classic analog waves. Wave at the centre (50) is the sawtooth, the buzzy wave with every harmonic; Timbre at 0 does nothing to the saw, and Shape at 0 adds no sub-oscillator.',
        controls: ['osc.*'],
      },
      {
        title: 'Open the filter all the way',
        module: 'filter',
        why: 'The filter takes brightness away. On LPF with Cutoff fully up and no Resonance it lets the saw through untouched, and Filter Amt at the centre keeps the envelope off it.',
        controls: ['vcf.*', 'env.filter_amt'],
      },
      {
        title: 'Let the key open the amplifier',
        module: 'amp',
        why: 'With Amp Mod unlit the amplifier simply opens while a key is held. The envelope is set too, a plain one (Attack 0, Decay/Rel 30, Sustain full), though nothing hears it while Amp Mod is unlit and Filter Amt is at the centre.',
        controls: ['env.*'],
        listen:
          'play a note: a bright, steady buzz that starts the moment you touch a key and stops when you let go.',
      },
      {
        title: 'Take every modulation off',
        module: 'mod',
        why: 'With every matrix point at 0 and the Assign columns on None, nothing moves the sound. The cycling envelope and the LFO only reach the sound through the matrix, so they are silent; set them as shown anyway (Env mode, Rise 30, Fall 50, Hold 0, Amount full, both Shapes linear; a sine at Rate 40, unsynced) so your MicroFreak matches.',
        controls: ['mx.*', 'cyc.*', 'lfo.*'],
      },
    ],
  },
  // The touch strip's Bend is the app's pitch wheel; the MicroFreak has no mod wheel.
  performance: { bend: { range: BEND_RANGE } },
  toEngine,
};

export default microfreak;
