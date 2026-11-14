/**
 * Moog Sub 37 Tribute Edition: the definition (D1). Positions are measured on the owner's 2048 × 1119 photo of the
 * keyboard (`.context/app/synth-data/sub-37/raw/Moog Sub 37.jpg`, local only) and written in photo pixels, turned
 * into view units by P() / Q(): view x = (photo x − 105) × 2 + the cheek, view y = (photo y − 100) × 2. The photo is
 * taken a little from the left, so its right half leans; the drawing squares it up, putting the controls of a row on
 * one line and each envelope's knobs and buttons in the same columns. The view is the faceplate from the PROGRAMMING
 * section to OUTPUT and down to the PRESET row: the keys and the PITCH and MODULATION wheels below it are left out, as
 * the app's keyboard plays the synth and its wheel is the mod wheel. The owner's spec is
 * `.context/app/synth-data/sub-37/sub-37.synth.json` (the Sub 37 Owner's Manual, 2015).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), from `defs/model-d.ts` (a Moog ladder
 * mono with the mixer feedback channel) and `defs/minilogue-xd.ts` (lit buttons, a display with menu pages, and the
 * step buttons for the app's sequencer). No content (sounds, lineage, unusual notes), a `version`, the maker's marks
 * tagged `brand` (the Moog logo, the SUB 37 badge with its Bob Moog TRIBUTE signature, and the printed "PARAPHONIC
 * ANALOG SYNTHESIZER / Designed & Handcrafted By Moog Music In Asheville, NC"), and panel values read through `num()`.
 *
 * The voice: two oscillators of continuously variable shape (`morph`), a square sub oscillator an octave below
 * Oscillator 1 (the engine's third oscillator, a square tuned under Oscillator 1), pink noise and the FDBK/EXT IN
 * channel → the mixer → the 20 Hz–20 kHz ladder at 6, 12, 18 or 24 dB/oct (`filter.poles`, t-252) → MultiDrive (the
 * engine's post-filter overdrive) → the VCA. Two DAHDSR envelopes with the full-stage LOOP (`env.loopAll`, t-252). Two
 * mod buses, each an LFO (or the filter EG, or a programmable source) to pitch, cutoff and one switched destination,
 * with LFO 1's and LFO 2's rates, the noise level and the envelope time reached through t-252's `lfo2Rate`,
 * `noiseLvl` and `env1Rate`. DUO MODE is the engine's `duo` keyboard: Osc 1 the lowest key, Osc 2 the highest (KB
 * CTRL HI) or the other way round (LO), or droning (OFF). The voice runs as a one-voice `poly` synth so the engine's
 * arpeggiator can play it, as the Grandmother does.
 *
 * Panel modes: KNOB SHIFT turns the eight envelope knobs into DELAY, HOLD, VEL AMT and KB TRACK, so each knob place
 * holds two controls, one shown with KNOB SHIFT off and one with it on. The menus are pages on the display, stepped by
 * CURSOR (`ui.page`), as the minilogue xd's EDIT MODE steps its own: each mod bus's depth controllers and its
 * programmable source and destination, and the PRESET EDIT settings the app models. The PRESET buttons are the steps
 * of the app's sequencer.
 *
 * The manual gives no curves for the envelopes or LFOs (`not_in_source`) and no depth at full for the mod buses'
 * amounts: the envelope and LFO ranges are the manual's, their curves the app's estimate; each mod bus depth at full
 * is a reasoned figure, said so where it is defined.
 */
import type {
  Area,
  ButtonControl,
  Control,
  ControlOption,
  ControlValues,
  Decor,
  EngineContext,
  EngineDest,
  EngineParams,
  EngineRoute,
  EngineSignal,
  Jack,
  KnobControl,
  KnobScale,
  LfoMix,
  LitWhen,
  MenuControl,
  OscParams,
  SeqButton,
  ShowCondition,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import {
  type CurvePoint,
  clamp,
  expMap,
  fmtHz,
  fmtTime,
  level10,
  pwl,
} from '@/lib/app/synths/lib/maps';

type KnobRest = OmitEach<KnobControl, 'id' | 'type' | 'x' | 'y' | 'r' | 'style' | 'labelPos'>;
type ButtonRest = Pick<ButtonControl, 'label' | 'help'> &
  Partial<Pick<ButtonControl, 'name' | 'ui' | 'module' | 'lamp' | 'show' | 'lit'>> &
  ({ kind?: 'bool'; def?: boolean } | { kind: 'enum'; options: ControlOption[]; def: string });
type MenuRest = OmitEach<
  MenuControl,
  'id' | 'type' | 'x' | 'y' | 'w' | 'h' | 'size' | 'vw' | 'show' | 'label'
>;
type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'spacing' | 'brand' | 'anchor'>>;

/** The wooden end cheeks, in view units. */
const CHEEK = 44;
const P = (x: number): number => (x - 105) * 2 + CHEEK;
const Q = (y: number): number => (y - 100) * 2;
const INK = '#e6e6e2';
const LAMP = 'amber';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The envelope stages run 1 ms to 10 s and DELAY and HOLD 0 to 10 s (the manual); the curve between is the app's
// estimate, exponential, as the panel's M-SEC and 10 SEC ends suggest.
const envTime = (v: number): number => expMap(v / 10, 0.001, 10);
const dhTime = (v: number): number => (v <= 0 ? 0 : expMap(v / 10, 0.001, 10));
/** The cutoff, 20 Hz to 20 kHz: exponential, which puts the panel's 80 Hz, 320 Hz, 1.2 kHz and 5 kHz at 2, 4, 6 and 8. */
const cutoffHz = (v: number): number => expMap(v / 10, 20, 20000);
/** An LFO's rate, 0.1 to 100 Hz (the manual): exponential, which puts the panel's doublings a step apart. */
const lfoHz = (v: number): number => expMap(v / 10, 0.1, 100);
/** The arpeggiator's RATE, 2 to 280 BPM, through the tempos the panel prints round the knob. */
const ARP_PTS: CurvePoint[] = [
  [0, 2],
  [1.67, 30],
  [3.17, 60],
  [4.83, 120],
  [6, 150],
  [7, 180],
  [8.17, 220],
  [10, 280],
];
const arpBpm = (v: number): number => pwl(v, ARP_PTS, true);
/** GLIDE TIME: up to 5 s, squared so the low end is fine (the manual gives no range; reasoned). */
const glideTime = (v: number): number => 5 * Math.pow(v / 10, 2);
/** BEAT FREQ in hertz, as semitones at middle C: the engine detunes by a ratio, not by a fixed number of hertz. */
const beatSemi = (hz: number): number => 12 * Math.log2(1 + hz / 261.63);
/** A bipolar ±5 knob as −1..1, squared with its sign kept, so the middle of its travel is fine. */
const signedSq = (v: number): number => Math.sign(v) * Math.pow(v / 5, 2);

/** Each mixer channel's level at 10. Past 5 a channel also drives the filter's input harder (`OVER`). */
const MIX_MAX = 1.2;
/** How much harder the ladder's input is driven per channel, from 5 to 10 on its level. */
const OVER = 0.9;
/** The feedback channel's gain round the mixer at 10: kept under 1 so the loop settles (reasoned). */
const FB_MAX = 0.7;
/** Filter EG AMOUNT at ±5: octaves of cutoff (reasoned). */
const EG_OCT = 8;
// Each mod bus's depth at full on its knob (none is in the manual; reasoned, in the range of the other Moogs here).
/** PITCH AMT: semitones, squared. */
const MOD_PITCH_ST = 24;
/** FILTER AMT: octaves. */
const MOD_CUT_OCT = 5;
/** MOD AMT to the other LFO's rate: octaves. */
const MOD_RATE_OCT = 4;
/** MOD AMT to an oscillator's WAVE: the knob's whole travel is 1. */
const MOD_WAVE = 0.6;
/** MOD AMT to the noise level and to the oscillator levels. */
const MOD_LEVEL = 0.9;
/** MOD AMT to the envelopes' time: octaves of rate. */
const MOD_EGT_OCT = 3;
/** MOD AMT to the resonance. */
const MOD_RES = 0.6;

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const seqButtons: Record<string, SeqButton> = {};

// ── Drawing helpers ───────────────────────────────────────────────────────
const text = (x: number, y: number, t: string, size = 13, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: P(x),
    y: Q(y),
    text: t,
    size,
    anchor: 'middle',
    weight: 600,
    ...rest,
  });
};
/** Text centred on y (the renderer places text by its baseline). */
const label = (x: number, y: number, t: string, size = 13, rest: TextRest = {}): void =>
  text(x, y + size * 0.18, t, size, rest);
const line = (x1: number, y1: number, x2: number, y2: number, w = 2): void => {
  decor.push({ t: 'line', x1: P(x1), y1: Q(y1), x2: P(x2), y2: Q(y2), w });
};
const box = (x0: number, y0: number, x1: number, y1: number): void => {
  decor.push({
    t: 'frame',
    x: P(x0),
    y: Q(y0),
    w: (x1 - x0) * 2,
    h: (y1 - y0) * 2,
    r: 6,
    labelAt: 'none',
    sw: 1.6,
  });
};
const led = (x: number, y: number, litWhen?: LitWhen): void => {
  decor.push({ t: 'led', x: P(x), y: Q(y), r: 6, color: LAMP, ...(litWhen ? { litWhen } : {}) });
};
const wave = (x: number, y: number, shape: WaveShape, size = 11): void => {
  decor.push({ t: 'wave', x: P(x), y: Q(y), size, shape });
};

