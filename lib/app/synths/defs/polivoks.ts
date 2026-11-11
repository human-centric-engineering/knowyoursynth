/**
 * Formanta Polivoks: the definition (D1). Positions are measured on the owner's straight-on photo
 * (`.context/app/synth-data/polivoks/raw/Polivoks Title.jpg`, local only, 4000 × 3000) and written in view units of
 * half a photo pixel, from photo (260, 360): view x = (photo x − 260) / 2, y = (photo y − 360) / 2. The view is the
 * faceplate and the ribbed "tank track" end cheeks beside it, down to the rail over the keys; the keys are left out.
 * The cheeks are drawn as decor, not the theme's `cheeks`, which the page crops off: the owner asked for them. The
 * owner's spec is `.context/app/synth-data/polivoks/polivoks.synth.json` (the Russian operating manual, re-OCRed, also
 * in `raw/` with the English patch-card drawing of the panel the English labels follow).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), following `defs/cat.ts` (the other
 * duophonic synth). The panel prints Russian, as the hardware does; `translation` gives the English the page switches
 * it to. Every knob's numbers and the lines out to them are decor (`spider()`), as the panel prints them.
 *
 * Duophonic: the engine's `duo` keyboard makes the main pitch the lowest key held and `kbd2` the highest. Generator II
 * (osc 1) follows the main pitch. Generator I (osc 0) ignores the keyboard (`kbd: false`) and takes `kbd2` through the
 * slew limiter instead, so GLISSANDO is the slew time and glides Generator I alone, as on the hardware (spec c01). In
 * 1-ГОЛ. (mono) both read the one key, last-note priority, which the manual does not state (`not_in_source`).
 *
 * The manual gives no envelope or modulator times (`not_in_source`), no pulse widths for the two pulse shapes and no
 * key tracking for the filter, so those readouts and values are this app's estimates. The harshness at high resonance
 * is the engine's overdrive after the filter, driven harder as РЕЗОНАНС rises; the SVF here has no drive of its own.
 * The modulator's noise position (chaotic pulses) is the noise generator itself as the modulation source. Not modelled,
 * drawn with help that says so: the key memory switch (ВКЛ.), the headphone level, the pedal and the rear-panel
 * connections, the external input's source, and the eight tuning trimmers under the front cover (not drawn).
 */
import type {
  Area,
  Control,
  ControlOption,
  ControlValues,
  Decor,
  EngineParams,
  EngineRoute,
  KnobControl,
  LfoMix,
  OscParams,
  RockerControl,
  SynthDef,
  SynthModule,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import { expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'spacing' | 'brand' | 'hw'>>;
type Common = { module: SynthModule; name: string; help: string };

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The numbered knobs read 0–6 (МИН. … МАКС. on some), the tuning knobs − … 0 … +, printed as −3 … 3 here.
const TOP = 6;
const u = (v: number): number => Math.max(0, Math.min(1, v / TOP));
/** ЧАСТОТА СРЕЗА: 100 Hz to 10 kHz (spec); at 0 there is no sound (b04), so the bottom stop closes it to 10 Hz. */
const cutHz = (v: number): number => (v <= 0 ? 10 : expMap(u(v), 100, 10000));
const lfoHz = (v: number): number => expMap(u(v), 0.1, 30);
const attackT = (v: number): number => expMap(u(v), 0.002, 5);
const decayT = (v: number): number => expMap(u(v), 0.01, 8);
const releaseT = (v: number): number => expMap(u(v), 0.01, 10);
const glideT = (v: number): number => (v <= 0 ? 0 : 0.01 * Math.pow(300, u(v))); // up to 3 s
/** НАСТРОЙКА: at least ±12 %, about ±1 tone (spec). */
const tuneSemi = (v: number): number => (v / 3) * 2;
/** РАССТРОЙКА: at least ±25 %, about ±2 tones (spec). */
const detuneSemi = (v: number): number => (v / 3) * 4;
const depth = (v: number, max: number): number => (v > 0 ? Math.pow(u(v), 2) * max : 0);
const level = (v: number, max: number): number => level10(u(v) * 10, max);
const pct = (v: number): string => `${Math.round(u(v) * 100)} %`;

const RANGE_SEMI: Record<string, number> = { "32'": -24, "16'": -12, "8'": 0, "4'": 12, "2'": 24 };
const SHAPE_PW: Record<string, number> = { square: 0.5, pulse_1: 0.25, pulse_2: 0.1 };
const LFO_MIX: Record<string, LfoMix> = {
  triangle: { tri: 1 },
  square: { sq: 1 },
  stepped: { sh: 1 },
};

const controls: Control[] = [];
const decor: Decor[] = [];
const INK = '#ebe8dc';
const PLATE = '#2b2e34';
const BODY = '#17181a';

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y): the renderer places text by its baseline. */
const text = (x: number, y: number, t: string, size = 13, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x,
    y: y + size * 0.35,
    text: t,
    size,
    anchor: 'middle',
    weight: 600,
    ...rest,
  });
};
const line = (x1: number, y1: number, x2: number, y2: number, w = 1.6): void => {
  decor.push({ t: 'line', x1, y1, x2, y2, w });
};
const glyph = (x: number, y: number, shape: WaveShape, size = 11): void => {
  decor.push({ t: 'wave', x, y, size, shape });
};
const plate = (x0: number, y0: number, x1: number, y1: number, fill = PLATE): void => {
  decor.push({ t: 'rect', x: x0, y: y0, w: x1 - x0, h: y1 - y0, r: 6, fill });
};
const rad = (a: number): number => (a * Math.PI) / 180;
const at = (x: number, y: number, r: number, a: number): [number, number] => [
  x + r * Math.sin(rad(a)),
  y - r * Math.cos(rad(a)),
];

