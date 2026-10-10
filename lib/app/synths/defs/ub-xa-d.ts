/**
 * Behringer UB-Xa D: the definition (D1). Positions are pixels on the 2000×1099 product photo, used directly as view
 * units (the faceplate is the top 945 px; below it is the front lip and its reflection). The data model is the UB-Xa D
 * synth.json (Quick Start Guide, 92 numbered controls), which follows the OB-Xa panel.
 *
 * The UB-Xa D holds two patches (lower and upper) and plays them split or doubled. This app has one voice pool, so it
 * models one patch played on all sixteen voices: SPLIT, DOUBLE, LOWER, UPPER and BALANCE are printed but do not change
 * the sound (see the "What is not modelled" notes). The sequencer, programmer and menus behind SHIFT are printed as
 * artwork.
 *
 * Transliterated from the prototype file `src/synths/ub-xa-d.js` (D3), the way `defs/model-d.ts` was: no content
 * (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the printed "UB-Xa D" and
 * "behringer" wordmarks, and the "UB-Xa D" in the display), and panel values read through `num()`.
 */
import type {
  Area,
  ButtonControl,
  Control,
  ControlCommon,
  ControlValues,
  ContinuousValue,
  Decor,
  EngineParams,
  EngineRoute,
  EnvParams,
  LfoMix,
  LitWhen,
  OscMix,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import {
  type CurvePoint,
  expMap,
  fmtHz,
  fmtSemi,
  fmtTime,
  level10,
  pwl,
} from '@/lib/app/synths/lib/maps';

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> & Partial<Omit<ContinuousValue, 'kind'>>;
type ButtonRest = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  (
    | { kind?: 'bool'; def?: boolean }
    | OmitEach<Extract<ButtonControl, { kind: 'enum' }>, keyof ControlCommon | 'type' | 'w' | 'h'>
  );
type TextRest = Partial<
  Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'size' | 'brand'>
>;

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The guide gives the LFO range (0.06–50 Hz) and the oscillator steps. Everything else here is this app's estimate.
const ENV_PTS: CurvePoint[] = [
  [0, 0.001],
  [2, 0.02],
  [4, 0.12],
  [6, 0.6],
  [8, 2.8],
  [10, 12],
];
const envTime = (v: number): number => pwl(v, ENV_PTS, true);
const lfoHz = (v: number): number => expMap(v / 10, 0.06, 50);
const vcfHz = (v: number): number => expMap(v / 10, 25, 20000);
const portaTime = (v: number): number => 5 * Math.pow(v / 10, 2);
const pct = (v: number): string => `${Math.round(v * 10)} %`;
/** OSC 2 HALF: "approximately 5 dB below full". */
const HALF = Math.pow(10, -5 / 20);

const MLFO_SHAPES = [
  { v: 'sine', label: 'SINE' },
  { v: 'saw', label: 'SAWTOOTH' },
  { v: 'square', label: 'SQUARE' },
  { v: 'ramp', label: 'RAMP' },
  { v: 'sh', label: 'S/H' },
  { v: 'trig', label: 'TRIG' },
  { v: 'smp', label: 'SMP' },
];
const PLFO_SHAPES = [
  { v: 'sine', label: 'SINE' },
  { v: 'saw', label: 'SAWTOOTH' },
  { v: 'square', label: 'SQUARE' },
  { v: 'ramp', label: 'RAMP' },
  { v: 'noise', label: 'NOISE' },
  { v: 'sh', label: 'S/H' },
];
// SAWTOOTH falls and RAMP rises, as the glyphs on the panel show. TRIG is the sine restarted on each key; SMP
// (sampling the performance LFO) and NOISE are approximated with the engine's random shapes.
const SHAPE_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  saw: { rsaw: 1 },
  square: { sq: 1 },
  ramp: { saw: 1 },
  sh: { sh: 1 },
  trig: { sine: 1 },
  smp: { sh: 1 },
  noise: { shg: 1 },
};

const controls: Control[] = [];
const decor: Decor[] = [];
const INK = '#f2f2ee';
const GREY = '#8d8e8f';
const STRIPE = '#46b4ea';

// ── Grid ──────────────────────────────────────────────────────────────────
// Five rows of controls, 154.6 px apart. BT = top of a button's bezel, KY = centre of a knob.
const BT = (r: number): number => 162 + 154.6 * r;
const KY = (r: number): number => 202 + 154.6 * r;
const text = (x: number, y: number, t: string, size = 13, rest: TextRest = {}): void => {
  decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...rest });
};
/** A label centred on y (the renderer places text by its baseline). */
const label = (x: number, y: number, t: string, rest: TextRest = {}): void =>
  text(x, y + 4.6, t, 13, rest);
const grey = (x: number, y: number, t: string): void => label(x, y, t, { fill: GREY, weight: 500 });
/** A section name with a rule running out to each side: ——— OSCILLATORS ———. */
const rule = (
  cx: number,
  y: number,
  t: string,
  x0: number,
  x1: number,
  size = 13,
  fill = INK
): void => {
  const half = (t.length * size * 0.6) / 2 + 9;
  if (cx - half > x0)
    decor.push({ t: 'line', x1: x0, y1: y, x2: cx - half, y2: y, w: 2, stroke: fill });
  if (x1 > cx + half)
    decor.push({ t: 'line', x1: cx + half, y1: y, x2: x1, y2: y, w: 2, stroke: fill });
  text(cx, y + size * 0.35, t, size, fill === INK ? {} : { fill, weight: 500 });
};