/** A knob of radius `r` photo pixels; `lab` is printed above it (null: none, or drawn separately). */
const knob = (
  id: string,
  x: number,
  y: number,
  r: number,
  lab: string | null,
  rest: KnobRest,
  labY = y - r - 22
): void => {
  controls.push({
    id,
    type: 'knob',
    x: P(x),
    y: Q(y),
    r: r * 2,
    style: 'd-silver',
    labelPos: 'none',
    ...rest,
  });
  if (lab) label(x, labY, lab, 14);
};
/** A rectangular push button, `w` × `h` view units. */
const btn = (id: string, x: number, y: number, rest: ButtonRest, w = 58, h = 30): void => {
  controls.push({
    id,
    type: 'button',
    x: P(x),
    y: Q(y),
    w,
    h,
    kind: 'bool',
    def: false,
    module: 'mode',
    labelPos: 'none',
    ...rest,
  });
};
/** A round lit button (the mixer's, ARP ON and GLIDE ON). */
const lamp = (id: string, x: number, y: number, rest: ButtonRest): void =>
  btn(id, x, y, { lamp: LAMP, ...rest }, 36, 36);
const NOT_HERE = 'Not modelled here.';

const S10: KnobScale = { nums: [0, 2, 4, 6, 8, 10], ticks: 11, size: 10 };
const PM5: KnobScale = {
  labels: [
    { at: -5, text: '-5' },
    { at: 0, text: '0' },
    { at: 5, text: '+5' },
  ],
  ticks: 11,
  size: 10,
};
const fmt10 = (v: number): string => v.toFixed(1);
const fmtPm = (v: number): string => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`;
const fmtPct = (v: number): string =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} %`;

// ── Faceplate artwork ─────────────────────────────────────────────────────
const SECTIONS: [number, number, string][] = [
  [105, 217, 'PROGRAMMING'],
  [217, 357, 'ARPEGGIATOR'],
  [357, 451, 'GLIDE'],
  [451, 662, 'MOD 1'],
  [662, 872, 'MOD 2'],
  [872, 1076, 'OSCILLATORS'],
  [1076, 1243, 'MIXER'],
  [1243, 1415, 'FILTER'],
  [1415, 1812, 'ENVELOPE GENERATORS'],
  [1812, 1898, 'OUTPUT'],
];
line(105, 103, 1898, 103, 3);
SECTIONS.forEach(([x0, x1, t]) => label((x0 + x1) / 2, 111, t, 12, { spacing: '0.08em' }));
SECTIONS.slice(1).forEach(([x]) => line(x, 104, x, x < 380 ? 440 : 492, 1.6));
line(105, 492, 1415, 492, 1.6);