/**
 * The printed scale round a knob, as the panel draws it: from under the knob a line runs out at each position's angle
 * to an elbow, then level and outwards, with the position's mark at its end; the top position is a short tick with its
 * mark above. `marks[i]` sits at angle `angles[i]`; a mark `''` is a line without one. Text marks print above the
 * line's end, except МИН. and МАКС., which print below it, as on the panel.
 */
const spider = (
  x: number,
  y: number,
  r: number,
  angles: number[],
  marks: (string | { glyph: WaveShape })[],
  geo = { ri: 1.15, re: 1.95, out: 2.45 }
): void => {
  angles.forEach((a, i) => {
    const m = marks[i];
    if (a === 0) {
      const [, y0] = at(x, y, r * geo.ri, 0);
      line(x, y0, x, y - r * (geo.re - 0.3));
      if (typeof m === 'string' && m) text(x, y - r * geo.re - 6, m, 11);
      else if (typeof m === 'object') glyph(x, y - r * geo.re - 6, m.glyph);
      return;
    }
    const side = Math.sign(Math.sin(rad(a)));
    const [x0, y0] = at(x, y, r * geo.ri, a);
    const [ex, ey] = at(x, y, r * geo.re, a);
    const endX = x + side * r * geo.out;
    line(x0, y0, ex, ey);
    line(ex, ey, endX, ey);
    if (typeof m === 'object') glyph(endX - side * 9, ey - 10, m.glyph);
    else if (m === 'МИН.' || m === 'МАКС.') text(endX - side * 14, ey + 10, m, 11);
    else if (m) text(endX - side * 5, ey - 8, m, 11);
  });
};
const SWEEP = [-150, -100, -50, 0, 50, 100, 150];
const N06 = ['0', '1', '2', '3', '4', '5', '6'];
const MINMAX = ['МИН.', '1', '2', '3', '4', '5', 'МАКС.'];
const PM = ['–', '2', '1', '0', '1', '2', '+'];

const KNOB_R = 19;
const ROTARY_R = 29;
/** A numbered knob, 0 to 6, its scale printed round it and its name below. */
const knob = (
  id: string,
  x: number,
  y: number,
  printed: string,
  labelY: number,
  marks: string[],
  c: Common & { def?: number; fmt?: (v: number) => string; bipolar?: boolean }
): void => {
  const { def = 0, fmt, bipolar, ...rest } = c;
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: KNOB_R,
    style: 'polivoks',
    kind: 'cont',
    min: bipolar ? -3 : 0,
    max: bipolar ? 3 : TOP,
    def,
    labelPos: 'none',
    label: c.name,
    ...(fmt ? { fmt } : null),
    ...rest,
  });
  spider(x, y, KNOB_R, SWEEP, marks);
  text(x, labelY, printed, 13);
};
/** A rotary switch: a big knob with its positions' marks printed round it. */
const rotary = (
  id: string,
  x: number,
  y: number,
  printed: string,
  labelY: number,
  options: (ControlOption & { mark: string | { glyph: WaveShape } })[],
  def: string,
  c: Common
): void => {
  const opts = options.map(({ mark: _mark, ...o }) => ({ ...o, label: '' }));
  const named = Object.fromEntries(options.map((o) => [String(o.v), o.label]));
  const knobCtl: KnobControl = {
    id,
    type: 'knob',
    x,
    y,
    r: ROTARY_R,
    style: 'polivoks',
    kind: 'enum',
    options: opts,
    def,
    fmt: (v) => named[String(v)] ?? String(v),
    labelPos: 'none',
    label: c.name,
    ...c,
  };
  controls.push(knobCtl);
  spider(
    x,
    y,
    ROTARY_R,
    options.map((o) => o.a ?? 0),
    options.map((o) => o.mark),
    { ri: 1.02, re: 1.4, out: 1.75 }
  );
  text(x, labelY, printed, 13);
};
type RockerRest = OmitEach<
  RockerControl,
  'id' | 'type' | 'x' | 'y' | 'w' | 'h' | 'color' | 'orient' | 'labelPos'
>;
/** A cream paddle switch; the first option is the paddle pressed at the top. */
const paddle = (id: string, x: number, y: number, rest: RockerRest): void => {
  controls.push({
    id,
    type: 'rocker',
    x,
    y,
    w: 26,
    h: 46,
    color: 'white',
    orient: 'v',
    labelPos: 'none',
    ...rest,
  });
};
/** The repeating envelope's mark under a ГЕНЕРАТОР ОГИБАЮЩЕЙ switch: two peaks. */
const repeatMark = (x: number, y: number): void => {
  decor.push({
    t: 'path',
    d: `M${x - 10} ${y + 5} L${x - 5} ${y - 5} L${x} ${y + 5} L${x + 5} ${y - 5} L${x + 10} ${y + 5}`,
    w: 1.6,
  });
};

