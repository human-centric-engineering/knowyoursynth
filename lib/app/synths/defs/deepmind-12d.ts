/**
 * Behringer DeepMind 12D: the definition (D1). Positions are measured in pixels on the 1200×1200 product photo and
 * mapped into view units by X() / Y() (the faceplate crop, doubled). The data model is the DeepMind 12D synth.json
 * (manual v1.0).
 *
 * The DeepMind is programmed as much from its display as from its faders, and one row of four faders serves three
 * envelopes. Both are modelled with panel modes (see CONTRACT.md → Panel modes): `ui.page` is the EDIT button that is
 * lit, and picks which menu rows the display shows; `env.select` and `env.curves` pick which of the twelve envelope
 * controls the A D S R faders are. Panel modes are not part of any sound.
 *
 * The effects engine is four slots, each loaded with one of the 35 algorithms in `defs/deepmind-12d-fx.ts`. Every
 * parameter of every algorithm in every slot is a control of its own, which is why this is the largest definition.
 *
 * Transliterated from the prototype file `src/synths/deepmind-12d.js` (D3), the way `defs/model-d.ts` was: no content
 * (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the "behringer" logo and the
 * "DeepMind 12" wordmark), and panel values read through `num()`.
 */
import type {
  ArpMode,
  Area,
  Control,
  ControlCommon,
  ControlOption,
  ControlValues,
  ContinuousValue,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  EnumValue,
  EnvParams,
  FxParams,
  FxSlot,
  LfoMix,
  LfoParams,
  ShowCondition,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import {
  FX_ALGOS,
  FX_MODES,
  FX_ROUTINGS,
  type FxAlgoDef,
  type FxUnit,
} from '@/lib/app/synths/defs/deepmind-12d-fx';
import { num } from '@/lib/app/synths/lib/def-kit';
import {
  type CurvePoint,
  expMap,
  fmtHz,
  fmtSemi,
  fmtTime,
  level10,
  pwl,
} from '@/lib/app/synths/lib/maps';

type Common = Omit<ControlCommon, 'id' | 'x' | 'y'>;
type ContRest = Common & Partial<Omit<ContinuousValue, 'kind'>>;
type ButtonRest = Common & { def: boolean };
type MenuRest = Common & (EnumValue | ContinuousValue);
type FxRowRest = Omit<Common, 'module'> & { vw?: number } & (EnumValue | ContinuousValue);
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'brand'>>;

const X = (px: number): number => Math.round((px - 93) * 2);
const Y = (py: number): number => Math.round((py - 351) * 2);

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The manual gives the end points of most faders but not the curve between them, and no envelope times at all.
// Frequencies and times use exponential curves; the envelope times are this app's estimate.
const ENV_PTS: CurvePoint[] = [
  [0, 0.0005],
  [2, 0.03],
  [4, 0.18],
  [6, 0.8],
  [8, 3.5],
  [10, 15],
];
const envTime = (v: number): number => pwl(v, ENV_PTS, true);
const lfoHz = (v: number): number => expMap(v / 10, 0.041, 65.4);
const lfoDelay = (v: number): number => 6.59 * Math.pow(v / 10, 2);
const vcfHz = (v: number): number => expMap(v / 10, 50, 20000);
const hpfHz = (v: number): number => expMap(v / 10, 20, 2000);
const bpm = (v: number): number => 20 + 25.5 * v;
const portaTime = (v: number): number => 10 * Math.pow(v / 10, 2);
const pitchModSemi = (v: number): number => 36 * Math.pow(v / 10, 2);
/** OSC 2 LEVEL and NOISE LEVEL: off at the bottom, then −48 dB to 0 dB. */
const dbLevel = (v: number): number => (v <= 0 ? 0 : Math.pow(10, (-48 + 4.8 * v) / 20));
const fmtDb = (v: number): string => (v <= 0 ? 'off' : `${(-48 + 4.8 * v).toFixed(1)} dB`);
const vcaDb = (v: number): number => -3 + 1.8 * v; // printed −5 … +5, manual −12 dB … +6 dB

const RANGE: ControlOption[] = [
  { v: '16', label: "16'" },
  { v: '8', label: "8'" },
  { v: '4', label: "4'" },
];
const RANGE_SEMI: Record<string, number> = { 16: -12, 8: 0, 4: 12 };
const MOD_SRC: ControlOption[] = [
  { v: 'lfo1', label: 'LFO 1' },
  { v: 'lfo2', label: 'LFO 2' },
  { v: 'vcaEnv', label: 'VCA ENV' },
  { v: 'vcfEnv', label: 'VCF ENV' },
  { v: 'modEnv', label: 'MOD ENV' },
  { v: 'lfo1uni', label: 'LFO 1 UNI' },
  { v: 'lfo2uni', label: 'LFO 2 UNI' },
];
const MANUAL_SRC: ControlOption[] = [{ v: 'manual', label: 'MANUAL' }, ...MOD_SRC.slice(0, 5)];
/** Matrix source → engine signal. VCF envelope = env1, VCA envelope = env2, MOD envelope = env3. */
const SIG: Record<string, string> = {
  lfo1: 'lfo',
  lfo2: 'lfo2',
  vcaEnv: 'env2',
  vcfEnv: 'env1',
  modEnv: 'env3',
  lfo1uni: 'lfoUni',
  lfo2uni: 'lfo2Uni',
};
const BIPOLAR: Record<string, boolean> = { lfo1: true, lfo2: true };
const SHAPES: ControlOption[] = [
  { v: 'sine', label: 'SINE' },
  { v: 'tri', label: 'TRIANGLE' },
  { v: 'sq', label: 'SQUARE' },
  { v: 'up', label: 'RAMP UP' },
  { v: 'down', label: 'RAMP DOWN' },
  { v: 'sh', label: 'S&H' },
  { v: 'sg', label: 'S&GLIDE' },
];
const SHAPE_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  tri: { tri: 1 },
  sq: { sq: 1 },
  up: { saw: 1 },
  down: { rsaw: 1 },
  sh: { sh: 1 },
  sg: { shg: 1 },
};
const OFF_ON: ControlOption[] = [
  { v: 'off', label: 'OFF' },
  { v: 'on', label: 'ON' },
];
const POLY_MODES: ControlOption[] = [
  { v: 'poly', label: 'POLY' },
  { v: 'uni2', label: 'UNISON-2' },
  { v: 'uni3', label: 'UNISON-3' },
  { v: 'uni4', label: 'UNISON-4' },
  { v: 'uni6', label: 'UNISON-6' },
  { v: 'uni12', label: 'UNISON-12' },
  { v: 'mono', label: 'MONO' },
  { v: 'mono2', label: 'MONO-2' },
  { v: 'mono3', label: 'MONO-3' },
  { v: 'mono4', label: 'MONO-4' },
  { v: 'mono6', label: 'MONO-6' },
  { v: 'poly6', label: 'POLY-6' },
  { v: 'poly8', label: 'POLY-8' },
];
/** POLYPHONY → [voices, stack, mono]. */
const POLY_SHAPE: Record<string, [number, number, boolean]> = {
  poly: [12, 1, false],
  uni2: [12, 2, false],
  uni3: [12, 3, false],
  uni4: [12, 4, false],
  uni6: [12, 6, false],
  uni12: [12, 12, false],
  mono: [12, 1, true],
  mono2: [12, 2, true],
  mono3: [12, 3, true],
  mono4: [12, 4, true],
  mono6: [12, 6, true],
  poly6: [6, 1, false],
  poly8: [8, 1, false],
};

