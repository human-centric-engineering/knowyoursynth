/**
 * Roland Jupiter-8: the definition (D1). Positions are pixels on the 2000×918 product photo (the main panel from y 150
 * to 550, the small performance panel to the left of the keys from y 600 to 840), written in photo space and moved
 * into the view by X()/Y() (main panel, × 1.25) and LX()/LY() (performance panel, stood to the left of the main panel,
 * as on the Poly D). The data model is the Jupiter-8 synth.json (Roland's specification list, the PLUG-OUT manual and
 * secondary sources).
 *
 * The Jupiter-8 holds an upper and a lower patch and plays them whole, split or layered (DUAL). This app has one voice
 * pool, so it models one patch on all eight voices: KEY MODE, PANEL MODE and BALANCE are printed but do not change the
 * sound, and the controls that come in pairs (HOLD LOWER/UPPER) both act on the one patch. The patch memory, the
 * display and the tape memory are printed only. The bender is drawn for reference: the app's mod wheel stands in for
 * it pushed to the right.
 *
 * Transliterated from the prototype file `src/synths/jupiter-8.js` (D3), the way `defs/model-d.ts` was: no content
 * (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the Roland wordmark and its boxed
 * R, and the JUPITER-8 and JP-8 badges), and panel values read through `num()`. A performance-panel switch's label
 * drops every line break of its printed name, not just the first (idea #4); the names have one each, so the labels are
 * unchanged. The modular layout's `brand` is the series name printed on blank panels; the neutral design leaves it
 * out.
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
  EnvParams,
  HighPassParams,
  KnobControl,
  LfoMix,
  LineDecor,
  ModularLayout,
  OptionValue,
  OscMix,
  SelectControl,
  SlideControl,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import {
  type CurvePoint,
  clamp,
  expMap,
  fmtHz,
  fmtSemi,
  fmtTime,
  level10,
  pwl,
} from '@/lib/app/synths/lib/maps';

type Common = Omit<ControlCommon, 'id' | 'x' | 'y'>;
type ContRest = Common & Partial<Omit<ContinuousValue, 'kind'>>;
type KnobRest = Common &
  Partial<Pick<KnobControl, 'scale'>> &
  (
    | Partial<Omit<ContinuousValue, 'kind'>>
    | { kind: 'enum'; options: ControlOption[]; def: string; fmt?: (v: OptionValue) => string }
  );
type SlideRest = OmitEach<
  SlideControl,
  'id' | 'type' | 'orient' | 'x' | 'y' | 'w' | 'h' | 'labelPos'
>;
type SelectRest = Common & Pick<SelectControl, 'def' | 'offValue'>;
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'brand'>>;
type LineRest = Partial<Pick<LineDecor, 'stroke'>>;

// ── Ranges and tapers ─────────────────────────────────────────────────────
// From the specification list: envelope attack 1 ms to 5 s, decay and release 1 ms to 10 s, LFO 0.05 to 40 Hz, LFO
// delay up to 4 s, filter key follow up to 120 %, arpeggio 1 to 20 Hz. The slider laws between those ends, the
// filter's range and the depths of the modulation routes are this app's estimates.
const ATT_PTS: CurvePoint[] = [
  [0, 0.001],
  [2, 0.012],
  [4, 0.07],
  [6, 0.35],
  [8, 1.4],
  [10, 5],
];
const DR_PTS: CurvePoint[] = [
  [0, 0.002],
  [2, 0.03],
  [4, 0.15],
  [6, 0.7],
  [8, 2.6],
  [10, 10],
];
const attTime = (v: number): number => pwl(v, ATT_PTS, true);
const drTime = (v: number): number => pwl(v, DR_PTS, true);
const lfoHz = (v: number): number => expMap(v / 10, 0.05, 40);
const lfoDelay = (v: number): number => 4 * Math.pow(v / 10, 1.5);
const vcfHz = (v: number): number => expMap(v / 10, 22, 20000);
const hpfHz = (v: number): number => expMap(v / 10, 30, 2500);
const arpHz = (v: number): number => expMap(v / 10, 1, 20);
const portaTime = (v: number): number => 3 * Math.pow(v / 10, 2);
const riseTime = (v: number): number => 2 * Math.pow(v / 10, 1.5);
const pct = (v: number): string => `${Math.round(v * 10)} %`;
/** The performance LFO's rate is not documented; this is a natural vibrato speed. */
const PLFO_HZ = 6;

// ── Photo → view ──────────────────────────────────────────────────────────
const S = 1.25;
const CHEEK = 14;
const X = (px: number): number => Math.round(430 + (px - 88) * S);
const Y = (py: number): number => Math.round((py - 150) * S);
const LX = (px: number): number => Math.round(CHEEK + (px - 88) * S);
const LY = (py: number): number => Math.round(200 + (py - 600) * S);
const VIEW_W = X(1913) + CHEEK;
const VIEW_H = Y(550);

const controls: Control[] = [];
const decor: Decor[] = [];
const INK = '#f1f0ea';
const ORANGE = '#f0662c';
const DARK = '#121214';
const CAP = {
  orange: '#f07a22',
  yellow: '#f2d23a',
  white: '#ece6d0',
  cream: '#f2ebcf',
  green: '#53c24a',
  teal: '#2f8f8c',
  blue: '#2c5d97',
  red: '#e0352a',
};

/** Silkscreen text centred on (x, y) in view units (the renderer places text by its baseline). */
const text = (x: number, y: number, t: string, size = 10, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x,
    y: Math.round(y + size * 0.35),
    text: t,
    size,
    anchor: 'middle',
    ...rest,
  });
};
const T = (px: number, py: number, t: string, size = 10, rest?: TextRest): void =>
  text(X(px), Y(py), t, size, rest);
const LT = (px: number, py: number, t: string, size = 10, rest?: TextRest): void =>
  text(LX(px), LY(py), t, size, rest);
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w = 1.6,
  rest: LineRest = {}
): void => {
  decor.push({ t: 'line', x1, y1, x2, y2, w, ...rest });
};
const ML = (
  px1: number,
  py1: number,
  px2: number,
  py2: number,
  w?: number,
  rest?: LineRest
): void => line(X(px1), Y(py1), X(px2), Y(py2), w, rest);
const LL = (
  px1: number,
  py1: number,
  px2: number,
  py2: number,
  w?: number,
  rest?: LineRest
): void => line(LX(px1), LY(py1), LX(px2), LY(py2), w, rest);
/** An orange section tab with dark lettering. */
const tab = (px0: number, px1: number, py0: number, py1: number, t: string, size = 15): void => {
  decor.push({
    t: 'rect',
    x: X(px0),
    y: Y(py0),
    w: X(px1) - X(px0),
    h: Y(py1) - Y(py0),
    r: 2,
    fill: ORANGE,
    hw: true,
  });
  text((X(px0) + X(px1)) / 2, (Y(py0) + Y(py1)) / 2, t, size, { weight: 700, fill: DARK });
};
/** A small orange source tag printed under a control (LFO, ENV-1, KYBD …). */
const tag = (px: number, py: number, t: string): void => {
  const w = t.length * 6.4 + 8;
  decor.push({
    t: 'rect',
    x: X(px) - w / 2,
    y: Y(py) - 7,
    w,
    h: 14,
    r: 1.5,
    fill: ORANGE,
    hw: true,
  });
  T(px, py, t, 8.5, { weight: 700, fill: DARK });
};
/** The thin arrow from a control up into its section tab. */
const up = (px: number, py0 = 291, py1 = 256): void => {
  ML(px, py0, px, py1 + 3, 1.3);
  decor.push({ t: 'arrow', x: X(px), y: Y(py1) + 4, dir: 'up', size: 3.6 });
};

// ── Control helpers ───────────────────────────────────────────────────────
const knob = (id: string, px: number, py: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(px),
    y: Y(py),
    r: 19,
    style: 'pro1',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    ...rest,
  });
};
const lknob = (id: string, px: number, py: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x: LX(px),
    y: LY(py),
    r: 18,
    style: 'pro1',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    ...rest,
  });
};
const FADER = {
  type: 'fader',
  orient: 'v',
  len: 58,
  pad: 9,
  ticks: 0,
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  labelPos: 'none',
} as const;
const fader = (id: string, px: number, rest: ContRest): void => {
  controls.push({ id, ...FADER, x: X(px), y: Y(342), ...rest });
};
const lfader = (id: string, px: number, rest: ContRest): void => {
  controls.push({ id, ...FADER, x: LX(px), y: LY(746), ...rest });
};
/** A small black slide switch. Options and bool `true` read from the top down. */
const slide = (id: string, px: number, py: number, n: number, rest: SlideRest): void => {
  controls.push({
    id,
    type: 'slide',
    orient: 'v',
    x: X(px),
    y: Y(py),
    w: 13,
    h: 15 * n,
    labelPos: 'none',
    ...rest,
  });
};
const lslide = (id: string, px: number, py: number, n: number, rest: SlideRest): void => {
  controls.push({
    id,
    type: 'slide',
    orient: 'v',
    x: LX(px),
    y: LY(py),
    w: 12,
    h: 13 * n,
    labelPos: 'none',
    ...rest,
  });
};
/** The printed 10 · 5 · 0 scale at the left of a group of sliders. */
const scale = (px: number, toView = X, toY = Y, cy = 342): void => {
  [
    [10, -23],
    [5, 0],
    [0, 23],
  ].forEach(([n, dy]) => text(toView(px), toY(cy) + dy * S, String(n), 7.5));
};
const BTN = { w: 27, h: 32 };
const BY = 474; // the button row
/** A printed (not modelled) Jupiter button: coloured cap with a dark lamp. */
const deadButton = (px: number, color: string, lit = false): void => {
  const x = X(px),
    y = Y(BY);
  decor.push({
    t: 'rect',
    x: x - BTN.w / 2 + 2,
    y: y - BTN.h / 2 + 3,
    w: BTN.w,
    h: BTN.h,
    r: 3,
    fill: '#0007',
    hw: true,
  });
  decor.push({
    t: 'rect',
    x: x - BTN.w / 2,
    y: y - BTN.h / 2,
    w: BTN.w,
    h: BTN.h,
    r: 3,
    fill: color,
    stroke: '#0008',
    sw: 1.2,
  });
  decor.push({
    t: 'led',
    x,
    y: y - BTN.h / 2 + 6,
    r: 3.4,
    color: 'red',
    ...(lit ? { litWhen: 'power' as const } : {}),
  });
};