// ── Body, end cheeks and plates ───────────────────────────────────────────
decor.push({ t: 'rect', x: 0, y: 0, w: 1750, h: 625, fill: BODY, hw: true });
decor.push({ t: 'rect', x: 76, y: 28, w: 1608, h: 586, r: 4, fill: '#a3a5a1', hw: true });
// The ribbed end cheeks ("tank tracks"): a black rail of square tread blocks, eleven a side.
[
  [6, 72],
  [1686, 1748],
].forEach(([x0, x1]) => {
  decor.push({ t: 'rect', x: x0, y: 16, w: x1 - x0, h: 609, r: 6, fill: '#101112', hw: true });
  for (let i = 0; i < 11; i++) {
    const y = 20 + i * 55;
    decor.push({ t: 'rect', x: x0 + 4, y, w: x1 - x0 - 8, h: 50, r: 3, fill: '#26282b', hw: true });
    decor.push({
      t: 'line',
      x1: x0 + 6,
      y1: y + 47,
      x2: x1 - 6,
      y2: y + 47,
      w: 2,
      stroke: '#0b0b0c',
      hw: true,
    });
  }
});
plate(82, 44, 361, 205);
plate(82, 213, 361, 607);
plate(368, 38, 951, 133);
plate(368, 143, 651, 434);
plate(658, 143, 951, 434);
plate(368, 441, 951, 607);
plate(960, 36, 1334, 607);
plate(1342, 36, 1592, 607);
plate(1599, 36, 1680, 607, '#222326');

// ── The name plate ────────────────────────────────────────────────────────
text(612, 86, 'ПОЛИВОКС', 58, { weight: 700, spacing: '0.06em', brand: true });
// Formanta's emblem: a ring round two linked hooks
decor.push({ t: 'circle', x: 897, y: 85, r: 31, fill: 'none', stroke: INK, sw: 5, brand: true });
decor.push({
  t: 'path',
  d: 'M884 70 C 900 60 914 74 902 86 C 892 96 880 92 884 102 M910 100 C 894 110 880 96 892 84',
  w: 5,
  stroke: INK,
  fill: 'none',
  brand: true,
});

// ── Modulator ─────────────────────────────────────────────────────────────
text(221, 60, 'МОДУЛЯТОР', 14);
knob('lfo.rate', 150, 135, 'ЧАСТОТА', 190, ['МИН.', '1', '2', '', '4', '5', 'МАКС.'], {
  def: 3,
  module: 'lfo',
  name: 'Modulator rate',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the modulator, from a slow sweep every ten seconds or so to a fast flutter. The lamp above the knob flashes at this rate.',
});
decor.push({ t: 'led', x: 140, y: 88, r: 5, color: 'red', litWhen: 'lfo' });
rotary(
  'lfo.shape',
  288,
  128,
  'РЕЖИМ',
  190,
  [
    { v: 'triangle', label: 'Triangle', a: -100, mark: { glyph: 'tri' } },
    { v: 'square', label: 'Square', a: -45, mark: { glyph: 'sq' } },
    { v: 'noise', label: 'Noise', a: 45, mark: { glyph: 'noise' } },
    { v: 'stepped', label: 'Stepped (sample and hold)', a: 100, mark: { glyph: 'pulse' } },
  ],
  'triangle',
  {
    module: 'lfo',
    name: 'Modulator shape',
    help: 'The modulator’s waveform. Triangle sweeps smoothly up and down; square jumps between two values (a trill); noise is random and chaotic; stepped holds a new random value on each beat of the rate, the classic computer burble.',
  }
);

// ── Tuning, glide, voices and output (left) ───────────────────────────────
knob('out.phones', 144, 264, 'ТЛФ.', 320, N06, {
  def: 3,
  module: 'out',
  name: 'Headphone level',
  fmt: pct,
  help: 'On the hardware, the level at the headphone socket (ТЛФ. is short for телефон, headphones). The app has one output, so here it does nothing.',
});
knob('gen.tune', 281, 264, 'НАСТРОЙКА', 320, PM, {
  bipolar: true,
  module: 'osc',
  name: 'Tune',
  fmt: (v) => fmtSemi(tuneSemi(v)),
  help: 'Tunes both generators together, about a tone either way.',
});
knob('gen1.glide', 142, 397, 'ГЛИССАНДО', 455, MINMAX, {
  module: 'glide',
  name: 'Glissando',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideT(v))),
  help: 'Glide: Generator I slides from one note to the next instead of jumping. Further right is a slower slide. Generator II always jumps.',
});
paddle('kbd.voices', 282, 397, {
  kind: 'enum',
  options: [
    { v: '1', label: '1 voice' },
    { v: '2', label: '2 voices' },
  ],
  def: '1',
  module: 'mode',
  label: 'Voices',
  name: 'Voices',
  help: '1-ГОЛ. (one voice): both generators play the one key. 2-ГОЛ. (two voices): hold two keys and Generator I plays the higher, Generator II the lower, through the one filter and amplifier.',
});
text(282, 352, '1-ГОЛ.', 12);
text(282, 445, '2-ГОЛ.', 12);
knob('out.level', 139, 535, 'ГРОМКОСТЬ', 593, N06, {
  def: 4,
  module: 'out',
  name: 'Volume',
  fmt: pct,
  help: 'The synth’s output level.',
});
paddle('out.enable', 276, 532, {
  kind: 'bool',
  def: true,
  module: 'out',
  label: 'Output',
  name: 'Output',
  help: 'Switches the output on (up) or off (down). Off, the synth is silent whatever the knobs say.',
});
text(277, 593, 'ВЫХОД', 13);