const controls: Control[] = [];
const decor: Decor[] = [];
const text = (px: number, py: number, t: string, size = 26, rest: TextRest = {}): void => {
  decor.push({ t: 'text', x: X(px), y: Y(py), text: t, size, anchor: 'middle', ...rest });
};

// ── Faceplate artwork ─────────────────────────────────────────────────────
const TOP: [number, number] = [418, 612];
const BOT: [number, number] = [618, 836];
// Each section sits on a slightly lighter plate with its name on a bar across the top.
const section = (x0: number, x1: number, row: [number, number], name: string): void => {
  const [y0, y1] = row;
  decor.push({
    t: 'rect',
    x: X(x0),
    y: Y(y0 + 4),
    w: X(x1) - X(x0),
    h: Y(y1) - Y(y0 + 4),
    r: 5,
    fill: '#2c2d30',
    hw: true,
  });
  decor.push({
    t: 'rect',
    x: X(x0),
    y: Y(y0 + 4),
    w: X(x1) - X(x0),
    h: 40,
    r: 4,
    fill: '#35363a',
    hw: true,
  });
  if (name) text((x0 + x1) / 2, y0 + 20, name, 30, { weight: 600 });
};
section(147, 207, TOP, '');
section(210, 342, TOP, 'ARP / SEQ');
section(346, 571, TOP, 'LFO 1&2');
section(575, 995, TOP, '');
section(999, 1050, TOP, 'POLY');
section(212, 509, BOT, 'OSC 1&2');
section(513, 731, BOT, 'VCF');
section(735, 784, BOT, 'VCA');
section(788, 840, BOT, 'HPF');
section(845, 1050, BOT, 'ENVELOPES');

