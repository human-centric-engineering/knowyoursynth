/**
 * Behringer PRO-800: the definition (D1). Positions are in view units: 2 × the pixels of the 1200 × 1200 product
 * photo, measured from the left end of the wooden cheek (x 79) and the top of the faceplate (y 413). The data model is
 * the PRO-800 synth.json (Quick Start Guide, 62 numbered controls; envelope and LFO figures computed from the GliGli
 * firmware it descends from).
 *
 * Eight voices, each a full copy of the voice: two oscillators with switchable waveforms, noise, a 24 dB low-pass
 * filter, two ADSR envelopes and Poly-Mod. The programmer (keypad, display, menus, sequencer) is printed as artwork; of
 * its buttons only ARP UP-DN and ARP ASSIGN are modelled. Menu settings keep their factory defaults (see the "What is
 * not modelled" notes).
 *
 * Transliterated from the prototype file `src/synths/pro-800.js` (D3), the way `defs/model-d.ts` was: no content
 * (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the "behringer" logo, the PRO-800
 * badge and its plate, and the P800 in the display), and panel values read through `num()`. A knob's label drops
 * every line break of its printed name, not just the first (idea #4); the names have one at most, so the labels are
 * unchanged.
 */
import type {
  Area,
  ButtonControl,
  Control,
  ControlCommon,
  ControlOption,
  ControlValues,
  ContinuousValue,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  EnvParams,
  Jack,
  KnobScale,
  OscParams,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { num } from '@/lib/app/synths/lib/def-kit';
import {
  type CurvePoint,
  clamp,
  expMap,
  fmtHz,
  fmtTime,
  level10,
  pwl,
} from '@/lib/app/synths/lib/maps';

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> & Partial<Omit<ContinuousValue, 'kind'>>;
type SlideRest = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  ({ kind?: 'bool'; def?: boolean } | { kind: 'enum'; options: ControlOption[]; def: string });
type ArpRest = Pick<ButtonControl, 'label' | 'name' | 'help'>;
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'hw' | 'brand'>>;

// ── Ranges and tapers ─────────────────────────────────────────────────────
// Envelope stage times: the GliGli firmware's fast exponential table (0.5 ms to 37.4 s). Behringer is reported to have
// made the envelopes snappier since, so these are the ancestor's figures. LFO 0.08–20 Hz is from the specifications.
// Cutoff range, resonance law, glide times and the modulation depths are this app's estimates.
const ENV_PTS: CurvePoint[] = [
  [0, 0.0005],
  [2.5, 0.016],
  [5, 0.22],
  [7.5, 2.8],
  [10, 37.4],
];
const envTime = (v: number): number => pwl(v, ENV_PTS, true);
const lfoHz = (v: number): number => expMap(v / 10, 0.08, 20);
const vcfHz = (v: number): number => expMap(v / 10, 16, 20000);
const glideTime = (v: number): number => 4 * Math.pow(v / 10, 2);
/** FREQUENCY steps in octaves by default (the menu can change that): five positions, two octaves either side of the middle. */
const octaves = (v: number): number => Math.round((v - 5) * 0.4) || 0;
const pct = (v: number): string => `${Math.round(v * 10)} %`;
const signed = (v: number): string =>
  Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
const cents = (v: number): string =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 20)} cents`;

const controls: Control[] = [];
const decor: Decor[] = [];
const INK = '#f1f1ee';

// ── Drawing helpers ───────────────────────────────────────────────────────
const text = (x: number, y: number, t: string, size = 14, rest: TextRest = {}): void => {
  decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...rest });
};
/** Text centred on y (the renderer places text by its baseline). */
const label = (x: number, y: number, t: string, size = 14, rest: TextRest = {}): void =>
  text(x, y + size * 0.36, t, size, rest);
/** A name with a short rule either side: —— SHAPE ——. */
const rule = (cx: number, y: number, t: string, x0: number, x1: number, size = 14): void => {
  const half = (t.length * size * 0.62) / 2 + 8;
  decor.push({ t: 'line', x1: x0, y1: y, x2: cx - half, y2: y, w: 2 });
  decor.push({ t: 'line', x1: cx + half, y1: y, x2: x1, y2: y, w: 2 });
  label(cx, y, t, size);
};

const UNI: KnobScale = {
  nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  ticks: 11,
  numR: 1.8,
  tickR: 1.3,
  size: 11,
};
const BI: KnobScale = {
  ticks: 11,
  numR: 1.8,
  tickR: 1.3,
  size: 11,
  labels: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((at) => ({
    at,
    text: at === -5 ? '−5' : at === 5 ? '+5' : String(Math.abs(at)),
  })),
};
/** A knob; `lab` is the printed name under it, `ly` the centre of that name. */
const knob = (
  id: string,
  x: number,
  y: number,
  lab: string,
  ly: number | null,
  rest: KnobRest
): void => {
  const bi = rest.min === -5;
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 26,
    style: 'pro1',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: lab.replace(/\n/g, ' '),
    labelPos: 'none',
    scale: bi ? BI : UNI,
    ...rest,
  });
  if (ly) label(x, ly, lab);
};
/** A vertical slide switch, on (or the first option) at the top. */
const slide = (id: string, x: number, y: number, rest: SlideRest): void => {
  controls.push({
    id,
    type: 'slide',
    x,
    y,
    w: 20,
    h: 55,
    orient: 'v',
    kind: 'bool',
    def: false,
    labelPos: 'none',
    ...rest,
  });
};

// ── Faceplate artwork ─────────────────────────────────────────────────────
[
  [70, 23],
  [702, 19],
  [1380, 19],
  [2009, 19],
  [70, 627],
  [702, 632],
  [1380, 632],
  [2009, 627],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 9 }));
decor.push({
  t: 'frame',
  x: 619,
  y: 41,
  w: 717,
  h: 137,
  r: 14,
  label: 'OSCILLATOR A',
  labelSize: 19,
});
decor.push({
  t: 'frame',
  x: 619,
  y: 187,
  w: 717,
  h: 133,
  r: 14,
  label: 'OSCILLATOR B',
  labelSize: 19,
});
decor.push({
  t: 'frame',
  x: 619,
  y: 330,
  w: 551,
  h: 136,
  r: 14,
  label: 'POLY-MOD',
  labelSize: 19,
  labelX: 978,
});
decor.push({ t: 'frame', x: 1186, y: 330, w: 146, h: 136, r: 14, labelAt: 'none' });
decor.push({
  t: 'frame',
  x: 619,
  y: 476,
  w: 551,
  h: 134,
  r: 14,
  label: 'LFO-MOD',
  labelSize: 19,
  labelX: 978,
});
decor.push({ t: 'frame', x: 1186, y: 476, w: 146, h: 134, r: 14, labelAt: 'none' });
decor.push({
  t: 'frame',
  x: 1356,
  y: 186,
  w: 530,
  h: 280,
  r: 14,
  label: 'FILTER',
  labelSize: 19,
  labelX: 1620,
});
decor.push({
  t: 'frame',
  x: 1356,
  y: 476,
  w: 530,
  h: 134,
  r: 14,
  label: 'AMPLIFIER',
  labelSize: 19,
  labelX: 1620,
});
text(1354, 62, 'ANALOG  8-VOICE POLYPHONIC SYNTHESIZER', 18, {
  anchor: 'start',
  spacing: '0.035em',
});
decor.push({ t: 'din', x: 1810, y: 104, r: 38 });
label(1810, 164, 'MIDI IN', 13);
decor.push({
  t: 'logo',
  x: 1967,
  y: 140,
  size: 34,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
decor.push({ t: 'led', x: 1967, y: 393, r: 6.5, color: 'red', litWhen: 'power' });
label(1967, 414, 'POWER', 11);

// Programmer: the inset panel, display, keypad and buttons. Printed only, apart from the two ARP buttons.
decor.push({
  t: 'rect',
  x: 84,
  y: 63,
  w: 521,
  h: 527,
  r: 12,
  fill: '#1f1f20',
  stroke: '#141415',
  sw: 2,
  hw: true,
});
label(203, 76, 'PROGRAM', 13);
decor.push({ t: 'rect', x: 104, y: 89, w: 197, h: 72, r: 4, fill: '#1b1516', hw: true });
text(202, 151, 'P800', 68, {
  fill: '#ff3a4c',
  weight: 500,
  spacing: '0.1em',
  hw: true,
  brand: true,
});
decor.push({ t: 'line', x1: 311, y1: 86, x2: 311, y2: 564, w: 2.4 });
decor.push({
  t: 'rect',
  x: 352,
  y: 86,
  w: 202,
  h: 49,
  r: 8,
  fill: '#f3f3f1',
  stroke: INK,
  sw: 1.5,
  brand: true,
});
text(453, 122, 'PRO-800', 34, { fill: '#18181a', weight: 600, spacing: '0.04em', brand: true });
[182, 254, 326].forEach((y) => decor.push({ t: 'line', x1: 328, y1: y, x2: 579, y2: y, w: 2.4 }));
const KEY = { w: 51, h: 51 };
/** A printed button: the rounded cap with its white rim, and the corner lamp when it has one. */
const capArt = (x: number, y: number, cap: string, size: number, lamp?: boolean): void => {
  decor.push({
    t: 'rect',
    x: x - KEY.w / 2,
    y: y - KEY.h / 2,
    w: KEY.w,
    h: KEY.h,
    r: 8,
    fill: '#161618',
    stroke: INK,
    sw: 2.4,
  });
  if (lamp)
    decor.push({ t: 'led', x: x - KEY.w / 2 + 8, y: y - KEY.h / 2 + 8, r: 3.6, color: 'red' });
  const lines = cap.split('\n').length;
  text(x, y - ((lines - 1) * size * 1.08) / 2 + size * 0.36, cap, size, { weight: 700 });
};
(
  [
    ['1', 137, 217],
    ['2', 203, 217],
    ['3', 270, 217],
    ['4', 137, 290],
    ['5', 203, 290],
    ['6', 270, 290],
    ['7', 137, 362],
    ['8', 203, 362],
    ['9', 270, 362],
    ['0', 203, 435],
  ] as const
).forEach(([n, x, y]) => capArt(x, y, n, 30));
label(203, 486, 'PROGRAM SELECT', 13);
(
  [
    ['PRESET', 354, 217],
    ['PERF', 421, 217],
    ['SETTINGS', 486, 217],
    ['TUNE', 552, 217],
    ['SYNC\nSOURCE', 354, 290],
    ['SYNC\nCLOCK', 453, 290],
    ['SEQ\n1', 354, 362],
    ['SEQ\n2', 421, 362],
  ] as const
).forEach(([t, x, y]) => capArt(x, y, t, 10, true));
decor.push({
  t: 'rect',
  x: 552 - KEY.w / 2,
  y: 290 - KEY.h / 2,
  w: KEY.w,
  h: KEY.h,
  r: 8,
  fill: '#e3252b',
  stroke: '#ff6b6b',
  sw: 2.4,
  hw: true,
});
label(552, 290, 'REC', 11, { weight: 700 });
decor.push({
  t: 'circle',
  x: 453,
  y: 494,
  r: 34,
  fill: '#0b0b0c',
  stroke: '#2a2b2e',
  sw: 2,
  hw: true,
});
decor.push({
  t: 'circle',
  x: 453,
  y: 494,
  r: 27,
  fill: 'url(#kysBlack)',
  stroke: '#3a3b3f',
  sw: 1.5,
});
label(453, 552, 'VALUE', 13);

// Jacks along the top: little arrows show which way the signal goes.
(
  [
    [1416, 'down', 'SYNC IN'],
    [1510, 'down', 'FILTER CV IN'],
    [1605, 'up', 'PHONES'],
    [1699, 'up', 'AUDIO OUT'],
  ] as const
).forEach(([x, dir, t]) => {
  decor.push({ t: 'arrow', x, y: 72, dir, size: 5 });
  label(x, 144, t, 11);
});

// ── Oscillator A ──────────────────────────────────────────────────────────
const OSC_FREQ = (n: string): Omit<KnobRest, 'help'> => ({
  def: 5,
  module: 'osc',
  fmt: (v) =>
    octaves(v) === 0 ? 'played note' : `${octaves(v) > 0 ? '+' : '−'}${Math.abs(octaves(v))} oct`,
  name: `OSC ${n} frequency`,
});
knob('osc1.freq', 695, 100, 'FREQUENCY', 164, {
  ...OSC_FREQ('A'),
  help: 'Pitch of OSC A in whole octaves: two octaves down or up from the middle, which plays the key’s own note. With SYNC on it changes the tone of OSC A instead of its note.',
});
slide('osc1.sync', 822, 112, {
  label: 'SYNC',
  name: 'OSC A sync',
  module: 'osc',
  help: 'Hard sync: OSC A restarts every time OSC B starts a cycle, so OSC B sets the note and OSC A’s FREQUENCY changes only the tone. Raise OSC A above OSC B for a hard, tearing sound.',
});
label(822, 75, 'SYNC', 11);
label(822, 152, 'OFF', 11);
const WAVES: [w: string, x: number, glyph: WaveShape, name: string, what: string][] = [
  [
    'saw',
    917,
    'saw',
    'sawtooth',
    'Bright and buzzy, with every harmonic: the usual starting point for brass, strings and bass.',
  ],
  ['tri', 979, 'tri', 'triangle', 'Soft and hollow, close to a sine: flutes, soft keys and bells.'],
  [
    'pulse',
    1042,
    'pulse',
    'pulse',
    'Hollow at 5 on PULSE WIDTH (a square wave) and thinner and more nasal as the width moves away from the middle.',
  ],
];
const waveSwitches = (n: number, osc: string, y: number, glyphY: number): void =>
  WAVES.forEach(([w, x, glyph, name, what]) => {
    slide(`osc${n}.${w}`, x, y, {
      def: w === 'saw',
      label: `OSC ${osc} ${name}`,
      name: `OSC ${osc} ${name}`,
      module: 'osc',
      help: `Switches OSC ${osc}’s ${name} wave on. ${what} The three switches can be on together, and their waves add up.`,
    });
    decor.push({ t: 'wave', x, y: glyphY, size: 9, shape: glyph, w: 2.4 });
  });
waveSwitches(1, 'A', 112, 73);
rule(979, 154, 'SHAPE', 917, 1042);
knob('osc1.pw', 1137, 100, 'PULSE WIDTH', 164, {
  def: 5,
  name: 'OSC A pulse width',
  module: 'osc',
  fmt: (v) => `${Math.round(3 + 9.4 * v)} %`,
  help: 'Width of OSC A’s pulse wave. At 5 it is a square, hollow like a clarinet; towards either end it narrows to a thin, reedy pulse. Only heard with the pulse switch on.',
});
knob('osc1.level', 1262, 100, 'LEVEL', 164, {
  def: 5,
  name: 'OSC A level',
  module: 'mixer',
  fmt: pct,
  help: 'How loud OSC A is going into the filter. Up to about 5 it is clean; above that it drives the filter harder, which adds grit and thickness.',
});

// ── Oscillator B ──────────────────────────────────────────────────────────
knob('osc2.freq', 695, 248, 'FREQUENCY', 308, {
  ...OSC_FREQ('B'),
  help: 'Pitch of OSC B in whole octaves: two octaves down or up from the middle. It is also the note OSC A follows when SYNC is on, and a modulation source for Poly-Mod.',
});
knob('osc2.fine', 822, 248, 'FINE', 308, {
  min: -5,
  max: 5,
  def: 0,
  name: 'OSC B fine tune',
  module: 'osc',
  fmt: cents,
  help: 'Tunes OSC B slightly flat or sharp of OSC A, up to a semitone either way. A little off the middle makes the two beat against each other, which thickens every note.',
});
waveSwitches(2, 'B', 256, 219);
rule(979, 298, 'SHAPE', 917, 1042);
knob('osc2.pw', 1137, 248, 'PULSE WIDTH', 308, {
  def: 5,
  name: 'OSC B pulse width',
  module: 'osc',
  fmt: (v) => `${Math.round(3 + 9.4 * v)} %`,
  help: 'Width of OSC B’s pulse wave. At 5 it is a square; towards either end it narrows to a thin, reedy pulse. Only heard with the pulse switch on.',
});
knob('osc2.level', 1262, 248, 'LEVEL', 308, {
  def: 0,
  name: 'OSC B level',
  module: 'mixer',
  fmt: pct,
  help: 'How loud OSC B is going into the filter. At 0 OSC B still runs, so it can still sync OSC A and feed Poly-Mod without being heard.',
});

// ── Poly-Mod ──────────────────────────────────────────────────────────────
knob('pmod.env', 695, 394, 'FIL ENV', null, {
  min: -5,
  max: 5,
  def: 0,
  name: 'Poly-Mod filter envelope amount',
  module: 'mod',
  fmt: signed,
  help: 'How much of the filter envelope goes to the Poly-Mod destinations. Zero is in the middle; turn right for a sweep that follows the envelope, left for one that moves the other way.',
});
knob('pmod.oscb', 822, 394, 'OSC B', null, {
  name: 'Poly-Mod OSC B amount',
  module: 'mod',
  fmt: pct,
  help: 'How much of OSC B goes to the Poly-Mod destinations. OSC B runs at audio speed, so on FREQ A it gives bell and metal tones (frequency modulation), and on FILTER a growl.',
});
rule(758, 454, 'SOURCE AMOUNT', 664, 853, 14);
slide('pmod.freqA', 978, 404, {
  label: 'FREQ A',
  name: 'Poly-Mod to OSC A frequency',
  module: 'mod',
  help: 'Sends Poly-Mod to OSC A’s pitch. With FIL ENV it bends OSC A at the start of each note (with SYNC on, a sweep of tone); with OSC B it gives metallic, bell-like frequency modulation.',
});
slide('pmod.filter', 1042, 404, {
  label: 'FILTER',
  name: 'Poly-Mod to the filter',
  module: 'mod',
  help: 'Sends Poly-Mod to the filter cutoff. FIL ENV here adds to the filter’s own envelope amount; OSC B here roughens the tone with audio-rate filter modulation.',
});
label(978, 364, 'FREQ A', 11);
label(1042, 364, 'FILTER', 11);
label(1010, 443, 'DESTINATION', 14);
slide('voice.unison', 1137, 404, {
  label: 'UNISON TRACK',
  module: 'mode',
  help: 'Puts all eight voices on one key, slightly detuned, so the synth plays one very thick note at a time. On the hardware, pressing it with a chord held gives chord memory instead; here it is always unison.',
});
label(1137, 352, 'UNISON', 11);
label(1137, 364, 'TRACK', 11);
label(1137, 443, 'OFF', 11);
knob('noise.level', 1262, 394, 'NOISE', 453, {
  module: 'mixer',
  fmt: pct,
  help: 'How much white noise goes into the filter: a little adds breath to a pad, a lot gives wind, surf and snare sounds.',
});
// the two source knobs are named after the last number of their scale: +5 FIL ENV, 10 OSC B
text(731, 443, 'FIL ENV', 11, { anchor: 'start' });
text(857, 443, 'OSC B', 11, { anchor: 'start' });

// ── LFO-Mod ───────────────────────────────────────────────────────────────
knob('lfo.rate', 695, 538, 'FREQUENCY', 598, {
  def: 5,
  name: 'LFO frequency',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every 12 seconds up to 20 Hz. Around 7 to 7.5 is a natural vibrato speed.',
});
slide('lfo.shape', 790, 534, {
  kind: 'enum',
  def: 'tri',
  options: [
    { v: 'tri', label: 'TRIANGLE' },
    { v: 'pulse', label: 'PULSE' },
  ],
  label: 'SHAPE',
  name: 'LFO shape',
  module: 'lfo',
  help: 'The LFO’s shape: up for a triangle, which sweeps smoothly back and forth; down for a pulse, which jumps between two values (a trill on pitch).',
});
(
  [
    [773, 'tri'],
    [790, 'sine'],
    [808, 'saw'],
  ] as const
).forEach(([x, shape]) => decor.push({ t: 'wave', x, y: 498, size: 6, shape, w: 2 }));
(
  [
    [773, 'sq'],
    [790, 'tmod'],
    [808, 'noise'],
  ] as const
).forEach(([x, shape]) => decor.push({ t: 'wave', x, y: 577, size: 6, shape, w: 2 }));
label(790, 598, 'SHAPE');
knob('lfo.amount', 884, 538, 'INITIAL AMOUNT', 598, {
  name: 'LFO initial amount',
  module: 'mod',
  fmt: pct,
  help: 'How strongly the LFO moves the destinations switched on beside it, without touching the mod wheel. The mod wheel adds more on top.',
});
slide('lfo.freq', 1011, 540, {
  label: 'FREQ A-B',
  name: 'LFO to oscillator frequency',
  module: 'mod',
  help: 'Lets the LFO move the pitch of both oscillators: a little is vibrato, more is a siren or, with the pulse shape, a trill.',
});
slide('lfo.pw', 1073, 540, {
  label: 'PW A-B',
  name: 'LFO to pulse width',
  module: 'mod',
  help: 'Lets the LFO sweep the pulse width of both oscillators, which makes pulse waves shimmer like a string section. Only heard on oscillators with the pulse switch on.',
});
slide('lfo.filter', 1137, 540, {
  label: 'FILTER',
  name: 'LFO to the filter',
  module: 'mod',
  help: 'Lets the LFO sweep the filter cutoff: slowly for a sound that opens and closes, quickly for a wah-wah or a growl.',
});
(
  [
    [1011, 'FREQ A-B'],
    [1073, 'PW A-B'],
    [1137, 'FILTER'],
  ] as const
).forEach(([x, t]) => label(x, 500, t, 11));
label(1073, 578, '- DESTINATION -', 14);
knob('glide.time', 1262, 538, 'GLIDE', 598, {
  name: 'Glide',
  module: 'glide',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: 'Makes the pitch slide from one note to the next instead of jumping. It works on every voice, so chords smear into each other; with UNISON TRACK it is a classic lead glide.',
});

// ── Filter ────────────────────────────────────────────────────────────────
knob('vcf.cutoff', 1432, 248, 'CUTOFF', 308, {
  def: 7,
  module: 'filter',
  fmt: (v) => fmtHz(vcfHz(v)),
  help: 'Cutoff of the 24 dB low-pass filter. Down makes the sound darker and duller; up lets all the brightness through.',
});
knob('vcf.res', 1558, 248, 'RESONANCE', 308, {
  module: 'filter',
  fmt: pct,
  help: 'A boost right at the cutoff that makes sweeps sound vocal and squelchy. Near the top the filter whistles on its own.',
});
knob('vcf.env', 1684, 248, 'ENVELOPE\nAMOUNT', 308, {
  min: -5,
  max: 5,
  def: 0,
  name: 'Filter envelope amount',
  module: 'filter',
  fmt: signed,
  help: 'How far the filter envelope moves the cutoff on each note. Zero is in the middle; right opens the filter as the envelope rises, left closes it.',
});
slide('vcf.kbd', 1810, 258, {
  kind: 'enum',
  def: 'half',
  options: [
    { v: 'full', label: 'FULL' },
    { v: 'half', label: '1/2' },
    { v: 'off', label: 'OFF' },
  ],
  label: 'KEYBOARD',
  name: 'Filter keyboard tracking',
  module: 'filter',
  help: 'How far the cutoff follows the notes you play. OFF keeps it still, so high notes sound duller; 1/2 follows half way; FULL follows exactly, so a whistling filter plays in tune.',
});
(
  [
    ['FULL', 239],
    ['1/2', 263],
    ['OFF', 287],
  ] as const
).forEach(([t, y]) => text(1827, y, t, 11, { anchor: 'start' }));
label(1810, 308, 'KEYBOARD');

// ── Envelopes ─────────────────────────────────────────────────────────────
const STAGES: [stage: string, top: string, x: number, help: string][] = [
  ['attack', 'ATTACK', 1432, 'how long it takes to rise to full after a key is pressed'],
  ['decay', 'DECAY', 1558, 'how long it takes to fall from the peak to the sustain level'],
  ['sustain', 'SUSTAIN', 1684, 'the level it holds while the key is held down'],
  ['release', 'RELEASE', 1810, 'how long it takes to fade to nothing after the key is let go'],
];
const ENV_DEF: Record<string, number[]> = { fenv: [0, 5, 5, 4], aenv: [0, 5, 10, 4] };
(
  [
    [
      'fenv',
      394,
      452,
      'Filter envelope',
      'the filter cutoff (by ENVELOPE AMOUNT) and Poly-Mod (by FIL ENV)',
    ],
    ['aenv', 539, 597, 'Amplifier envelope', 'the volume of each note'],
  ] as const
).forEach(([e, y, ly, full, what]) => {
  STAGES.forEach(([stage, top, x, help], i) => {
    const isTime = stage !== 'sustain';
    knob(`${e}.${stage}`, x, y, top, ly, {
      def: ENV_DEF[e][i],
      name: `${full} ${stage}`,
      module: e === 'fenv' ? 'env' : 'amp',
      fmt: isTime ? (v) => fmtTime(envTime(v)) : pct,
      help: `${full}: ${help}. It shapes ${what}.${isTime ? ' Times run from half a millisecond to about 37 seconds.' : ''}`,
    });
  });
});

// ── Output ────────────────────────────────────────────────────────────────
knob('out.tune', 1968, 248, 'MASTER TUNE', 308, {
  min: -5,
  max: 5,
  def: 0,
  module: 'out',
  fmt: cents,
  help: 'Tunes the whole synth up or down by up to a semitone.',
});
knob('out.volume', 1967, 539, 'VOLUME', 597, {
  def: 7,
  module: 'out',
  fmt: pct,
  help: 'Master output level.',
});

// ── Programmer: the two arpeggiator buttons ───────────────────────────────
const arpButton = (id: string, x: number, cap: string, rest: ArpRest): void => {
  controls.push({
    id,
    type: 'button',
    face: 'ring',
    x,
    y: 362,
    ...KEY,
    kind: 'bool',
    def: false,
    caption: cap,
    captionSize: 10,
    labelPos: 'none',
    module: 'mode',
    ...rest,
  });
};
arpButton('arp.updn', 486, 'ARP\nUP-DN', {
  label: 'ARP UP-DN',
  name: 'Arpeggiator (up and down)',
  help: 'Turns the arpeggiator on: hold a chord and its notes play one at a time, from the lowest key up to the highest and back down, at 120 BPM. Its lamp lights while it is on.',
});
arpButton('arp.assign', 552, 'ARP\nASSIGN', {
  label: 'ARP ASSIGN',
  name: 'Arpeggiator (played order)',
  help: 'Turns the arpeggiator on in the order you pressed the keys, rather than by pitch. If ARP UP-DN is lit as well, UP-DN wins here.',
});

// ── Jacks ─────────────────────────────────────────────────────────────────
const jacks: Jack[] = [
  {
    id: 'j.sync_in',
    x: 1416,
    y: 104,
    r: 15,
    label: 'SYNC IN',
    labelPos: 'none',
    dir: 'in',
    dest: null,
    help: 'A clock input for the arpeggiator and sequencer, from a drum machine or another sequencer. Not modelled here: a cable can be drawn but does nothing.',
  },
  {
    id: 'j.filter_cv',
    x: 1510,
    y: 104,
    r: 15,
    label: 'FILTER CV IN',
    labelPos: 'none',
    dir: 'in',
    dest: 'cutoff',
    amt: 5,
    add: true,
    help: 'A control voltage (0 to 10 V) added to the cutoff of all eight filters. On the hardware its depth is set in the global settings; here a full-scale signal moves the cutoff five octaves.',
  },
  {
    id: 'j.phones',
    x: 1605,
    y: 104,
    r: 15,
    label: 'PHONES',
    labelPos: 'none',
    dir: 'out',
    signal: 'out',
    help: 'Headphone output: the same sound as the main output.',
  },
  {
    id: 'j.audio_out',
    x: 1699,
    y: 104,
    r: 15,
    label: 'AUDIO OUT',
    labelPos: 'none',
    dir: 'out',
    signal: 'out',
    help: 'The synth’s audio output on a small jack (the rear panel has a full-size one). In a Eurorack case this is the only output.',
  },
];

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'program',
    label: 'Programs',
    module: 'util',
    keywords: 'display keypad preset memory bank number',
    rects: [R(33, 0, 318, 652)],
    help: 'The display and the number keys. On the hardware they choose one of 400 stored programs and edit the settings in the menus. Printed only: this app keeps its sounds in the library instead.',
  },
  {
    id: 'programmer',
    label: 'Programmer',
    module: 'util',
    keywords: 'arpeggiator arp latch sequencer record tempo clock menu settings perf tune',
    rects: [R(318, 0, 612, 652)],
    help: 'The function buttons and the VALUE encoder. ARP UP-DN and ARP ASSIGN start the arpeggiator, playing held notes one at a time in pitch order or in the order you pressed them. PRESET, PERF, SETTINGS, TUNE, the sync and sequencer buttons and REC are printed but not modelled.',
  },
  {
    id: 'oscA',
    label: 'Oscillator A',
    module: 'osc',
    keywords: 'vco sawtooth triangle pulse square pwm sync waveform octave',
    rects: [R(612, 0, 1343, 182)],
    help: 'The first oscillator in each voice. FREQUENCY sets its octave; the three SHAPE switches turn the sawtooth, triangle and pulse on, alone or together; PULSE WIDTH shapes the pulse and LEVEL sets how loud it is. SYNC locks it to OSC B.',
  },
  {
    id: 'oscB',
    label: 'Oscillator B',
    module: 'osc',
    keywords: 'vco detune fine sawtooth triangle pulse waveform octave',
    rects: [R(612, 182, 1343, 325)],
    help: 'The second oscillator, laid out like OSC A with FINE in place of the sync switch, to detune it against OSC A. It is also a modulation source: it drives Poly-Mod and is the note OSC A follows when synced.',
  },
  {
    id: 'pmod',
    label: 'Poly-Mod',
    module: 'mod',
    keywords: 'fm frequency modulation cross modulation sync sweep bell metallic',
    rects: [R(612, 325, 1100, 471)],
    help: 'Modulation inside each voice. FIL ENV and OSC B set how much of the filter envelope and of OSC B are mixed; FREQ A and FILTER send the mix to OSC A’s pitch, the filter cutoff, or both. Because every voice has its own, chords stay in tune.',
  },
  {
    id: 'voices',
    label: 'Unison',
    module: 'mode',
    keywords: 'unison stack mono chord memory voices detune',
    rects: [R(1100, 325, 1178, 471)],
    help: 'UNISON TRACK stacks all eight voices on one note, detuned against each other, for a single very thick note: leads and basses.',
  },
  {
    id: 'noise',
    label: 'Noise',
    module: 'mixer',
    keywords: 'white noise hiss breath wind',
    rects: [R(1178, 325, 1343, 471)],
    help: 'The NOISE level into the filter, alongside the two oscillator LEVEL knobs.',
  },
  {
    id: 'lfo',
    label: 'LFO-Mod',
    module: 'lfo',
    keywords: 'lfo vibrato wah tremolo pwm trill mod wheel',
    rects: [R(612, 471, 1178, 652)],
    help: 'One LFO for all the voices. FREQUENCY sets its speed and SHAPE picks triangle or pulse. INITIAL AMOUNT sets how strongly it moves the destinations switched on: both oscillators’ pitch, both pulse widths and the filter. The mod wheel adds more.',
  },
  {
    id: 'glide',
    label: 'Glide',
    module: 'glide',
    keywords: 'portamento slide',
    rects: [R(1178, 471, 1343, 652)],
    help: 'GLIDE makes each voice slide from its last note to the next instead of jumping.',
  },
  {
    id: 'top',
    label: 'Connections',
    module: 'out',
    keywords: 'jacks output headphones midi clock cv',
    rects: [R(1343, 0, 2051, 182)],
    help: 'The sockets: SYNC IN for an external clock, FILTER CV IN to move all eight filters from another device, PHONES, AUDIO OUT and MIDI IN.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf cutoff resonance low-pass 24 db keyboard tracking brightness',
    rects: [R(1343, 182, 1893, 325)],
    help: 'A 24 dB low-pass filter in each voice. CUTOFF sets the brightness and RESONANCE the emphasis at the cutoff. ENVELOPE AMOUNT sets how far the filter envelope moves it, either way from the middle, and KEYBOARD how far it follows the notes.',
  },
  {
    id: 'fenv',
    label: 'Filter envelope',
    module: 'env',
    keywords: 'adsr attack decay sustain release contour eg',
    rects: [R(1343, 325, 1893, 471)],
    help: 'An ADSR envelope, one per voice, that moves the filter by ENVELOPE AMOUNT and feeds Poly-Mod through FIL ENV.',
  },
  {
    id: 'aenv',
    label: 'Amplifier',
    module: 'amp',
    keywords: 'adsr vca volume loudness attack decay sustain release',
    rects: [R(1343, 471, 1893, 652)],
    help: 'The ADSR envelope that shapes the volume of every note: how quickly it starts, how it falls to the level it holds, and how long it takes to die away after the key is let go.',
  },
  {
    id: 'master',
    label: 'Master',
    module: 'out',
    keywords: 'volume tuning power',
    rects: [R(1893, 182, 2051, 652)],
    help: 'MASTER TUNE and VOLUME for the whole synth, and the power lamp.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const envOf = (v: ControlValues, e: string): EnvParams => ({
  a: envTime(num(v, `${e}.attack`)),
  d: envTime(num(v, `${e}.decay`)),
  s: num(v, `${e}.sustain`) / 10,
  r: envTime(num(v, `${e}.release`)),
});
const oscOf = (v: ControlValues, n: number): Omit<OscParams, 'semi'> => ({
  level: 0.34 * (num(v, `osc${n}.level`) / 5),
  mix: {
    saw: v[`osc${n}.saw`] ? 1 : 0,
    tri: v[`osc${n}.tri`] ? 1 : 0,
    pulse: v[`osc${n}.pulse`] ? 1 : 0,
  },
  pw: 0.03 + 0.094 * num(v, `osc${n}.pw`),
});
const KBD_TRACK: Record<string, number> = { off: 0, half: 0.5, full: 1 };

function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number): void => {
    if (amt !== 0) routes.push({ src, dst, amt });
  };
  // Poly-Mod: the filter envelope (either way) and OSC B, summed, to OSC A pitch and/or the filter, inside each voice
  const pe = num(v, 'pmod.env') / 5;
  const pb = num(v, 'pmod.oscb') / 10;
  if (v['pmod.freqA']) {
    route('env1', 'pitch1', Math.sign(pe) * 48 * pe * pe);
    route('osc2', 'pitch1', 24 * pb * pb);
  }
  if (v['pmod.filter']) {
    route('env1', 'cutoff', 5 * pe);
    route('osc2', 'cutoff', 4 * pb);
  }
  // LFO: INITIAL AMOUNT plus the mod wheel sets the depth
  const d = clamp(num(v, 'lfo.amount') / 10 + (ctx.wheel || 0), 0, 1);
  if (v['lfo.freq']) {
    route('lfo', 'pitch1', 12 * d * d);
    route('lfo', 'pitch2', 12 * d * d);
  }
  if (v['lfo.pw']) {
    route('lfo', 'pw1', 0.45 * d);
    route('lfo', 'pw2', 0.45 * d);
  }
  if (v['lfo.filter']) route('lfo', 'cutoff', 4 * d);

  const unison = !!v['voice.unison'];
  const arpOn = !!(v['arp.updn'] || v['arp.assign']);
  return {
    osc: [
      {
        ...oscOf(v, 1),
        semi: 12 * octaves(num(v, 'osc1.freq')),
        kbd: true,
        syncTo: v['osc1.sync'] ? 1 : -1,
      },
      {
        ...oscOf(v, 2),
        semi: 12 * octaves(num(v, 'osc2.freq')) + num(v, 'osc2.fine') / 5,
        kbd: true,
        syncTo: -1,
      },
    ],
    noise: { level: level10(num(v, 'noise.level'), 0.8), color: 'white' },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.cutoff')),
      res: (num(v, 'vcf.res') / 10) * 1.08,
      envAmt: (num(v, 'vcf.env') / 5) * 7,
      envSrc: 'env1',
      kbd: KBD_TRACK[String(v['vcf.kbd'])],
    },
    env1: envOf(v, 'fenv'),
    env2: envOf(v, 'aenv'),
    vca: { envSrc: 'env2', bias: 0 },
    lfo: {
      rate: lfoHz(num(v, 'lfo.rate')),
      mix: v['lfo.shape'] === 'pulse' ? { sq: 1 } : { tri: 1 },
      keySync: false,
    },
    glide: { time: glideTime(num(v, 'glide.time')), legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly: { voices: 8, stack: unison ? 8 : 1, mono: unison, detune: unison ? 0.1 : 0 },
    arp: {
      on: arpOn,
      bpm: 120,
      gate: 0.5,
      mode: v['arp.updn'] ? 'updown' : 'played',
      octaves: 1,
      hold: false,
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

const pro800: SynthDef & { version: number } = {
  id: 'pro-800',
  version: 1,
  name: 'PRO-800',
  maker: 'Behringer',
  year: 2023,
  heritage: 'Based on the 1982 Sequential Circuits Prophet-600',
  summary:
    'Eight analogue voices, each with two oscillators (sawtooth, triangle and pulse, mixable; A syncs to B) and noise → 24 dB low-pass filter → VCA, with a filter and an amplifier envelope. Poly-Mod sends the filter envelope and OSC B to OSC A’s pitch and the filter; one LFO, glide, unison and an arpeggiator.',
  view: { w: 2084, h: 652 },
  theme: {
    panel: '#2a2a2b',
    panel2: '#232324',
    ink: INK,
    font: 'din',
    weight: 700,
    cheeks: 'wood',
    cheekW: 33,
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
  signalNames: {
    env1: 'the filter envelope',
    env2: 'the amplifier envelope',
    osc1: 'OSC A',
    osc2: 'OSC B',
  },
};

export default pro800;