// ── Generators ────────────────────────────────────────────────────────────
const RANGES = (): (ControlOption & { mark: string })[] => [
  { v: "32'", label: "32'", a: -100, mark: "32'" },
  { v: "16'", label: "16'", a: -50, mark: "16'" },
  { v: "8'", label: "8'", a: 0, mark: "8'" },
  { v: "4'", label: "4'", a: 50, mark: "4'" },
  { v: "2'", label: "2'", a: 100, mark: "2'" },
];
const SHAPES = (): (ControlOption & { mark: { glyph: WaveShape } })[] => [
  { v: 'triangle', label: 'Triangle', a: -100, mark: { glyph: 'tri' } },
  { v: 'sawtooth', label: 'Sawtooth', a: -50, mark: { glyph: 'saw' } },
  { v: 'square', label: 'Square', a: 0, mark: { glyph: 'sq' } },
  { v: 'pulse_1', label: 'Pulse 1', a: 50, mark: { glyph: 'pulse' } },
  { v: 'pulse_2', label: 'Pulse 2', a: 100, mark: { glyph: 'npulse' } },
];
const SHAPE_HELP =
  'Triangle is soft and flute-like; sawtooth bright and brassy; square hollow, like a clarinet; the two pulses thinner and more nasal.';
([1, 2] as const).forEach((g) => {
  const x0 = g === 1 ? 430 : 731;
  const x1 = g === 1 ? 580 : 880;
  const roman = g === 1 ? 'I' : 'II';
  text(g === 1 ? 506 : 806, 157, `ГЕНЕРАТОР ${roman}`, 14);
  rotary(`gen${g}.range`, x0, 226, 'ДИАПАЗОН', 289, RANGES(), "8'", {
    module: 'osc',
    name: `Generator ${roman} range`,
    help: `Generator ${roman}’s octave, in organ feet: 32′ is the lowest, 2′ the highest, each step an octave.`,
  });
  rotary(`gen${g}.shape`, x1, 226, 'ФОРМА', 289, SHAPES(), g === 1 ? 'sawtooth' : 'square', {
    module: 'osc',
    name: `Generator ${roman} waveform`,
    help: `Generator ${roman}’s waveform. ${SHAPE_HELP}`,
  });
  knob(`gen${g}.mod`, x0, 359, 'МОДУЛЯЦИЯ', 418, N06, {
    module: 'mod',
    name: `Generator ${roman} modulation`,
    fmt: pct,
    help: `How far the modulator moves Generator ${roman}’s pitch: a touch is vibrato, more a siren or a trill.`,
  });
});
knob('gen1.fm', 580, 359, 'ГЕНЕРАТОР II', 418, N06, {
  module: 'mod',
  name: 'Generator II to Generator I (FM)',
  fmt: pct,
  help: 'Frequency modulation: Generator II wobbles Generator I’s pitch. Slow (Generator II in a low range) it is a vibrato or a warble; at audio rate it turns metallic, clangorous and harsh.',
});
knob('gen2.detune', 880, 359, 'РАССТРОЙКА', 418, PM, {
  bipolar: true,
  module: 'osc',
  name: 'Generator II detune',
  fmt: (v) => fmtSemi(detuneSemi(v)),
  help: 'Tunes Generator II against Generator I, about two tones either way. A little makes the two beat and sound fat; more gives an interval.',
});

// ── Mixer ─────────────────────────────────────────────────────────────────
text(653, 456, 'МИКШЕР', 14);
(
  [
    [
      'mixer.gen1',
      430,
      'ГЕНЕРАТОР I',
      'Generator I level',
      4,
      'Level of Generator I into the filter.',
    ],
    [
      'mixer.gen2',
      577,
      'ГЕНЕРАТОР II',
      'Generator II level',
      0,
      'Level of Generator II into the filter. Leave it down when Generator II is only modulating Generator I.',
    ],
    [
      'mixer.noise',
      727,
      'ШУМ',
      'Noise level',
      0,
      'Level of white noise into the filter: wind, surf, steam.',
    ],
    [
      'mixer.ext',
      878,
      'ВНЕШ.',
      'External level',
      0,
      'On the hardware, the level of an external sound (a guitar, an organ) from the rear-panel input. The app has nothing plugged into it.',
    ],
  ] as const
).forEach(([id, x, printed, name, def, help]) =>
  knob(id, x, 530, printed, 590, N06, { def, module: 'mixer', name, fmt: pct, help })
);