text(253, 406, 'DeepMind 12', 62, {
  weight: 700,
  fill: '#c9cacc',
  spacing: '0.01em',
  brand: true,
});
text(374, 409, 'ANALOG 12-VOICE POLYPHONIC SYNTHESIZER', 19, { anchor: 'start', weight: 600 });
decor.push({
  t: 'logo',
  x: X(172.5),
  y: Y(527),
  size: 15,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
text(752, 408, 'VOICES', 15, { anchor: 'end' });
for (let i = 0; i < 12; i++) {
  const x = 777.5 + i * 22.6;
  text(x, 396, String(i + 1), 15);
  decor.push({ t: 'led', x: X(x), y: Y(404), r: 5, color: 'amber', litWhen: { voice: i } });
}

// Fader scales: lines printed right across each group of faders, numbered at both ends.
const scale = (x0: number, x1: number, row: 'top' | 'bot', labels = ['10', '5', '0']): void => {
  const [yTop, yBot] = row === 'top' ? [486, 552.5] : [687.5, 755];
  for (let i = 0; i <= 10; i++) {
    const y = yTop + ((yBot - yTop) * i) / 10;
    decor.push({
      t: 'line',
      x1: X(x0 - 12),
      y1: Y(y),
      x2: X(x1 + 12),
      y2: Y(y),
      w: i % 5 === 0 ? 2.4 : 1.6,
      opacity: i % 5 === 0 ? 0.8 : 0.45,
    });
  }
  [0, 5, 10].forEach((i, k) => {
    const y = Y(yTop + ((yBot - yTop) * i) / 10) + 6;
    decor.push({ t: 'text', x: X(x0 - 15), y, text: labels[k], size: 15, anchor: 'end' });
    decor.push({ t: 'text', x: X(x1 + 15), y, text: labels[k], size: 15, anchor: 'start' });
  });
};
scale(277, 317.5, 'top');
scale(371.5, 411.5, 'top');
scale(503.5, 544, 'top');
scale(971, 971, 'top');
scale(1026.5, 1026.5, 'top');
scale(237.5, 277.5, 'bot');
scale(325, 483.5, 'bot');
scale(538.5, 578, 'bot');
scale(626, 705.5, 'bot');
scale(760, 760, 'bot', ['+5', '0', '−5']);
scale(815, 815, 'bot');
scale(870, 988.5, 'bot');

// ── Controls ──────────────────────────────────────────────────────────────
const TOP_Y = Y(519.25);
const BOT_Y = Y(721.25);
const fader = (id: string, px: number, row: 'top' | 'bot', rest: ContRest): void => {
  controls.push({
    id,
    type: 'fader',
    x: X(px),
    y: row === 'top' ? TOP_Y : BOT_Y,
    len: row === 'top' ? 133 : 135,
    orient: 'v',
    ticks: 0,
    pad: 16,
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'top',
    labelSize: 17,
    ...rest,
  });
};
const BTN = { w: 44, h: 34 };
const button = (
  id: string,
  px: number,
  py: number,
  lamp: 'white' | 'blue',
  rest: ButtonRest
): void => {
  controls.push({
    id,
    type: 'button',
    x: X(px),
    y: Y(py),
    ...BTN,
    lamp,
    kind: 'bool',
    labelPos: 'top',
    labelSize: 15,
    ...rest,
  });
};
/** Hardware buttons and faders that this app does not model, printed as artwork. */
const deadButton = (px: number, py: number, lamp: string, label: string): void => {
  const fill = lamp === 'blue' ? '#2f4d53' : lamp === 'amber' ? '#5a4526' : '#4b4e50'; // unlit, like a real button that is off
  decor.push({
    t: 'rect',
    x: X(px) - 22,
    y: Y(py) - 17,
    w: 44,
    h: 34,
    r: 6,
    fill,
    stroke: '#000',
    sw: 1.5,
  });
  if (label) text(px, py - 17 - (label.split('\n').length - 1) * 8, label, 15);
};

// ARP / SEQ
deadButton(238.5, 486, 'blue', 'CHORD');
deadButton(238.5, 539, 'blue', 'POLY\nCHORD');
fader('arp.rate', 277, 'top', {
  def: 3.9,
  label: 'RATE',
  module: 'mode',
  fmt: (v) => `${Math.round(bpm(v))} BPM`,
  help: 'Speed of the arpeggiator, as the master tempo in beats per minute. The arpeggiator plays four notes to the beat.',
});
fader('arp.gate', 317.5, 'top', {
  def: 7.5,
  label: 'GATE\nTIME',
  module: 'mode',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How long each arpeggiated note lasts, as a share of the step. Short gives staccato plucks, full length makes the notes join up.',
});
button('arp.on', 238.5, 588.5, 'white', {
  def: false,
  label: 'ON/OFF',
  module: 'mode',
  help: 'Turns the arpeggiator on. Hold a chord and it plays the notes one at a time, in the order set in the ARP EDIT menu.',
});
button('arp.hold', 277, 588.5, 'blue', {
  def: false,
  label: 'TAP/HOLD',
  module: 'mode',
  help: 'Latches the arpeggio, so it keeps playing after you let go. Playing a new chord replaces the held one.',
});

// LFO 1 & 2
(
  [
    [1, 371.5, 411.5],
    [2, 503.5, 544],
  ] as const
).forEach(([n, xr, xd]) => {
  fader(`lfo${n}.rate`, xr, 'top', {
    def: 4,
    label: 'RATE',
    module: 'lfo',
    fmt: (v) => fmtHz(lfoHz(v)),
    help: `Speed of LFO ${n}, from one cycle every 24 seconds up to 65 Hz, which is fast enough to hear as a tone of its own.`,
  });
  fader(`lfo${n}.delay`, xd, 'top', {
    def: 0,
    label: 'DELAY\nTIME',
    module: 'lfo',
    fmt: (v) => (v <= 0 ? 'off' : fmtTime(lfoDelay(v))),
    help: `Holds LFO ${n} back at the start of each note and then fades it in, so a note starts steady and the wobble grows. The first 40% of the time is silence, the rest a fade-in.`,
  });
});
const SHAPE_ROWS = [475.5, 490, 504, 518, 532, 546, 560];
const SHAPE_GLYPH = ['sine', 'tri', 'sq', 'saw', 'rsaw'] as const;
SHAPES.forEach((s, i) => {
  const y = SHAPE_ROWS[i];
  if (i < 5) {
    decor.push({ t: 'wave', x: X(457.5), y: Y(y), size: 9, shape: SHAPE_GLYPH[i], w: 2.2 });
  } else text(457.5, y + 3.5, i === 5 ? 'S&H' : 'S&G', 12);
  decor.push({
    t: 'led',
    x: X(444),
    y: Y(y),
    r: 5,
    color: 'amber',
    litWhen: { id: 'lfo1.shape', eq: s.v },
  });
  decor.push({
    t: 'led',
    x: X(471),
    y: Y(y),
    r: 5,
    color: 'amber',
    litWhen: { id: 'lfo2.shape', eq: s.v },
  });
});

// Display, its buttons and the data entry controls
decor.push({
  t: 'lcd',
  x: X(588),
  y: Y(449),
  w: X(764) - X(588),
  h: Y(560) - Y(449),
  page: 'ui.page',
  titles: {
    prog: 'PROGRAM',
    arp: 'ARP EDIT',
    lfo1: 'LFO 1 EDIT',
    lfo2: 'LFO 2 EDIT',
    poly: 'POLY EDIT',
    osc: 'OSC EDIT',
    vcf: 'VCF EDIT',
    vca: 'VCA EDIT',
    fx: 'FX',
    global: 'GLOBAL',
    compare: 'COMPARE',
    write: 'WRITE',
  },
  notes: {
    prog: "Press an EDIT button to\nopen that section's menu\nhere. Click a value to\nchange it.",
    vca: 'Velocity, pan spread and\nVCA mode are not\nmodelled here.',
    global: 'Global settings are not\nmodelled here.',
    compare: "Not modelled: sounds are\nkept in this app's\nlibrary instead.",
    write: "Not modelled: sounds are\nkept in this app's\nlibrary instead.",
  },
});
const PAGE_BTN: [string, number, string][] = [
  ['arp', 316.5, 'EDIT'],
  ['lfo1', 391.5, 'EDIT'],
  ['lfo2', 524, 'EDIT'],
  ['prog', 596.5, 'PROG'],
  ['fx', 637.5, 'FX'],
  ['global', 676, 'GLOBAL'],
  ['compare', 715, 'COMPARE'],
  ['write', 755, 'WRITE'],
  ['poly', 1026, 'EDIT'],
];
const PAGE_BTN_LOW: [string, number, string][] = [
  ['osc', 384, 'EDIT'],
  ['vcf', 578, 'EDIT'],
  ['vca', 760, 'EDIT'],
];
controls.push({
  id: 'ui.page',
  type: 'select',
  ui: true,
  x: X(676),
  y: Y(504.5),
  ...BTN,
  lamp: 'amber',
  kind: 'enum',
  def: 'prog',
  label: 'Display page',
  labelPos: 'none',
  module: 'mode',
  options: [
    ...PAGE_BTN.map(([v, px, t]) => ({
      v,
      label: `${t === 'EDIT' ? `${v.toUpperCase()} ` : ''}${t}`,
      text: t,
      x: X(px),
      y: Y(588.5),
    })),
    ...PAGE_BTN_LOW.map(([v, px, t]) => ({
      v,
      label: `${v.toUpperCase()} ${t}`,
      text: t,
      x: X(px),
      y: Y(791),
    })),
  ].map((o) => ({ ...o, label: o.label.replace('LFO1', 'LFO 1').replace('LFO2', 'LFO 2') })),
  help: "The amber EDIT buttons open each section's menu on the display, and PROG goes back to the program screen. Only one is lit at a time. This changes what you see, not the sound.",
});
(
  [
    [858, 468.5, 'BANK/UP', -1],
    [808.5, 514, '−/NO', 0],
    [906.5, 514, '+/YES', 0],
    [858, 560, 'BANK/DOWN', 1],
  ] as const
).forEach(([px, py, t, pos]) => {
  deadButton(px, py, 'white', pos < 0 ? t : '');
  if (pos === 0) text(px, py - 17, t, 15);
  if (pos > 0) text(px, py + 30, t, 15);
});
decor.push({
  t: 'circle',
  x: X(858),
  y: Y(514),
  r: 50,
  fill: '#08090a',
  stroke: '#3c3d41',
  sw: 3,
});
decor.push({
  t: 'circle',
  x: X(858),
  y: Y(514),
  r: 34,
  fill: '#1c1d20',
  stroke: '#9c9ea3',
  sw: 4,
});
text(971, 462, 'DATA\nENTRY', 17);
decor.push({
  t: 'rect',
  x: X(971) - 7,
  y: Y(486) - 16,
  w: 14,
  h: 133 + 32,
  r: 7,
  fill: '#040405',
  stroke: '#2c2d31',
  sw: 1.5,
});
decor.push({
  t: 'rect',
  x: X(971) - 13,
  y: Y(496) - 10,
  w: 26,
  h: 20,
  r: 4,
  fill: '#1d1e21',
  stroke: '#3d3e43',
  sw: 1.2,
});
deadButton(971, 588.5, 'blue', 'MOD');

// POLY
fader('voice.detune', 1026.5, 'top', {
  def: 0,
  label: 'UNISON\nDETUNE',
  module: 'osc',
  fmt: (v) => `±${(v * 5).toFixed(1)} cents`,
  help: 'How far apart the stacked voices are tuned when the POLY EDIT menu stacks several voices on each note (UNISON or MONO-2 and up). Up to 50 cents either side.',
});

// Volume and portamento
const KNOB_SCALE = {
  ticks: 11,
  labels: [
    { at: 0, text: '0' },
    { at: 10, text: '10' },
  ],
  size: 15,
};
controls.push(
  {
    id: 'out.volume',
    type: 'knob',
    x: X(172.5),
    y: Y(652.5),
    r: 26,
    style: 'd-silver',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 7,
    label: 'VOLUME',
    labelPos: 'bottom',
    labelSize: 17,
    labelGap: 8,
    module: 'out',
    scale: KNOB_SCALE,
    help: 'Master output level.',
  },
  {
    id: 'glide.time',
    type: 'knob',
    x: X(172.5),
    y: Y(734),
    r: 26,
    style: 'd-silver',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: 'PORTAMENTO',
    labelPos: 'bottom',
    labelSize: 17,
    labelGap: 8,
    module: 'glide',
    scale: KNOB_SCALE,
    fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaTime(v))),
    help: 'Glide time between notes, up to 10 seconds. In POLY each voice glides from the last note it played, so chords smear into each other.',
  }
);