// ── Faceplate furniture ───────────────────────────────────────────────────
// The vent slots across the top, the logo, the rules between the rows and sections.
for (let px = 212; px < 1790; px += 7.2)
  decor.push({
    t: 'rect',
    x: X(px),
    y: Y(152),
    w: 3.2,
    h: Y(168) - Y(152),
    r: 1.2,
    fill: '#060607',
    hw: true,
  });
T(1625, 190, 'JUPITER-8', 56, { weight: 700, fill: '#c9cdd3', spacing: '-0.01em', brand: true });
ML(95, 212, 1906, 212, 2.2);
ML(95, 416, 1906, 416, 2.2);
ML(95, 529, 1906, 529, 2.2);
ML(320, 220, 320, 410);
ML(1088, 220, 1088, 410);
ML(1540, 220, 1540, 410);
[248, 718, 893, 1153, 1448, 1757].forEach((px) => ML(px, 420, px, 525));
// The Roland wordmark with its boxed-R mark
decor.push({
  t: 'path',
  d: `M${X(128)} ${Y(249)} V${Y(229)} H${X(146)} Q${X(153)} ${Y(229)} ${X(153)} ${Y(235)} Q${X(153)} ${Y(241)} ${X(146)} ${Y(241)} H${X(136)} L${X(153)} ${Y(249)}`,
  w: 2.6,
  brand: true,
});
decor.push({
  t: 'path',
  d: `M${X(133)} ${Y(249)} V${Y(234)} H${X(145)} Q${X(148)} ${Y(234)} ${X(148)} ${Y(236)}`,
  w: 2,
  brand: true,
});
T(230, 238, 'Roland', 36, { weight: 500, spacing: '-0.01em', brand: true });
T(203, 266, 'JP-8', 14, { weight: 700, brand: true });
// Front strip screws and the centre marker
[148, 1022, 1870].forEach((px) => decor.push({ t: 'screw', x: X(px), y: Y(544), r: 4 }));

// Section tabs
tab(338, 450, 222, 252, 'LFO');
tab(459, 650, 222, 252, 'VCO MODULATOR');
tab(659, 818, 222, 252, 'VCO-1');
tab(827, 1071, 222, 252, 'VCO-2');
tab(1106, 1157, 222, 236, 'VCO-1', 9);
tab(1106, 1157, 240, 254, 'VCO-2', 9);
tab(1166, 1219, 222, 252, 'HPF');
tab(1227, 1452, 222, 252, 'VCF');
tab(1461, 1522, 222, 252, 'VCA');
tab(1556, 1731, 222, 252, 'ENV-1');
tab(1740, 1888, 222, 252, 'ENV-2');

// ── Left of the top row: VOLUME, BALANCE, ARPEGGIO RATE ────────────────────
knob('out.volume', 148, 340, {
  def: 7,
  module: 'out',
  label: 'VOLUME',
  fmt: pct,
  scale: {
    labels: [
      { at: 0, text: '0' },
      { at: 10, text: '10' },
    ],
    ticks: 11,
    size: 7.5,
  },
  help: 'Master output level. It is not stored with a patch.',
});
T(148, 299, 'VOLUME', 8.5);
knob('out.balance', 205, 340, {
  min: -5,
  max: 5,
  def: 0,
  module: 'out',
  label: 'BALANCE',
  fmt: (v: number) =>
    Math.abs(v) < 0.25
      ? 'centre'
      : v < 0
        ? `lower ${Math.round(-v * 20)} %`
        : `upper ${Math.round(v * 20)} %`,
  scale: { labels: [], ticks: 11, size: 7.5 },
  help: 'The level of the lower patch against the upper one when the keyboard is split or layered. This app plays one patch, so BALANCE does not change the sound here.',
});
T(205, 299, 'BALANCE', 8.5);
T(186, 365, 'LOWER', 7);
T(230, 365, 'UPPER', 7);
T(285, 270, 'ARPEGGIO', 8.5);
ML(262, 277, 308, 277, 1.2);
fader('arp.rate', 268, {
  def: 5,
  module: 'mode',
  label: 'ARPEGGIO RATE',
  name: 'Arpeggio rate',
  fmt: (v) => fmtHz(arpHz(v)),
  help: 'Speed of the arpeggio, from 1 to 20 steps a second. It only matters while an arpeggio MODE button is lit.',
});
T(268, 299, 'RATE', 8.5);
scale(255);
slide('arp.clock', 300, 341, 2, {
  kind: 'enum',
  options: [
    { v: 'int', label: 'INT' },
    { v: 'ext', label: 'EXT' },
  ],
  def: 'int',
  module: 'mode',
  label: 'ARPEGGIO INT/EXT',
  name: 'Arpeggio clock',
  help: 'INT runs the arpeggio from its own RATE. EXT waits for pulses at the ARPEGGIO CLOCK socket on the back; nothing is plugged in here, so the arpeggio stops.',
});
T(300, 324, 'INT', 7);
T(300, 360, 'EXT', 7);

// ── LFO ───────────────────────────────────────────────────────────────────
decor.push({ t: 'led', x: X(346), y: Y(236), r: 3.6, color: 'red', litWhen: 'lfo' });
fader('lfo.rate', 355, {
  def: 5,
  module: 'lfo',
  label: 'LFO RATE',
  name: 'LFO rate',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every 20 seconds up to 40 Hz. The lamp on the LFO tab flashes at the rate.',
});
fader('lfo.delay', 383, {
  def: 0,
  module: 'lfo',
  label: 'DELAY TIME',
  name: 'LFO delay time',
  fmt: (v) => (v <= 0 ? 'none' : fmtTime(lfoDelay(v))),
  help: 'How long after each new note the LFO takes to come in, up to 4 seconds. Turned up, a held note starts plain and the vibrato or wah grows in, as a singer or violinist would play it.',
});
scale(342);
T(355, 299, 'RATE', 8.5);
T(383, 295, 'DELAY\nTIME', 8.5);
[355, 383].forEach((px) => up(px));
const LFO_WAVES: ControlOption[] = [
  { v: 'sine', label: '', a: -60 },
  { v: 'saw', label: '', a: -20 },
  { v: 'square', label: '', a: 20 },
  { v: 'random', label: '', a: 60 },
];
const LFO_NAMES: Record<string, string> = {
  sine: 'sine',
  saw: 'sawtooth',
  square: 'square',
  random: 'random',
};
knob('lfo.wave', 432, 341, {
  kind: 'enum',
  options: LFO_WAVES,
  def: 'sine',
  module: 'lfo',
  label: 'LFO WAVE FORM',
  name: 'LFO waveform',
  fmt: (v: OptionValue) => LFO_NAMES[String(v)],
  help: 'Shape of the LFO. Sine is a smooth wobble, sawtooth rises and drops back, square jumps between two values (a trill on pitch), and RANDOM jumps to a new value each cycle (sample and hold).',
});
T(432, 299, 'WAVE FORM', 8.5);
up(432);
(
  [
    ['sine', 410, 322],
    ['saw', 424, 313],
    ['sq', 441, 313],
  ] as const
).forEach(([s, px, py]) =>
  decor.push({ t: 'wave', x: X(px), y: Y(py), size: 8, shape: s, w: 1.6 })
);
T(452, 310, 'RANDOM', 6.5);