// ── Filter ────────────────────────────────────────────────────────────────
text(1140, 74, 'ФИЛЬТР', 14);
const ENV_MODE = [
  { v: 'single', label: 'Single' },
  { v: 'repeat', label: 'Repeat' },
];
const envModeHelp = (what: string): string =>
  `How the ${what} envelope runs. Up (single): once for each key, holding at the pedestal. Down (repeat, накат): over and over while the key is held, rising at the attack rate and falling at the decay rate.`;
text(1189, 99, 'РЕЖИМ', 12);
text(1189, 121, 'ГЕНЕРАТОРА', 12);
text(1189, 144, 'ОГИБАЮЩЕЙ', 12);
paddle('fenv.mode', 1277, 120, {
  kind: 'enum',
  options: ENV_MODE,
  def: 'single',
  module: 'env',
  label: 'Filter envelope mode',
  name: 'Filter envelope mode',
  help: envModeHelp('filter'),
});
glyph(1276, 74, 'adsr', 13);
repeatMark(1276, 172);
knob('fenv.attack', 1020, 122, 'АТАКА', 180, MINMAX, {
  module: 'env',
  name: 'Filter attack',
  fmt: (v) => fmtTime(attackT(v)),
  help: 'How long the filter envelope takes to rise when a key goes down.',
});
knob('fenv.decay', 1020, 257, 'ЗАТУХАНИЕ', 315, MINMAX, {
  def: 3,
  module: 'env',
  name: 'Filter decay',
  fmt: (v) => fmtTime(decayT(v)),
  help: 'How long the filter envelope takes to fall from its peak to the pedestal.',
});
knob('fenv.pedestal', 1146, 257, 'ПЬЕДЕСТАЛ', 315, N06, {
  module: 'env',
  name: 'Filter pedestal (sustain)',
  fmt: pct,
  help: 'The level the filter envelope holds at while the key is held: its sustain, called the pedestal on the panel. Fully right, the decay does nothing.',
});
knob('fenv.release', 1275, 257, 'ПОСЛЕЗВУЧ.', 315, MINMAX, {
  module: 'env',
  name: 'Filter after-sound (release)',
  fmt: (v) => fmtTime(releaseT(v)),
  help: 'How long the filter envelope takes to fall back after the key is let go: its release, called the after-sound on the panel.',
});
knob('vcf.cutoff', 1020, 395, 'ЧАСТОТА СРЕЗА', 452, MINMAX, {
  def: 3,
  module: 'filter',
  name: 'Cutoff',
  fmt: (v) => fmtHz(cutHz(v)),
  help: 'The filter’s cutoff, 100 Hz to 10 kHz: lower is darker. Fully left, nothing gets through.',
});
knob('vcf.resonance', 1146, 395, 'РЕЗОНАНС', 452, MINMAX, {
  module: 'filter',
  name: 'Resonance',
  fmt: pct,
  help: 'Emphasis at the cutoff. Turned up, the filter rings, then screams and whistles on its own; the Polivoks’s filter turns harsh and gritty on the way.',
});
paddle('vcf.mode', 1277, 395, {
  kind: 'enum',
  options: [
    { v: 'band_pass', label: 'Band-pass' },
    { v: 'low_pass', label: 'Low-pass' },
  ],
  def: 'low_pass',
  module: 'filter',
  label: 'Filter mode',
  name: 'Filter mode',
  help: 'ФНЧ (down): low-pass, 12 dB, which takes away the highs above the cutoff. ПФ (up): band-pass, 6 dB, which keeps only a band round the cutoff, thin and vocal.',
});
text(1279, 350, 'ПФ', 12);
text(1279, 452, 'ФНЧ', 12);
knob('vcf.mod', 1020, 530, 'МОДУЛЯЦИЯ', 580, N06, {
  module: 'mod',
  name: 'Filter modulation',
  fmt: pct,
  help: 'How far the modulator moves the cutoff: a wah, a wobble, or random steps of tone.',
});
knob('vcf.env', 1146, 530, 'ОГИБАЮЩАЯ', 580, N06, {
  def: 3,
  module: 'filter',
  name: 'Filter envelope depth',
  fmt: pct,
  help: 'How far the filter envelope opens the cutoff on each note, above where ЧАСТОТА СРЕЗА sets it.',
});
// The response drawing: low-pass and band-pass on one pair of axes
decor.push({
  t: 'path',
  d: 'M1231 566 L1231 492 M1226 499 L1231 490 L1236 499 M1231 566 L1328 566 M1321 561 L1330 566 L1321 571 M1231 518 L1272 518 L1290 494 L1312 566 M1262 566 L1290 494',
  w: 1.5,
});
text(1250, 508, 'ФНЧ', 9);
text(1294, 554, 'ПФ', 9);