// ── Programming ───────────────────────────────────────────────────────────
const LCD = { x0: 114, y0: 127, x1: 220, y1: 196 };
const PAGES: [string, string][] = [
  ['prog', 'PRESET'],
  ['m1d', 'MOD 1 DEPTH'],
  ['m1p', 'MOD 1 PGM'],
  ['m2d', 'MOD 2 DEPTH'],
  ['m2p', 'MOD 2 PGM'],
  ['edit', 'PRESET EDIT'],
];
decor.push({
  t: 'rect',
  x: P(LCD.x0 - 3),
  y: Q(LCD.y0 - 3),
  w: (LCD.x1 - LCD.x0 + 6) * 2,
  h: (LCD.y1 - LCD.y0 + 6) * 2,
  r: 4,
  fill: '#101112',
});
decor.push({
  t: 'lcd',
  x: P(LCD.x0),
  y: Q(LCD.y0),
  w: (LCD.x1 - LCD.x0) * 2,
  h: (LCD.y1 - LCD.y0) * 2,
  page: 'ui.page',
  titles: Object.fromEntries(PAGES),
  notes: { prog: 'CURSOR steps\nthrough the\nmenus. Click a\nvalue to set it.' },
  titleH: 26,
});
const rows: Record<string, number> = {};
const menu = (page: string, id: string, lab: string, rest: MenuRest): void => {
  const i = (rows[page] = (rows[page] || 0) + 1) - 1;
  controls.push({
    id,
    type: 'menu',
    x: P((LCD.x0 + LCD.x1) / 2),
    y: Q(LCD.y0) + 39 + i * 23,
    w: (LCD.x1 - LCD.x0) * 2 - 10,
    h: 22,
    size: 12,
    vw: 84,
    show: { id: 'ui.page', eq: page },
    label: lab,
    deep: true,
    ...rest,
  });
};
(
  [
    ['ui.down', 140, '▼', 'Steps down through the presets, or down a menu’s values. ' + NOT_HERE],
    ['ui.up', 172, '▲', 'Steps up through the presets, or up a menu’s values. ' + NOT_HERE],
  ] as const
).forEach(([id, x, lab, help]) =>
  btn(id, x, 219, { label: lab, name: lab === '▼' ? 'Down' : 'Up', ui: true, help })
);
btn('ui.page', 205, 219, {
  kind: 'enum',
  def: 'prog',
  options: PAGES.map(([v, t]) => ({ v, label: t })),
  lit: 'always',
  ui: true,
  label: 'CURSOR',
  help: 'On the hardware CURSOR moves along a menu on the display; the menus are opened by CONTROLLERS, EDIT, MIDI and GLOBAL. Here it steps through the pages the app models: each mod bus’s depth controllers and programmable source and destination, and PRESET EDIT.',
});
label(140, 241, '▼', 12);
label(172, 241, '▲', 12);
label(205, 241, 'CURSOR', 11);
(
  [
    [
      'ui.compare',
      152,
      267,
      'COMPARE',
      'Plays the stored preset, to hear it against the edited one. ' + NOT_HERE,
    ],
    [
      'ui.save',
      205,
      267,
      'SAVE',
      'Saves the panel as a preset, with its own sequence. Here the page’s Save keeps a sound. ' +
        NOT_HERE,
    ],
    [
      'ui.midi',
      152,
      315,
      'MIDI',
      'Opens the MIDI menu: channels, clock, the ports and local control. ' + NOT_HERE,
    ],
    [
      'ui.global',
      205,
      315,
      'GLOBAL',
      'Opens the GLOBAL menu: tuning, calibration, the CV inputs’ mapping and the poly chain. ' +
        NOT_HERE,
    ],
    [
      'ui.preset',
      159,
      367,
      'PRESET',
      'PRESET mode plays the stored sound until a knob moves; with EDIT (held) it opens PRESET EDIT. Here the presets are the library’s sounds, and CURSOR opens PRESET EDIT.',
    ],
    [
      'ui.panel',
      207,
      367,
      'PANEL',
      'PANEL mode plays the knobs as they are set; with INIT (held) it starts from a plain sound. Here the panel is always live.',
    ],
  ] as const
).forEach(([id, x, y, lab, help]) => {
  btn(id, x, y, { label: lab, ui: true, help, ...(id === 'ui.preset' ? { lamp: LAMP } : {}) });
  label(x, y + 22, lab, 11);
});
label(159, 349, 'EDIT', 9);
label(207, 349, 'INIT', 9);
knob('osc.fineTune', 167, 442, 20, 'FINE TUNE', {
  kind: 'cont',
  min: -100,
  max: 100,
  def: 0,
  step: 1,
  module: 'osc',
  label: 'FINE TUNE',
  scale: { ticks: 11, size: 10 },
  fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} cents`,
  help: 'Tunes both oscillators together, up to a semitone either way. On the hardware it also changes the value of a menu item.',
});

// ── Arpeggiator ───────────────────────────────────────────────────────────
knob('arp.rate', 250, 172, 22, null, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4.83,
  module: 'mode',
  label: 'RATE',
  name: 'ARP RATE',
  scale: {
    labels: [
      { at: 0, text: '2 BPM' },
      { at: 1.67, text: '30' },
      { at: 3.17, text: '60' },
      { at: 4.83, text: '120' },
      { at: 6, text: '150' },
      { at: 7, text: '180' },
      { at: 8.17, text: '220' },
      { at: 10, text: '280 BPM' },
    ],
    ticks: 0,
    size: 9,
  },
  fmt: (v) => `${Math.round(arpBpm(v))} BPM`,
  help: 'The tempo of the arpeggiator and the sequencer, 2 to 280 beats a minute. Each note is one ARP CLOCK DIV long (PRESET EDIT on the display), a sixteenth unless set otherwise.',
});
label(250, 126, 'RATE', 13);
led(287, 125);
btn('arp.sync', 336, 177, {
  label: 'SYNC',
  name: 'ARP SYNC',
  module: 'mode',
  lamp: LAMP,
  help:
    'Follows MIDI clock, so the arpeggio plays only while a clock arrives; held for a second it is TAP, which sets the tempo by tapping. Here the arpeggio runs at RATE. ' +
    NOT_HERE,
});
label(336, 158, 'TAP', 9);
label(336, 197, 'SYNC', 11);
const RANGE_X = [237, 265, 295, 322, 350];
const RANGES = ['-2', '-1', '0', '+1', '+2'];
controls.push({
  id: 'arp.range',
  type: 'select',
  x: P(295),
  y: Q(240),
  w: 14,
  h: 14,
  lamp: LAMP,
  kind: 'enum',
  def: '0',
  options: RANGES.map((v, i) => ({ v, label: v, x: P(RANGE_X[i]), y: Q(240) })),
  module: 'mode',
  label: 'RANGE',
  name: 'ARP RANGE',
  labelPos: 'none',
  help: 'How many octaves the arpeggio spans: up to two above the keys played, or down to two below; the lamps show which. On the hardware ◀ and ▶ step it, and further presses add a three-octave back-and-forth; here press a lamp.',
});
RANGES.forEach((t, i) => label(RANGE_X[i], 230, t, 10));
btn('ui.rangeDown', 267, 262, {
  label: '◀',
  name: 'RANGE ◀',
  ui: true,
  help: 'Steps the arpeggio’s RANGE down an octave. Here press one of the lamps above it.',
});
btn('ui.rangeUp', 327, 262, {
  label: '▶',
  name: 'RANGE ▶',
  ui: true,
  help: 'Steps the arpeggio’s RANGE up an octave. Here press one of the lamps above it.',
});
label(245, 262, '◀', 10);
label(349, 262, '▶', 10);
label(297, 283, 'RANGE', 12);
btn('arp.backForth', 272, 315, {
  label: 'BACK / FORTH',
  module: 'mode',
  lamp: LAMP,
  help: 'Makes the pattern run up and back down (or down and back up) instead of starting again from the beginning.',
});
btn('arp.invert', 327, 315, {
  label: 'INVERT',
  module: 'mode',
  lamp: LAMP,
  help: 'Plays each note in every octave of the range before moving to the next note. ' + NOT_HERE,
});
label(272, 336, 'BACK / FORTH', 11);
label(327, 336, 'INVERT', 11);
const PATTERNS: [string, string, number][] = [
  ['up', 'UP', -105],
  ['down', 'DWN', -65],
  ['order', 'ORDR', -22],
  ['random', 'RND', 22],
  ['seq', 'SEQ', 70],
  ['rec', 'REC', 110],
];
knob('arp.pattern', 287, 415, 14, null, {
  kind: 'enum',
  def: 'up',
  options: PATTERNS.map(([v, l, a]) => ({ v, label: l, a })),
  module: 'mode',
  label: 'PATTERN',
  scale: { size: 9 },
  help: 'The arpeggio’s order: UP, DOWN, in the ORDER the keys were played, or RANDOM. SEQ plays the preset’s step sequence and REC records one. Here SEQ and REC leave the arpeggiator off, and the app’s sequencer under the panel plays and records sequences.',
});
label(287, 371, 'PATTERN', 12);
lamp('arp.on', 262, 459, {
  label: 'ON',
  name: 'ARP ON',
  module: 'mode',
  help: 'Starts the arpeggiator: hold keys and it plays them in turn at RATE. While recording a sequence it enters a REST.',
});
label(262, 437, 'REST', 9);
label(262, 478, 'ON', 12);
btn('arp.latch', 345, 457, {
  label: 'LATCH',
  module: 'mode',
  lamp: LAMP,
  help: 'Keeps the arpeggio playing after the keys are let go, until a new chord is played. While recording a sequence it enters a TIE.',
});
label(345, 437, 'TIE', 9);
label(345, 478, 'LATCH', 11);

// ── Glide ─────────────────────────────────────────────────────────────────
knob('glide.time', 395, 180, 20, 'TIME', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 3,
  module: 'glide',
  label: 'TIME',
  name: 'GLIDE TIME',
  scale: S10,
  fmt: (v) => fmtTime(glideTime(v)),
  help: 'How long each note takes to slide from the last one’s pitch, while GLIDE is ON.',
});
const GLIDE_OSC: ControlOption[] = [
  { v: 'both', label: 'BOTH' },
  { v: 'osc1', label: 'OSC 1' },
  { v: 'osc2', label: 'OSC 2' },
];
btn('glide.osc', 411, 262, {
  kind: 'enum',
  def: 'both',
  options: GLIDE_OSC,
  module: 'glide',
  label: 'OSC',
  name: 'GLIDE OSC',
  help:
    'Which oscillators glide: both, or only 1 or only 2, so one slides while the other jumps. Here both always glide. ' +
    NOT_HERE,
});
led(397, 242, { id: 'glide.osc', in: ['both', 'osc1'] });
led(425, 242, { id: 'glide.osc', in: ['both', 'osc2'] });
label(397, 232, '1', 10);
label(425, 232, '2', 10);
label(411, 283, 'OSC', 12);
const GLIDE_TYPES: [string, string, number][] = [
  ['LCR', 'LCR', 389],
  ['LCT', 'LCT', 415],
  ['EXP', 'EXP', 442],
];
btn('glide.type', 415, 332, {
  kind: 'enum',
  def: 'LCR',
  options: GLIDE_TYPES.map(([v, l]) => ({ v, label: l })),
  module: 'glide',
  label: 'TYPE',
  name: 'GLIDE TYPE',
  help:
    'How the glide moves: LCR at a constant rate, so a wider interval takes longer; LCT in a constant time whatever the interval; EXP slowing as it arrives. Here the glide takes the same time whatever the interval. ' +
    NOT_HERE,
});
GLIDE_TYPES.forEach(([v, l, x]) => {
  led(x, 312, { id: 'glide.type', eq: v });
  label(x, 302, l, 9);
});
label(415, 351, 'TYPE', 12);
btn('glide.gated', 418, 372, {
  label: 'GATED',
  name: 'GLIDE GATED',
  module: 'glide',
  lamp: LAMP,
  help: 'Glides only while a key is held: let go and the pitch stops where it is. ' + NOT_HERE,
});
label(418, 392, 'GATED', 12);
btn('glide.legato', 418, 415, {
  label: 'LEGATO',
  name: 'GLIDE LEGATO',
  module: 'glide',
  lamp: LAMP,
  help: 'Glides only from a key still held to the next, so detached notes jump and joined ones slide.',
});
label(418, 435, 'LEGATO', 12);
lamp('glide.on', 425, 460, {
  label: 'ON',
  name: 'GLIDE ON',
  module: 'glide',
  help: 'Switches glide on without moving TIME.',
});
label(425, 478, 'ON', 12);

// ── MOD 1 and MOD 2 ───────────────────────────────────────────────────────
const SOURCES: [string, string, number][] = [
  ['triangle', 'Triangle', -125],
  ['square', 'Square', -75],
  ['saw', 'Sawtooth', -25],
  ['ramp', 'Ramp', 25],
  ['sample_hold', 'Sample and hold', 75],
  ['feg_pgm', 'F.EG/PGM', 125],
];
const DESTS: [string, string][] = [
  ['osc1_wave', 'OSC 1 WAVE'],
  ['osc1_osc2_wave', 'OSC 1 + 2 WAVE'],
  ['osc2_wave', 'OSC 2 WAVE'],
  ['vca_level', 'VCA LEVEL'],
  ['noise_level', 'NOISE LEVEL'],
  ['lfo_rate', 'LFO RATE'],
  ['eg_time_pgm', 'EG TIME / PGM'],
];
const PITCH_OSC: ControlOption[] = [
  { v: 'both', label: 'BOTH' },
  { v: 'osc1', label: 'OSC 1' },
  { v: 'osc2', label: 'OSC 2' },
];
const CTRL4_SRCS: [string, string][] = [
  ['breath_cc2', 'BREATH'],
  ['filter_eg', 'FILT EG'],
  ['amp_eg', 'AMP EG'],
  ['lfo1', 'LFO 1'],
  ['lfo2', 'LFO 2'],
];
const PGM_SRCS: [string, string][] = [
  ['filter_eg', 'FILT EG'],
  ['amp_eg', 'AMP EG'],
  ['velocity', 'VELOCITY'],
  ['pressure', 'PRESSURE'],
  ['kb_track', 'KB TRACK'],
  ['const_on', 'CONST ON'],
];
const PGM_DSTS: [string, string][] = [
  ['eg_time', 'EG TIME'],
  ['filter_res', 'FILT RES'],
  ['osc_levels', 'OSC LVLS'],
];

function modSection(n: 1 | 2, bx: number): void {
  const other = n === 1 ? 2 : 1;
  const m = `mod${n}`;
  const l = `lfo${n}`;
  const X = (dx: number): number => bx + dx;
  knob(`${l}.rate`, X(45), 182, 20, null, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    module: 'lfo',
    label: `LFO ${n} RATE`,
    scale: {
      labels: [
        { at: 0, text: '0.1' },
        { at: 3, text: '.7' },
        { at: 4, text: '1.4' },
        { at: 5, text: '3' },
        { at: 6, text: '6' },
        { at: 7, text: '12' },
        { at: 8, text: '25' },
        { at: 9, text: '50' },
        { at: 10, text: '100' },
      ],
      ticks: 0,
      size: 9,
    },
    fmt: (v) => fmtHz(lfoHz(v)),
    help: `The speed of LFO ${n}, 0.1 to 100 Hz, or ten times that with HI RANGE: from a slow sweep to a buzz at audio rate.`,
  });
  label(X(45), 130, `LFO ${n} RATE`, 13);
  led(X(89), 130, n === 1 ? 'lfo' : undefined);
  label(X(45), 213, 'SYNC', 8);
  knob(`${m}.source`, X(147), 183, 14, null, {
    kind: 'enum',
    def: 'triangle',
    options: SOURCES.map(([v, , a]) => ({ v, label: '', a })),
    module: 'mod',
    label: `MOD ${n} SOURCE`,
    fmt: (v) => SOURCES.find(([k]) => k === v)?.[1] ?? String(v),
    help: `What MOD ${n} sends: LFO ${n} as a triangle, square, sawtooth, ramp or sample and hold, or (F.EG/PGM) the filter envelope, or whichever source PGM SRC on the display chooses.`,
  });
  label(X(147), 132, `MOD ${n} SOURCE`, 13);
  const at = (a: number, r = 30): [number, number] => [
    X(147) + Math.sin((a * Math.PI) / 180) * r,
    183 - Math.cos((a * Math.PI) / 180) * r,
  ];
  (['tri', 'sq', 'rsaw', 'saw'] as const).forEach((shape, i) => {
    const [x, y] = at(SOURCES[i][2]);
    wave(x, y, shape, 9);
  });
  label(...at(75, 31), 'S&H', 8);
  label(...at(125, 33), 'F.EG/\nPGM', 8);
  box(X(16), 228, X(205), 271);
  btn(`${l}.hiRange`, X(47), 241, {
    label: 'HI RANGE',
    module: 'lfo',
    lamp: LAMP,
    help: `Multiplies LFO ${n}’s rate by ten, 1 to 1000 Hz, well into audio rate for FM and growl.`,
  });
  btn(`${l}.sync`, X(111), 241, {
    label: 'SYNC',
    name: `LFO ${n} SYNC`,
    module: 'lfo',
    lamp: LAMP,
    help: `Locks LFO ${n} to the arpeggiator’s clock or MIDI clock, RATE then choosing a division of the beat. ${NOT_HERE}`,
  });
  btn(`${l}.kbReset`, X(172), 241, {
    label: 'KB RESET',
    name: `LFO ${n} KB RESET`,
    module: 'lfo',
    lamp: LAMP,
    help: `Starts LFO ${n}’s cycle again on every new note, so each note is modulated the same way.`,
  });
  label(X(47), 261, 'HI RANGE', 10);
  label(X(111), 261, 'SYNC', 10);
  label(X(172), 261, 'KB RESET', 10);
  knob(`${m}.pitchAmt`, X(53), 323, 20, 'PITCH AMT', {
    kind: 'cont',
    min: -5,
    max: 5,
    def: 0,
    module: 'mod',
    label: 'PITCH AMT',
    name: `MOD ${n} PITCH AMT`,
    scale: PM5,
    fmt: fmtPm,
    help: `How far MOD ${n} moves the pitch of the oscillators OSC chooses, either way from the centre: vibrato a little off it, sirens and FM further out.`,
  });
  knob(`${m}.filterAmt`, X(150), 323, 20, 'FILTER AMT', {
    kind: 'cont',
    min: -5,
    max: 5,
    def: 0,
    module: 'mod',
    label: 'FILTER AMT',
    name: `MOD ${n} FILTER AMT`,
    scale: PM5,
    fmt: fmtPm,
    help: `How far MOD ${n} moves the filter’s cutoff, either way from the centre: a wah, a wobble, or (from the filter envelope) a second sweep.`,
  });
  btn(`${m}.pitchOsc`, X(70), 376, {
    kind: 'enum',
    def: 'both',
    options: PITCH_OSC,
    module: 'mod',
    label: 'OSC',
    name: `MOD ${n} OSC`,
    help: `Which oscillators PITCH AMT reaches: both, or only 1 (with the sub oscillator) or only 2, so the other holds its pitch while this one sweeps.`,
  });
  led(X(39), 376, { id: `${m}.pitchOsc`, in: ['both', 'osc1'] });
  led(X(103), 376, { id: `${m}.pitchOsc`, in: ['both', 'osc2'] });
  label(X(39), 364, '1', 9);
  label(X(103), 364, '2', 9);
  label(X(70), 396, 'OSC', 12);
  btn(`ui.controllers${n}`, X(167), 376, {
    label: 'CONTROLLERS',
    name: `MOD ${n} CONTROLLERS`,
    ui: true,
    help: `Opens MOD ${n}’s menu on the display: how far the mod wheel, velocity, aftertouch and a fourth controller set the bus’s depth, and its programmable source and destination. Here CURSOR steps to those pages.`,
  });
  label(X(167), 396, 'CONTROLLERS', 10);
  btn(`${m}.dest`, X(72), 452, {
    kind: 'enum',
    def: n === 1 ? 'osc1_osc2_wave' : 'vca_level',
    options: DESTS.map(([v, t]) => ({ v, label: t })),
    module: 'mod',
    label: 'DEST',
    name: `MOD ${n} DEST`,
    help: `Where MOD AMT sends MOD ${n}: either oscillator’s WAVE or both, the VCA’s level, the noise level, the rate of LFO ${other}, or (EG TIME/PGM) the envelopes’ time or the destination PGM DST chooses.`,
  });
  const destLed = (x: number, y: number, on: string[], t: string, side: 'start' | 'end'): void => {
    led(x, y, { id: `${m}.dest`, in: on });
    label(side === 'end' ? x - 9 : x + 9, y, t, 7.5, { anchor: side });
  };
  destLed(X(50), 428, ['osc1_wave', 'osc1_osc2_wave'], 'OSC 1\nWAVE', 'end');
  destLed(X(50), 448, ['vca_level'], 'VCA\nLEVEL', 'end');
  destLed(X(50), 468, ['lfo_rate'], `LFO ${other}\nRATE`, 'end');
  destLed(X(103), 428, ['osc2_wave', 'osc1_osc2_wave'], 'OSC 2\nWAVE', 'start');
  destLed(X(103), 448, ['noise_level'], 'NOISE\nLEVEL', 'start');
  destLed(X(103), 468, ['eg_time_pgm'], 'EG TIME /\nPGM', 'start');
  label(X(76), 412, 'BOTH', 8);
  label(X(76), 429, `MOD ${n}`, 12);
  label(X(76), 471, 'DEST', 11);
  knob(`${m}.modAmt`, X(158), 464, 20, `MOD ${n} AMT`, {
    kind: 'cont',
    min: -5,
    max: 5,
    def: 0,
    module: 'mod',
    label: `MOD ${n} AMT`,
    scale: PM5,
    fmt: fmtPm,
    help: `How far MOD ${n} moves the destination DEST chooses, either way from the centre.`,
  });

  // the bus's menus (CONTROLLERS on the hardware)
  const depth = (id: string, lab: string, def: number, what: string): void =>
    menu(`m${n}d`, `${m}.${id}`, lab, {
      kind: 'cont',
      min: -100,
      max: 100,
      def,
      step: 1,
      module: 'mod',
      name: `MOD ${n} ${lab}`,
      fmt: fmtPct,
      help: `How much ${what} sets MOD ${n}’s depth. At +100 % it sets all of it: at rest the bus does nothing, and it reaches the knobs’ full amounts at the top. Between, part of the depth is always there; a negative amount turns the bus over.`,
    });
  depth('wheelDepth', 'MOD WHEEL', n === 1 ? 100 : 0, 'the mod wheel');
  depth('velDepth', 'VELOCITY', 0, 'how hard each key is played');
  depth('atDepth', 'AFTERTOUCH', 0, 'pressing down on a held key (aftertouch)');
  depth('ctrl4Depth', 'CTRL4 AMT', 0, 'the fourth controller CTRL4 SRC chooses');
  menu(`m${n}p`, `${m}.ctrl4Src`, 'CTRL4 SRC', {
    kind: 'enum',
    def: 'breath_cc2',
    options: CTRL4_SRCS.map(([v, t]) => ({ v, label: t })),
    module: 'mod',
    name: `MOD ${n} CTRL4 SRC`,
    help: 'The fourth controller of the bus’s depth: a breath controller (MIDI CC 2), the filter or amp envelope, or either LFO. The app has no breath controller, so BREATH sets nothing.',
  });
  menu(`m${n}p`, `${m}.pgmSrc`, 'PGM SRC', {
    kind: 'enum',
    def: 'filter_eg',
    options: PGM_SRCS.map(([v, t]) => ({ v, label: t })),
    module: 'mod',
    name: `MOD ${n} PGM SRC`,
    help: 'What the bus sends with SOURCE at F.EG/PGM: the filter envelope, the amp envelope, velocity, aftertouch, the key played, or a steady level. The hardware has more (a sine or noise LFO, the oscillators’ pitch, the sequencer’s notes and mod values), which the app does not model.',
  });
  menu(`m${n}p`, `${m}.pgmDst`, 'PGM DST', {
    kind: 'enum',
    def: 'eg_time',
    options: PGM_DSTS.map(([v, t]) => ({ v, label: t })),
    module: 'mod',
    name: `MOD ${n} PGM DST`,
    help: 'Where MOD AMT goes with DEST at EG TIME/PGM: both envelopes’ time (positive is longer, the shape kept), the resonance, or the two oscillators’ levels. On the hardware almost any parameter can be chosen; the app models these three.',
  });
  menu(`m${n}p`, `${l}.kbTrack`, `LFO${n} KBTRK`, {
    kind: 'cont',
    min: 0,
    max: 200,
    def: 0,
    step: 1,
    module: 'lfo',
    name: `LFO ${n} KB TRACK`,
    fmt: (v) => `${Math.round(v)} %`,
    help: `How far LFO ${n}’s rate rises with the key played: at 100 % it doubles each octave up, so an audio-rate LFO plays in tune.`,
  });
}
modSection(1, 451);
modSection(2, 663);

// ── Oscillators ───────────────────────────────────────────────────────────
const FEET: [string, number, number][] = [
  ["16'", -12, -75],
  ["8'", 0, -25],
  ["4'", 12, 25],
  ["2'", 24, 75],
];
const FOOT_SEMI: Record<string, number> = Object.fromEntries(FEET.map(([f, s]) => [f, s]));
/** WAVE 0–10 onto the engine's morph: the panel's triangle, sawtooth, square and narrow pulse at 0, 3.3, 6.7 and 10. */
const WAVE_PTS: CurvePoint[] = [
  [0, 0],
  [10 / 3, 0.5],
  [20 / 3, 2 / 3],
  [10, 1],
];
const waveMorph = (v: number): number => pwl(v, WAVE_PTS);
const badge = (x: number, y: number, t: string): void => {
  decor.push({
    t: 'rect',
    x: P(x - 9),
    y: Q(y - 10),
    w: 36,
    h: 40,
    r: 3,
    fill: 'none',
    stroke: INK,
    sw: 2,
  });
  label(x, y, t, 17, { weight: 700 });
};
[
  [1, 194],
  [2, 333],
].forEach(([n, y]) => {
  badge(882, y - 49, String(n));
  knob(`osc${n}.octave`, 921, y, 15, null, {
    kind: 'enum',
    def: "8'",
    options: FEET.map(([v, , a]) => ({ v, label: v, a })),
    module: 'osc',
    label: 'OCTAVE',
    name: `OSC ${n} OCTAVE`,
    scale: { size: 9 },
    help: `Oscillator ${n}’s octave in organ feet: 16′ is the lowest, 2′ the highest${n === 1 ? ', and the sub oscillator follows it an octave down' : ''}.`,
  });
  label(921, y - 56, 'OCTAVE', 13);
  knob(`osc${n}.wave`, 1021, y, 20, null, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 10 / 3,
    module: 'osc',
    label: 'WAVE',
    name: `OSC ${n} WAVE`,
    scale: { ticks: 11 },
    fmt: (v) =>
      v < 1.2
        ? 'triangle'
        : v < 2.6
          ? 'tri → saw'
          : v < 4.1
            ? 'sawtooth'
            : v < 5.9
              ? 'saw → square'
              : v < 7.4
                ? 'square'
                : 'narrowing pulse',
    help: `Oscillator ${n}’s shape, sweeping smoothly from triangle through sawtooth and square to a narrow pulse: soft and hollow at the left, brighter and buzzier going right, thin and nasal at the end.`,
  });
  label(1021, y - 56, 'WAVE', 13);
  (
    [
      [-150, 'tri'],
      [-50, 'saw'],
      [50, 'sq'],
      [150, 'npulse'],
    ] as const
  ).forEach(([a, shape]) => {
    const r = (a * Math.PI) / 180;
    wave(1021 + Math.sin(r) * 34, y - Math.cos(r) * 32, shape, 10);
  });
});
btn('osc2.hardSync', 938, 249, {
  label: 'HARD SYNC',
  module: 'osc',
  lamp: LAMP,
  help: 'Restarts Oscillator 2’s cycle with every cycle of Oscillator 1, so Oscillator 2’s tuning changes its tone instead of its pitch: tune it up (FREQUENCY, or a mod bus on Osc 2’s pitch) for the tearing sync lead.',
});
btn('osc.kbReset', 1007, 249, {
  label: 'KB RESET',
  name: 'OSC KB RESET',
  module: 'osc',
  lamp: LAMP,
  help:
    'Starts both oscillators’ cycles together on each new note, so every note’s attack sounds the same. ' +
    NOT_HERE,
});
label(938, 270, 'HARD SYNC', 11);
label(1007, 270, 'KB RESET', 11);
line(872, 257, 1076, 257, 1.6);
box(882, 368, 1062, 412);
btn('osc2.kbCtrl', 924, 383, {
  kind: 'enum',
  def: 'hi',
  options: [
    { v: 'hi', label: 'HI' },
    { v: 'lo', label: 'LO' },
    { v: 'off', label: 'OFF' },
  ],
  module: 'osc',
  label: 'KB CTRL',
  help: 'In DUO MODE, which key Oscillator 2 plays: HI the highest held, with Oscillator 1 on the lowest; LO the lowest, with Oscillator 1 on the highest; OFF none, so it drones at its own pitch, FREQUENCY then reaching three octaves either way.',
});
led(895, 383, { id: 'osc2.kbCtrl', eq: 'lo' });
led(954, 383, { id: 'osc2.kbCtrl', eq: 'hi' });
label(895, 372, 'LO', 8);
label(954, 372, 'HI', 8);
label(924, 404, 'KB CTRL', 11);
btn('osc.duo', 1018, 383, {
  label: 'DUO MODE',
  module: 'osc',
  lamp: LAMP,
  help: 'Plays two notes at once, one on each oscillator, through the one filter and amplifier: hold two keys for an interval, or one for both oscillators on it. KB CTRL says which oscillator takes the higher key.',
});
label(1018, 404, 'DUO MODE', 11);
knob('osc2.frequency', 921, 466, 20, 'FREQUENCY', {
  kind: 'cont',
  min: -7,
  max: 7,
  def: 0,
  module: 'osc',
  label: 'FREQUENCY',
  name: 'OSC 2 FREQUENCY',
  scale: {
    labels: [
      { at: -7, text: '-7' },
      { at: -3, text: '-3' },
      { at: -1, text: '-1' },
      { at: 1, text: '+1' },
      { at: 3, text: '+3' },
      { at: 7, text: '+7' },
    ],
    ticks: 15,
    size: 9,
  },
  fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} st`,
  help: 'Tunes Oscillator 2 against Oscillator 1, up to seven semitones (a fifth) either way; with DUO MODE on and KB CTRL OFF, three octaves either way.',
});
knob('osc2.beat', 1018, 466, 20, 'BEAT FREQ', {
  kind: 'cont',
  min: -3.5,
  max: 3.5,
  def: 0,
  module: 'osc',
  label: 'BEAT FREQ',
  name: 'OSC 2 BEAT FREQ',
  scale: {
    labels: [
      { at: -3.5, text: '-3.5Hz' },
      { at: 0, text: '0' },
      { at: 3.5, text: '+3.5Hz' },
    ],
    ticks: 15,
    size: 8,
  },
  fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(2)} Hz`,
  help: 'Detunes Oscillator 2 by up to 3.5 Hz either way, so the two oscillators beat against each other: slowly near the centre, a fast chorus at the ends. On the hardware the beating is the same speed at every note; here it is set at middle C, and gets faster higher up.',
});

// ── Mixer ─────────────────────────────────────────────────────────────────
const MIXER: [string, string, string, number, number, number, number, number, string][] = [
  ['osc1', 'OSC 1', 'Oscillator 1', 1121, 195, 1221, 195, 1185, 'Oscillator 1'],
  [
    'sub',
    'SUB 1',
    'the sub oscillator',
    1190,
    264,
    1093,
    262,
    1130,
    'the square sub oscillator, an octave below Oscillator 1',
  ],
  ['osc2', 'OSC 2', 'Oscillator 2', 1121, 334, 1215, 333, 1180, 'Oscillator 2'],
  [
    'noise',
    'NOISE',
    'noise',
    1188,
    403,
    1093,
    400,
    1130,
    'pink noise, for breath, wind and the hiss of a snare',
  ],
  [
    'fbext',
    'FDBK/\nEXT IN',
    'the feedback channel',
    1119,
    466,
    1210,
    462,
    1170,
    'the mixer’s own output fed back into it, which thickens, growls and distorts as it goes up',
  ],
];
MIXER.forEach(([k, lab, short, kx, ky, bx, by, tx, what]) => {
  knob(`mixer.${k}`, kx, ky, 20, null, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: k === 'osc1' ? 5 : 0,
    module: 'mixer',
    label: lab,
    name: `${lab.replace('\n', ' ')} level`,
    scale: S10,
    fmt: fmt10,
    help: `The level of ${what}. Past 5 it drives the filter’s input harder, for the overdriven Moog sound.`,
  });
  lamp(`mixer.${k}On`, bx, by, {
    label: lab,
    name: `${lab.replace('\n', ' ')} on`,
    module: 'mixer',
    def: true,
    help: `Switches ${short} into the mixer, or out of it without moving its level.`,
  });
  label(tx, by, lab, 11);
});

// ── Filter ────────────────────────────────────────────────────────────────
knob('vcf.cutoff', 1335, 203, 32, null, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 10,
  module: 'filter',
  label: 'CUTOFF',
  scale: {
    labels: [
      { at: 0, text: '20Hz' },
      { at: 2, text: '80Hz' },
      { at: 4, text: '320Hz' },
      { at: 4.66, text: '500Hz' },
      { at: 6, text: '1.2KHz' },
      { at: 8, text: '5KHz' },
      { at: 10, text: '20KHz' },
    ],
    ticks: 21,
    size: 9,
  },
  fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the ladder filter starts to cut, 20 Hz to 20 kHz: turn it down and the sound gets darker until only a thud is left; turn it up and the full brightness of the oscillators comes through.',
});
label(1345, 262, 'CUTOFF', 13);
knob('vcf.resonance', 1286, 336, 20, 'RESONANCE', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'filter',
  label: 'RESONANCE',
  scale: S10,
  fmt: fmt10,
  help: 'Boosts the frequencies at the cutoff, so a sweep whistles and squelches. Past 7 the filter rings on its own as a sine wave, which plays in tune with KB TRACK at half.',
});
knob('drive.amount', 1374, 336, 20, 'MULTIDRIVE', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'filter',
  label: 'MULTIDRIVE',
  scale: S10,
  fmt: fmt10,
  help: 'Overdrive after the filter: a little warms and thickens the sound, more turns it to grit and fuzz.',
});
box(1249, 377, 1394, 414);
const SLOPES: [string, string, number][] = [
  ['-6', '6', 1266],
  ['-12', '12', 1287],
  ['-18', '18', 1350],
  ['-24', '24', 1373],
];
btn('vcf.slope', 1320, 391, {
  kind: 'enum',
  def: '-24',
  options: SLOPES.map(([v, l]) => ({ v, label: `${l} dB` })),
  module: 'filter',
  label: 'SLOPE',
  name: 'FILTER SLOPE',
  help: 'How steeply the filter cuts above the cutoff: 6, 12, 18 or the classic Moog 24 dB an octave. The gentler slopes keep more of the top, for a brighter, thinner sound; the resonance works the same at every slope.',
});
SLOPES.forEach(([v, l, x]) => {
  led(x, 391, { id: 'vcf.slope', eq: v });
  label(x, 382, l, 8);
});
label(1320, 408, 'SLOPE', 11);
knob('vcf.egAmt', 1282, 466, 20, 'EG AMT', {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  module: 'filter',
  label: 'EG AMT',
  name: 'FILTER EG AMT',
  scale: PM5,
  fmt: fmtPm,
  help: 'How far the filter envelope sweeps the cutoff on each note: up from the knob to the right of centre, down to the left.',
});
knob('vcf.kbTrack', 1372, 466, 20, 'KB TRACK', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'filter',
  label: 'KB TRACK',
  name: 'FILTER KB TRACK',
  scale: {
    labels: [
      { at: 0, text: '0' },
      { at: 5, text: '1:1' },
      { at: 10, text: '2:1' },
    ],
    ticks: 11,
    size: 9,
  },
  fmt: fmt10,
  help: 'How far the cutoff follows the keys, so higher notes are as bright as low ones: none at 0, exactly at half (1:1), twice as far fully up (2:1).',
});

// ── Envelope generators ───────────────────────────────────────────────────
const ENV_X = [1495, 1588, 1675, 1762];
const BTN_X = [1460, 1535, 1608, 1680, 1752];
const ENVS = [
  {
    e: 'env_f',
    name: 'FILTER',
    y: 200,
    by: 257,
    bad: 'F',
    what: 'the filter’s cutoff (with EG AMT), and MOD at F.EG/PGM',
  },
  { e: 'env_a', name: 'AMP', y: 405, by: 460, bad: 'A', what: 'the loudness' },
] as const;
const shifted = (on: boolean): ShowCondition => ({ id: 'env.knobShift', eq: on });
/** One of an envelope's knobs, 0 to 10 on the panel. */
interface EnvKnob {
  def: number;
  scale: KnobScale;
  fmt: (v: number) => string;
  help: string;
}
const TIME_SCALE: KnobScale = {
  labels: [
    { at: 0, text: 'M-SEC .1' },
    { at: 10, text: '10 SEC' },
  ],
  ticks: 11,
  size: 8,
};
ENVS.forEach(({ e, name, y, by, bad, what }) => {
  const id = (k: string): string => `${e === 'env_f' ? 'envF' : 'envA'}.${k}`;
  badge(bad === 'F' ? 1438 : 1432, y - 53, bad);
  const stage = (i: number, k: string, lab: string, rest: EnvKnob, glyph: boolean): void => {
    knob(id(k), ENV_X[i], y, 20, null, {
      kind: 'cont',
      min: 0,
      max: 10,
      ...rest,
      module: 'env',
      label: lab,
      name: `${name} ${lab}`,
      show: shifted(false),
    });
    label(ENV_X[i] - (glyph ? 10 : 0), y - 56, lab, 13);
    if (glyph) wave(ENV_X[i] + 28, y - 57, 'adsr', 10);
  };
  stage(
    0,
    'attack',
    'ATTACK',
    {
      def: 0,
      scale: TIME_SCALE,
      fmt: (v: number) => fmtTime(envTime(v)),
      help: `How long ${what} takes to rise to its peak after a key goes down, 1 ms to 10 s.`,
    },
    true
  );
  stage(
    1,
    'decay',
    'DECAY',
    {
      def: 5,
      scale: TIME_SCALE,
      fmt: (v: number) => fmtTime(envTime(v)),
      help: `How long ${what} takes to fall from its peak to SUSTAIN, 1 ms to 10 s.`,
    },
    true
  );
  stage(
    2,
    'sustain',
    'SUSTAIN',
    {
      def: 10,
      scale: { nums: [0, 10], ticks: 11, size: 9 },
      fmt: fmt10,
      help: `The level ${what} holds at while the key is held: at 10 the peak, at 0 nothing, so the note dies away however long the key is held.`,
    },
    true
  );
  stage(
    3,
    'release',
    'RELEASE',
    {
      def: 3,
      scale: TIME_SCALE,
      fmt: (v: number) => fmtTime(envTime(v)),
      help: `How long ${what} takes to fall away after the key is let go, 1 ms to 10 s.`,
    },
    true
  );
  // KNOB SHIFT: the same four knobs as DELAY, HOLD, VEL AMT and KB TRACK
  const shiftKnob = (i: number, k: string, lab: string, rest: EnvKnob): void => {
    controls.push({
      id: id(k),
      type: 'knob',
      kind: 'cont',
      min: 0,
      max: 10,
      x: P(ENV_X[i]),
      y: Q(y),
      r: 40,
      style: 'd-silver',
      labelPos: 'none',
      module: 'env',
      label: lab,
      name: `${name} ${lab}`,
      show: shifted(true),
      ...rest,
    });
  };
  const timeRest = (help: string): EnvKnob => ({
    def: 0,
    scale: {
      labels: [
        { at: 0, text: '0' },
        { at: 10, text: '10 SEC' },
      ],
      ticks: 11,
      size: 8,
    },
    fmt: (v: number) => (v <= 0 ? '0' : fmtTime(dhTime(v))),
    help,
  });
  shiftKnob(
    0,
    'delay',
    'DELAY',
    timeRest(
      e === 'env_f'
        ? 'How long the filter envelope waits after a key goes down before its attack starts, 0 to 10 s (KNOB SHIFT on ATTACK).'
        : 'How long the amp envelope waits before its attack, 0 to 10 s (KNOB SHIFT on ATTACK). It works only with LOOP on, where it is the gap at the start of each cycle.'
    )
  );
  shiftKnob(
    1,
    'hold',
    'HOLD',
    timeRest(
      `How long ${e === 'env_f' ? 'the filter envelope' : 'the amp envelope'} stays at its peak after the attack before it starts to decay, 0 to 10 s (KNOB SHIFT on DECAY).`
    )
  );
  shiftKnob(2, 'velAmt', 'VEL AMT', {
    def: 0,
    scale: S10,
    fmt: fmt10,
    help: `How much how hard a key is played sets the height of ${e === 'env_f' ? 'the filter envelope (and so its sweep)' : 'the amp envelope (and so the note’s loudness)'}: at 0 none, at 10 a soft key barely moves it (KNOB SHIFT on SUSTAIN).`,
  });
  shiftKnob(3, 'kbTrack', 'KB TRACK', {
    def: 0,
    scale: S10,
    fmt: fmt10,
    help: `How much the envelope’s times shorten on higher keys, as a plucked string’s do (KNOB SHIFT on RELEASE).`,
  });
  (
    [
      [
        'multiTrig',
        'MULTI TRIG',
        'Restarts the envelope on every new key, even one played before the last is let go. Off, a key played legato carries on from where the envelope is.',
      ],
      [
        'reset',
        'RESET',
        `Starts each attack from zero rather than from wherever the envelope is. ${NOT_HERE}`,
      ],
      [
        'sync',
        'SYNC',
        `Restarts the envelope at a division of the arpeggiator’s or MIDI clock (CLOCK DIV in PRESET EDIT). ${NOT_HERE}`,
      ],
      [
        'loop',
        'LOOP',
        `Loops the envelope while a key is held: delay, attack, hold, decay to the sustain level and release, then round again, a many-stage LFO.${e === 'env_a' ? ' The amp envelope’s DELAY works only with LOOP on.' : ''}`,
      ],
      [
        'latch',
        'LATCH ON',
        `Holds the envelope at its SUSTAIN level as if a key were always held${e === 'env_a' ? ': the sound then plays with no key, and the feedback channel drones' : ', so the filter sits at the level it would hold'}.`,
      ],
    ] as const
  ).forEach(([k, lab, help], i) => {
    btn(id(k), BTN_X[i], by, {
      label: lab,
      name: `${name} ${lab}`,
      module: 'env',
      lamp: LAMP,
      help,
    });
    label(BTN_X[i], by + 20, lab, 10);
  });
});
box(1425, 290, 1795, 325);
btn('env.knobShift', 1438, 305, {
  label: 'KNOB SHIFT',
  module: 'env',
  lamp: LAMP,
  ui: true,
  help: 'Turns each envelope’s four knobs into DELAY, HOLD, VEL AMT and KB TRACK, printed on the strip beside it. Press again for ATTACK, DECAY, SUSTAIN and RELEASE.',
});
['DELAY', 'HOLD', 'VEL AMT', 'KB TRACK'].forEach((t, i) => label(ENV_X[i] - 8, 307, t, 12));
label(1601, 329, 'KNOB SHIFT', 7);

// ── Output ────────────────────────────────────────────────────────────────
knob('out.volume', 1866, 200, 20, 'VOLUME', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  module: 'out',
  label: 'VOLUME',
  scale: { nums: [0, 10], ticks: 11, size: 9 },
  fmt: fmt10,
  help: 'The level at the main output.',
});
btn(
  'out.mute',
  1862,
  262,
  {
    label: 'MUTE',
    module: 'out',
    lamp: LAMP,
    help: 'Silences the main output; the headphones still play on the hardware.',
  },
  30,
  30
);
label(1862, 284, 'MUTE', 11);
box(1822, 296, 1894, 473);
knob('out.phones', 1866, 345, 18, null, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  module: 'out',
  label: 'VOLUME',
  name: 'HEADPHONES VOLUME',
  scale: { nums: [0, 10], ticks: 11, size: 9 },
  fmt: fmt10,
  help: 'The headphone level on the hardware. It has no effect in this app.',
});
label(1866, 383, 'VOLUME', 11);
jacks.push({
  id: 'j.phones',
  x: P(1858),
  y: Q(420),
  r: 17,
  label: 'HEADPHONES',
  labelPos: 'none',
  dir: 'out',
  signal: 'out',
  help: 'The headphone output: the main output, on both sides.',
});
label(1858, 458, 'HEADPHONES', 9);

// ── The PRESET row ────────────────────────────────────────────────────────
label(172, 512, 'KB OCTAVE', 10);
(
  [
    ['ui.octDown', 227, '◀', 'Down'],
    ['ui.octUp', 272, '▶', 'Up'],
  ] as const
).forEach(([id, x, lab, dir]) =>
  btn(id, x, 512, {
    label: lab,
    name: `KB OCTAVE ${lab}`,
    ui: true,
    help: `Moves the keyboard ${dir.toLowerCase()} an octave, up to two either way: the button lights dimly for one, brightly for two. Here use the octave buttons of the app’s keyboard.`,
  })
);
label(330, 486, 'STEP', 8);
line(345, 486, 345, 513, 1.4);
line(345, 513, 368, 513, 1.4);
line(337, 486, 345, 486, 1.4);
label(356, 513, 'BANK', 10);
btn('ui.bank', 395, 513, {
  label: 'BANK',
  ui: true,
  help: 'Chooses one of the 16 banks of 16 presets, with a PRESET button; with LATCH it is STEP edit, where the PRESET buttons show and edit the sequence’s steps. Here the PRESET buttons are always the app’s sequencer steps.',
});
label(462, 514, 'PRESET', 10);
for (let i = 0; i < 16; i++) {
  const x = 507 + Math.floor(i / 4) * 226 + (i % 4) * 54;
  label(x - 25, 514, String(i + 1), 10);
  btn(
    `seq.step${i + 1}`,
    x,
    514,
    {
      label: String(i + 1),
      name: `PRESET ${i + 1}`,
      ui: true,
      lamp: LAMP,
      help: `On the hardware PRESET ${i + 1} plays preset ${i + 1} of the bank; in step edit it is step ${i + 1} of the page. Here it chooses step ${i + 1} of the app’s sequencer.`,
    },
    44,
    26
  );
  seqButtons[`seq.step${i + 1}`] = { step: i };
}

// ── Maker's marks ─────────────────────────────────────────────────────────
text(1458, 524, 'SUB 37', 34, { brand: true, weight: 700, spacing: '0.02em' });
text(1512, 513, 'Bob Moog', 9, { brand: true, anchor: 'start' });
text(1512, 525, 'TRIBUTE', 9, { brand: true, anchor: 'start' });
line(1560, 500, 1560, 530, 1.4);
text(1570, 513, 'PARAPHONIC ANALOG SYNTHESIZER', 12, { brand: true, anchor: 'start', weight: 700 });
text(1570, 526, 'Designed & Handcrafted By Moog Music In Asheville, NC', 8.5, {
  brand: true,
  anchor: 'start',
  weight: 500,
});
decor.push({
  t: 'circle',
  x: P(1846),
  y: Q(507),
  r: 46,
  fill: 'none',
  stroke: INK,
  sw: 6,
  brand: true,
});
text(1846, 517, 'm', 40, { brand: true, weight: 700 });

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: P(x0),
  y: Q(y0),
  w: (x1 - x0) * 2,
  h: (y1 - y0) * 2,
});
const areas: Area[] = [
  {
    id: 'programming',
    label: 'Programming',
    module: 'mode',
    keywords: 'display lcd preset panel save compare menu cursor fine tune midi global',
    rects: [R(105, 104, 217, 492)],
    help: 'The display and its buttons, for presets and the menus behind the panel, and FINE TUNE for both oscillators. Here CURSOR steps through the menu pages the app models: each mod bus’s controllers and programmable source and destination, and PRESET EDIT.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator',
    module: 'mode',
    keywords: 'arpeggio arp rate tempo bpm pattern range latch sequencer step',
    rects: [R(217, 104, 357, 492)],
    help: 'Plays the held keys one at a time at RATE: PATTERN sets the order (up, down, as played, random), RANGE the octaves, BACK/FORTH makes it run both ways, and LATCH keeps it going. On the hardware PATTERN also plays and records the 64-step sequencer.',
  },
  {
    id: 'glide',
    label: 'Glide',
    module: 'glide',
    keywords: 'portamento glide slide legato',
    rects: [R(357, 104, 451, 492)],
    help: 'Makes the pitch slide from one note to the next. TIME sets how long, ON switches it in, and LEGATO keeps it to notes played joined. OSC, TYPE and GATED choose which oscillators glide, how, and whether it stops when the key is let go.',
  },
  {
    id: 'mod1',
    label: 'MOD 1',
    module: 'mod',
    keywords: 'lfo modulation vibrato wobble mod wheel source destination',
    rects: [R(451, 104, 662, 492)],
    help: 'A modulation bus: LFO 1 (or the filter envelope, or a programmable source) to the oscillators’ pitch, the cutoff and one more destination, each with its own amount either way. It follows the mod wheel unless its CONTROLLERS menu says otherwise.',
  },
  {
    id: 'mod2',
    label: 'MOD 2',
    module: 'mod',
    keywords: 'lfo modulation vibrato wobble source destination',
    rects: [R(662, 104, 872, 492)],
    help: 'The second modulation bus, the same as MOD 1 with LFO 2: pitch, cutoff and a switched destination. Its depth does not follow the mod wheel unless its CONTROLLERS menu says so, so it is always on.',
  },
  {
    id: 'osc',
    label: 'Oscillators',
    module: 'osc',
    keywords: 'vco octave wave shape pulse sync duo paraphonic detune beat',
    rects: [R(872, 104, 1076, 492)],
    help: 'Two oscillators, each with an OCTAVE and a WAVE that sweeps from triangle to narrow pulse. Oscillator 2 has FREQUENCY and BEAT FREQ to tune it against the first, HARD SYNC, and DUO MODE, which gives each oscillator its own key.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'level volume sub oscillator noise feedback external input overdrive',
    rects: [R(1076, 104, 1243, 492)],
    help: 'The levels of the two oscillators, the sub oscillator, noise and the feedback channel going into the filter, each with a lit button to switch it in. Past 5 a channel overdrives the filter’s input.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'cutoff resonance ladder slope drive multidrive envelope amount key tracking',
    rects: [R(1243, 104, 1415, 492)],
    help: 'The Moog ladder filter: CUTOFF and RESONANCE, a SLOPE of 6 to 24 dB an octave, EG AMT for the filter envelope’s sweep and KB TRACK to follow the keys. MULTIDRIVE overdrives the sound after it.',
  },
  {
    id: 'env',
    label: 'Envelope generators',
    module: 'env',
    keywords: 'adsr dahdsr attack decay sustain release delay hold loop latch velocity',
    rects: [R(1415, 104, 1812, 492)],
    help: 'Two envelopes: F, the filter’s, and A, the loudness. Each has ATTACK, DECAY, SUSTAIN and RELEASE, and with KNOB SHIFT DELAY, HOLD, VEL AMT and KB TRACK. The buttons under each set how it is triggered, and LOOP turns it into a many-stage LFO.',
  },
  {
    id: 'output',
    label: 'Output',
    module: 'out',
    keywords: 'volume mute headphones phones',
    rects: [R(1812, 104, 1898, 492)],
    help: 'The main VOLUME and MUTE, and the headphones with their own volume.',
  },
  {
    id: 'presets',
    label: 'Presets and steps',
    module: 'mode',
    keywords: 'preset bank octave keyboard step sequencer',
    rects: [R(105, 492, 1415, 550)],
    help: 'KB OCTAVE moves the keyboard by octaves; BANK and the 16 PRESET buttons choose one of 256 presets. In step edit the PRESET buttons are the sequence’s steps; here they choose the steps of the app’s sequencer.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const LFO_MIX: Record<string, LfoMix> = {
  triangle: { tri: 1 },
  square: { sq: 1 },
  saw: { rsaw: 1 },
  ramp: { saw: 1 },
  sample_hold: { sh: 1 },
};
const PGM_SIG: Record<string, EngineSignal> = {
  filter_eg: 'env1',
  amp_eg: 'env2',
  velocity: 'vel',
  pressure: 'press',
  kb_track: 'kbd',
  const_on: 'one',
};
const CTRL4_SIG: Record<string, EngineSignal | null> = {
  breath_cc2: null,
  filter_eg: 'env1',
  amp_eg: 'env2',
  lfo1: 'lfo',
  lfo2: 'lfo2',
};
const ARP_MODE: Record<string, 'up' | 'down' | 'played' | 'random'> = {
  up: 'up',
  down: 'down',
  order: 'played',
  random: 'random',
};
const ARP_DIVS: [string, number][] = [
  ['1/4', 1],
  ['1/8', 1 / 2],
  ['1/8T', 1 / 3],
  ['1/16', 1 / 4],
  ['1/16T', 1 / 6],
  ['1/32', 1 / 8],
];
menu('edit', 'arp.clockDiv', 'ARP CLK DIV', {
  kind: 'enum',
  def: '1/16',
  options: ARP_DIVS.map(([v]) => ({ v, label: v })),
  module: 'mode',
  name: 'ARP CLOCK DIV',
  help: 'How long each arpeggio note is against the beat RATE sets: a quarter, an eighth, a sixteenth and so on. The hardware has more divisions, from four whole notes down; the app has these six.',
});
menu('edit', 'arp.gateLen', 'ARP GATE LEN', {
  kind: 'cont',
  min: 0,
  max: 100,
  def: 50,
  step: 1,
  module: 'mode',
  name: 'ARP GATE LENGTH',
  fmt: (v) => `${Math.round(v)} %`,
  help: 'How long each arpeggio note sounds against its step: short and detached at the low end, joined at 100 %.',
});
menu('edit', 'kbd.transpose', 'TRANSPOSE', {
  kind: 'cont',
  min: -12,
  max: 12,
  def: 0,
  step: 1,
  module: 'osc',
  name: 'KB TRANSPOSE',
  fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v))} st`,
  help: 'Transposes the preset up or down by up to an octave, in semitones.',
});