// OSC 1 & 2
fader('osc1.pitchMod', 237.5, 'bot', {
  def: 0,
  label: 'PITCH\nMOD',
  module: 'osc',
  fmt: (v) => fmtSemi(pitchModSemi(v)),
  help: 'How far the chosen modulation source (LFO 1 unless the OSC EDIT menu says otherwise) bends the pitch. A little gives vibrato; a lot, up to three octaves, gives sirens and swoops.',
});
fader('osc1.pwm', 277.5, 'bot', {
  def: 0,
  label: 'PWM',
  module: 'osc',
  fmt: (v) => `${Math.round(50 + 4.9 * v)} %`,
  help: 'Pulse width of OSC 1’s square wave, from 50% (hollow) to a narrow, nasal pulse. With a modulation source chosen in the OSC EDIT menu it sets how far that source sweeps the width instead.',
});
fader('osc2.pitchMod', 325, 'bot', {
  def: 0,
  label: 'PITCH\nMOD',
  module: 'osc',
  fmt: (v) => fmtSemi(pitchModSemi(v)),
  help: 'How far the chosen modulation source bends OSC 2’s pitch on its own, so the two oscillators can move against each other.',
});
fader('osc2.toneMod', 364.5, 'bot', {
  def: 0,
  label: 'TONE\nMOD',
  module: 'osc',
  fmt: (v) => `${Math.round(50 + v * 5)} %`,
  help: 'Cuts a gap into each half of OSC 2’s square wave. At 0 it is a plain square; as it rises the tone gets thinner and more buzzy. With a source chosen in the OSC EDIT menu it sets how far that source moves the gap.',
});
fader('osc2.pitch', 404, 'bot', {
  min: -12,
  max: 12,
  def: 0,
  label: 'PITCH',
  module: 'osc',
  fmt: fmtSemi,
  help: 'Tunes OSC 2 up to an octave above or below OSC 1. Small offsets make the two beat against each other; +7 or +12 stack a fifth or an octave.',
});
fader('osc2.level', 443.5, 'bot', {
  def: 0,
  label: 'LEVEL',
  module: 'mixer',
  fmt: fmtDb,
  help: 'How much of OSC 2 goes into the filter. At the bottom OSC 2 is off.',
});
fader('noise.level', 483.5, 'bot', {
  def: 0,
  label: 'NOISE\nLEVEL',
  module: 'mixer',
  fmt: fmtDb,
  help: 'How much white noise goes into the filter: a little adds breath, a lot turns the sound into wind or surf.',
});
button('osc1.saw', 238.5, 791, 'white', {
  def: true,
  label: 'Sawtooth',
  labelPos: 'none',
  module: 'osc',
  help: 'Switches OSC 1’s sawtooth on or off. It can sound together with the square.',
});
button('osc1.pulse', 277, 791, 'white', {
  def: false,
  label: 'Square',
  labelPos: 'none',
  module: 'osc',
  help: 'Switches OSC 1’s square (pulse) wave on or off. Its width is set by the PWM fader.',
});
decor.push(
  { t: 'wave', x: X(238.5), y: Y(772), size: 11, shape: 'saw', w: 2.4 },
  { t: 'wave', x: X(277), y: Y(772), size: 11, shape: 'pulse', w: 2.4 }
);
button('osc2.sync', 325, 791, 'white', {
  def: false,
  label: 'SYNC',
  module: 'osc',
  help: 'Hard sync: OSC 2 restarts every time OSC 1 does. Move OSC 2’s PITCH and the tone tears and sweeps instead of detuning.',
});

// VCF
fader('vcf.freq', 538.5, 'bot', {
  def: 10,
  label: 'FREQ',
  module: 'filter',
  fmt: (v) => fmtHz(vcfHz(v)),
  help: 'Cutoff of the low-pass filter, 50 Hz to 20 kHz. Down makes the sound darker and duller; up lets all the brightness through.',
});
fader('vcf.res', 578, 'bot', {
  def: 0,
  label: 'RES',
  module: 'filter',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Resonance: a boost right at the cutoff that makes filter sweeps sound vocal and squelchy.',
});
fader('vcf.env', 626, 'bot', {
  def: 0,
  label: 'ENV',
  module: 'filter',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the VCF envelope opens the filter on each note. Use INVERT to make it close the filter instead.',
});
fader('vcf.lfo', 666, 'bot', {
  def: 0,
  label: 'LFO',
  module: 'filter',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far an LFO sweeps the cutoff: a wah-wah or a slow swell. It uses LFO 2 unless the VCF EDIT menu picks LFO 1.',
});
fader('vcf.kybd', 705.5, 'bot', {
  def: 0,
  label: 'KYBD',
  module: 'filter',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Keyboard tracking: higher notes open the filter further, so they stay as bright as low ones. At 10 the cutoff follows the notes exactly.',
});
button('vcf.twoPole', 538.5, 791, 'white', {
  def: false,
  label: '2 POLE',
  module: 'filter',
  help: 'Switches the filter from 4-pole (24 dB per octave, round and heavy) to 2-pole (12 dB per octave, brighter and thinner, more buzz left in).',
});
button('vcf.invert', 626, 791, 'white', {
  def: false,
  label: 'INVERT',
  module: 'filter',
  help: 'Turns the VCF envelope upside down: each note pulls the cutoff down, then lets it rise back.',
});

// VCA and HPF
fader('vca.level', 760, 'bot', {
  min: -5,
  max: 5,
  def: 0,
  label: 'LEVEL',
  module: 'amp',
  fmt: (v) => `${vcaDb(v) > 0 ? '+' : ''}${vcaDb(v).toFixed(1)} dB`,
  help: 'Level of every voice after the filter, from −12 dB to +6 dB.',
});
fader('hpf.freq', 815, 'bot', {
  def: 0,
  label: 'FREQ',
  module: 'filter',
  fmt: (v) => fmtHz(hpfHz(v)),
  help: 'High-pass filter on the mixed sound of all the voices: it takes off bass below the cutoff, 20 Hz to 2 kHz. Use it to thin out pads so they sit above the bass.',
});
button('hpf.boost', 815, 791, 'white', {
  def: false,
  label: 'BOOST',
  module: 'filter',
  help: 'Adds 12 dB of bass boost after the voices are mixed. The manual does not give the frequency; here it is a shelf below about 110 Hz.',
});