// ── VCO MODULATOR ─────────────────────────────────────────────────────────
T(515, 271, 'FREQ MOD', 8);
ML(485, 278, 547, 278, 1.2);
ML(547, 278, 547, 290, 1.2);
fader('vcomod.lfo', 485, {
  def: 0,
  module: 'mod',
  label: 'VCO MOD LFO',
  name: 'VCO modulator LFO depth',
  fmt: (v) => (v <= 0 ? 'off' : fmtSemi(48 * (v / 10) ** 2)),
  help: 'How far the LFO moves the pitch of the oscillators picked by the switch beside it. A little is vibrato; a lot is a siren or, with a square LFO, a trill.',
});
fader('vcomod.env', 513, {
  def: 0,
  module: 'mod',
  label: 'VCO MOD ENV',
  name: 'VCO modulator ENV-1 depth',
  fmt: (v) => (v <= 0 ? 'off' : fmtSemi(60 * (v / 10) ** 2)),
  help: 'How far ENV-1 moves the pitch of the oscillators picked by the switch beside it: a pitch sweep at the start of each note. With SYNC on and only VCO-2 picked, it sweeps the tone instead.',
});
scale(472);
T(485, 295, 'LFO\nMOD', 8.5);
T(513, 295, 'ENV\nMOD', 8.5);
tag(486, 405, 'LFO');
tag(513, 405, 'ENV-1');
[
  [485, 392],
  [513, 392],
].forEach(([px, py]) => {
  ML(px, 376, px, py - 6, 1.3);
  decor.push({ t: 'arrow', x: X(px), y: Y(378), dir: 'up', size: 3.6 });
});
slide('vcomod.target', 546, 341, 3, {
  kind: 'enum',
  options: [
    { v: 'vco1', label: 'VCO-1' },
    { v: 'both', label: 'BOTH' },
    { v: 'vco2', label: 'VCO-2' },
  ],
  def: 'both',
  module: 'mod',
  label: 'VCO MOD selector',
  name: 'VCO modulator destination',
  help: 'Which oscillators the two VCO MODULATOR sliders reach: VCO-1, BOTH, or VCO-2. Moving only one makes the two drift against each other.',
});
(
  [
    ['VCO-1', 329],
    ['BOTH', 341],
    ['VCO-2', 353],
  ] as const
).forEach(([t, py]) => T(556, py, t, 6.5, { anchor: 'start' }));
fader('pwm.amount', 593, {
  def: 0,
  module: 'osc',
  label: 'PULSE WIDTH MOD',
  name: 'Pulse width',
  fmt: pct,
  help: 'With the switch beside it at MANUAL, this sets the width of the pulse wave: 0 is square, up narrows it. At LFO or ENV-1 it sets how far that source sweeps the width. Only heard where a PULSE waveform is chosen.',
});
T(607, 300, 'PULSE WIDTH MOD', 8.5);
scale(580);
slide('pwm.mode', 624, 337, 3, {
  kind: 'enum',
  options: [
    { v: 'lfo', label: 'LFO' },
    { v: 'manual', label: 'MANUAL' },
    { v: 'env1', label: 'ENV-1' },
  ],
  def: 'manual',
  module: 'osc',
  label: 'PWM mode',
  name: 'Pulse width source',
  help: 'What sets the pulse width: MANUAL holds it where the slider puts it, LFO sweeps it back and forth (the shimmer of string and pad sounds), ENV-1 sweeps it once on each note.',
});
(
  [
    ['LFO', 326],
    ['MANUAL', 337],
    ['ENV-1', 348],
  ] as const
).forEach(([t, py]) => T(634, py, t, 6.5, { anchor: 'start' }));
[485, 513, 593].forEach((px) => up(px));

// ── VCO-1 ─────────────────────────────────────────────────────────────────
fader('vco1.xmod', 678, {
  def: 0,
  module: 'osc',
  label: 'CROSS MOD',
  name: 'Cross mod',
  fmt: pct,
  help: 'VCO-2 moves VCO-1’s pitch at audio rate (frequency modulation). A little adds grit and bell-like overtones; more gives clangy, metallic and gong tones. Tune VCO-2 to change the colour.',
});
T(678, 295, 'CROSS\nMOD', 8.5);
scale(665);
tag(678, 406, 'VCO-2');
ML(678, 376, 678, 398, 1.3);
decor.push({ t: 'arrow', x: X(678), y: Y(378), dir: 'up', size: 3.6 });
const RANGE1: ControlOption[] = [
  { v: '16', label: "16'", a: -60 },
  { v: '8', label: "8'", a: -20 },
  { v: '4', label: "4'", a: 20 },
  { v: '2', label: "2'", a: 60 },
];
const RANGE1_SEMI: Record<string, number> = { 16: -12, 8: 0, 4: 12, 2: 24 };
knob('vco1.range', 728, 341, {
  kind: 'enum',
  options: RANGE1,
  def: '8',
  module: 'osc',
  label: 'VCO-1 RANGE',
  name: 'VCO-1 range',
  scale: { ticks: 0, size: 7.5, numR: 1.6 },
  help: 'The octave of VCO-1, in organ feet: 16’ is an octave down, 8’ plays at the pitch of the key, 4’ and 2’ are one and two octaves up.',
});
T(728, 299, 'RANGE', 8.5);
const W1: ControlOption[] = [
  { v: 'tri', label: '', a: -60 },
  { v: 'saw', label: '', a: -20 },
  { v: 'pulse', label: '', a: 20 },
  { v: 'square', label: '', a: 60 },
];
const W1_NAMES: Record<string, string> = {
  tri: 'triangle',
  saw: 'sawtooth',
  pulse: 'pulse',
  square: 'square',
};
knob('vco1.wave', 789, 341, {
  kind: 'enum',
  options: W1,
  def: 'saw',
  module: 'osc',
  label: 'VCO-1 WAVEFORM',
  name: 'VCO-1 waveform',
  fmt: (v: OptionValue) => W1_NAMES[String(v)],
  help: 'VCO-1’s waveform. Triangle is soft and flute-like, sawtooth bright and buzzy, square hollow, and pulse a narrower square whose width is set in the VCO MODULATOR section.',
});
T(789, 299, 'WAVEFORM', 8.5);
(
  [
    ['tri', 768, 322],
    ['saw', 780, 313],
    ['pulse', 797, 313],
    ['sq', 812, 322],
  ] as const
).forEach(([s, px, py]) =>
  decor.push({ t: 'wave', x: X(px), y: Y(py), size: 7.5, shape: s, w: 1.5 })
);
[678, 728, 789].forEach((px) => up(px));