// ── Amplifier ─────────────────────────────────────────────────────────────
text(1465, 44, 'УСИЛИТЕЛЬ', 14);
knob('aenv.attack', 1408, 116, 'АТАКА', 173, MINMAX, {
  module: 'env',
  name: 'Amplifier attack',
  fmt: (v) => fmtTime(attackT(v)),
  help: 'How long the sound takes to rise to full loudness when a key goes down.',
});
knob('aenv.decay', 1533, 116, 'ЗАТУХАНИЕ', 173, MINMAX, {
  module: 'env',
  name: 'Amplifier decay',
  fmt: (v) => fmtTime(decayT(v)),
  help: 'How long the loudness takes to fall from its peak to the pedestal.',
});
knob('aenv.pedestal', 1408, 252, 'ПЬЕДЕСТАЛ', 312, N06, {
  def: 6,
  module: 'env',
  name: 'Amplifier pedestal (sustain)',
  fmt: pct,
  help: 'The loudness held while the key is down: its sustain, called the pedestal on the panel. Fully right, the decay does nothing.',
});
knob('aenv.release', 1533, 252, 'ПОСЛЕЗВУЧ.', 312, MINMAX, {
  def: 1,
  module: 'env',
  name: 'Amplifier after-sound (release)',
  fmt: (v) => fmtTime(releaseT(v)),
  help: 'How long the sound takes to die away after the key is let go: its release, called the after-sound on the panel.',
});
text(1445, 360, 'РЕЖИМ', 12);
text(1445, 390, 'ГЕНЕРАТОРА', 12);
text(1445, 420, 'ОГИБАЮЩЕЙ', 12);
paddle('aenv.mode', 1540, 394, {
  kind: 'enum',
  options: ENV_MODE,
  def: 'single',
  module: 'env',
  label: 'Amplifier envelope mode',
  name: 'Amplifier envelope mode',
  help: envModeHelp('amplifier'),
});
glyph(1536, 348, 'adsr', 13);
repeatMark(1536, 440);
knob('vca.mod', 1408, 527, 'МОДУЛЯЦИЯ', 592, N06, {
  module: 'mod',
  name: 'Amplifier modulation',
  fmt: pct,
  help: 'How far the modulator moves the loudness: tremolo, or with the square a chopped, gated sound.',
});
paddle('kbd.keyMemory', 1540, 532, {
  kind: 'enum',
  options: [
    { v: 'off', label: 'Off' },
    { v: 'hold', label: 'Hold last key' },
  ],
  def: 'off',
  module: 'mode',
  label: 'Key memory',
  name: 'Key memory',
  help: 'On the hardware, the key memory (ВКЛ., on): in the back position the generators keep the pitch of the last key pressed while the envelopes go on working. The app does not model the difference: its generators keep the last pitch anyway.',
});
text(1542, 592, 'ВКЛ.', 13);