// Envelopes: four faders, three envelopes, times or curves
type EnvName = 'vca' | 'vcf' | 'mod';
const ENVS: [EnvName, string, string][] = [
  ['vca', 'VCA', 'VCA envelope'],
  ['vcf', 'VCF', 'VCF envelope'],
  ['mod', 'MOD', 'MOD envelope'],
];
const STAGES: [string, string, number, string][] = [
  ['attack', 'A', 870, 'How long the envelope takes to rise to full after a key is pressed.'],
  ['decay', 'D', 910, 'How long it takes to fall from the peak to the sustain level.'],
  ['sustain', 'S', 949, 'The level it holds while the key is held down.'],
  ['release', 'R', 988.5, 'How long it takes to fade to nothing after the key is let go.'],
];
const ENV_DEF: Record<EnvName, number[]> = {
  vca: [0, 5, 10, 3],
  vcf: [0, 5, 5, 3],
  mod: [0, 5, 5, 3],
};
const WHAT: Record<EnvName, string> = {
  vca: 'the volume of each note',
  vcf: 'the filter cutoff (with the VCF ENV fader)',
  mod: 'whatever the OSC EDIT menu sends it to',
};
ENVS.forEach(([e, , full]) => {
  STAGES.forEach(([stage, label, px, help], i) => {
    const isTime = stage !== 'sustain';
    fader(`${e}Env.${stage}`, px, 'bot', {
      def: ENV_DEF[e][i],
      label,
      module: 'env',
      show: [
        { id: 'env.select', eq: e },
        { id: 'env.curves', eq: false },
      ],
      fmt: isTime ? (v) => fmtTime(envTime(v)) : (v) => `${Math.round(v * 10)} %`,
      help: `${full}: ${help.charAt(0).toLowerCase()}${help.slice(1)} This envelope shapes ${WHAT[e]}.${isTime ? ' The manual gives no times; the readout is this app’s estimate.' : ''}`,
    });
    if (!isTime) return;
    fader(`${e}Env.${stage}Curve`, px, 'bot', {
      def: 3,
      label,
      module: 'env',
      show: [
        { id: 'env.select', eq: e },
        { id: 'env.curves', eq: true },
      ],
      fmt: (v) => (Math.abs(v - 5) < 0.3 ? 'straight' : v < 5 ? 'fast start' : 'slow start'),
      help: `${full}: the shape of the ${stage} stage. At 5 it is a straight line; below 5 it moves fast at first and slows down (the usual analogue shape); above 5 it starts slowly and speeds up.`,
    });
  });
});
const ENV_BTN_X: Record<EnvName, number> = { vca: 889, vcf: 929, mod: 968.5 };
controls.push({
  id: 'env.select',
  type: 'select',
  ui: true,
  x: X(929),
  y: Y(791),
  ...BTN,
  lamp: 'white',
  kind: 'enum',
  def: 'vca',
  label: 'Envelope select',
  labelPos: 'none',
  module: 'env',
  options: ENVS.map(([v, t, full]) => ({ v, label: full, text: t, x: X(ENV_BTN_X[v]), y: Y(791) })),
  help: 'Chooses which of the three envelopes the A, D, S and R faders show and move: VCA (loudness), VCF (filter) or MOD (modulation). The others keep their settings.',
});
button('env.curves', 1025, 791, 'blue', {
  ui: true,
  def: false,
  label: 'CURVES',
  module: 'env',
  help: 'Switches the A, D, S and R faders from stage times to stage shapes for the envelope that is selected. S has no curve here.',
});
(
  [
    [687.5, 'M-8 6 Q-8 -8 0 -8 Q8 -8 8 6'],
    [721.5, 'M-9 6 L0 -7 L9 6'],
    [754, 'M-8 7 Q-6 -8 0 -8 Q4 -8 8 7'],
  ] as const
).forEach(([py, d]) => {
  decor.push({
    t: 'path',
    d: d.replace(
      /(-?\d+(\.\d+)?) (-?\d+(\.\d+)?)/g,
      (_m, a: string, _f: string, b: string) =>
        `${X(1025) + Number(a) * 1.3} ${Y(py) + Number(b) * 1.3}`
    ),
    w: 2.2,
  });
});

// ── Display menu rows ─────────────────────────────────────────────────────
const LCD = { x: (X(588) + X(764)) / 2, w: X(764) - X(588) - 16, top: Y(449) + 52 };
const rows: Record<string, number> = {};
const menu = (page: string, id: string, label: string, rest: MenuRest): void => {
  const i = (rows[page] = (rows[page] || 0) + 1) - 1;
  controls.push({
    id,
    type: 'menu',
    x: LCD.x,
    y: LCD.top + i * 25,
    w: LCD.w,
    h: 24,
    size: 14.5,
    vw: 124,
    show: { id: 'ui.page', eq: page },
    label,
    ...rest,
  });
};
menu('arp', 'arp.mode', 'MODE', {
  kind: 'enum',
  def: 'up',
  module: 'mode',
  options: [
    { v: 'up', label: 'UP' },
    { v: 'down', label: 'DOWN' },
    { v: 'updown', label: 'UP-DOWN' },
    { v: 'random', label: 'RANDOM' },
    { v: 'played', label: 'AS PLAYED' },
  ],
  help: 'The order the arpeggiator plays the held notes in.',
});
menu('arp', 'arp.octaves', 'OCTAVES', {
  kind: 'enum',
  def: 1,
  module: 'mode',
  options: [1, 2, 3, 4].map((v) => ({ v, label: String(v) })),
  help: 'How many octaves the arpeggio climbs through before starting again.',
});
[1, 2].forEach((n) => {
  menu(`lfo${n}`, `lfo${n}.shape`, 'SHAPE', {
    kind: 'enum',
    def: 'tri',
    module: 'lfo',
    options: SHAPES,
    help: `Waveform of LFO ${n}. Sine and triangle wobble smoothly, square jumps between two values, the ramps rise or fall and then snap back, S&H jumps to a random value each cycle and S&GLIDE slides between random values.`,
  });
  menu(`lfo${n}`, `lfo${n}.keySync`, 'KEY SYNC', {
    kind: 'enum',
    def: 'off',
    module: 'lfo',
    options: OFF_ON,
    help: `ON restarts LFO ${n} from the beginning of its cycle on every new note, so each note wobbles the same way. OFF lets it run freely.`,
  });
});
menu('poly', 'voice.mode', 'POLYPHONY', {
  kind: 'enum',
  def: 'poly',
  module: 'osc',
  options: POLY_MODES,
  help: 'How the twelve voices are shared out. POLY plays up to twelve notes. UNISON-n stacks n voices on every note, detuned by UNISON DETUNE. MONO plays one note at a time (MONO-n with n voices stacked). POLY-6 and POLY-8 limit the number of notes.',
});
menu('poly', 'voice.drift', 'OSC DRIFT', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'osc',
  fmt: (v) => (v <= 0 ? 'OFF' : String(Math.round(v * 25.5))),
  help: 'Slow random pitch wander on each voice, separately, like an old analogue synth that is not quite in tune with itself.',
});
menu('osc', 'osc1.range', 'OSC1 RANGE', {
  kind: 'enum',
  def: '8',
  module: 'osc',
  options: RANGE,
  help: 'Octave of OSC 1, in organ-pipe feet: 16’ is lowest, 4’ highest.',
});
menu('osc', 'osc2.range', 'OSC2 RANGE', {
  kind: 'enum',
  def: '8',
  module: 'osc',
  options: RANGE,
  help: 'Octave of OSC 2, in organ-pipe feet: 16’ is lowest, 4’ highest.',
});
menu('osc', 'osc1.pmSrc', 'OSC1 PMOD SRC', {
  kind: 'enum',
  def: 'lfo1',
  module: 'mod',
  options: MOD_SRC,
  help: 'What OSC 1’s PITCH MOD fader bends the pitch with: an LFO, one of the envelopes, or an LFO kept above zero (UNI).',
});
menu('osc', 'osc1.pmMode', 'PMOD MODE', {
  kind: 'enum',
  def: 'both',
  module: 'mod',
  options: [
    { v: 'both', label: 'OSC1+2' },
    { v: 'osc1', label: 'OSC1' },
  ],
  help: 'Whether OSC 1’s PITCH MOD moves both oscillators together (OSC1+2) or only OSC 1.',
});
menu('osc', 'osc1.pwmSrc', 'PWM SRC', {
  kind: 'enum',
  def: 'manual',
  module: 'mod',
  options: MANUAL_SRC,
  help: 'MANUAL: the PWM fader sets the pulse width. Any other choice: that source sweeps the width and the fader sets how far.',
});
menu('osc', 'osc2.pmSrc', 'OSC2 PMOD SRC', {
  kind: 'enum',
  def: 'lfo1',
  module: 'mod',
  options: MOD_SRC,
  help: 'What OSC 2’s PITCH MOD fader bends its pitch with.',
});
menu('osc', 'osc2.tmSrc', 'TMOD SRC', {
  kind: 'enum',
  def: 'manual',
  module: 'mod',
  options: MANUAL_SRC,
  help: 'MANUAL: the TONE MOD fader sets the tone directly. Any other choice: that source moves it and the fader sets how far.',
});
menu('vcf', 'vcf.lfoSel', 'LFO SELECT', {
  kind: 'enum',
  def: 'lfo2',
  module: 'filter',
  options: [
    { v: 'lfo1', label: 'LFO 1' },
    { v: 'lfo2', label: 'LFO 2' },
  ],
  help: 'Which LFO the VCF’s LFO fader uses. LFO 2 by default, so LFO 1 is free for vibrato.',
});
menu('vcf', 'vcf.mwLfo', 'MW>LFO DEPTH', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'mod',
  fmt: (v) => String(Math.round(v * 25.5)),
  help: 'How much the mod wheel adds to the filter’s LFO depth. Turn it up, then push the wheel to bring in a filter wobble while you play.',
});