// ── VCO-2 ─────────────────────────────────────────────────────────────────
slide('vco2.sync', 857, 349, 2, {
  kind: 'bool',
  def: false,
  onAt: 'bottom',
  module: 'osc',
  label: 'SYNC',
  name: 'VCO-2 sync',
  help: 'Hard sync: VCO-2 restarts every time VCO-1 does, so VCO-2 follows VCO-1’s note and its own RANGE changes the tone instead, from hollow to tearing. Sweep VCO-2 with ENV-1 for the classic sync lead.',
});
T(857, 300, 'SYNC', 8.5);
T(857, 330, 'OFF', 6.5);
T(857, 368, 'ON', 6.5);
tag(857, 406, 'VCO-1');
ML(857, 376, 857, 398, 1.3);
decor.push({ t: 'arrow', x: X(857), y: Y(378), dir: 'up', size: 3.6 });
T(912, 300, 'RANGE', 8.5);
ML(882, 300, 896, 300, 1.2);
ML(929, 300, 962, 300, 1.2);
slide('vco2.lowFreq', 889, 349, 2, {
  kind: 'bool',
  def: false,
  onAt: 'bottom',
  module: 'osc',
  label: 'NORMAL / LOW FREQ',
  name: 'VCO-2 low frequency',
  help: 'LOW FREQ takes VCO-2 down to a few cycles a second and stops it following the keys, so it becomes a second LFO: through CROSS MOD it gives vibrato or a slow warble on VCO-1, and in the mix you hear it as clicks.',
});
T(889, 330, 'NORMAL', 6.5);
T(889, 368, 'LOW FREQ', 6.5);
knob('vco2.range', 935, 341, {
  min: 0,
  max: 36,
  def: 12,
  step: 1,
  module: 'osc',
  label: 'VCO-2 RANGE',
  name: 'VCO-2 range',
  fmt: (v: number) => fmtSemi(v - 12),
  scale: {
    labels: [
      { at: 0, text: "16'" },
      { at: 36, text: "2'" },
    ],
    ticks: 13,
    size: 7.5,
  },
  help: 'VCO-2’s pitch in semitone steps over four octaves, from 16’ to 2’. Twelve steps from the left (8’) is in tune with VCO-1 at 8’; +7 adds a fifth, +12 an octave. In LOW FREQ it sets the rate instead.',
});
knob('vco2.fine', 993, 341, {
  min: -5,
  max: 5,
  def: 0,
  module: 'osc',
  label: 'FINE TUNE',
  name: 'VCO-2 fine tune',
  fmt: (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 10)} cents`,
  scale: {
    labels: [
      { at: -5, text: '−' },
      { at: 5, text: '+' },
    ],
    ticks: 11,
    size: 9,
  },
  help: 'Tunes VCO-2 up to half a semitone either way. A few cents off VCO-1 and the two beat against each other, which thickens every note.',
});
T(993, 295, 'FINE\nTUNE', 8.5);
const W2: ControlOption[] = [
  { v: 'sine', label: '', a: -60 },
  { v: 'saw', label: '', a: -20 },
  { v: 'pulse', label: '', a: 20 },
  { v: 'noise', label: '', a: 60 },
];
const W2_NAMES: Record<string, string> = {
  sine: 'sine',
  saw: 'sawtooth',
  pulse: 'pulse',
  noise: 'noise',
};
knob('vco2.wave', 1053, 341, {
  kind: 'enum',
  options: W2,
  def: 'saw',
  module: 'osc',
  label: 'VCO-2 WAVEFORM',
  name: 'VCO-2 waveform',
  fmt: (v: OptionValue) => W2_NAMES[String(v)],
  help: 'VCO-2’s waveform: a pure sine, a sawtooth, a pulse (its width set in the VCO MODULATOR section) or NOISE, which turns VCO-2 into a noise source for breath, wind and percussion.',
});
T(1053, 299, 'WAVEFORM', 8.5);
(
  [
    ['sine', 1032, 322],
    ['saw', 1045, 313],
    ['pulse', 1062, 313],
  ] as const
).forEach(([s, px, py]) =>
  decor.push({ t: 'wave', x: X(px), y: Y(py), size: 7.5, shape: s, w: 1.5 })
);
T(1078, 321, 'NOISE', 6.5);
[857, 912, 993, 1053].forEach((px) => up(px));

// ── Mixer and HPF ─────────────────────────────────────────────────────────
knob('mix.balance', 1132, 341, {
  def: 5,
  module: 'mixer',
  label: 'SOURCE MIX',
  name: 'Source mix',
  scale: { labels: [], ticks: 11, size: 7.5 },
  fmt: (v: number) => (Math.abs(v - 5) < 0.25 ? 'both' : v < 5 ? `more VCO-1` : 'more VCO-2'),
  help: 'Balance of the two oscillators into the filter: VCO-1 alone to the left, VCO-2 alone to the right, both at full level in the middle.',
});
T(1132, 295, 'SOURCE\nMIX', 8.5);
T(1132, 314, 'MIX', 6.5);
tag(1117, 388, 'VCO-1');
tag(1146, 388, 'VCO-2');
up(1132, 286, 257);
fader('hpf.cutoff', 1190, {
  def: 0,
  module: 'filter',
  label: 'HPF CUTOFF FREQ',
  name: 'High-pass cutoff',
  fmt: (v) => (v <= 0 ? 'off' : fmtHz(hpfHz(v))),
  help: 'A gentle high-pass filter before the main filter: it thins out the bottom of the sound. At 0 everything passes; up takes the body away for a lighter, brighter tone that sits above a bass part.',
});
T(1190, 295, 'CUT OFF\nFREQ', 8.5);
T(1214, 316, 'HIGH', 6.5);
T(1214, 368, 'LOW', 6.5);
up(1190);

// ── VCF ───────────────────────────────────────────────────────────────────
fader('vcf.cutoff', 1243, {
  def: 10,
  module: 'filter',
  label: 'CUTOFF FREQ',
  name: 'Filter cutoff',
  fmt: (v) => fmtHz(vcfHz(v)),
  help: 'Cutoff of the low-pass filter. Down makes the sound darker and duller; up lets all the brightness through.',
});
fader('vcf.res', 1270, {
  def: 0,
  module: 'filter',
  label: 'RES',
  name: 'Resonance',
  fmt: pct,
  help: 'A boost right at the cutoff that makes filter sweeps sound vocal and squelchy. Near the top the filter starts to whistle on its own.',
});
scale(1229);
T(1243, 295, 'CUT OFF\nFREQ', 8.5);
T(1270, 299, 'RES', 8.5);
slide('vcf.slope', 1305, 341, 2, {
  kind: 'enum',
  options: [
    { v: '12', label: '-12dB/OCT' },
    { v: '24', label: '-24dB/OCT' },
  ],
  def: '24',
  module: 'filter',
  label: 'SLOPE',
  name: 'Filter slope',
  help: 'How steeply the filter cuts above the cutoff. −24 dB per octave is round and heavy; −12 dB leaves more of the upper harmonics in, brighter and buzzier, good for brass and strings.',
});
T(1305, 299, 'SLOPE', 8.5);
T(1305, 326, '-12dB/OCT', 6.2);
T(1305, 357, '-24dB/OCT', 6.2);
fader('vcf.env', 1340, {
  def: 0,
  module: 'filter',
  label: 'ENV MOD',
  name: 'Filter envelope depth',
  fmt: pct,
  help: 'How far the envelope chosen by the switch beside it opens the filter on each note. With ENV-1 inverted by its POLARITY switch, it closes the filter instead.',
});
T(1340, 295, 'ENV\nMOD', 8.5);
slide('vcf.envSel', 1377, 344, 2, {
  kind: 'enum',
  options: [
    { v: 'env1', label: 'ENV-1' },
    { v: 'env2', label: 'ENV-2' },
  ],
  def: 'env1',
  module: 'filter',
  label: 'ENV MOD selector',
  name: 'Filter envelope',
  help: 'Which envelope moves the filter: ENV-1, which can be inverted and also drives the pitch and pulse-width sweeps, or ENV-2, the one that shapes the volume, so the brightness follows the loudness.',
});
tag(1374, 308, 'ENV-1');
tag(1374, 387, 'ENV-2');
fader('vcf.lfo', 1410, {
  def: 0,
  module: 'filter',
  label: 'LFO MOD',
  name: 'Filter LFO depth',
  fmt: pct,
  help: 'How far the LFO sweeps the cutoff: a slow wah, a rhythmic pulse, or with RANDOM a stepping, bubbling filter.',
});
fader('vcf.kbd', 1437, {
  def: 0,
  module: 'filter',
  label: 'KEY FOLLOW',
  name: 'Filter key follow',
  fmt: (v) => `${Math.round(v * 12)} %`,
  help: 'How much the cutoff follows the keyboard, up to 120 %. At about 8 (100 %) high notes are as bright as low ones; at 0 the top of the keyboard sounds duller.',
});
scale(1397);
T(1410, 295, 'LFO\nMOD', 8.5);
T(1437, 295, 'KEY\nFOLLOW', 8.5);
tag(1410, 407, 'LFO');
tag(1437, 407, 'KYBD');
[1243, 1270, 1305, 1340, 1410, 1437].forEach((px) => up(px));

// ── VCA ───────────────────────────────────────────────────────────────────
fader('vca.level', 1478, {
  def: 8,
  module: 'amp',
  label: 'VCA LEVEL',
  name: 'VCA level',
  fmt: pct,
  help: 'The volume of this patch, set under ENV-2. It is stored with each patch, so quiet and loud sounds can be balanced; VOLUME at the left sets the overall level.',
});
T(1478, 299, 'LEVEL', 8.5);
scale(1465);
slide('vca.lfo', 1504, 342, 4, {
  kind: 'enum',
  options: [
    { v: 3, label: '3' },
    { v: 2, label: '2' },
    { v: 1, label: '1' },
    { v: 0, label: '0' },
  ],
  def: 0,
  module: 'amp',
  label: 'VCA LFO MOD',
  name: 'Tremolo depth',
  help: 'Tremolo: the LFO dips the volume, in four steps from 0 (off) to 3 (deep). With a square LFO it chops the sound on and off.',
});
T(1504, 295, 'LFO\nMOD', 8.5);
(
  [
    ['3', 316],
    ['2', 333],
    ['1', 350],
    ['0', 367],
  ] as const
).forEach(([t, py]) => T(1517, py, t, 6.5));
tag(1478, 407, 'ENV-2');
tag(1504, 407, 'LFO');
[1478, 1504].forEach((px) => up(px));

// ── Envelopes ─────────────────────────────────────────────────────────────
const STAGE: [stage: string, t: string][] = [
  ['attack', 'A'],
  ['decay', 'D'],
  ['sustain', 'S'],
  ['release', 'R'],
];
const STAGE_HELP: Record<string, string> = {
  attack: 'how long it takes to rise to full after a key is pressed',
  decay: 'how long it takes to fall from the peak to the sustain level',
  sustain: 'the level it holds while the key is held down',
  release: 'how long it takes to fall to nothing after the key is let go',
};
const ENV_DEF: Record<string, number[]> = { env1: [0, 4, 5, 3], env2: [0, 4, 10, 3] };
const ENVS: [e: string, xs: number[], full: string, what: string][] = [
  [
    'env1',
    [1565, 1592, 1620, 1647],
    'ENV-1',
    'the filter (when ENV MOD is set to ENV-1), the pitch sweeps of the VCO MODULATOR and the pulse width (at ENV-1)',
  ],
  [
    'env2',
    [1750, 1778, 1806, 1834],
    'ENV-2',
    'the volume of each note, and the filter when ENV MOD is set to ENV-2',
  ],
];
ENVS.forEach(([e, xs, full, what]) => {
  STAGE.forEach(([stage, t], i) => {
    const isTime = stage !== 'sustain';
    fader(`${e}.${stage}`, xs[i], {
      def: ENV_DEF[e][i],
      module: 'env',
      label: `${full} ${t}`,
      name: `${full} ${stage}`,
      fmt: isTime ? (v) => fmtTime(stage === 'attack' ? attTime(v) : drTime(v)) : pct,
      help: `${full}: ${STAGE_HELP[stage]}. It shapes ${what}.`,
    });
    T(xs[i], 299, t, 8.5);
    up(xs[i]);
  });
  scale(xs[0] - 13);
});
slide('env1.kf', 1685, 341, 2, {
  kind: 'bool',
  def: false,
  onAt: 'bottom',
  module: 'env',
  label: 'ENV-1 KEY FOLLOW',
  name: 'ENV-1 key follow',
  help: 'ON makes ENV-1’s times shorter on higher notes and longer on lower ones, as on a piano or a plucked string, where high notes die away faster.',
});
slide('env2.kf', 1877, 341, 2, {
  kind: 'bool',
  def: false,
  onAt: 'bottom',
  module: 'env',
  label: 'ENV-2 KEY FOLLOW',
  name: 'ENV-2 key follow',
  help: 'ON makes ENV-2’s times shorter on higher notes and longer on lower ones, so the top of the keyboard plucks and the bottom rings.',
});
[1685, 1877].forEach((px) => {
  T(px, 295, 'KEY\nFOLLOW', 8.5);
  T(px, 324, 'OFF', 6.5);
  T(px, 360, 'ON', 6.5);
  tag(px, 407, 'KYBD');
  up(px);
});
slide('env1.polarity', 1717, 344, 2, {
  kind: 'enum',
  options: [
    { v: 'normal', label: 'Normal' },
    { v: 'inverted', label: 'Inverted' },
  ],
  def: 'normal',
  module: 'env',
  label: 'ENV-1 POLARITY',
  name: 'ENV-1 polarity',
  help: 'Turns ENV-1 upside down everywhere it goes: the filter closes instead of opening, pitch sweeps go down instead of up, and the pulse width sweeps the other way.',
});
T(1717, 299, 'POLARITY', 8.5);
decor.push({ t: 'wave', x: X(1717), y: Y(323), size: 8, shape: 'adsr', w: 1.5 });
decor.push({
  t: 'path',
  d: `M${X(1711)} ${Y(360)} L${X(1714)} ${Y(368)} L${X(1718)} ${Y(364)} L${X(1723)} ${Y(364)} L${X(1726)} ${Y(360)}`,
  w: 1.5,
});
up(1717);

// ── Bottom row: tuning ────────────────────────────────────────────────────
knob('out.tune', 148, 470, {
  min: -5,
  max: 5,
  def: 0,
  module: 'out',
  label: 'MASTER TUNE',
  name: 'Master tune',
  fmt: (v: number) => `${v > 0 ? '+' : ''}${Math.round(v * 10)} cents`,
  scale: {
    labels: [
      { at: -5, text: '−' },
      { at: 5, text: '+' },
    ],
    ticks: 11,
    size: 9,
  },
  help: 'Tunes the whole synth up or down by up to half a semitone.',
});
T(148, 430, 'MASTER TUNE', 8);
deadButton(228, CAP.red);
T(228, 444, 'TUNE', 7.5);

// ── Arpeggio ──────────────────────────────────────────────────────────────
T(382, 430, 'ARPEGGIO', 8);
ML(262, 430, 352, 430, 1.1);
ML(412, 430, 500, 430, 1.1);
const sel = (
  id: string,
  opts: [v: OptionValue, px: number, label: string, capColor?: string][],
  rest: SelectRest
): void => {
  controls.push({
    id,
    type: 'select',
    ...BTN,
    x: X(opts[0][1]),
    y: Y(BY),
    labelPos: 'none',
    kind: 'enum',
    options: opts.map(([v, px, label, capColor]) => ({ v, x: X(px), y: Y(BY), label, capColor })),
    ...rest,
  });
};
sel(
  'arp.range',
  [
    [1, 270, '1 octave', CAP.orange],
    [2, 300, '2 octaves', CAP.orange],
    [3, 330, '3 octaves', CAP.orange],
    [4, 360, '4 octaves', CAP.orange],
  ],
  {
    def: 1,
    module: 'mode',
    label: 'ARPEGGIO RANGE',
    name: 'Arpeggio range',
    help: 'How many octaves the arpeggio climbs through: the held notes are played in the first octave, then repeated one, two or three octaves higher.',
  }
);
[1, 2, 3, 4].forEach((n, i) => T(270 + 30 * i, 444, String(n), 7.5));
T(315, 507, 'RANGE', 7.5);
sel(
  'arp.mode',
  [
    ['off', 403, 'Off'],
    ['up', 403, 'UP', CAP.yellow],
    ['down', 433, 'DOWN', CAP.yellow],
    ['updown', 463, 'U&D', CAP.yellow],
    ['random', 493, 'RANDOM', CAP.yellow],
  ],
  {
    def: 'off',
    offValue: 'off',
    module: 'mode',
    label: 'ARPEGGIO MODE',
    name: 'Arpeggio mode',
    help: 'Starts the arpeggio: hold a chord and its notes play one at a time, UP, DOWN, up and down (U&D) or in RANDOM order, at the RATE set in the top row. Press the lit button again to stop it.',
  }
);
// The OFF position has no button: pressing the lit MODE button again returns to it.
const arpMode = controls[controls.length - 1];
if (arpMode.type === 'select') arpMode.options[0].hide = true;
(
  [
    ['UP', 403],
    ['DOWN', 433],
    ['U&D', 463],
    ['RANDOM', 493],
  ] as const
).forEach(([t, px]) => T(px, 444, t, 7));
T(448, 507, 'MODE', 7.5);
[
  [262, 368],
  [395, 500],
].forEach(([a, b]) => {
  ML(a, 500, a, 494, 1.1);
  ML(b, 500, b, 494, 1.1);
  ML(a, 500, (a + b) / 2 - 22, 500, 1.1);
  ML((a + b) / 2 + 22, 500, b, 500, 1.1);
});

// ── Assign mode and hold ──────────────────────────────────────────────────
T(580, 430, 'ASSIGN MODE', 8);
ML(528, 430, 548, 430, 1.1);
ML(612, 430, 632, 430, 1.1);
sel(
  'assign.mode',
  [
    ['solo', 535, 'SOLO', CAP.white],
    ['unison', 565, 'UNISON', CAP.white],
    ['poly1', 595, 'POLY 1', CAP.white],
    ['poly2', 625, 'POLY 2', CAP.white],
  ],
  {
    def: 'poly1',
    module: 'mode',
    label: 'ASSIGN MODE',
    name: 'Assign mode',
    help: 'How keys are given to the eight voices. SOLO plays one voice at a time, like a mono synth. UNISON stacks all eight voices on one note for a huge lead or bass. POLY 1 and POLY 2 play chords, one voice per key.',
  }
);
T(595, 444, '1', 7.5);
T(625, 444, '2', 7.5);
T(535, 507, 'SOLO', 7);
T(565, 507, 'UNISON', 7);
T(610, 507, 'POLY', 7);
ML(590, 507, 598, 507, 1.1);
ML(622, 507, 630, 507, 1.1);
T(682, 430, 'HOLD', 8);
ML(660, 430, 670, 430, 1.1);
ML(694, 430, 704, 430, 1.1);
(
  [
    ['kbd.holdLower', 667, 'LOWER'],
    ['kbd.holdUpper', 697, 'UPPER'],
  ] as const
).forEach(([id, px, t]) => {
  controls.push({
    id,
    type: 'button',
    x: X(px),
    y: Y(BY),
    ...BTN,
    capColor: CAP.green,
    capLamp: true,
    kind: 'bool',
    def: false,
    labelPos: 'none',
    module: 'mode',
    label: `HOLD ${t}`,
    name: `Hold (${t.toLowerCase()})`,
    help: `Latches the arpeggio, so it keeps playing after you let go; a new chord replaces the held one. On the hardware LOWER and UPPER hold each half of a split keyboard; this app plays one patch, so either one latches it. Holding notes without the arpeggio is not modelled.`,
  });
  T(px, 507, t, 7);
});

// ── Key mode and panel mode (printed) ─────────────────────────────────────
T(770, 430, 'KEY MODE', 8);
(
  [
    [740, 'DUAL'],
    [770, 'SPLIT'],
    [800, 'WHOLE'],
  ] as const
).forEach(([px, t]) => {
  deadButton(px, CAP.teal, t === 'WHOLE');
  T(px, 507, t, 7);
});
T(857, 426, 'PANEL', 7.5);
T(857, 435, 'MODE', 7.5);
(
  [
    [842, 'LOWER'],
    [872, 'UPPER'],
  ] as const
).forEach(([px, t]) => {
  deadButton(px, CAP.blue, t === 'UPPER');
  T(px, 507, t, 7);
});

// ── Patch number display (printed) ────────────────────────────────────────
decor.push({
  t: 'rect',
  x: X(930),
  y: Y(428),
  w: X(1115) - X(930),
  h: Y(518) - Y(428),
  r: 4,
  fill: '#3a3b3e',
  stroke: '#6a6b70',
  sw: 1.5,
  hw: true,
});
decor.push({
  t: 'rect',
  x: X(950),
  y: Y(448),
  w: X(1095) - X(950),
  h: Y(498) - Y(448),
  r: 2,
  fill: '#1a0808',
  stroke: '#000',
  sw: 1.5,
});
T(1022, 461, '88  88', 34, { fill: '#3d1210', weight: 700, spacing: '0.05em' });
T(988, 438, 'LOWER', 6.5);
T(1056, 438, 'UPPER', 6.5);
T(1022, 509, 'PATCH NUMBER', 7.5);
[
  [934, 432],
  [1110, 432],
  [934, 514],
  [1110, 514],
].forEach(([px, py]) => decor.push({ t: 'screw', x: X(px), y: Y(py), r: 4 }));

// ── Patch number, presets, write, tape (printed) ──────────────────────────
T(1280, 430, 'PATCH NUMBER 11-88', 8);
ML(1170, 434, 1240, 434, 1.1);
ML(1322, 434, 1390, 434, 1.1);
for (let i = 0; i < 8; i++) {
  deadButton(1175 + 30 * i, CAP.cream);
  T(1175 + 30 * i, 444, String(i + 1), 7.5);
}
deadButton(1425, CAP.green, true);
T(1425, 444, 'MANUAL', 7);
T(1572, 430, 'PATCH PRESET', 8);
ML(1465, 434, 1532, 434, 1.1);
ML(1612, 434, 1685, 434, 1.1);
'ABCDEFGH'.split('').forEach((ch, i) => {
  deadButton(1470 + 30 * i, i < 4 ? CAP.yellow : CAP.orange);
  T(1470 + 30 * i, 444, ch, 7.5);
});
T(1707, 436, 'MEMORY', 6.5);
T(1707, 444, 'PROTECT', 6.5);
decor.push({ t: 'led', x: X(1707), y: Y(462), r: 3.6, color: 'red', litWhen: 'power' });
deadButton(1737, CAP.red);
T(1737, 444, 'WRITE', 7);
T(1810, 430, 'TAPE MEMORY', 7.5);
(
  [
    [1780, 'SAVE', CAP.teal],
    [1810, 'VERIFY', CAP.teal],
    [1840, 'LOAD', '#2b8fb8'],
  ] as const
).forEach(([px, t, c]) => {
  deadButton(px, c);
  T(px, 444, t, 7);
});
T(1868, 436, 'DATA', 6.5);
T(1868, 444, 'CHECK', 6.5);
decor.push({ t: 'led', x: X(1868), y: Y(462), r: 3.6, color: 'red' });

// ── Performance panel (left of the keys) ──────────────────────────────────
decor.push({
  t: 'rect',
  x: CHEEK,
  y: 0,
  w: LX(412) - CHEEK,
  h: LY(600) - 6,
  fill: '#0b0b0c',
  hw: true,
});
decor.push({
  t: 'rect',
  x: LX(412),
  y: 0,
  w: X(88) - LX(412),
  h: VIEW_H,
  fill: 'url(#kysMetal)',
  hw: true,
});
LL(88, 600, 412, 600, 2);
(
  [
    ['bend.vco1', 130, 'VCO-1\nBEND', 'Bend reaches VCO-1'],
    ['bend.vco2', 157, 'VCO-2\nBEND', 'Bend reaches VCO-2'],
    ['bend.vcf', 182, 'VCF\nBEND', 'Bend reaches the filter'],
    ['plfo.vco', 208, 'VCO\nMOD', 'Performance LFO to the VCOs'],
    ['plfo.vcf', 236, 'VCF\nMOD', 'Performance LFO to the filter'],
  ] as const
).forEach(([id, px, t, name]) => {
  const bend = id.startsWith('bend');
  const what =
    id === 'bend.vco1'
      ? 'VCO-1’s pitch'
      : id === 'bend.vco2'
        ? 'VCO-2’s pitch'
        : id === 'bend.vcf'
          ? 'the filter cutoff'
          : id === 'plfo.vco'
            ? 'the pitch of both oscillators (vibrato)'
            : 'the filter cutoff (growl)';
  lslide(id, px, 655, 2, {
    kind: 'bool',
    def: id === 'bend.vco1' || id === 'bend.vco2' || id === 'plfo.vco',
    onAt: 'bottom',
    module: bend ? 'util' : 'mod',
    label: t.replace(/\n/g, ' '),
    name,
    help: bend
      ? `ON lets the bender move ${what}, by the BEND ${id === 'bend.vcf' ? 'VCF' : 'VCO'} slider. Bending only one oscillator pulls the two apart, and against SYNC it bends the tone. Here the mod wheel beside the keyboard stands in for the bender pushed to the right.`
      : `ON lets the performance LFO move ${what} while the LFO MODULATION button is on, by the LFO MOD ${id === 'plfo.vco' ? 'VCO' : 'VCF'} slider.`,
  });
  LT(px, 627, t, 7.5);
});
LT(110, 650, 'OFF', 6);
LT(110, 661, 'ON', 6);
lknob('plfo.rise', 290, 653, {
  def: 0,
  module: 'lfo',
  label: 'LFO MOD RISE TIME',
  name: 'Performance LFO rise time',
  fmt: (v: number) => (v <= 0 ? 'at once' : fmtTime(riseTime(v))),
  scale: { labels: [], ticks: 11, size: 7 },
  help: 'How long the performance LFO takes to come in after a note starts, up to about 2 seconds, so vibrato can bloom on held notes.',
});
LT(290, 621, 'LFO MOD\nRISE TIME', 7.5);
lknob('glide.time', 360, 653, {
  def: 0,
  module: 'glide',
  label: 'PORTAMENTO',
  name: 'Portamento time',
  fmt: (v: number) => (v <= 0 ? 'off' : fmtTime(portaTime(v))),
  scale: { labels: [], ticks: 11, size: 7 },
  help: 'Glide time between notes, up to about 3 seconds. It works only with the switch below at ON (or UPPER ONLY). Every voice glides from the last note it played, so chords smear into each other.',
});
LT(360, 621, 'PORTAMENTO', 7.5);
controls.push({
  id: 'plfo.on',
  type: 'button',
  x: LX(288),
  y: LY(704),
  w: 46,
  h: 30,
  capColor: CAP.cream,
  capLamp: true,
  kind: 'bool',
  def: false,
  labelPos: 'none',
  module: 'mod',
  label: 'LFO MODULATION',
  name: 'Performance LFO on',
  help: 'Brings in the performance LFO, a second, sine LFO for vibrato and growl, reaching the pitch and the filter as the VCO MOD and VCF MOD switches above allow. On the hardware it is a held button for vibrato on demand; here it latches.',
});
LT(288, 728, 'LFO MODULATION', 7);
lslide('glide.mode', 355, 707, 3, {
  kind: 'enum',
  options: [
    { v: 'upper', label: 'UPPER ONLY' },
    { v: 'off', label: 'OFF' },
    { v: 'on', label: 'ON' },
  ],
  def: 'off',
  module: 'glide',
  label: 'PORTAMENTO switch',
  name: 'Portamento switch',
  help: 'Turns portamento on. UPPER ONLY glides only the upper patch of a split keyboard; this app plays one patch, which counts as the upper one, so UPPER ONLY glides it too.',
});
(
  [
    ['UPPER ONLY', 696],
    ['OFF', 707],
    ['ON', 718],
  ] as const
).forEach(([t, py]) => LT(366, py, t, 6, { anchor: 'start' }));
lfader('bend.vcoSens', 128, {
  def: 3,
  module: 'util',
  label: 'BEND VCO',
  name: 'Bend depth on the VCOs',
  fmt: (v) => fmtSemi(12 * (v / 10)),
  help: 'How far the bender moves the pitch of the oscillators switched on above, up to an octave. Here the mod wheel stands in for the bender pushed right.',
});
lfader('bend.vcfSens', 158, {
  def: 0,
  module: 'util',
  label: 'BEND VCF',
  name: 'Bend depth on the filter',
  fmt: pct,
  help: 'How far the bender opens the filter when VCF BEND is on, up to five octaves. Here the mod wheel stands in for the bender pushed right.',
});
lfader('plfo.vcoDepth', 205, {
  def: 3,
  module: 'mod',
  label: 'LFO MOD VCO',
  name: 'Performance vibrato depth',
  fmt: pct,
  help: 'Depth of the performance LFO on pitch, up to a little over a semitone either way.',
});
lfader('plfo.vcfDepth', 233, {
  def: 0,
  module: 'mod',
  label: 'LFO MOD VCF',
  name: 'Performance growl depth',
  fmt: pct,
  help: 'Depth of the performance LFO on the filter cutoff, up to four octaves.',
});
scale(115, LX, LY, 746);
LT(128, 789, 'VCO', 7);
LT(158, 789, 'VCF', 7);
LT(143, 805, 'BEND', 7);
LT(205, 789, 'VCO', 7);
LT(233, 789, 'VCF', 7);
LT(219, 805, 'LFO MOD', 7);
LL(118, 798, 168, 798, 1.1);
LL(195, 798, 243, 798, 1.1);
// switch-to-slider wiring
LL(130, 669, 130, 680, 1.1);
LL(157, 669, 157, 680, 1.1);
LL(130, 680, 157, 680, 1.1);
LL(143, 680, 128, 712, 1.1);
LL(182, 669, 158, 712, 1.1);
[
  [208, 205],
  [236, 233],
].forEach(([a, b]) => LL(a, 669, b, 712, 1.1));
// The bender lever, drawn for reference
decor.push({
  t: 'rect',
  x: LX(282),
  y: LY(772),
  w: LX(372) - LX(282),
  h: 26,
  r: 3,
  fill: '#1c1c1e',
  stroke: '#3a3b3f',
  sw: 1.5,
  hw: true,
});
decor.push({
  t: 'rect',
  x: LX(320),
  y: LY(772) + 3,
  w: 26,
  h: 20,
  r: 3,
  fill: '#2b2c2f',
  stroke: '#55565a',
  sw: 1,
  hw: true,
});
[
  [286, 768],
  [366, 768],
].forEach(([px, py]) => decor.push({ t: 'screw', x: LX(px), y: LY(py), r: 4 }));
LT(325, 806, 'BENDER', 7.5);

// ── Areas ─────────────────────────────────────────────────────────────────
const RP = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: X(x1) - X(x0),
  h: Y(y1) - Y(y0),
});
const RL = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: LX(x0),
  y: LY(y0),
  w: LX(x1) - LX(x0),
  h: LY(y1) - LY(y0),
});
const areas: Area[] = [
  {
    id: 'output',
    label: 'Volume and tuning',
    module: 'out',
    keywords: 'master volume level balance tune tuning auto-tune',
    rects: [RP(90, 212, 247, 416), RP(90, 416, 248, 529)],
    help: 'VOLUME sets the overall level and MASTER TUNE the pitch of the whole synth. BALANCE sets the lower patch against the upper one when the keyboard is split or layered, and TUNE retunes all sixteen oscillators automatically. Neither of those two changes the sound here.',
  },
  {
    id: 'arp',
    label: 'Arpeggio',
    module: 'mode',
    keywords: 'arp arpeggiator rate range octave up down random',
    rects: [RP(247, 212, 320, 416), RP(248, 416, 515, 529)],
    help: 'Hold a chord and the arpeggio plays its notes one at a time. RATE sets the speed, the four orange buttons how many octaves it climbs, and the four yellow MODE buttons the order: UP, DOWN, up and down, or RANDOM. Press the lit MODE button again to stop it.',
  },
  {
    id: 'lfo',
    label: 'LFO',
    module: 'lfo',
    keywords: 'lfo vibrato wobble rate delay sample and hold random',
    rects: [RP(320, 212, 455, 416)],
    help: 'One LFO, a slow wave that moves other parts of the sound, shared by all the voices. RATE sets its speed, DELAY TIME how long it takes to come in after each note, and WAVE FORM its shape. Where it goes is set in the VCO MODULATOR, VCF and VCA sections.',
  },
  {
    id: 'vcomod',
    label: 'VCO modulator',
    module: 'mod',
    keywords: 'vibrato pitch sweep pwm pulse width modulation',
    rects: [RP(455, 212, 655, 416)],
    help: 'Pitch and pulse-width modulation for both oscillators. LFO MOD and ENV MOD set how far the LFO and ENV-1 move the pitch, and the switch picks VCO-1, BOTH or VCO-2. PULSE WIDTH MOD sets the width of the pulse waves by hand, or how far the LFO or ENV-1 sweeps it.',
  },
  {
    id: 'vco1',
    label: 'VCO-1',
    module: 'osc',
    keywords: 'oscillator range waveform cross mod fm frequency modulation metallic bell',
    rects: [RP(655, 212, 822, 416)],
    help: 'The first oscillator. RANGE sets its octave and WAVEFORM picks triangle, sawtooth, pulse or square. CROSS MOD lets VCO-2 modulate VCO-1’s pitch at audio rate, for metallic, bell and clang tones.',
  },
  {
    id: 'vco2',
    label: 'VCO-2',
    module: 'osc',
    keywords: 'oscillator sync range fine tune detune noise low frequency',
    rects: [RP(822, 212, 1088, 416)],
    help: 'The second oscillator. RANGE steps it in semitones over four octaves and FINE TUNE detunes it slightly. WAVEFORM picks sine, sawtooth, pulse or noise. SYNC locks it to VCO-1, and LOW FREQ slows it right down so it can act as a second LFO through CROSS MOD.',
  },
  {
    id: 'mixer',
    label: 'Source mix',
    module: 'mixer',
    keywords: 'mixer balance level oscillator',
    rects: [RP(1088, 212, 1162, 416)],
    help: 'SOURCE MIX balances the two oscillators into the filters: VCO-1 alone at the left, VCO-2 alone at the right, both at full level in the middle.',
  },
  {
    id: 'hpf',
    label: 'High-pass filter',
    module: 'filter',
    keywords: 'hpf high pass thin bass cut',
    rects: [RP(1162, 212, 1224, 416)],
    help: 'A gentle high-pass filter with no resonance, before the main filter. Raising it takes the low end away, which thins a pad or a string sound so it sits above the bass.',
  },
  {
    id: 'vcf',
    label: 'Filter (VCF)',
    module: 'filter',
    keywords: 'vcf cutoff resonance low-pass slope 12 24 envelope key tracking',
    rects: [RP(1224, 212, 1456, 416)],
    help: 'A resonant low-pass filter in each voice. CUT OFF FREQ sets the brightness and RES the emphasis at the cutoff. SLOPE picks a round −24 dB or a brighter −12 dB. ENV MOD sets how far the chosen envelope opens it, LFO MOD how far the LFO sweeps it, and KEY FOLLOW how much it follows the keyboard.',
  },
  {
    id: 'vca',
    label: 'Amplifier (VCA)',
    module: 'amp',
    keywords: 'vca level volume tremolo',
    rects: [RP(1456, 212, 1540, 416)],
    help: 'The amplifier in each voice, shaped by ENV-2. LEVEL is the volume of this patch, stored with it, and LFO MOD adds tremolo in four steps.',
  },
  {
    id: 'env1',
    label: 'ENV-1',
    module: 'env',
    keywords: 'adsr envelope attack decay sustain release key follow polarity invert',
    rects: [RP(1540, 212, 1736, 416)],
    help: 'An ADSR envelope (attack, decay, sustain, release) for the filter, the pitch sweeps and the pulse width. KEY FOLLOW makes it faster on high notes, and POLARITY turns it upside down everywhere it goes.',
  },
  {
    id: 'env2',
    label: 'ENV-2',
    module: 'env',
    keywords: 'adsr envelope loudness volume attack decay sustain release key follow',
    rects: [RP(1736, 212, 1910, 416)],
    help: 'The ADSR envelope that shapes the volume of every note, and can drive the filter too. KEY FOLLOW makes it faster on high notes, so the top of the keyboard dies away sooner.',
  },
  {
    id: 'assign',
    label: 'Assign mode and hold',
    module: 'mode',
    keywords: 'solo unison poly mono voices stack hold latch',
    rects: [RP(515, 416, 718, 529)],
    help: 'How the eight voices are used: SOLO for one note at a time, UNISON for all eight on one note, POLY 1 and POLY 2 for chords. The two HOLD buttons latch the arpeggio.',
  },
  {
    id: 'keymode',
    label: 'Key mode and panel mode',
    module: 'mode',
    keywords: 'split dual layer whole lower upper bi-timbral',
    rects: [RP(718, 416, 893, 529)],
    help: 'The Jupiter-8 holds two patches. KEY MODE plays one over the whole keyboard (WHOLE), one each side of a split point (SPLIT), or both on every key with four voices each (DUAL). PANEL MODE picks which of the two the panel edits. This app plays one patch, so these are printed only.',
  },
  {
    id: 'memory',
    label: 'Patch memory',
    module: 'util',
    keywords: 'program preset memory store write tape display',
    rects: [RP(893, 416, 1910, 529)],
    help: 'The display, the patch number buttons 11 to 88, MANUAL, the eight patch presets (which store a split or dual pair with the performance settings), WRITE with its protect lamp, and the tape memory. Printed only: this app keeps its sounds in the library.',
  },
  {
    id: 'bend',
    label: 'Bender',
    module: 'util',
    keywords: 'pitch bend lever wheel',
    rects: [RL(88, 600, 194, 840)],
    help: 'The bender lever moves pitch and filter. The three switches pick what it reaches (VCO-1, VCO-2, the filter) and the two sliders set how far. Here the mod wheel beside the keyboard stands in for the lever pushed to the right.',
  },
  {
    id: 'plfo',
    label: 'Performance LFO',
    module: 'lfo',
    keywords: 'vibrato growl lfo modulation rise delay',
    rects: [RL(194, 600, 322, 840)],
    help: 'A second, sine LFO for playing vibrato and growl by hand. The LFO MODULATION button brings it in, RISE TIME fades it in after each note, the two switches choose the pitch and the filter, and the two sliders set the depths.',
  },
  {
    id: 'glide',
    label: 'Portamento',
    module: 'glide',
    keywords: 'glide portamento slide',
    rects: [RL(322, 600, 412, 840)],
    help: 'PORTAMENTO sets how long each voice takes to slide to its new note, and the switch turns it on (or on for the upper patch only).',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const LFO_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  saw: { saw: 1 },
  square: { sq: 1 },
  random: { sh: 1 },
};
const OSC1_MIX: Record<string, OscMix> = {
  tri: { tri: 1 },
  saw: { saw: 1 },
  pulse: { pulse: 1 },
  square: { pulse: 1 },
};
const OSC2_MIX: Record<string, OscMix> = {
  sine: { sine: 1 },
  saw: { saw: 1 },
  pulse: { pulse: 1 },
  noise: {},
};
const ARP_MODE: Record<string, ArpMode> = {
  up: 'up',
  down: 'down',
  updown: 'updown',
  random: 'random',
};
const envOf = (v: ControlValues, e: string): EnvParams => ({
  a: attTime(num(v, `${e}.attack`)),
  d: drTime(num(v, `${e}.decay`)),
  s: num(v, `${e}.sustain`) / 10,
  r: drTime(num(v, `${e}.release`)),
  kf: v[`${e}.kf`] ? 1 : 0,
});
const hpfOf = (hp: number): HighPassParams => ({
  poles: 1,
  cutoff: hpfHz(hp),
  res: 0,
  envAmt: 0,
  envSrc: 'env1',
  kbd: 0,
});

function toEngine(v: ControlValues, ctx?: Partial<EngineContext>): EngineParams {
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number, by?: string): void => {
    if (amt !== 0) routes.push(by ? { src, dst, amt, by } : { src, dst, amt });
  };
  const inv = v['env1.polarity'] === 'inverted' ? -1 : 1;
  // VCO MODULATOR: LFO and ENV-1 to the pitch of the oscillators the switch picks
  const tgt = v['vcomod.target'];
  const toV1 = tgt !== 'vco2',
    toV2 = tgt !== 'vco1';
  const lfoP = 48 * (num(v, 'vcomod.lfo') / 10) ** 2;
  const envP = 60 * (num(v, 'vcomod.env') / 10) ** 2 * inv;
  if (toV1) {
    route('lfo', 'pitch1', lfoP);
    route('env1', 'pitch1', envP);
  }
  if (toV2) {
    route('lfo', 'pitch2', lfoP);
    route('env1', 'pitch2', envP);
  }
  // Pulse width: MANUAL sets it; LFO and ENV-1 sweep it from square towards narrow, by the same slider
  const pa = num(v, 'pwm.amount') / 10;
  const mode = v['pwm.mode'];
  let pw = 0.5;
  const pwRoutes: [src: string, amt: number][] = [];
  if (mode === 'manual') pw = 0.5 - 0.44 * pa;
  else if (mode === 'lfo') {
    pw = 0.5 - 0.22 * pa;
    pwRoutes.push(['lfo', 0.22 * pa]);
  } else if (inv > 0) pwRoutes.push(['env1', -0.44 * pa]);
  else {
    pw = 0.5 - 0.44 * pa;
    pwRoutes.push(['env1', 0.44 * pa]);
  }
  const w1 = String(v['vco1.wave']),
    w2 = String(v['vco2.wave']);
  if (w1 === 'pulse') pwRoutes.forEach(([s, a]) => route(s, 'pw1', a));
  if (w2 === 'pulse') pwRoutes.forEach(([s, a]) => route(s, 'pw2', a));
  // CROSS MOD: VCO-2 to VCO-1's pitch at audio rate
  route('osc2', 'pitch1', 30 * (num(v, 'vco1.xmod') / 10) ** 2);
  // VCF
  const envSel = v['vcf.envSel'] === 'env2' ? 'env2' : 'env1';
  const envAmt = 8 * (num(v, 'vcf.env') / 10) * (envSel === 'env1' ? inv : 1);
  route('lfo', 'cutoff', 4 * (num(v, 'vcf.lfo') / 10));
  // VCA tremolo, four steps
  route('lfoUni', 'amp', -0.28 * num(v, 'vca.lfo'));
  // Performance LFO (LFO MODULATION button)
  if (v['plfo.on']) {
    const pv = 1.3 * (num(v, 'plfo.vcoDepth') / 10);
    if (v['plfo.vco']) {
      route('lfo2', 'pitch1', pv);
      route('lfo2', 'pitch2', pv);
    }
    if (v['plfo.vcf']) route('lfo2', 'cutoff', 4 * (num(v, 'plfo.vcfDepth') / 10));
  }
  // The mod wheel stands in for the bender pushed right
  const bend = clamp(ctx?.wheel || 0, 0, 1);
  if (bend > 0) {
    const bv = 12 * (num(v, 'bend.vcoSens') / 10) * bend;
    if (v['bend.vco1']) route('one', 'pitch1', bv);
    if (v['bend.vco2']) route('one', 'pitch2', bv);
    if (v['bend.vcf']) route('one', 'cutoff', 5 * (num(v, 'bend.vcfSens') / 10) * bend);
  }

  // Mixer: a crossfade with both at full level in the middle
  const m = num(v, 'mix.balance');
  const g1 = 0.36 * clamp((10 - m) / 5, 0, 1),
    g2 = 0.36 * clamp(m / 5, 0, 1);
  const noise2 = w2 === 'noise';
  const low = !!v['vco2.lowFreq'];
  const assign = v['assign.mode'];
  const mono = assign === 'solo' || assign === 'unison';
  const arpOn = v['arp.mode'] !== 'off' && v['arp.clock'] === 'int';
  const hp = num(v, 'hpf.cutoff');
  return {
    osc: [
      {
        level: g1,
        mix: OSC1_MIX[w1],
        pw: w1 === 'square' ? 0.5 : pw,
        semi: RANGE1_SEMI[String(v['vco1.range'])],
        kbd: true,
        syncTo: -1,
      },
      {
        level: noise2 ? 0 : g2,
        mix: OSC2_MIX[w2],
        pw: w2 === 'pulse' ? pw : 0.5,
        semi: (low ? 0 : num(v, 'vco2.range') - 12) + num(v, 'vco2.fine') / 10,
        kbd: !low,
        fixedNote: low ? -36 + num(v, 'vco2.range') : undefined,
        syncTo: v['vco2.sync'] ? 0 : -1,
      },
    ],
    noise: { level: noise2 ? g2 * 1.3 : 0, color: 'white' },
    ext: { level: 0 },
    ...(hp > 0 ? { hpf: hpfOf(hp) } : {}),
    filter: {
      type: v['vcf.slope'] === '24' ? 'ladder' : 'svf',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.cutoff')),
      res: (num(v, 'vcf.res') / 10) * (v['vcf.slope'] === '24' ? 1.06 : 0.98),
      envAmt,
      envSrc: envSel,
      kbd: 1.2 * (num(v, 'vcf.kbd') / 10),
    },
    env1: envOf(v, 'env1'),
    env2: envOf(v, 'env2'),
    vca: { envSrc: 'env2', bias: 0, gain: level10(num(v, 'vca.level'), 1.25) },
    lfo: {
      rate: lfoHz(num(v, 'lfo.rate')),
      mix: LFO_MIX[String(v['lfo.wave'])],
      keySync: false,
      delay: lfoDelay(num(v, 'lfo.delay')),
    },
    lfo2: { rate: PLFO_HZ, mix: { sine: 1 }, keySync: false, delay: riseTime(num(v, 'plfo.rise')) },
    glide: {
      time: v['glide.mode'] === 'off' ? 0 : portaTime(num(v, 'glide.time')),
      legato: false,
    },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly: {
      voices: 8,
      stack: assign === 'unison' ? 8 : 1,
      mono,
      detune: assign === 'unison' ? 0.1 : 0,
    },
    arp: {
      on: arpOn,
      bpm: arpHz(num(v, 'arp.rate')) * 15,
      gate: 0.5,
      mode: arpOn ? (ARP_MODE[String(v['arp.mode'])] ?? 'up') : 'up',
      octaves: num(v, 'arp.range'),
      hold: !!(v['kbd.holdLower'] || v['kbd.holdUpper']),
    },
    routes,
    normals: {},
    od: { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: num(v, 'out.tune') / 10,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

// The modular layout: each printed section cut out as a module (cuts are [x0, y0, x1, y1] on the long panel), four
// rows. The panel left of the keyboard (BENDER, LFO MOD, PORTAMENTO) joins the second row.
const CUTS: [number, number, number, number][][] = [
  [
    [433, 78, 720, 333],
    [720, 78, 889, 333],
    [889, 78, 1139, 333],
    [1139, 78, 1348, 333],
    [1348, 78, 1680, 333],
  ],
  [
    [1680, 78, 2245, 333],
    [2245, 78, 2708, 333],
    [14, 194, 419, 500],
  ],
  [
    [433, 333, 630, 474],
    [630, 333, 1218, 474],
    [1218, 333, 1436, 474],
    [1436, 333, 1761, 474],
  ],
  [
    [1761, 333, 2130, 474],
    [2130, 333, 2516, 474],
    [2516, 333, 2708, 474],
  ],
];
const modular: ModularLayout = {
  brand: 'JUPITER-8',
  rows: CUTS.map((row) => row.map((cut) => ({ cut }))),
};

const jupiter8: SynthDef & { version: number } = {
  id: 'jupiter-8',
  version: 1,
  name: 'Jupiter-8',
  maker: 'Roland',
  year: 1981,
  heritage: 'Roland’s flagship polysynth, 1981–85',
  summary:
    'Eight analogue voices, each with two VCOs (cross mod, sync) → a gentle high-pass filter → a resonant 12 or 24 dB low-pass filter → VCA, with two ADSR envelopes that follow the keyboard. One LFO with delay, a performance LFO for vibrato, polyphonic portamento, solo and unison modes and an arpeggiator.',
  view: { w: VIEW_W, h: VIEW_H },
  theme: {
    panel: '#1d1e20',
    panel2: '#151617',
    ink: INK,
    font: 'helv',
    cheeks: 'metal',
    cheekW: CHEEK,
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
  modular,
  signalNames: {
    env1: 'ENV-1',
    env2: 'ENV-2',
    lfo: 'the LFO',
    lfo2: 'the performance LFO',
    osc1: 'VCO-1',
    osc2: 'VCO-2',
  },
};

export default jupiter8;