// ── Faceplate artwork ─────────────────────────────────────────────────────
// The blue lines behind the controls: every 19.33 px, in six columns at the top, four in the middle rows, two at the
// bottom.
const COLS6 = [
  [74, 266],
  [283, 457],
  [466, 623],
  [632, 807],
  [824, 1431],
  [1448, 1926],
];
const COLS4 = [
  [74, 266],
  [283, 807],
  [824, 1431],
  [1448, 1926],
];
const COLS2 = [
  [74, 266],
  [283, 1926],
];
for (let k = 0; k <= 41; k++) {
  const y = Math.round((124 + 19.33 * k) * 10) / 10;
  const cols = k === 0 || k === 41 ? [[74, 1926]] : k <= 24 ? COLS6 : k <= 32 ? COLS4 : COLS2;
  cols.forEach(([x1, x2]) =>
    decor.push({ t: 'line', x1, y1: y, x2, y2: y, w: 2.4, stroke: STRIPE, hw: true })
  );
}
text(275, 97, 'UB-Xa D', 78, { weight: 700, spacing: '-0.02em', brand: true });
text(1687, 90, 'behringer', 58, { weight: 500, brand: true });

// Section names
(
  [
    ['KEYBOARD', 170],
    ['MANUAL', 379],
    ['PERF LFO', 545],
    ['CONTROL', 710],
  ] as const
).forEach(([t, x]) => text(x, 139, t, 15.5));
rule(1128, 133, 'OSCILLATORS', 850, 1405, 15.5);
rule(1688, 133, 'FILTER', 1475, 1900, 15.5);
rule(1128, 443, 'MODULATION', 850, 1405, 15.5);
rule(1688, 443, 'ENVELOPES', 1475, 1900, 15.5);
label(1688, 462, 'FILTER ENVELOPE', { size: 12 });
label(1688, 617, 'LOUDNESS ENVELOPE', { size: 12 });
(
  [
    ['I', 920],
    ['I+2', 1128],
    ['2', 1334],
  ] as const
).forEach(([t, x]) => label(x, 153, t));
label(920, 308, 'WAVEFORM');
label(1128, 308, 'OSC 2');
label(1334, 308, 'WAVEFORM');
rule(920, 424, 'TRIANGLE', 850, 990);
rule(1334, 424, 'TRIANGLE', 1265, 1405);
grey(1128, 424, 'OSC 1 LFO INVERT');
label(170, 578, 'TRANSPOSE');
rule(379, 733, 'BEND', 310, 448);
rule(627, 733, 'PERFORMANCE LFO', 475, 780);
rule(169, 907, 'ARPEGGIATOR', 100, 238);
rule(545, 907, 'SEQUENCER', 393, 697);
rule(1062, 907, 'PROGRAMMER', 724, 1400);
rule(1745, 907, 'ASSIGNABLE PRESET RECALL', 1593, 1898);

// The display, the SELECT encoder and the PRESET/VALUE buttons
decor.push({
  t: 'rect',
  x: 1003,
  y: 783,
  w: 294,
  h: 76,
  r: 6,
  fill: '#151516',
  stroke: '#050505',
  sw: 2,
});
text(1150, 832, 'UB-Xa D', 30, { weight: 500, fill: '#cfd2d0', spacing: '0.08em', brand: true });
decor.push({ t: 'circle', x: 1358, y: 820, r: 38, fill: '#0b0b0c', stroke: '#2a2b2e', sw: 2 });
decor.push({
  t: 'circle',
  x: 1358,
  y: 820,
  r: 29,
  fill: 'url(#kysBlack)',
  stroke: '#3a3b3f',
  sw: 1.5,
});
decor.push({ t: 'circle', x: 1358, y: 869, r: 6, fill: 'none', stroke: INK, sw: 1.6 });
label(1358, 888, 'SELECT');
rule(1497, 868, 'PRESET/VALUE', 1440, 1555);
text(1440, 872.6, '−', 15, { anchor: 'start' });
text(1555, 872.6, '+', 15, { anchor: 'end' });
rule(1497, 888, 'BANK/PAGE', 1440, 1555, 13, GREY);

// ── Buttons ───────────────────────────────────────────────────────────────
// Each switch is a tall black bezel with a red lamp in its top half and the square cap below it.
const bezel = (x: number, row: number, lamp: LitWhen | false | null): void => {
  const t = BT(row);
  decor.push({
    t: 'rect',
    x: x - 28,
    y: t,
    w: 56,
    h: 81,
    r: 4,
    fill: '#0c0c0d',
    stroke: '#000',
    sw: 1.5,
  });
  decor.push({ t: 'rect', x: x - 24, y: t + 4, w: 48, h: 28, r: 2, fill: '#29292b' });
  if (lamp !== false)
    decor.push({
      t: 'led',
      x,
      y: t + 18,
      r: 6.5,
      color: 'red',
      ...(lamp ? { litWhen: lamp } : {}),
    });
};
const CAP = { w: 46, h: 40 };
/** A switch the app models. `lamp` false = a button with no lamp (the LFO waveform buttons). */
const button = (id: string, x: number, row: number, rest: ButtonRest, lamp?: false): void => {
  bezel(x, row, lamp === false ? false : { id, eq: rest.kind === 'enum' ? undefined : true });
  controls.push({
    id,
    type: 'button',
    x,
    y: BT(row) + 55,
    ...CAP,
    kind: 'bool',
    def: false,
    labelPos: 'none',
    ...rest,
  });
};
/** Printed but not modelled: bezel, unlit lamp and cap as artwork. */
const deadButton = (x: number, row: number, top?: string, sub?: string, subGrey = true): void => {
  bezel(x, row, null);
  decor.push({
    t: 'rect',
    x: x - 23,
    y: BT(row) + 35,
    w: 46,
    h: 40,
    r: 3,
    fill: 'url(#kysButtonBlack)',
    stroke: '#4c4d50',
    sw: 1.2,
  });
  if (top) label(x, BT(row) + 88, top, top === 'SHIFT' ? { fill: GREY, weight: 500 } : {});
  if (sub) (subGrey ? grey : label)(x, BT(row) + 107, sub);
};
const btnLabel = (x: number, row: number, top: string, sub?: string, subGrey = true): void => {
  label(x, BT(row) + 88, top);
  if (sub) (subGrey ? grey : label)(x, BT(row) + 107, sub);
};