function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const wheel = clamp(ctx.wheel || 0, 0, 1);
  const routes: EngineRoute[] = [];

  // the oscillators: Osc 1, Osc 2, and the sub oscillator as a square an octave under Osc 1
  const duo = !!v['osc.duo'];
  const kbCtrl = String(v['osc2.kbCtrl']);
  const drone = duo && kbCtrl === 'off';
  const ch = (k: string): number =>
    v[`mixer.${k}On`] ? level10(num(v, `mixer.${k}`), MIX_MAX) : 0;
  const over = (k: string): number =>
    v[`mixer.${k}On`] ? Math.max(0, num(v, `mixer.${k}`) - 5) / 5 : 0;
  const semi1 = FOOT_SEMI[String(v['osc1.octave'])] ?? 0;
  const osc1: OscParams = {
    level: ch('osc1'),
    morph: waveMorph(num(v, 'osc1.wave')),
    semi: semi1,
    kbd: true,
    syncTo: -1,
  };
  const osc2: OscParams = {
    level: ch('osc2'),
    morph: waveMorph(num(v, 'osc2.wave')),
    semi:
      (FOOT_SEMI[String(v['osc2.octave'])] ?? 0) +
      num(v, 'osc2.frequency') * (drone ? 36 / 7 : 1) +
      beatSemi(num(v, 'osc2.beat')),
    kbd: !drone,
    ...(drone ? { fixedNote: 60 } : {}),
    syncTo: v['osc2.hardSync'] ? 0 : -1,
  };
  const sub: OscParams = {
    level: ch('sub'),
    mix: { pulse: 1 },
    pw: 0.5,
    semi: semi1 - 12,
    kbd: true,
    syncTo: -1,
  };

  // the two mod buses
  const levelOf = (n: 1 | 2, k: string): number => num(v, `mod${n}.${k}`) / 100;
  function bus(n: 1 | 2): void {
    const m = `mod${n}`;
    const source = String(v[`${m}.source`]);
    const sig =
      source === 'feg_pgm'
        ? (PGM_SIG[String(v[`${m}.pgmSrc`])] ?? 'env1')
        : n === 1
          ? 'lfo'
          : 'lfo2';
    const dW = levelOf(n, 'wheelDepth');
    const dV = levelOf(n, 'velDepth');
    const dA = levelOf(n, 'atDepth');
    const c4 = CTRL4_SIG[String(v[`${m}.ctrl4Src`])] ?? null;
    const dC = c4 ? levelOf(n, 'ctrl4Depth') : 0;
    // each controller sets its share of the depth; whatever none of them claims is always there
    const base = 1 - Math.abs(dW) - Math.abs(dV) - Math.abs(dA) - Math.abs(dC) + dW * wheel;
    const send = (dst: EngineDest, amt: number): void => {
      if (!amt) return;
      if (Math.abs(base) > 1e-6) routes.push({ src: sig, dst, amt: amt * base });
      if (dV) routes.push({ src: sig, dst, amt: amt * dV, by: 'vel' });
      if (dA) routes.push({ src: sig, dst, amt: amt * dA, by: 'press' });
      if (dC && c4) routes.push({ src: sig, dst, amt: amt * dC, by: c4 });
    };
    const pitch = MOD_PITCH_ST * signedSq(num(v, `${m}.pitchAmt`));
    const po = String(v[`${m}.pitchOsc`]);
    if (po === 'both') send('pitchAll', pitch);
    else if (po === 'osc1') {
      send('pitch1', pitch);
      send('pitch3', pitch);
    } else send('pitch2', pitch);
    send('cutoff', MOD_CUT_OCT * (num(v, `${m}.filterAmt`) / 5));
    const amt = num(v, `${m}.modAmt`) / 5;
    const dest = String(v[`${m}.dest`]);
    if (dest === 'lfo_rate') send(n === 1 ? 'lfo2Rate' : 'lfoRate', MOD_RATE_OCT * amt);
    else if (dest === 'vca_level') send('amp', amt);
    else if (dest === 'osc1_wave' || dest === 'osc2_wave' || dest === 'osc1_osc2_wave') {
      if (dest !== 'osc2_wave') send('wave1', MOD_WAVE * amt);
      if (dest !== 'osc1_wave') send('wave2', MOD_WAVE * amt);
    } else if (dest === 'noise_level') send('noiseLvl', MOD_LEVEL * amt);
    else if (dest === 'eg_time_pgm') {
      const pgm = String(v[`${m}.pgmDst`]);
      if (pgm === 'filter_res') send('res', MOD_RES * amt);
      else if (pgm === 'osc_levels') {
        send('lvl1', MOD_LEVEL * amt);
        send('lvl2', MOD_LEVEL * amt);
      } else {
        // EG TIME: positive is longer, the opposite way to the engine's rate destinations
        send('env1Rate', -MOD_EGT_OCT * amt);
        send('env2Rate', -MOD_EGT_OCT * amt);
      }
    }
    const kt = num(v, `lfo${n}.kbTrack`) / 100;
    if (kt > 0) routes.push({ src: 'kbd', dst: n === 1 ? 'lfoRate' : 'lfo2Rate', amt: kt });
  }

  // the envelopes
  const env = (e: 'envF' | 'envA', loopDelay: boolean) => {
    const loop = !!v[`${e}.loop`];
    return {
      a: envTime(num(v, `${e}.attack`)),
      d: envTime(num(v, `${e}.decay`)),
      s: num(v, `${e}.sustain`) / 10,
      r: envTime(num(v, `${e}.release`)),
      ...(loopDelay || loop ? { dly: dhTime(num(v, `${e}.delay`)) } : {}),
      hold: dhTime(num(v, `${e}.hold`)),
      kf: (num(v, `${e}.kbTrack`) / 10) * 1.2,
      ...(loop ? { loop: true, loopAll: true } : {}),
    };
  };
  const env1 = env('envF', true);
  // the amp envelope's DELAY works only with LOOP on
  const env2 = env('envA', false);
  const egOct = EG_OCT * (num(v, 'vcf.egAmt') / 5);
  const fVel = num(v, 'envF.velAmt') / 10;
  const aVel = num(v, 'envA.velAmt') / 10;
  const fLatch = !!v['envF.latch'];
  const aLatch = !!v['envA.latch'];
  // LATCH ON holds the filter envelope at its sustain: a steady lift of the cutoff
  const cutoff = cutoffHz(num(v, 'vcf.cutoff')) * (fLatch ? Math.pow(2, egOct * env1.s) : 1);
  const envAmt = fLatch ? 0 : egOct * (1 - fVel);
  if (!fLatch && fVel > 0 && egOct !== 0)
    routes.push({ src: 'env1', dst: 'cutoff', amt: egOct * fVel, by: 'vel' });
  if (!aLatch && aVel > 0) {
    routes.push({ src: 'env2', dst: 'amp', amt: -aVel });
    routes.push({ src: 'env2', dst: 'amp', amt: aVel, by: 'vel' });
  }
  bus(1);
  bus(2);

  // the resonance self-oscillates past 7
  const res = num(v, 'vcf.resonance');
  const drive = num(v, 'drive.amount') / 10;
  const slope = Number(v['vcf.slope']);
  const poles = slope === -6 ? 1 : slope === -12 ? 2 : slope === -18 ? 3 : 4;

  // the arpeggiator: PATTERN at SEQ or REC leaves it off (the app's sequencer plays sequences)
  const pattern = String(v['arp.pattern']);
  const arpMode = ARP_MODE[pattern];
  const arpOn = !!v['arp.on'] && !!arpMode;
  const range = Number(v['arp.range']) || 0;
  const div = ARP_DIVS.find(([d]) => d === v['arp.clockDiv']) ?? ARP_DIVS[3];
  const mode = v['arp.backForth'] ? (arpMode === 'down' ? 'downup' : 'updown') : (arpMode ?? 'up');

  const lfo = (n: 1 | 2) => ({
    rate: lfoHz(num(v, `lfo${n}.rate`)) * (v[`lfo${n}.hiRange`] ? 10 : 1),
    mix: LFO_MIX[String(v[`mod${n}.source`])] ?? LFO_MIX.triangle,
    keySync: !!v[`lfo${n}.kbReset`],
  });

  return {
    osc: [osc1, osc2, sub],
    noise: { level: ch('noise'), color: 'pink' },
    // FDBK: the mixer's own output, back into it
    ext: { level: ch('fbext') > 0 ? (ch('fbext') / MIX_MAX) * FB_MAX : 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff,
      res: res <= 7 ? res / 7 : 1 + ((res - 7) / 3) * 0.1,
      envAmt,
      envSrc: 'env1',
      kbd: num(v, 'vcf.kbTrack') / 5,
      drive:
        0.8 + OVER * (over('osc1') + over('sub') + over('osc2') + over('noise') + over('fbext')),
      poles,
    },
    env1,
    env2,
    vca: aLatch ? { envSrc: 'none', bias: env2.s } : { envSrc: 'env2', bias: 0 },
    lfo: lfo(1),
    lfo2: lfo(2),
    glide: {
      time: v['glide.on'] ? glideTime(num(v, 'glide.time')) : 0,
      legato: !!v['glide.legato'],
    },
    trig: { retrig: !!v['envF.multiTrig'] || !!v['envA.multiTrig'], drone: false, repeat: false },
    duo: duo && !drone,
    paraphonic: duo && !drone,
    note2Osc: kbCtrl === 'lo' ? 0 : 1,
    routes,
    normals: { extIn: 'mixer' },
    od:
      drive > 0 ? { on: true, drive: 0.2 + 0.45 * drive, tone: 0.55, level: 0.95 } : { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    poly: { voices: 1, stack: 1, mono: true },
    arp: {
      on: arpOn,
      // the engine steps in sixteenths: a note of ARP CLOCK DIV plays at the tempo that makes a sixteenth that long
      bpm: arpBpm(num(v, 'arp.rate')) / (4 * div[1]),
      gate: Math.max(0.05, num(v, 'arp.gateLen') / 100),
      mode,
      octaves: Math.abs(range) + 1,
      hold: !!v['arp.latch'],
    },
    // a range below the keys: the arpeggio climbs from that many octaves down
    tune:
      num(v, 'osc.fineTune') / 100 +
      num(v, 'kbd.transpose') +
      (arpOn && range < 0 ? 12 * range : 0),
    volume: v['out.mute'] ? 0 : level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const sub37: SynthDef & { version: number } = {
  id: 'sub-37',
  version: 1,
  name: 'Sub 37',
  maker: 'Moog',
  year: 2014,
  heritage:
    'A development of the 2013 Sub Phatty, with duo mode, a second mod bus, looping envelopes and a sequencer',
  summary:
    'Two oscillators of continuously variable shape, a square sub oscillator, pink noise and a feedback channel → the Moog ladder filter at 6 to 24 dB an octave → MultiDrive → the VCA. Two looping DAHDSR envelopes, two mod buses each with its own LFO, duo mode, glide and an arpeggiator.',
  view: { w: (1898 - 105) * 2 + 2 * CHEEK, h: Q(550) },
  theme: {
    panel: '#1d1e20',
    panel2: '#141516',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'wood',
    cheekW: CHEEK,
    bezel: true,
    button: 'black',
  },
  signalNames: {
    osc1: 'Oscillator 1',
    osc2: 'Oscillator 2',
    osc3: 'the sub oscillator',
    env1: 'the filter envelope',
    env2: 'the amp envelope',
    lfo: 'LFO 1',
    lfo2: 'LFO 2',
    mixer: 'the mixer',
    vcf1: 'the ladder filter',
    od: 'MultiDrive',
  },
  destNames: { extIn: 'the feedback channel' },
  seqButtons,
  decor,
  areas,
  controls,
  jacks,
  init,
  // no Default patch: init is already Osc 1's sawtooth alone at 8′ through the open filter, with no resonance and no
  // envelope sweep, the loudness a gate with a short release, and the mod buses at rest
  toEngine,
};

export default sub37;