// ── FX pages ──────────────────────────────────────────────────────────────
// Four slots, each loaded with one of 35 algorithms of up to 12 parameters. The FX page has nine short rows: EDIT picks
// the routing page or a slot, PAGE picks the slot's first seven parameters or the rest. Every parameter of every
// algorithm in every slot is a control of its own (fx<slot>.<algorithm>.<ref>), shown only while its slot has that
// algorithm loaded, so a slot keeps each algorithm's settings when you switch between them, as the hardware does.
const FX_ROW = { h: 19, size: 12.5, step: 20, y0: Y(449) + 50 };
const fxRow = (
  id: string,
  row: number,
  half: 'left' | 'right' | null,
  show: ShowCondition | ShowCondition[],
  rest: FxRowRest
): void => {
  const w = half ? LCD.w / 2 - 4 : LCD.w;
  const x =
    half === 'left' ? LCD.x - LCD.w / 4 - 2 : half === 'right' ? LCD.x + LCD.w / 4 + 2 : LCD.x;
  controls.push({
    id,
    type: 'menu',
    x,
    y: FX_ROW.y0 + row * FX_ROW.step,
    w,
    h: FX_ROW.h,
    size: FX_ROW.size,
    vw: 124,
    show,
    module: 'fx',
    ...rest,
  });
};
const ON_FX: ShowCondition = { id: 'ui.page', eq: 'fx' };
const SLOTS = [1, 2, 3, 4];
/** Slot LEVEL: off at 0, unity at 8, +4 dB at 10. The manual does not print the range. */
const fxLevel = (v: number): number => (v <= 0 ? 0 : Math.pow(v / 8, 2));
const fmtFxLevel = (v: number): string =>
  v <= 0 ? 'off' : `${v >= 8 ? '+' : ''}${(40 * Math.log10(v / 8)).toFixed(1)} dB`;
const fmtUnit: Record<FxUnit, (v: number) => string> = {
  ms: (v) =>
    v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${v < 10 ? v.toFixed(1) : Math.round(v)} ms`,
  s: (v) => `${v < 10 ? v.toFixed(1) : Math.round(v)} s`,
  Hz: (v) => fmtHz(v),
  '%': (v) => `${Math.round(v)} %`,
  dB: (v) => `${v > 0 ? '+' : ''}${v.toFixed(1)} dB`,
  deg: (v) => `${Math.round(v)}°`,
  x: (v) => `${v.toFixed(2)}×`,
  st: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} st`,
  ct: (v) => `${v > 0 ? '+' : ''}${Math.round(v)} ct`,
  m: (v) => `${Math.round(v)} m`,
  bit: (v) => `${Math.round(v)} bit`,
  '': (v) => (Math.abs(v) < 10 ? v.toFixed(1) : String(Math.round(v))),
};