// ── Knobs ─────────────────────────────────────────────────────────────────
const knob = (
  id: string,
  x: number,
  row: number,
  top: string,
  sub: string | null,
  rest: KnobRest
): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y: KY(row),
    r: 38,
    style: 'obxa',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: top,
    labelPos: 'none',
    ...rest,
  });
  label(x, KY(row) + 48, top);
  if (sub) grey(x, KY(row) + 67, sub);
};

// KEYBOARD: layer and keyboard functions, printed only
deadButton(128, 0, 'SPLIT');
deadButton(210, 0, 'DOUBLE');
deadButton(128, 1, 'LOWER');
deadButton(210, 1, 'UPPER');
deadButton(128, 2, 'DOWN');
deadButton(210, 2, 'UP');
deadButton(128, 3, 'CHORD', 'AUTO');
deadButton(210, 3, 'ARP', 'SETTINGS', false);

// MANUAL
knob('out.volume', 379, 0, 'VOLUME', 'PRESET VOLUME', {
  def: 7,
  module: 'out',
  fmt: pct,
  help: 'Master output level.',
});
knob('out.balance', 379, 1, 'BALANCE', null, {
  min: -5,
  max: 5,
  def: 0,
  module: 'out',
  fmt: (v) =>
    Math.abs(v) < 0.25
      ? 'centre'
      : v < 0
        ? `lower ${Math.round(-v * 20)} %`
        : `upper ${Math.round(v * 20)} %`,
  help: 'The level of the lower patch against the upper one when the two play together in SPLIT or DOUBLE. This app plays one patch, so BALANCE does not change the sound here.',
});
knob('out.tune', 379, 2, 'MASTER TUNE', null, {
  min: -5,
  max: 5,
  def: 0,
  module: 'out',
  fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 20)} cents`,
  help: 'Tunes the whole synth up or down, here by up to a semitone either way.',
});

// PERF LFO
knob('plfo.rate', 545, 0, 'LFO RATE', 'TEMPO SYNC', {
  def: 5.5,
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the performance LFO, from one cycle every 17 seconds up to 50 Hz. Around 5 to 6 is a natural vibrato.',
});
button(
  'plfo.shape',
  545,
  1,
  {
    kind: 'enum',
    def: 'sine',
    options: PLFO_SHAPES,
    label: 'Performance LFO waveform',
    name: 'Performance LFO waveform',
    module: 'lfo',
    help: 'Steps through the performance LFO’s six shapes; the lamp shows which one is chosen. SINE is a smooth vibrato, SQUARE a trill between two pitches, SAWTOOTH and RAMP fall or rise and snap back, NOISE wanders at random and S/H jumps to a new random pitch each cycle.',
  },
  false
);
label(545, BT(1) + 88, 'WAVEFORM');
(
  [
    ['sine', 506, 289, 'tri'],
    ['square', 545, 289, 'sq'],
    ['ramp', 584, 289, 'saw'],
    ['saw', 506, 424, 'rsaw'],
    ['noise', 545, 424, 'noise'],
    ['sh', 584, 424, null],
  ] as const
).forEach(([v, x, y, glyph]) => {
  decor.push({ t: 'led', x, y, r: 5.5, color: 'red', litWhen: { id: 'plfo.shape', eq: v } });
  if (glyph) decor.push({ t: 'wave', x, y: y + 19, size: 8, shape: glyph, w: 2.2 });
  else label(x, y + 19, 'S/H', { size: 11 });
});
knob('plfo.depth', 545, 2, 'DEPTH', 'TEMPO', {
  def: 0,
  module: 'mod',
  fmt: (v) => (v <= 0 ? 'off' : fmtSemi(3 * Math.pow(v / 10, 2))),
  help: 'How far the performance LFO moves the pitch of the oscillators switched on under PERFORMANCE LFO. A little is vibrato; turned up it becomes a trill or a siren.',
});

// CONTROL
knob('glide.time', 710, 0, 'PORTAMENTO', 'BEND', {
  def: 0,
  module: 'glide',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaTime(v))),
  help: 'Glide time between notes. It is polyphonic: every voice slides from the last note it played, so chords smear into each other.',
});
button('voice.unison', 710, 1, {
  label: 'UNISON',
  module: 'mode',
  help: 'Puts every voice on one key, so the synth plays one note at a time with the voices stacked on it, slightly detuned. Low notes take priority. This is the huge Oberheim lead and bass sound. The hardware stacks all sixteen voices; this app stacks eight.',
});
btnLabel(710, 1, 'UNISON', 'VOICES');
knob('osc2.detune', 710, 2, 'OSC 2 DETUNE', 'VOICE DETUNE', {
  def: 0,
  module: 'osc',
  fmt: (v) => (v <= 0 ? 'in tune' : `+${Math.round(v * 5)} cents`),
  help: 'Tunes OSC 2 slightly sharp of OSC 1, up to half a semitone. The two beat against each other, which thickens every note. The lamp above lights whenever OSC 2 is detuned.',
});
decor.push({
  t: 'led',
  x: 710,
  y: 453,
  r: 5.5,
  color: 'red',
  litWhen: { id: 'osc2.detune', eq: 0, near: 0.05, not: true },
});

// OSCILLATORS
knob('osc1.freq', 920, 0, 'FREQUENCY', null, {
  max: 4,
  def: 2,
  step: 1,
  name: 'OSC 1 frequency',
  module: 'osc',
  fmt: (v) => (v === 2 ? '0 oct' : `${v > 2 ? '+' : '−'}${Math.abs(v - 2)} oct`),
  help: 'Pitch of OSC 1, in whole octaves over a four-octave range. The middle position plays at the pitch of the key.',
});
knob('osc.pw', 1128, 0, 'PULSE WIDTH', null, {
  def: 0,
  name: 'Pulse width (OSC 1 and 2)',
  module: 'osc',
  fmt: (v) => `${Math.round(50 - 4.5 * v)} %`,
  help: 'Width of the pulse wave on both oscillators at once. At 0 it is a square, hollow like a clarinet; turned up it narrows to a thin, nasal pulse.',
});
knob('osc2.freq', 1334, 0, 'FREQUENCY', null, {
  max: 48,
  def: 24,
  step: 1,
  name: 'OSC 2 frequency',
  module: 'osc',
  fmt: (v) => fmtSemi(v - 24),
  help: 'Pitch of OSC 2, in semitones over four octaves. The middle position is in tune with OSC 1’s middle; +7 adds a fifth, +12 an octave.',
});
button('osc1.saw', 878, 1, {
  def: true,
  label: 'SAW',
  name: 'OSC 1 saw',
  module: 'osc',
  help: 'Switches OSC 1’s sawtooth on. With PULSE on as well, OSC 1 plays a triangle instead of both waves.',
});
button('osc1.pulse', 961, 1, {
  label: 'PULSE',
  name: 'OSC 1 pulse',
  module: 'osc',
  help: 'Switches OSC 1’s pulse wave on. Its width is set by PULSE WIDTH. With SAW on as well, OSC 1 plays a triangle.',
});
btnLabel(878, 1, 'SAW');
btnLabel(961, 1, 'PULSE');
button('osc2.sync', 1086, 1, {
  label: 'SYNC',
  module: 'osc',
  help: 'Hard sync: OSC 2 restarts every time OSC 1 does. OSC 2’s FREQUENCY then changes its tone, not its note: higher settings tear and snarl.',
});
button('osc2.fenv', 1169, 1, {
  label: 'F-ENV',
  module: 'osc',
  help: 'Sends the filter envelope to OSC 2’s pitch, so each note starts sharp and falls back. How far is set by the filter’s MODULATION knob. With SYNC on it sweeps the tone instead: the classic Oberheim sync lead.',
});
label(1068, BT(1) + 88, 'SYNC');
grey(1106, BT(1) + 88, 'FREQ');
label(1161, BT(1) + 88, 'F-ENV');
grey(1193, BT(1) + 88, 'PW');
button('osc2.saw', 1293, 1, {
  def: true,
  label: 'SAW',
  name: 'OSC 2 saw',
  module: 'osc',
  help: 'Switches OSC 2’s sawtooth on. With PULSE on as well OSC 2 plays both waves; with both off it plays a triangle.',
});
button('osc2.pulse', 1376, 1, {
  label: 'PULSE',
  name: 'OSC 2 pulse',
  module: 'osc',
  help: 'Switches OSC 2’s pulse wave on. With both OSC 2 switches off, OSC 2 plays a triangle, so it is never silent at the source.',
});
btnLabel(1293, 1, 'SAW');
btnLabel(1376, 1, 'PULSE');

// MODULATION
knob('mlfo.rate', 920, 2, 'LFO RATE', 'TEMPO SYNC', {
  def: 5,
  name: 'Modulation LFO rate',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the modulation LFO, from one cycle every 17 seconds up to 50 Hz.',
});
button('mlfo.osc1', 1044, 2, {
  label: 'OSC 1 FREQ',
  module: 'mod',
  help: 'Lets the modulation LFO move OSC 1’s pitch, by the amount set with DEPTH 1.',
});
button('mlfo.osc2', 1127, 2, {
  label: 'OSC 2 FREQ',
  module: 'mod',
  help: 'Lets the modulation LFO move OSC 2’s pitch, by the amount set with DEPTH 1. With only one oscillator moving, the two drift in and out of tune with each other.',
});
button('mlfo.filter', 1210, 2, {
  label: 'FILTER FREQ',
  module: 'mod',
  help: 'Lets the modulation LFO sweep the filter cutoff, by the amount set with DEPTH 1: a wah-wah or a slow swell.',
});
(
  [
    [1044, 'OSC 1', 'QUANTIZE'],
    [1127, 'OSC 2', 'INVERT'],
    [1210, 'FILTER', 'TRACK'],
  ] as const
).forEach(([x, t, g]) => {
  label(x, BT(2) + 88, t);
  label(x, BT(2) + 107, 'FREQ');
  grey(x, BT(2) + 126, g);
});
knob('mlfo.depth1', 1334, 2, 'DEPTH I', 'MOD LFO PHASE', {
  def: 0,
  name: 'Modulation depth 1',
  module: 'mod',
  fmt: pct,
  help: 'How far the modulation LFO moves the destinations switched on in the row beside it: OSC 1 pitch, OSC 2 pitch and the filter cutoff.',
});
button(
  'mlfo.shape',
  920,
  3,
  {
    kind: 'enum',
    def: 'sine',
    options: MLFO_SHAPES,
    label: 'Modulation LFO waveform',
    name: 'Modulation LFO waveform',
    module: 'lfo',
    help: 'Steps through the modulation LFO’s seven positions; the lamp shows which one is chosen. Five are shapes. TRIG is a sine that restarts on every key, so each note wobbles the same way. SMP samples the performance LFO, giving stepped changes.',
  },
  false
);
label(920, BT(3) + 88, 'WAVEFORM');
const MLFO_LAMPS: [v: string, x: number, y: number, glyph: string][] = [
  ['sine', 862, 598, 'tri'],
  ['saw', 901, 598, 'rsaw'],
  ['square', 940, 598, 'sq'],
  ['ramp', 979, 598, 'saw'],
  ['sh', 881, 733, 'S/H'],
  ['trig', 920, 733, 'TRIG'],
  ['smp', 959, 733, 'SMP'],
];
const GLYPHS: Record<string, WaveShape> = { tri: 'tri', rsaw: 'rsaw', sq: 'sq', saw: 'saw' };
MLFO_LAMPS.forEach(([v, x, y, glyph]) => {
  decor.push({ t: 'led', x, y, r: 5.5, color: 'red', litWhen: { id: 'mlfo.shape', eq: v } });
  if (y < 700) decor.push({ t: 'wave', x, y: y + 19, size: 8, shape: GLYPHS[glyph], w: 2.2 });
  else label(x, y + 19, glyph, { size: 11 });
});
button('mlfo.pwm1', 1044, 3, {
  label: 'OSC 1 PWM',
  module: 'mod',
  help: 'Lets the modulation LFO sweep OSC 1’s pulse width, by the amount set with DEPTH 2. Only heard when OSC 1’s PULSE is on.',
});
button('mlfo.pwm2', 1127, 3, {
  label: 'OSC 2 PWM',
  module: 'mod',
  help: 'Lets the modulation LFO sweep OSC 2’s pulse width, by the amount set with DEPTH 2. Only heard when OSC 2’s PULSE is on.',
});
button('mlfo.vol', 1210, 3, {
  label: 'VOLUME MOD',
  module: 'mod',
  help: 'Lets the modulation LFO dip the volume, by the amount set with DEPTH 2: tremolo.',
});
(
  [
    [1044, 'OSC 1', 'PWM', 'QUANTIZE'],
    [1127, 'OSC 2', 'PWM', 'INVERT'],
    [1210, 'VOLUME', 'MOD', 'ENV MOD'],
  ] as const
).forEach(([x, t, s, g]) => {
  label(x, BT(3) + 88, t);
  label(x, BT(3) + 107, s);
  grey(x, BT(3) + 126, g);
});
knob('mlfo.depth2', 1334, 3, 'DEPTH 2', null, {
  def: 0,
  name: 'Modulation depth 2',
  module: 'mod',
  fmt: pct,
  help: 'How far the modulation LFO moves the destinations switched on in the row beside it: OSC 1 pulse width, OSC 2 pulse width and the volume.',
});

// FILTER
knob('vcf.freq', 1505, 0, 'FREQUENCY', null, {
  def: 8,
  name: 'Filter frequency',
  module: 'filter',
  fmt: (v) => fmtHz(vcfHz(v)),
  help: 'Cutoff of the low-pass filter. Down makes the sound darker and duller; up lets all the brightness through.',
});
knob('vcf.res', 1627, 0, 'RESONANCE', null, {
  def: 0,
  module: 'filter',
  fmt: pct,
  help: 'A boost right at the cutoff that makes filter sweeps sound vocal and squelchy. In 4 POLE mode the top of the range whistles on its own.',
});
knob('vcf.mod', 1749, 0, 'MODULATION', null, {
  def: 0,
  name: 'Filter envelope amount',
  module: 'filter',
  fmt: pct,
  help: 'How far the filter envelope opens the filter on each note. It also sets how far F-ENV bends OSC 2.',
});
knob('noise.level', 1870, 0, 'NOISE', null, {
  def: 0,
  module: 'mixer',
  fmt: pct,
  help: 'How much white noise goes into the filter: a little adds breath, a lot turns the sound into wind or surf.',
});
button('mix.osc1', 1505, 1, {
  def: true,
  label: 'OSC 1',
  name: 'OSC 1 into the filter',
  module: 'mixer',
  help: 'Switches OSC 1 into the filter. There is no level knob: it is on or off.',
});
button('mix.half', 1597, 1, {
  label: 'HALF',
  name: 'OSC 2 at half level',
  module: 'mixer',
  help: 'Switches OSC 2 into the filter about 5 dB quieter than OSC 1. If FULL is on too, FULL wins.',
});
button('mix.full', 1688, 1, {
  label: 'FULL',
  name: 'OSC 2 at full level',
  module: 'mixer',
  help: 'Switches OSC 2 into the filter at full level, as loud as OSC 1.',
});
button('vcf.fourPole', 1779, 1, {
  label: '4 POLE',
  module: 'filter',
  help: 'Switches the filter from 2-pole (12 dB per octave: bright and buzzy, with plenty of harmonics left in) to 4-pole (24 dB per octave: rounder, heavier, and able to whistle at high resonance).',
});
button('vcf.track', 1870, 1, {
  label: 'TRACK',
  name: 'Keyboard tracking',
  module: 'filter',
  help: 'Makes the cutoff follow the keyboard, so high notes are as bright as low ones.',
});
btnLabel(1505, 1, 'OSC 1');
label(1642, BT(1) + 88, 'HALF — OSC 2 — FULL');
btnLabel(1779, 1, '4 POLE');
btnLabel(1870, 1, 'TRACK');

// ENVELOPES
const STAGES: [stage: string, top: string, x: number, help: string][] = [
  ['attack', 'ATTACK', 1505, 'How long it takes to rise to full after a key is pressed.'],
  ['decay', 'DECAY', 1627, 'How long it takes to fall from the peak to the sustain level.'],
  ['sustain', 'SUSTAIN', 1749, 'The level it holds while the key is held down.'],
  ['release', 'RELEASE', 1870, 'How long it takes to fade to nothing after the key is let go.'],
];
const ENV_SUB: Record<string, (string | null)[]> = {
  fenv: ['MOD 1 DELAY', 'MOD 1 ATTACK', null, 'TRIG POINT'],
  lenv: ['MOD 2 DELAY', 'MOD 2 ATTACK', null, 'PEDAL RELEASE'],
};
const ENV_DEF: Record<string, number[]> = { fenv: [0, 5, 5, 4], lenv: [0, 5, 10, 4] };
(
  [
    ['fenv', 2, 'Filter envelope', 'the filter cutoff (by the amount set with MODULATION)'],
    ['lenv', 3, 'Loudness envelope', 'the volume of each note'],
  ] as const
).forEach(([e, row, full, what]) => {
  STAGES.forEach(([stage, top, x, help], i) => {
    const isTime = stage !== 'sustain';
    knob(`${e}.${stage}`, x, row, top, ENV_SUB[e][i], {
      def: ENV_DEF[e][i],
      name: `${full} ${stage}`,
      module: 'env',
      fmt: isTime ? (v) => fmtTime(envTime(v)) : pct,
      help: `${full}: ${help.charAt(0).toLowerCase()}${help.slice(1)} It shapes ${what}.${isTime ? ' The guide gives no times; the readout is this app’s estimate.' : ''}`,
    });
  });
});

// Bottom row: bend and performance LFO switches
deadButton(337, 3, 'OSC 2 ONLY');
deadButton(420, 3, 'AMOUNT');
button('plfo.osc1', 503, 3, {
  label: 'OSC 1',
  name: 'Performance LFO to OSC 1',
  module: 'mod',
  help: 'Lets the performance LFO move OSC 1’s pitch, by the amount set with its DEPTH.',
});
button('plfo.osc2', 586, 3, {
  label: 'OSC 2',
  name: 'Performance LFO to OSC 2',
  module: 'mod',
  help: 'Lets the performance LFO move OSC 2’s pitch, by the amount set with its DEPTH.',
});
button('plfo.lower', 669, 3, {
  def: true,
  label: 'LOWER',
  name: 'Performance LFO on the lower patch',
  module: 'mod',
  help: 'Turns the performance LFO on for the lower patch. This app plays one patch, which counts as both lower and upper: the LFO is heard while either LOWER or UPPER is on.',
});
button('plfo.upper', 751, 3, {
  def: true,
  label: 'UPPER',
  name: 'Performance LFO on the upper patch',
  module: 'mod',
  help: 'Turns the performance LFO on for the upper patch. This app plays one patch, which counts as both lower and upper: the LFO is heard while either LOWER or UPPER is on.',
});
(
  [
    [503, 'OSC I'],
    [586, 'OSC 2'],
    [669, 'LOWER'],
    [751, 'UPPER'],
  ] as const
).forEach(([x, t]) => btnLabel(x, 3, t));

// Bottom row: arpeggiator, sequencer and programmer
button('arp.on', 128, 4, {
  label: 'ARP ON',
  name: 'Arpeggiator on',
  module: 'mode',
  help: 'Turns the arpeggiator on. Hold a chord and it plays the notes one at a time, upwards, at 120 BPM.',
});
button('arp.hold', 210, 4, {
  label: 'HOLD',
  name: 'Arpeggiator hold',
  module: 'mode',
  help: 'Latches the arpeggio, so it keeps playing after you let go. Playing a new chord replaces the held one.',
});
btnLabel(128, 4, 'ARP', 'ON', false);
btnLabel(210, 4, 'HOLD');
(
  [
    [337, 'SHIFT'],
    [420, 'REST/TIE', 'SETTINGS'],
    [503, 'RECORD', 'APPEND'],
    [586, 'STOP', 'CLR LAST'],
    [669, 'PLAY/PAUSE', 'RESTART'],
    [751, 'COMPARE', 'GLOBALS'],
    [834, 'MANUAL', 'VINTAGE'],
    [917, 'WRITE', 'INITIAL'],
  ] as [number, string, string?][]
).forEach(([x, t, s]) => deadButton(x, 4, t, s));
decor.push({
  t: 'rect',
  x: 1455 - 28,
  y: BT(4),
  w: 56,
  h: 81,
  r: 4,
  fill: '#0c0c0d',
  stroke: '#000',
  sw: 1.5,
});
decor.push({
  t: 'rect',
  x: 1538 - 28,
  y: BT(4),
  w: 56,
  h: 81,
  r: 4,
  fill: '#0c0c0d',
  stroke: '#000',
  sw: 1.5,
});
[1455, 1538].forEach((x) =>
  decor.push({
    t: 'rect',
    x: x - 23,
    y: BT(4) + 6,
    w: 46,
    h: 69,
    r: 3,
    fill: 'url(#kysButtonBlack)',
    stroke: '#4c4d50',
    sw: 1.2,
  })
);
(
  [
    [1621, '1', 'USB/MIDI'],
    [1704, '2', 'VEL/AFT'],
    [1787, '3', 'VOICE'],
    [1869, '4', 'MOD'],
  ] as const
).forEach(([x, t, s]) => deadButton(x, 4, t, s));

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'keyboard',
    label: 'Keyboard',
    module: 'mode',
    keywords: 'split double layer bi-timbral lower upper transpose octave chord memory',
    rects: [R(70, 115, 275, 617), R(70, 617, 170, 772)],
    help: 'The layer controls. The UB-Xa D holds two patches, lower and upper: SPLIT plays them either side of a key, DOUBLE plays both on every note, and LOWER and UPPER choose which one the panel edits. TRANSPOSE shifts by octaves and CHORD replays a held chord from any key. This app plays one patch, so none of these is modelled.',
  },
  {
    id: 'manual',
    label: 'Manual (output)',
    module: 'out',
    keywords: 'master volume level tuning',
    rects: [R(275, 115, 462, 600)],
    help: 'Master VOLUME and MASTER TUNE for the whole synth, and BALANCE, which sets the level of the lower patch against the upper one when both play.',
  },
  {
    id: 'perf',
    label: 'Performance LFO',
    module: 'lfo',
    keywords: 'vibrato trill wobble second lfo',
    rects: [R(462, 115, 628, 600), R(462, 600, 815, 772)],
    help: 'A second LFO kept for vibrato. LFO RATE sets its speed, WAVEFORM steps through six shapes, and DEPTH sets how far it moves the pitch. The switches along the bottom choose which oscillators it reaches, and whether it plays on the lower patch, the upper patch or both.',
  },
  {
    id: 'control',
    label: 'Control',
    module: 'glide',
    keywords: 'glide portamento unison stack detune thickness',
    rects: [R(628, 115, 815, 600)],
    help: 'PORTAMENTO makes the pitch glide from one note to the next, on every voice. UNISON stacks all the voices on one key for a single, very thick note. OSC 2 DETUNE tunes OSC 2 slightly sharp of OSC 1 so every note beats and thickens; its lamp lights whenever it is off zero.',
  },
  {
    id: 'bend',
    label: 'Bend',
    module: 'util',
    keywords: 'pitch bend range wheel lever',
    rects: [R(275, 600, 462, 772)],
    help: 'How pitch bend from MIDI is applied: OSC 2 ONLY bends only the second oscillator, which against a synced OSC 2 bends the tone rather than the note, and AMOUNT switches the range between a whole tone and an octave. This app has no pitch bend, so these are not modelled.',
  },
  {
    id: 'osc',
    label: 'Oscillators',
    module: 'osc',
    keywords: 'vco sawtooth pulse triangle square pwm sync detune',
    rects: [R(815, 115, 1440, 435)],
    help: 'Two oscillators per voice. OSC 1 steps in octaves and OSC 2 in semitones; PULSE WIDTH is shared by both. Each has a SAW and a PULSE switch: both on gives OSC 1 a triangle, while OSC 2 plays a triangle with both off. SYNC locks OSC 2 to OSC 1, and F-ENV lets the filter envelope bend OSC 2’s pitch.',
  },
  {
    id: 'mod',
    label: 'Modulation',
    module: 'mod',
    keywords: 'lfo vibrato wah tremolo pwm routing depth',
    rects: [R(815, 435, 1440, 772)],
    help: 'The modulation LFO and where it goes. LFO RATE and WAVEFORM set its speed and shape. DEPTH 1 sets how far it moves the destinations in the top row (OSC 1 and OSC 2 pitch, the filter), and DEPTH 2 the bottom row (OSC 1 and OSC 2 pulse width, the volume). Each destination has its own switch.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'level balance noise half full',
    rects: [R(1810, 115, 1935, 290), R(1440, 290, 1734, 435)],
    help: 'What goes into the filter. OSC 1 is on or off; OSC 2 comes in at HALF or FULL level; NOISE is the only continuous level. To balance the oscillators, use HALF.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf cutoff resonance low-pass 2-pole 4-pole keyboard tracking',
    rects: [R(1440, 115, 1810, 290), R(1734, 290, 1935, 435)],
    help: 'A low-pass filter in each voice. FREQUENCY sets the brightness and RESONANCE the emphasis at the cutoff. MODULATION sets how far the filter envelope opens it. 4 POLE switches from the bright 2-pole mode to a heavier 4-pole one, and TRACK makes the cutoff follow the keyboard.',
  },
  {
    id: 'fenv',
    label: 'Filter envelope',
    module: 'env',
    keywords: 'adsr attack decay sustain release contour eg',
    rects: [R(1440, 435, 1935, 592)],
    help: 'An ADSR envelope for the filter: ATTACK, DECAY, SUSTAIN and RELEASE. MODULATION in the filter section sets how far it opens the filter, and F-ENV sends it to OSC 2’s pitch as well.',
  },
  {
    id: 'lenv',
    label: 'Loudness envelope',
    module: 'amp',
    keywords: 'adsr vca volume amplifier attack decay sustain release',
    rects: [R(1440, 592, 1935, 772)],
    help: 'The ADSR envelope that shapes the volume of every note: how quickly it starts, how it falls to the level it holds, and how long it takes to die away after the key is let go.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator',
    module: 'mode',
    keywords: 'arp arpeggio hold latch',
    rects: [R(170, 617, 275, 772), R(70, 772, 275, 925)],
    help: 'Plays a held chord one note at a time. ARP ON starts it and HOLD keeps it going after you let go. The ARP SETTINGS button opens a menu on the hardware; here the arpeggiator always plays upwards over one octave at 120 BPM.',
  },
  {
    id: 'seq',
    label: 'Sequencer',
    module: 'mode',
    keywords: 'step sequencer record play pattern shift',
    rects: [R(275, 772, 975, 925)],
    help: 'A step sequencer recorded from played notes, and the SHIFT button that reaches the grey functions printed under the controls, plus COMPARE, MANUAL and WRITE for the programmer. None of these is modelled here: sounds are kept in this app’s library.',
  },
  {
    id: 'programmer',
    label: 'Programmer',
    module: 'mode',
    keywords: 'display preset bank memory recall select encoder menu',
    rects: [R(975, 772, 1935, 925)],
    help: 'The display, the SELECT encoder, the PRESET/VALUE buttons and four switches that recall chosen presets (with SHIFT they open the USB/MIDI, velocity, voice and modulation menus). Printed only: this app keeps its sounds in the library instead.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const envOf = (v: ControlValues, e: string): EnvParams => ({
  a: envTime(num(v, `${e}.attack`)),
  d: envTime(num(v, `${e}.decay`)),
  s: num(v, `${e}.sustain`) / 10,
  r: envTime(num(v, `${e}.release`)),
});

function toEngine(v: ControlValues): EngineParams {
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number): void => {
    if (amt !== 0) routes.push({ src, dst, amt });
  };
  // Modulation LFO: DEPTH 1 → the frequency row, DEPTH 2 → the width and volume row
  const d1 = num(v, 'mlfo.depth1') / 10;
  const d2 = num(v, 'mlfo.depth2') / 10;
  if (v['mlfo.osc1']) route('lfo', 'pitch1', 12 * d1 * d1);
  if (v['mlfo.osc2']) route('lfo', 'pitch2', 12 * d1 * d1);
  if (v['mlfo.filter']) route('lfo', 'cutoff', 5 * d1 * d1);
  if (v['mlfo.pwm1']) route('lfo', 'pw1', 0.44 * d2);
  if (v['mlfo.pwm2']) route('lfo', 'pw2', 0.44 * d2);
  if (v['mlfo.vol']) route('lfoUni', 'amp', -0.9 * d2); // dips below the envelope; the VCA cannot go under zero
  // Performance LFO: vibrato on the oscillators it is switched to
  const pd = v['plfo.lower'] || v['plfo.upper'] ? 3 * Math.pow(num(v, 'plfo.depth') / 10, 2) : 0;
  if (v['plfo.osc1']) route('lfo2', 'pitch1', pd);
  if (v['plfo.osc2']) route('lfo2', 'pitch2', pd);
  // F-ENV: the filter envelope bends OSC 2, as far as MODULATION says
  if (v['osc2.fenv']) route('env1', 'pitch2', 24 * (num(v, 'vcf.mod') / 10));

  const pw = 0.5 - 0.045 * num(v, 'osc.pw');
  const s1 = v['osc1.saw'],
    p1 = v['osc1.pulse'];
  const s2 = v['osc2.saw'],
    p2 = v['osc2.pulse'];
  const mix1: OscMix = s1 && p1 ? { tri: 1 } : s1 ? { saw: 1 } : p1 ? { pulse: 1 } : {};
  const mix2: OscMix =
    s2 && p2 ? { saw: 0.7, pulse: 0.7 } : s2 ? { saw: 1 } : p2 ? { pulse: 1 } : { tri: 1 };
  const lvl1 = v['mix.osc1'] && (s1 || p1) ? 0.38 : 0;
  const lvl2 = v['mix.full'] ? 0.38 : v['mix.half'] ? 0.38 * HALF : 0;
  const unison = !!v['voice.unison'];
  const shape = String(v['mlfo.shape']);
  return {
    osc: [
      {
        level: lvl1,
        mix: mix1,
        pw,
        semi: (num(v, 'osc1.freq') - 2) * 12,
        kbd: true,
        syncTo: -1,
      },
      {
        level: lvl2,
        mix: mix2,
        pw,
        semi: num(v, 'osc2.freq') - 24 + num(v, 'osc2.detune') * 0.05,
        kbd: true,
        syncTo: v['osc2.sync'] ? 0 : -1,
      },
    ],
    noise: { level: 0.35 * level10(num(v, 'noise.level')), color: 'white' },
    ext: { level: 0 },
    filter: {
      type: v['vcf.fourPole'] ? 'ladder' : 'svf',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.freq')),
      res: (num(v, 'vcf.res') / 10) * (v['vcf.fourPole'] ? 1.05 : 0.95),
      envAmt: (num(v, 'vcf.mod') / 10) * 7,
      envSrc: 'env1',
      kbd: v['vcf.track'] ? 1 : 0,
    },
    env1: envOf(v, 'fenv'),
    env2: envOf(v, 'lenv'),
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: lfoHz(num(v, 'mlfo.rate')), mix: SHAPE_MIX[shape], keySync: shape === 'trig' },
    lfo2: {
      rate: lfoHz(num(v, 'plfo.rate')),
      mix: SHAPE_MIX[String(v['plfo.shape'])],
      keySync: false,
      delay: 0,
    },
    glide: { time: portaTime(num(v, 'glide.time')), legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    // UNISON stacks eight voices here, not sixteen: sixteen full voices on one note is more than the page can run
    // smoothly.
    poly: { voices: 16, stack: unison ? 8 : 1, mono: unison, detune: unison ? 0.12 : 0 },
    arp: {
      on: !!v['arp.on'],
      bpm: 120,
      gate: 0.5,
      mode: 'up',
      octaves: 1,
      hold: !!v['arp.hold'],
    },
    routes,
    normals: {},
    od: { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: num(v, 'out.tune') / 5,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const ubXaD: SynthDef & { version: number } = {
  id: 'ub-xa-d',
  version: 1,
  name: 'UB-Xa D',
  maker: 'Behringer',
  year: 2024,
  heritage: 'Based on the 1980 Oberheim OB-Xa',
  summary:
    'Sixteen analogue voices, each with two oscillators and noise → 2- or 4-pole low-pass filter → VCA, with a filter and a loudness envelope. A modulation LFO with two depth rows, a performance LFO for vibrato, polyphonic portamento, unison and an arpeggiator.',
  view: { w: 2000, h: 945 },
  theme: {
    panel: '#353535',
    panel2: '#2b2b2c',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'wood',
    cheekW: 62,
    button: 'black',
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
  signalNames: {
    env1: 'the filter envelope',
    env2: 'the loudness envelope',
    lfo: 'the modulation LFO',
    lfo2: 'the performance LFO',
  },
};

export default ubXaD;