// ── Power ─────────────────────────────────────────────────────────────────
decor.push({ t: 'led', x: 1647, y: 458, r: 5, color: 'red', litWhen: 'power' });
decor.push({
  t: 'rect',
  x: 1634,
  y: 506,
  w: 36,
  h: 52,
  r: 3,
  fill: '#c8202a',
  stroke: '#7a1016',
  sw: 1.5,
});
text(1650, 583, 'СЕТЬ', 13);

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'modulator',
    label: 'Modulator (МОДУЛЯТОР)',
    module: 'lfo',
    keywords:
      'lfo modulator rate speed shape triangle square noise random sample hold stepped vibrato',
    rects: [R(82, 44, 361, 205)],
    help: 'The one modulator: ЧАСТОТА sets its speed and РЕЖИМ its shape (triangle, square, noise or stepped). Its own depth knob in each section sends it to Generator I, Generator II, the filter and the amplifier.',
  },
  {
    id: 'keys',
    label: 'Tuning, glide and voices',
    module: 'glide',
    keywords: 'tune tuning glide glissando portamento duophonic mono voices',
    rects: [R(212, 213, 361, 470), R(82, 300, 212, 470)],
    help: 'НАСТРОЙКА tunes both generators, ГЛИССАНДО glides Generator I between notes, and the switch picks one voice (both generators on one key) or two (the top key on Generator I, the bottom on Generator II).',
  },
  {
    id: 'output',
    label: 'Output',
    module: 'out',
    keywords: 'volume output level headphones phones',
    rects: [R(82, 213, 212, 300), R(82, 470, 361, 607)],
    help: 'ГРОМКОСТЬ is the output level and ВЫХОД switches the output on or off. ТЛФ. sets the headphone level on the hardware.',
  },
  {
    id: 'gen1',
    label: 'Generator I (ГЕНЕРАТОР I)',
    module: 'osc',
    keywords:
      'oscillator vco generator range octave feet waveform shape fm frequency modulation top key glide',
    rects: [R(368, 143, 651, 434)],
    help: 'The first oscillator, on the top key when two are held: its range in organ feet, its waveform, how far the modulator moves its pitch, and how far Generator II frequency-modulates it.',
  },
  {
    id: 'gen2',
    label: 'Generator II (ГЕНЕРАТОР II)',
    module: 'osc',
    keywords: 'oscillator vco generator range octave feet waveform shape detune bottom key',
    rects: [R(658, 143, 951, 434)],
    help: 'The second oscillator, on the bottom key when two are held: its range, its waveform, how far the modulator moves its pitch, and its detune against Generator I.',
  },
  {
    id: 'mixer',
    label: 'Mixer (МИКШЕР)',
    module: 'mixer',
    keywords: 'mixer level generator noise external input',
    rects: [R(368, 441, 951, 607)],
    help: 'The levels into the filter: Generator I, Generator II, white noise (ШУМ) and an external sound (ВНЕШ.).',
  },
  {
    id: 'fenv',
    label: 'Filter envelope',
    module: 'env',
    keywords: 'envelope attack decay pedestal sustain after-sound release repeat filter',
    rects: [R(960, 36, 1334, 330)],
    help: 'The filter’s own envelope: attack, decay, pedestal (sustain) and after-sound (release), once per key or repeating while it is held. ОГИБАЮЩАЯ below sets how far it opens the filter.',
  },
  {
    id: 'filter',
    label: 'Filter (ФИЛЬТР)',
    module: 'filter',
    keywords: 'filter cutoff resonance low-pass band-pass harsh scream modulation envelope',
    rects: [R(960, 330, 1334, 607)],
    help: 'Low-pass or band-pass. ЧАСТОТА СРЕЗА is the cutoff and РЕЗОНАНС the emphasis, harsh and screaming when turned up. МОДУЛЯЦИЯ is the modulator’s depth on it and ОГИБАЮЩАЯ the envelope’s.',
  },
  {
    id: 'aenv',
    label: 'Amplifier envelope',
    module: 'env',
    keywords:
      'envelope attack decay pedestal sustain after-sound release repeat loudness amplifier',
    rects: [R(1342, 36, 1592, 470)],
    help: 'The loudness envelope: attack, decay, pedestal (sustain) and after-sound (release), once per key or repeating while it is held.',
  },
  {
    id: 'amp',
    label: 'Amplifier (УСИЛИТЕЛЬ)',
    module: 'amp',
    keywords: 'amplifier vca tremolo modulation key memory',
    rects: [R(1342, 470, 1592, 607)],
    help: 'МОДУЛЯЦИЯ is the modulator’s depth on the loudness (tremolo). ВКЛ. is the key memory switch.',
  },
  {
    id: 'power',
    label: 'Power (СЕТЬ)',
    module: 'util',
    keywords: 'power mains switch lamp',
    rects: [R(1599, 36, 1680, 607)],
    help: 'The mains button and its lamp. The app is always on.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const SHAPE_MIX = (s: string): OscParams['mix'] =>
  s === 'triangle' ? { tri: 1 } : s === 'sawtooth' ? { saw: 1 } : { pulse: 1 };
const gen = (v: ControlValues, g: 1 | 2): Pick<OscParams, 'mix' | 'pw'> => {
  const s = String(v[`gen${g}.shape`]);
  return { mix: SHAPE_MIX(s), pw: SHAPE_PW[s] ?? 0.5 };
};

function toEngine(v: ControlValues): EngineParams {
  const routes: EngineRoute[] = [];
  const add = (src: string, dst: string, amt: number, by?: string): void => {
    if (amt) routes.push(by ? { src, dst, amt, by } : { src, dst, amt });
  };
  const shape = String(v['lfo.shape']);
  // the noise position modulates from the noise generator itself; the others are the modulator's own waves
  const mod = shape === 'noise' ? 'noise' : 'lfo';
  const tune = tuneSemi(num(v, 'gen.tune'));
  // Generator I follows the top key through the slew limiter, which is the glissando (Generator II never glides)
  add('kbd2', 'slewIn', 1);
  add('slew', 'pitch1', 12);
  add(mod, 'pitch1', depth(num(v, 'gen1.mod'), 24));
  add(mod, 'pitch2', depth(num(v, 'gen2.mod'), 24));
  add('osc2', 'pitch1', depth(num(v, 'gen1.fm'), 24));
  add(mod, 'cutoff', depth(num(v, 'vcf.mod'), 4));
  add(mod, 'amp', 0.6 * u(num(v, 'vca.mod')), 'env2');
  const res = num(v, 'vcf.resonance');
  const loop = (id: string): boolean => v[id] === 'repeat';
  return {
    osc: [
      {
        level: level(num(v, 'mixer.gen1'), 0.8),
        ...gen(v, 1),
        semi: RANGE_SEMI[String(v['gen1.range'])] + tune,
        kbd: false,
        fixedNote: 60,
        syncTo: -1,
      },
      {
        level: level(num(v, 'mixer.gen2'), 0.8),
        ...gen(v, 2),
        semi: RANGE_SEMI[String(v['gen2.range'])] + detuneSemi(num(v, 'gen2.detune')),
        kbd: true,
        fixedNote: 60,
        syncTo: -1,
      },
    ],
    duo: v['kbd.voices'] === '2',
    noise: { level: level(num(v, 'mixer.noise'), 0.6), color: 'white' },
    ext: { level: level(num(v, 'mixer.ext'), 1) },
    filter: {
      type: 'svf',
      mode: v['vcf.mode'] === 'band_pass' ? 'bp' : 'lp',
      cutoff: cutHz(num(v, 'vcf.cutoff')),
      res: u(res) * 1.05,
      envAmt: u(num(v, 'vcf.env')) * 5,
      envSrc: 'env1',
      kbd: 0,
    },
    env1: {
      a: attackT(num(v, 'fenv.attack')),
      d: decayT(num(v, 'fenv.decay')),
      s: u(num(v, 'fenv.pedestal')),
      r: releaseT(num(v, 'fenv.release')),
      ...(loop('fenv.mode') ? { loop: true } : null),
    },
    env2: {
      a: attackT(num(v, 'aenv.attack')),
      d: decayT(num(v, 'aenv.decay')),
      s: u(num(v, 'aenv.pedestal')),
      r: releaseT(num(v, 'aenv.release')),
      ...(loop('aenv.mode') ? { loop: true } : null),
    },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: lfoHz(num(v, 'lfo.rate')), mix: LFO_MIX[shape] ?? { tri: 1 }, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: false, drone: false, repeat: false },
    routes,
    // the harsh edge at high resonance: overdrive after the filter, harder as РЕЗОНАНС rises
    od:
      res > 0
        ? { on: true, drive: 0.6 * Math.pow(u(res), 2), tone: 0.55, level: 1 }
        : { on: false },
    delay: { on: false },
    slew: { time: glideT(num(v, 'gen1.glide')) },
    tune,
    volume: v['out.enable'] ? level(num(v, 'out.level'), 1) : 0,
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

/**
 * The panel's Russian, in English: the English patch-card drawing's words where they fit (PHONES, SUSTAIN, RELEASE),
 * the literal sense elsewhere. A key is a whole printed string, so a word printed in two places reads the same in both.
 */
const english: Record<string, string> = {
  ПОЛИВОКС: 'POLIVOKS',
  МОДУЛЯТОР: 'MODULATOR',
  ЧАСТОТА: 'RATE',
  РЕЖИМ: 'MODE',
  'ТЛФ.': 'PHONES',
  НАСТРОЙКА: 'TUNE',
  ГЛИССАНДО: 'GLISSANDO',
  '1-ГОЛ.': '1 VOICE',
  '2-ГОЛ.': '2 VOICES',
  ГРОМКОСТЬ: 'VOLUME',
  ВЫХОД: 'OUTPUT',
  'ГЕНЕРАТОР I': 'GENERATOR I',
  'ГЕНЕРАТОР II': 'GENERATOR II',
  ДИАПАЗОН: 'RANGE',
  ФОРМА: 'WAVEFORM',
  МОДУЛЯЦИЯ: 'MODULATION',
  РАССТРОЙКА: 'DETUNE',
  МИКШЕР: 'MIXER',
  ШУМ: 'NOISE',
  'ВНЕШ.': 'EXT.',
  ФИЛЬТР: 'FILTER',
  АТАКА: 'ATTACK',
  ЗАТУХАНИЕ: 'DECAY',
  ПЬЕДЕСТАЛ: 'SUSTAIN',
  'ПОСЛЕЗВУЧ.': 'RELEASE',
  'ЧАСТОТА СРЕЗА': 'CUTOFF',
  РЕЗОНАНС: 'RESONANCE',
  ПФ: 'BPF',
  ФНЧ: 'LPF',
  ОГИБАЮЩАЯ: 'ENVELOPE',
  УСИЛИТЕЛЬ: 'AMPLIFIER',
  // РЕЖИМ / ГЕНЕРАТОРА / ОГИБАЮЩЕЙ, printed a word a line, is "mode of the envelope generator"
  ГЕНЕРАТОРА: 'ENVELOPE',
  ОГИБАЮЩЕЙ: 'GENERATOR',
  'ВКЛ.': 'HOLD',
  СЕТЬ: 'POWER',
  'МИН.': 'MIN',
  'МАКС.': 'MAX',
};

const polivoks: SynthDef & { version: number } = {
  id: 'polivoks',
  version: 1,
  name: 'Polivoks',
  maker: 'Formanta',
  year: 1982,
  heritage:
    'Designed by Vladimir Kuzmin and built by the Formanta radio factory, sold only in the USSR',
  summary:
    'A Soviet duophonic synth: two generators with five waveforms and five octave ranges, Generator II able to frequency-modulate Generator I, and noise, into a low-pass or band-pass filter famous for its harsh, screaming resonance. Hold two keys and Generator I plays the higher, Generator II the lower. The filter and the amplifier each have an envelope that can repeat, and one modulator reaches both generators, the filter and the amplifier.',
  view: { w: 1750, h: 625 },
  theme: { panel: PLATE, panel2: '#222326', ink: INK, font: 'din', weight: 600, cheeks: 'none' },
  signalNames: {
    lfo: 'the modulator',
    noise: 'the noise generator',
    osc1: 'Generator I',
    osc2: 'Generator II',
    env1: 'the filter envelope',
    env2: 'the amplifier envelope',
    kbd2: 'the top key',
    slew: 'the glissando',
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  // Init is already Generator I's sawtooth alone at 8′ into a gated amplifier. The Default patch opens the filter, takes
  // its envelope off, and gives the loudness a short release.
  defaultPatch: {
    values: {
      'vcf.cutoff': 6,
      'vcf.env': 0,
      'fenv.decay': 0,
    },
  },
  translation: { language: 'Russian', english },
  toEngine,
};

export default polivoks;