fxRow('ui.fxSlot', 0, 'left', ON_FX, {
  ui: true,
  kind: 'enum',
  def: 'route',
  label: 'EDIT',
  vw: 92,
  name: 'FX edit page',
  options: [
    { v: 'route', label: 'ROUTING' },
    ...SLOTS.map((s) => ({ v: String(s), label: `SLOT ${s}` })),
  ],
  help: 'Chooses what the FX page shows: the routing and the four slot levels, or the effect loaded into one slot and its settings. This changes what you see, not the sound.',
});
fxRow('ui.fxPart', 0, 'right', [ON_FX, { id: 'ui.fxSlot', in: SLOTS.map(String) }], {
  ui: true,
  kind: 'enum',
  def: 'a',
  label: 'PAGE',
  vw: 70,
  name: 'FX parameter page',
  options: [
    { v: 'a', label: '1-7' },
    { v: 'b', label: '8-12' },
  ],
  help: 'An effect has up to twelve settings and the screen shows seven at a time. This picks the first seven or the rest. It changes what you see, not the sound.',
});
const ON_ROUTE: ShowCondition[] = [ON_FX, { id: 'ui.fxSlot', eq: 'route' }];
fxRow('fx.mode', 1, null, ON_ROUTE, {
  kind: 'enum',
  def: 'insert',
  label: 'MODE',
  name: 'FX mode',
  options: FX_MODES.map(({ v, label }) => ({ v, label })),
  help: `How the effects join the sound. ${FX_MODES.map((m) => `${m.label}: ${m.help.charAt(0).toLowerCase()}${m.help.slice(1)}`).join(' ')}`,
});
fxRow('fx.routing', 2, null, ON_ROUTE, {
  kind: 'enum',
  def: 1,
  label: 'ROUTING',
  vw: 190,
  name: 'FX routing',
  options: FX_ROUTINGS.map(({ v, label }) => ({ v, label })),
  help: 'How the four slots are connected: in a row (>), side by side (+), or with one slot’s output fed back through others (FB). A slot with nothing loaded is skipped.',
});
SLOTS.forEach((s) => {
  fxRow(`fx${s}.level`, 2 + s, null, ON_ROUTE, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 8,
    label: `SLOT ${s} LEVEL`,
    name: `FX slot ${s} level`,
    fmt: fmtFxLevel,
    help: `Output level of slot ${s}. At 0 the slot is silent, which also silences everything after it in a row. 8 leaves the level as it is.`,
  });
  const onSlot: ShowCondition[] = [ON_FX, { id: 'ui.fxSlot', eq: String(s) }];
  fxRow(`fx${s}.type`, 1, null, onSlot, {
    kind: 'enum',
    def: 'none',
    label: 'TYPE',
    vw: 150,
    name: `FX slot ${s} type`,
    options: [{ v: 'none', label: 'NONE' }, ...FX_ALGOS.map((a) => ({ v: a.id, label: a.short }))],
    help: `Which effect is loaded into slot ${s}: one of 35, from reverbs and delays to a compressor, an amp, a pitch shifter and a rotary speaker. NONE leaves the slot empty.`,
  });
  FX_ALGOS.forEach((a) =>
    a.params.forEach((q, k) => {
      const show: ShowCondition[] = [
        ...onSlot,
        { id: 'ui.fxPart', eq: k < 7 ? 'a' : 'b' },
        { id: `fx${s}.type`, eq: a.id },
      ];
      const common = {
        label: q.label,
        name: `FX ${s} ${a.name}: ${q.name}`,
        help: q.help,
        deep: true,
        find: s === 1,
      };
      if (q.options) {
        fxRow(`fx${s}.${a.id}.${q.ref.toLowerCase()}`, 2 + (k % 7), null, show, {
          ...common,
          kind: 'enum',
          def: q.def,
          options: q.options.map((o) => ({ v: o, label: o })),
        });
      } else {
        fxRow(`fx${s}.${a.id}.${q.ref.toLowerCase()}`, 2 + (k % 7), null, show, {
          ...common,
          kind: 'cont',
          min: q.min,
          max: q.max,
          def: q.def,
          fmt: fmtUnit[q.unit || ''],
          ...(q.log ? { taper: 'log' as const } : {}),
          ...(q.step ? { step: q.step } : {}),
        });
      }
    })
  );
});
const FX_BY_ID: Record<string, FxAlgoDef> = Object.fromEntries(FX_ALGOS.map((a) => [a.id, a]));

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: X(x1) - X(x0),
  h: Y(y1) - Y(y0),
});
const areas: Area[] = [
  {
    id: 'voices',
    label: 'Voice lamps',
    module: 'mode',
    keywords: 'polyphony leds allocation',
    rects: [R(740, 382, 1040, 416)],
    help: 'One lamp for each of the twelve voices. A lamp lights while its voice is sounding, so you can watch notes being handed out to voices as you play, and see several lamps come on for one note in UNISON.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator',
    module: 'mode',
    keywords: 'arp arpeggio sequencer tempo bpm hold latch chord',
    rects: [R(209, 418, 344, 612)],
    help: 'Plays held notes one after another at the tempo set by RATE. GATE TIME sets how long each note lasts, TAP/HOLD keeps it going after you let go, and ARP EDIT sets the order and range. CHORD and POLY CHORD are not modelled here.',
  },
  {
    id: 'lfos',
    label: 'LFO 1 and LFO 2',
    module: 'lfo',
    keywords: 'vibrato wobble tremolo modulation shape delay fade',
    rects: [R(345, 418, 573, 612)],
    help: 'Two low-frequency oscillators, each with its own RATE and DELAY TIME. The column of lamps shows each one’s shape, chosen in its EDIT menu. LFO 1 normally makes vibrato and PWM; LFO 2 normally moves the filter.',
  },
  {
    id: 'display',
    label: 'Display and menus',
    module: 'mode',
    keywords: 'screen menu edit program settings encoder data entry effects fx reverb delay chorus',
    rects: [R(574, 418, 997, 612)],
    help: 'The screen shows the menu of whichever EDIT button is lit. Most of what has no fader of its own is set here: oscillator ranges, modulation sources, LFO shapes, polyphony, arpeggio mode, and the whole effects engine behind the FX button. Click a value on the screen to change it. The navigation buttons, encoder and DATA ENTRY fader are not modelled; the screen is clicked directly instead.',
  },
  {
    id: 'poly',
    label: 'Poly',
    module: 'mode',
    keywords: 'unison detune voices stack mono polyphony',
    rects: [R(998, 418, 1052, 612)],
    help: 'UNISON DETUNE spreads the tuning of voices that are stacked on one note. Whether they are stacked at all is set in POLY EDIT on the display.',
  },
  {
    id: 'performance',
    label: 'Volume and portamento',
    module: 'out',
    keywords: 'master volume glide portamento',
    rects: [R(122, 618, 210, 836)],
    help: 'Master VOLUME, and PORTAMENTO, which makes the pitch glide from one note to the next.',
  },
  {
    id: 'osc',
    label: 'Oscillators and noise',
    module: 'osc',
    keywords: 'vco dco sawtooth square pwm sync detune tone mod noise mixer',
    rects: [R(211, 618, 511, 836)],
    help: 'Two oscillators and a noise source. OSC 1 has a sawtooth and a square that switch on separately, with pulse-width modulation. OSC 2 is a square with TONE MOD, its own PITCH and LEVEL, and SYNC to OSC 1. NOISE LEVEL mixes in white noise. OSC 1 has no level fader: it is always in.',
  },
  {
    id: 'vcf',
    label: 'Filter (VCF)',
    module: 'filter',
    keywords: 'cutoff resonance brightness low-pass envelope keyboard tracking',
    rects: [R(512, 618, 733, 836)],
    help: 'The low-pass filter in each voice. FREQ sets the brightness and RES the resonance. ENV, LFO and KYBD set how far the VCF envelope, an LFO and the keyboard move the cutoff. 2 POLE makes it gentler and INVERT flips the envelope.',
  },
  {
    id: 'vca',
    label: 'Amplifier (VCA)',
    module: 'amp',
    keywords: 'volume level loudness',
    rects: [R(734, 618, 786, 836)],
    help: 'The level of every voice after the filter. Its loudness over time comes from the VCA envelope in the ENVELOPES section.',
  },
  {
    id: 'hpf',
    label: 'High-pass filter',
    module: 'filter',
    keywords: 'hpf bass cut low cut boost',
    rects: [R(787, 618, 842, 836)],
    help: 'A gentle high-pass filter on the mix of all the voices, with a bass BOOST. It shapes the whole sound at once, after the voices are added together.',
  },
  {
    id: 'env',
    label: 'Envelopes',
    module: 'env',
    keywords: 'adsr attack decay sustain release curves contour eg',
    rects: [R(843, 618, 1052, 836)],
    help: 'Three envelopes share one set of A, D, S and R faders. The VCA, VCF and MOD buttons choose which one the faders move; CURVES switches the faders to the shape of each stage instead of its time.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const ARP_MODE: Record<string, ArpMode> = {
  up: 'up',
  down: 'down',
  updown: 'updown',
  random: 'random',
  played: 'played',
};
const FX_MODE: Record<string, FxParams['mode']> = {
  insert: 'insert',
  send: 'send',
  bypass: 'bypass',
};
const envOf = (v: ControlValues, e: EnvName): EnvParams => ({
  a: envTime(num(v, `${e}Env.attack`)),
  d: envTime(num(v, `${e}Env.decay`)),
  s: num(v, `${e}Env.sustain`) / 10,
  r: envTime(num(v, `${e}Env.release`)),
  curve: {
    a: num(v, `${e}Env.attackCurve`) / 10,
    d: num(v, `${e}Env.decayCurve`) / 10,
    r: num(v, `${e}Env.releaseCurve`) / 10,
  },
});
const lfoOf = (v: ControlValues, n: number): LfoParams => ({
  rate: lfoHz(num(v, `lfo${n}.rate`)),
  mix: SHAPE_MIX[String(v[`lfo${n}.shape`])],
  keySync: v[`lfo${n}.keySync`] === 'on',
  delay: lfoDelay(num(v, `lfo${n}.delay`)),
});

/** The effects engine: nothing at all while bypassed or empty, so its settings count as unused then. */
function fxOf(v: ControlValues): FxParams {
  const slots = SLOTS.map((s): FxSlot => {
    const a = FX_BY_ID[String(v[`fx${s}.type`])];
    if (!a) return { alg: null };
    return {
      alg: a.id,
      level: fxLevel(num(v, `fx${s}.level`)),
      p: Object.fromEntries(
        a.params.map((q) => {
          const id = `fx${s}.${a.id}.${q.ref.toLowerCase()}`;
          return [q.ref, q.options ? String(v[id]) : num(v, id)];
        })
      ),
    };
  });
  const mode = FX_MODE[String(v['fx.mode'])];
  if (mode === 'bypass' || !slots.some((x) => x.alg)) return { mode: 'bypass' };
  return { mode, routing: num(v, 'fx.routing'), slots };
}

function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number): void => {
    if (amt !== 0) routes.push({ src: SIG[src], dst, amt });
  };
  const pwmSrc = String(v['osc1.pwmSrc']);
  const tmSrc = String(v['osc2.tmSrc']);
  // OSC 1: pulse width, set by hand or swept by a source (then the fader is the depth)
  const pwm = num(v, 'osc1.pwm') / 10;
  let pw1 = 0.5 + 0.49 * pwm;
  if (pwmSrc !== 'manual') {
    const bi = BIPOLAR[pwmSrc];
    pw1 = 0.5 + (bi ? 0.235 * pwm : 0);
    route(pwmSrc, 'pw1', (bi ? 0.235 : 0.47) * pwm);
  }
  // OSC 2: the TONE MOD gap, the same way
  const tm = num(v, 'osc2.toneMod') / 10;
  let gap = 0.6 * tm;
  if (tmSrc !== 'manual') {
    const bi = BIPOLAR[tmSrc];
    gap = bi ? 0.3 * tm : 0;
    route(tmSrc, 'pw2', (bi ? 0.3 : 0.6) * tm);
  }
  route(
    String(v['osc1.pmSrc']),
    v['osc1.pmMode'] === 'both' ? 'pitchAll' : 'pitch1',
    pitchModSemi(num(v, 'osc1.pitchMod'))
  );
  route(String(v['osc2.pmSrc']), 'pitch2', pitchModSemi(num(v, 'osc2.pitchMod')));
  const lfoDepth =
    Math.pow(num(v, 'vcf.lfo') / 10, 2) + (num(v, 'vcf.mwLfo') / 10) * (ctx.wheel || 0);
  route(String(v['vcf.lfoSel']), 'cutoff', 5 * lfoDepth);
  const [voices, stack, mono] = POLY_SHAPE[String(v['voice.mode'])];
  const drift = num(v, 'voice.drift') / 10;
  return {
    osc: [
      {
        level: 0.5,
        mix: { saw: v['osc1.saw'] ? 1 : 0, pulse: v['osc1.pulse'] ? 1 : 0 },
        pw: pw1,
        semi: RANGE_SEMI[String(v['osc1.range'])],
        kbd: true,
        syncTo: -1,
      },
      {
        level: 0.5 * dbLevel(num(v, 'osc2.level')),
        mix: { notch: 1 },
        pw: gap,
        semi: RANGE_SEMI[String(v['osc2.range'])] + num(v, 'osc2.pitch'),
        kbd: true,
        syncTo: v['osc2.sync'] ? 0 : -1,
      },
    ],
    noise: { level: 0.35 * dbLevel(num(v, 'noise.level')), color: 'white' },
    ext: { level: 0 },
    filter: {
      type: v['vcf.twoPole'] ? 'svf' : 'ladder',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.freq')),
      res: (num(v, 'vcf.res') / 10) * 1.05,
      envAmt: (num(v, 'vcf.env') / 10) * 8 * (v['vcf.invert'] ? -1 : 1),
      envSrc: 'env1',
      kbd: num(v, 'vcf.kybd') / 10,
    },
    env1: envOf(v, 'vcf'),
    env2: envOf(v, 'vca'),
    env3: envOf(v, 'mod'),
    vca: { envSrc: 'env2', bias: 0, gain: Math.pow(10, vcaDb(num(v, 'vca.level')) / 20) },
    lfo: lfoOf(v, 1),
    lfo2: lfoOf(v, 2),
    glide: { time: portaTime(num(v, 'glide.time')), legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly: { voices, stack, mono, detune: (num(v, 'voice.detune') / 10) * 0.5 },
    drift: { depth: drift > 0 ? 0.3 * drift * drift : 0, rate: 1.2 },
    arp: {
      on: !!v['arp.on'],
      bpm: bpm(num(v, 'arp.rate')),
      gate: num(v, 'arp.gate') / 10,
      mode: ARP_MODE[String(v['arp.mode'])],
      octaves: num(v, 'arp.octaves'),
      hold: !!v['arp.hold'],
    },
    post: { hpf: hpfHz(num(v, 'hpf.freq')), boost: !!v['hpf.boost'] },
    fx: fxOf(v),
    routes,
    normals: {},
    od: { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 0,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const deepmind12d: SynthDef & { version: number } = {
  id: 'deepmind-12d',
  version: 1,
  name: 'DeepMind 12D',
  maker: 'Behringer',
  year: 2017,
  heritage:
    'A twelve-voice analogue poly in the Roland Juno tradition, with a modulation matrix and effects',
  summary:
    'Twelve analogue voices, each with two oscillators and noise → 2- or 4-pole low-pass filter → VCA, then a common high-pass filter on the mix and a four-slot digital effects engine. Three envelopes, two LFOs per voice, unison and an arpeggiator.',
  view: { w: X(1107), h: Y(847) },
  theme: {
    panel: '#232427',
    panel2: '#1b1c1e',
    ink: '#e4e4e0',
    font: 'din',
    weight: 600,
    cheeks: 'wood',
    cheekW: X(119),
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
};

export default deepmind12d;
