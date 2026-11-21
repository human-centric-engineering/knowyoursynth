/**
 * Oberheim TEO-5: the definition (D1). Positions are measured on the owner's 1200 × 675 photo of the keyboard, from
 * above (`.context/app/synth-data/teo-5/raw/teo-5.jpg`, local only), and written in view units of half a photo pixel,
 * from photo (22, 36): view x = (photo x − 22) × 2, y = (photo y − 36) × 2. The view is the faceplate between the end
 * cheeks, down to the row of program buttons; the keys are left out. The pitch and mod wheels sit on the faceplate, so
 * they are drawn, as artwork: the page's keyboard has the wheels the app plays with. The owner's spec is
 * `.context/app/synth-data/teo-5/teo-5.synth.json` (the TEO-5 User Guide and MIDI implementation). There is no manual
 * in `raw/`; the spec is the source for everything the photo does not show.
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), following `defs/take-5.ts`: the TEO-5 is
 * built on the Take 5's platform (Oberheim, with Sequential), and shares its layout of sections, its ENV ROUTING, its
 * global LFO 1 and per-voice LFO 2, its overdrive, effects and plate reverb, and its menus. Five voices, each two
 * oscillators with any mix of triangle, sawtooth and pulse, a sub from Oscillator 1 and white or pink noise → a 12 dB
 * state-variable filter whose STATE sweeps low-pass, notch and high-pass → the VCA. No content (sounds, lineage,
 * unusual notes), a `version`, the maker's mark tagged `brand` (the TEO-5 lettering), and panel values read through
 * `num()`.
 *
 * The settings with no knob of their own (the mixer levels, held with a button and set with VALUE on the hardware; the
 * LFO and Envelope 1 destinations; the envelopes' delay and repeat; key tracking; unison) are rows on the display,
 * whose pages the PROGRAM button steps through. The 16-slot mod matrix, the program memory, LOW SPLIT, the clock sync
 * and the arpeggiator's repeats are drawn and explained but not modelled.
 *
 * The guide gives no envelope or LFO curves, cutoff range or effect parameter ranges (`not_in_source`): every curve
 * below is the app's estimate, the Take 5's where the two share a control. X-MOD is through-zero FM on the hardware;
 * the engine has none, so here it is Oscillator 2's triangle moving Oscillator 1's pitch exponentially. The effects run
 * on the DeepMind's effects engine (`audio/dm-fx.ts`): slot 1 the chosen effect, slot 2 the plate reverb. The ring
 * modulator runs on the engine's ring modulator on the voice sum.
 */
import type {
  ArpMode,
  Area,
  ButtonControl,
  Control,
  ControlOption,
  ControlValues,
  Decor,
  EngineParams,
  EngineRoute,
  EnvParams,
  FilterParams,
  FxSlot,
  KnobControl,
  KnobScale,
  LfoMix,
  MenuControl,
  OscMix,
  OscParams,
  SeqButton,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { FX_ALGOS } from '@/lib/app/synths/defs/deepmind-12d-fx';
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

type KnobRest = OmitEach<KnobControl, 'id' | 'type' | 'x' | 'y' | 'r' | 'style' | 'labelPos'>;
type ButtonRest = Pick<ButtonControl, 'label' | 'name' | 'help'> &
  Partial<Pick<ButtonControl, 'ui' | 'module' | 'lamp' | 'show' | 'lit'>> &
  ({ kind?: 'bool'; def?: boolean } | { kind: 'enum'; options: ControlOption[]; def: string });
type MenuRest = OmitEach<
  MenuControl,
  'id' | 'type' | 'x' | 'y' | 'w' | 'h' | 'size' | 'vw' | 'show' | 'label' | 'labelPos'
>;
type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'spacing' | 'brand' | 'anchor'>>;

/** Photo pixels to view units: half a photo pixel each, from the faceplate's top-left corner. */
const X = (x: number): number => (x - 22) * 2;
const Y = (y: number): number => (y - 36) * 2;
const INK = '#e4e6ea';
const STRIPE = '#1f80b0';
const SLOT = '#0b0c0e';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The guide gives the LFO range (0.022–500 Hz), the oscillators' range and the detune; it gives no envelope times, cutoff
// range or glide times (`not_in_source`), so these are the Take 5's estimates, the voice the TEO-5 is built on.
const ENV_PTS: CurvePoint[] = [
  [0, 0.001],
  [2.5, 0.03],
  [5, 0.3],
  [7.5, 2.5],
  [10, 20],
];
const envTime = (v: number): number => pwl(v, ENV_PTS, true);
const lfoHz = (v: number): number => expMap(v / 10, 0.022, 500);
const vcfHz = (v: number): number => expMap(v / 10, 20, 18000);
const glideTime = (v: number): number => 4 * Math.pow(v / 10, 2);
const pct = (v: number): string => `${Math.round(v * 10)} %`;
const signed = (v: number): string =>
  Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;
/** FREQUENCY: 63 semitone steps, 5 octaves and a minor third. The guide does not say where the key's own pitch is; here it is step 24. */
const FREQ_HOME = 24;
/** OSC 2 DETUNE at either end: the guide's ±49.2 cents. */
const DETUNE_CENTS = 49.2;
/** ENV AMOUNT at ±5 on the cutoff: octaves (reasoned). */
const ENV_CUT_OCT = 7;
/** X-MOD at full: semitones of Oscillator 2's triangle on Oscillator 1's pitch, squared (reasoned). */
const XMOD_ST = 24;
/** Each mixer channel's level at full. */
const MIX_LEVEL = 0.6;

const controls: Control[] = [];
const decor: Decor[] = [];
const seqButtons: Record<string, SeqButton> = {};

// ── Drawing helpers ───────────────────────────────────────────────────────
const text = (x: number, y: number, t: string, size = 14, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y),
    text: t,
    size,
    anchor: 'middle',
    weight: 600,
    ...rest,
  });
};
/** Text centred on y (the renderer places text by its baseline). */
const label = (x: number, y: number, t: string, size = 14, rest: TextRest = {}): void =>
  text(x, y + size * 0.18, t, size, rest);
const line = (x1: number, y1: number, x2: number, y2: number, w = 2, stroke?: string): void => {
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
const led = (x: number, y: number, litWhen: Extract<Decor, { t: 'led' }>['litWhen']): void => {
  decor.push({ t: 'led', x: X(x), y: Y(y), r: 5, color: 'red', litWhen });
};

/** A black knob; `lab` is its printed name at photo row `ly` (null: none, or drawn separately). */
const knob = (
  id: string,
  x: number,
  y: number,
  lab: string | null,
  ly: number,
  rest: KnobRest,
  r = 24
): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r,
    style: 'obxa',
    labelPos: 'none',
    ...rest,
  });
  if (lab) label(x, ly, lab);
};
/** A rectangular button with a red lamp; `lab` is its printed name at photo row `ly`. */
const btn = (
  id: string,
  x: number,
  y: number,
  lab: string | null,
  ly: number,
  rest: ButtonRest,
  w = 28,
  h = 24
): void => {
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w,
    h,
    kind: 'bool',
    def: false,
    module: 'mode',
    labelPos: 'none',
    lamp: 'red',
    ...rest,
  });
  if (lab) label(x, ly, lab);
};
const WIDE = 42;
const NOT_HERE = 'Not modelled here.';
/** The printed ring and its − and + on a knob that works either way from the centre. */
const bipolar = (x: number, y: number, r = 30): void => {
  decor.push({ t: 'arc', x: X(x), y: Y(y), r, a0: -140, a1: 140, w: 1.6 });
  label(x - 15, y + 13, '−', 12);
  label(x + 15, y + 13, '+', 12);
};

// ── Faceplate artwork ─────────────────────────────────────────────────────
// The Oberheim pinstripes: blue rules across each section, broken between them.
const TOP_ROWS = [55, 65, 74.5, 84.5, 94, 104, 113, 122.5, 132.5, 142, 152];
const TOP_SECTIONS: [number, number][] = [
  [30, 81],
  [91, 224],
  [234, 368],
  [377, 421],
  [611, 707],
  [717, 815],
  [824, 867],
  [876, 1167],
];
TOP_SECTIONS.forEach(([x0, x1]) =>
  TOP_ROWS.forEach((y) => {
    // the REVERB heading sits in a gap in the effect section's rules
    if (x0 === 876 && y === 113) return;
    line(x0, y, x1, y, 2.4, STRIPE);
  })
);
const BOTTOM_ROWS = [180, 190, 199.5, 209, 219, 228, 238, 247.5, 257.5, 267, 276, 285.5];
[
  [30, 271],
  [279, 499],
  [504, 546],
  [552, 776],
  [782, 1167],
].forEach(([x0, x1]) => BOTTOM_ROWS.forEach((y) => line(x0, y, x1, y, 2.4, STRIPE)));
[305, 314.5, 324, 333].forEach((y) => {
  line(30, y, 47, y, 2.4, STRIPE);
  line(154, y, 1167, y, 2.4, STRIPE);
});
line(24, 160.5, 1169, 160.5, 3, STRIPE);
line(24, 292, 1169, 292, 3, STRIPE);

const SECTIONS: [number, number, string][] = [
  [55, 48, 'MASTER'],
  [157, 48, 'LFO 1: MONO'],
  [300, 48, 'LFO 2: POLY'],
  [399, 48, 'MOD'],
  [454, 48, 'SETTINGS'],
  [577.5, 48, 'MEMORY'],
  [659, 48, 'CLOCK'],
  [765, 48, 'ARPEGGIATOR'],
  [845, 48, 'SEQ'],
  [1015, 48, 'EFFECT'],
  [1015, 115, 'REVERB'],
  [70, 172.5, 'PITCH'],
  [130, 172.5, 'MOD'],
  [391, 172.5, 'OSCILLATORS'],
  [526, 172.5, 'OSC MOD'],
  [664, 172.5, 'FILTER'],
  [975, 172.5, 'ENVELOPES'],
];
SECTIONS.forEach(([x, y, t]) => label(x, y, t, 19, { weight: 600 }));

// the pitch and mod wheels, drawn: the page's keyboard has the wheels the app plays
[70, 131].forEach((x) => {
  decor.push({ t: 'rect', x: X(x - 15), y: Y(193), w: 60, h: 226, r: 4, fill: SLOT });
  decor.push({
    t: 'rect',
    x: X(x - 11),
    y: Y(197),
    w: 44,
    h: 218,
    r: 10,
    fill: '#1c1d20',
    stroke: '#2c2e33',
    sw: 2,
  });
});
// the model name, printed in outline letters
text(100, 333, 'TEO-5', 50, { weight: 500, spacing: 2, brand: true });

// ── Master ────────────────────────────────────────────────────────────────
knob('out.volume', 51, 76, 'VOLUME', 99, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  module: 'out',
  label: 'VOLUME',
  fmt: pct,
  help: 'The level at the outputs and the headphone socket. It is not saved with a sound.',
});
knob('drive.amount', 51, 136, 'OVERDRIVE', 156, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'fx',
  label: 'OVERDRIVE',
  fmt: (v) => (v <= 0 ? 'off' : pct(v)),
  help: 'Analogue overdrive on the summed voices, before the effect and the reverb. A little thickens the sound; turned up it growls and then fuzzes. Here it drives each voice on its own, after its filter, so a chord’s notes do not distort against each other.',
});

// ── LFOs ──────────────────────────────────────────────────────────────────
const LFO_SHAPES: ControlOption[] = [
  { v: 'tri', label: 'Triangle' },
  { v: 'saw', label: 'Sawtooth' },
  { v: 'rsaw', label: 'Reverse sawtooth' },
  { v: 'sq', label: 'Square' },
  { v: 'sh', label: 'Sample and hold' },
];
const SHAPE_DX = [0, 22.5, 47, 70.5, 94.5];
const SHAPE_GLYPH: (WaveShape | null)[] = ['tri', 'saw', 'rsaw', 'sq', null];
/** What an LFO or Envelope 1 (as Aux) can be set to here: the spec's destination list, cut to what the engine can move. */
const DESTS: ControlOption[] = [
  { v: 'none', label: 'No Dest' },
  { v: 'osc-all', label: 'Osc All Freq' },
  { v: 'osc1', label: 'Osc 1 Freq' },
  { v: 'osc2', label: 'Osc 2 Freq' },
  { v: 'pw-all', label: 'Osc All PW' },
  { v: 'cutoff', label: 'Cutoff' },
  { v: 'res', label: 'Resonance' },
];
const DEST_HELP =
  'Osc All Freq, Osc 1 Freq and Osc 2 Freq move pitch (vibrato and trills), Osc All PW the pulse width of both oscillators, Cutoff the filter (wah) and Resonance its emphasis. The hardware lists 62 destinations; here the seven an LFO is most used for.';
[1, 2].forEach((n) => {
  const lfo = `LFO ${n}`;
  const dx = n === 1 ? 0 : 143;
  btn(`lfo${n}.sync`, 129 + dx, 70, null, 0, {
    label: 'SYNC',
    name: `${lfo} SYNC`,
    module: 'lfo',
    ui: true,
    help: `Locks ${lfo}’s speed to the clock, and FREQ then picks a note value. ${NOT_HERE} FREQ always sets a free speed.`,
  });
  label(109 + dx, 70, 'SYNC', 12, { weight: 500 });
  btn(`lfo${n}.destKey`, 185.5 + dx, 70, null, 0, {
    label: 'DEST',
    name: `${lfo} DEST`,
    module: 'lfo',
    ui: true,
    help: `Shows ${lfo}’s destination on the display, to change with VALUE; on the hardware, hold it and move a knob to choose that knob. Here the destination is a row on the display’s first page.`,
  });
  label(200 + dx, 70, 'DEST', 12, { weight: 500 });
  controls.push({
    id: `lfo${n}.shape`,
    type: 'select',
    x: X(110 + dx),
    y: Y(99),
    w: 26,
    h: 22,
    lamp: 'red',
    kind: 'enum',
    def: 'tri',
    options: LFO_SHAPES.map((o, i) => ({ ...o, x: X(110 + dx + SHAPE_DX[i]), y: Y(99) })),
    module: 'lfo',
    label: 'SHAPE',
    name: `${lfo} SHAPE`,
    labelPos: 'none',
    help: `${lfo}’s wave, one button each: triangle, sawtooth, reverse sawtooth, square, or sample and hold (a new random level each cycle).`,
  });
  SHAPE_GLYPH.forEach((g, i) => {
    if (g)
      decor.push({
        t: 'wave',
        x: X(110 + dx + SHAPE_DX[i]),
        y: Y(117.5),
        size: 10,
        shape: g,
        w: 1.6,
      });
    else label(110 + dx + SHAPE_DX[i], 117.5, 'S/H', 11, { weight: 500 });
  });
  knob(`lfo${n}.freq`, 127.5 + dx, 136, 'FREQ', 156, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    module: 'lfo',
    label: 'FREQ',
    name: `${lfo} FREQ`,
    fmt: (v) => fmtHz(lfoHz(v)),
    help: `How fast ${lfo} cycles, from one cycle every 45 seconds up to 500 a second, fast enough to be heard as a tone.`,
  });
  knob(`lfo${n}.amt`, 186 + dx, 136, 'AMOUNT', 156, {
    kind: 'cont',
    min: -5,
    max: 5,
    def: 0,
    module: 'lfo',
    label: 'AMOUNT',
    name: `${lfo} AMOUNT`,
    fmt: signed,
    help: `How far ${lfo} moves its destination, either way from the centre. Left of 0 turns the wave upside down.`,
  });
  bipolar(186 + dx, 136);
});

// ── Mod matrix ────────────────────────────────────────────────────────────
btn('mod.src', 398, 79, 'SOURCE', 98, {
  label: 'SOURCE',
  name: 'MOD SOURCE',
  module: 'mod',
  ui: true,
  help: `Shows the 16-slot mod matrix on the display, and held while you move a control (or play keys), makes that the source of the slot being set up. ${NOT_HERE} The matrix is left empty.`,
});
btn('mod.dest', 398, 137, 'DESTINATION', 156, {
  label: 'DESTINATION',
  name: 'MOD DESTINATION',
  module: 'mod',
  ui: true,
  help: `Held while you move a knob, makes that knob the destination of the mod slot being set up. ${NOT_HERE} The matrix is left empty.`,
});

// ── Settings, display and memory ──────────────────────────────────────────
btn('ui.global', 454, 69.5, 'GLOBAL', 84, {
  label: 'GLOBAL',
  ui: true,
  help: `Opens the global settings: tuning, MIDI, pedals, velocity and pressure curves, the clock. ${NOT_HERE}`,
});
const PAGES: [string, string][] = [
  ['dest', 'DESTINATIONS'],
  ['mixer', 'MIXER LEVELS'],
  ['osc', 'OSCILLATORS'],
  ['filter', 'FILTER'],
  ['env', 'ENVELOPES'],
  ['voice', 'UNISON'],
];
btn('ui.page', 454, 105, 'PROGRAM', 120, {
  kind: 'enum',
  def: 'dest',
  options: PAGES.map(([v, t]) => ({ v, label: t })),
  lit: 'always',
  label: 'PROGRAM',
  ui: true,
  help: 'Opens the settings saved with each sound that have no knob of their own. Here it steps through the display’s pages: the destinations, the mixer levels, the oscillators’ and filter’s settings, the envelopes’ delay and repeat, and unison.',
});
const LCD = { x0: 480.5, y0: 62.5, x1: 551, y1: 115 };
decor.push({
  t: 'rect',
  x: X(LCD.x0 - 3),
  y: Y(LCD.y0 - 3),
  w: (LCD.x1 - LCD.x0 + 6) * 2,
  h: (LCD.y1 - LCD.y0 + 6) * 2,
  r: 3,
  fill: '#050607',
  stroke: '#25272b',
  sw: 2,
});
decor.push({
  t: 'lcd',
  x: X(LCD.x0),
  y: Y(LCD.y0),
  w: (LCD.x1 - LCD.x0) * 2,
  h: (LCD.y1 - LCD.y0) * 2,
  page: 'ui.page',
  titles: Object.fromEntries(PAGES),
  titleH: 20,
});
const rows: Record<string, number> = {};
const menu = (page: string, id: string, lab: string, rest: MenuRest): void => {
  const i = (rows[page] = (rows[page] || 0) + 1) - 1;
  controls.push({
    id,
    type: 'menu',
    x: X((LCD.x0 + LCD.x1) / 2),
    y: Y(LCD.y0) + 30 + i * 20,
    w: (LCD.x1 - LCD.x0) * 2 - 8,
    h: 19,
    size: 10,
    vw: 62,
    show: { id: 'ui.page', eq: page },
    label: lab,
    labelPos: 'none',
    deep: true,
    ...rest,
  });
};
const onOff: ControlOption[] = [
  { v: 'off', label: 'Off' },
  { v: 'on', label: 'On' },
];
const tenths = (def: number, fmt: (v: number) => string = pct) => ({
  kind: 'cont' as const,
  min: 0,
  max: 10,
  def,
  fmt,
});

// Destinations (LFO 1 and 2 DEST; Env 1 Dest in the PROGRAM menu)
menu('dest', 'lfo1.dest', 'LFO 1', {
  kind: 'enum',
  def: 'osc-all',
  options: DESTS,
  module: 'lfo',
  name: 'LFO 1 DEST',
  help: `What LFO 1 moves, chosen with its DEST button on the hardware. ${DEST_HELP}`,
});
menu('dest', 'lfo2.dest', 'LFO 2', {
  kind: 'enum',
  def: 'cutoff',
  options: DESTS,
  module: 'lfo',
  name: 'LFO 2 DEST',
  help: `What LFO 2 moves, chosen with its DEST button on the hardware. ${DEST_HELP}`,
});
menu('dest', 'env1.dest', 'ENV 1', {
  kind: 'enum',
  def: 'none',
  options: DESTS,
  module: 'env',
  name: 'ENV 1 DEST',
  help: `What Envelope 1 moves while ENV ROUTING sets it to Aux; with Filter it does nothing. ${DEST_HELP}`,
});
// Mixer levels (hold a mixer button and turn VALUE)
(
  [
    ['mix.osc1Lvl', 'OSC 1', 'Oscillator 1'],
    ['mix.subLvl', 'SUB', 'the sub-oscillator'],
    ['mix.osc2Lvl', 'OSC 2', 'Oscillator 2'],
    ['mix.noiseLvl', 'NOISE', 'the noise'],
  ] as const
).forEach(([id, lab, what]) =>
  menu('mixer', id, lab, {
    ...tenths(10),
    module: 'mixer',
    name: `${lab} level`,
    help: `The level of ${what} into the filter, while its mixer button is on. On the hardware hold the button and turn VALUE; turning a channel on sets it to full.`,
  })
);
// Oscillators
menu('osc', 'osc1.key', 'OSC 1 KEY', {
  kind: 'enum',
  def: 'on',
  options: onOff,
  module: 'osc',
  name: 'Osc 1 Key On',
  help: 'Whether Oscillator 1 (and the sub with it) follows the keyboard. Off, it holds one pitch, set by FREQUENCY 1, whatever key is played: a drone, or a fixed tone to sync or modulate against.',
});
menu('osc', 'osc2.key', 'OSC 2 KEY', {
  kind: 'enum',
  def: 'on',
  options: onOff,
  module: 'osc',
  name: 'Osc 2 Key On',
  help: 'Whether Oscillator 2 follows the keyboard. Off, it holds one pitch, set by FREQUENCY 2.',
});
menu('osc', 'osc2.bypass', 'OSC 2 BYP', {
  kind: 'enum',
  def: 'off',
  options: onOff,
  module: 'osc',
  name: 'Osc 2 Filter Bypass',
  help: 'Sends Oscillator 2 past the filter, straight to the VCA, so it stays bright however the filter is set while Oscillator 1 is filtered.',
});
menu('osc', 'noise.type', 'NOISE', {
  kind: 'enum',
  def: 'white',
  options: [
    { v: 'white', label: 'White' },
    { v: 'pink', label: 'Pink' },
  ],
  module: 'mixer',
  name: 'Noise type',
  help: 'White noise, bright and hissing, or pink, darker and rumbling.',
});
// Filter
menu('filter', 'vcf.key', 'KEY AMT', {
  ...tenths(5),
  module: 'filter',
  name: 'Filter Key Amt',
  help: 'How far the cutoff follows the keyboard: at full it rises an octave for each octave up, so high notes stay as bright as low ones.',
});
menu('filter', 'vcf.bp', 'BANDPASS', {
  kind: 'enum',
  def: 'off',
  options: onOff,
  module: 'filter',
  name: 'Filter Bandpass',
  help: 'Puts a band-pass in the middle of STATE in place of the notch, and lights bp. Here STATE then steps: low-pass in its first third, band-pass in the middle third, high-pass in the last.',
});
// Envelopes
menu('env', 'env1.delay', 'ENV 1 DLY', {
  ...tenths(0, (v) => (v <= 0 ? 'off' : fmtTime(envTime(v)))),
  module: 'env',
  name: 'ENV 1 Delay',
  help: 'A wait between the key going down and Envelope 1’s attack starting.',
});
menu('env', 'env2.delay', 'ENV 2 DLY', {
  ...tenths(0, (v) => (v <= 0 ? 'off' : fmtTime(envTime(v)))),
  module: 'env',
  name: 'ENV 2 Delay',
  help: 'A wait between the key going down and Envelope 2’s attack starting.',
});
menu('env', 'env.repeat', 'REPEAT', {
  kind: 'enum',
  def: 'off',
  options: [
    { v: 'off', label: 'Off' },
    { v: 'env1', label: 'Env 1' },
    { v: 'env2', label: 'Env 2' },
    { v: 'both', label: 'Env 1+2' },
  ],
  module: 'env',
  name: 'Env Repeat',
  help: 'Loops an envelope while the key is held: it rises over its attack, falls over its decay and starts again, a rhythmic pulse from one held key.',
});
// Unison
menu('voice', 'voice.uniVoices', 'VOICES', {
  kind: 'enum',
  def: '5',
  options: ['1', '2', '3', '4', '5'].map((v) => ({ v, label: v })),
  module: 'osc',
  name: 'Unison voices',
  help: 'How many voices UNISON stacks on one note, one to five. On the hardware hold UNISON and turn VALUE.',
});
menu('voice', 'voice.uniDetune', 'DETUNE', {
  kind: 'enum',
  def: '2',
  options: ['0', '1', '2', '3', '4', '5', '6', '7'].map((v) => ({ v, label: v })),
  module: 'osc',
  name: 'Unison detune',
  help: 'How far apart the stacked voices are tuned in UNISON, 0 to 7: a little thickens the note, more makes it swirl.',
});

knob('ui.select', 481, 134, 'SELECT', 156, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'mode',
  label: 'SELECT',
  ui: true,
  help: `Scrolls through the menus and the mod matrix slots. ${NOT_HERE} PROGRAM steps the display’s pages.`,
});
knob('ui.value', 550, 134, 'VALUE', 156, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'mode',
  label: 'VALUE',
  ui: true,
  help: 'Changes the value on the display, and chooses programs. Here a row of the display is changed by clicking it.',
});
btn('ui.compare', 577.5, 69.5, 'COMPARE', 84, {
  label: 'COMPARE',
  ui: true,
  help: `Plays the sound as it was saved, to compare with your edits. ${NOT_HERE}`,
});
btn('ui.write', 577.5, 105, 'WRITE', 120, {
  label: 'WRITE',
  ui: true,
  help: `Saves the sound into one of the 256 user programs; in sequencer recording, enters a tie. ${NOT_HERE}`,
});

// ── Clock ─────────────────────────────────────────────────────────────────
const DIVS: { v: string; beats: number }[] = [
  { v: '1/2', beats: 2 },
  { v: '1/4', beats: 1 },
  { v: '1/8', beats: 0.5 },
  { v: '1/8T', beats: 1 / 3 },
  { v: '1/16', beats: 0.25 },
  { v: '1/16T', beats: 1 / 6 },
  { v: '1/32', beats: 0.125 },
  { v: '1/64', beats: 0.0625 },
];
knob('clock.bpm', 632.5, 75, 'BPM', 98, {
  kind: 'cont',
  min: 30,
  max: 250,
  def: 120,
  step: 1,
  module: 'mode',
  label: 'BPM',
  fmt: (v) => `${Math.round(v)} BPM`,
  help: 'The tempo of the arpeggiator and the sequencer, 30 to 250 beats a minute. Each sound starts at its own riff’s tempo.',
});
knob('clock.div', 687.5, 75, 'CLK DIVIDE', 98, {
  kind: 'enum',
  def: '1/16',
  options: DIVS.map((d) => ({ v: d.v, label: '' })),
  fmt: (v) => String(v),
  module: 'mode',
  label: 'CLK DIVIDE',
  help: 'The note value of each arpeggiator step against the BPM: from half notes down to 64ths, with triplets.',
});
btn(
  'clock.tap',
  660,
  137,
  'TAP TEMPO',
  156,
  {
    label: 'TAP TEMPO',
    ui: true,
    help: `Tap it four times in time to set the BPM; its lamp flashes on the beat. ${NOT_HERE} Turn BPM instead.`,
  },
  WIDE
);

// ── Arpeggiator ───────────────────────────────────────────────────────────
btn('arp.on', 739, 79, 'ON', 98, {
  label: 'ON',
  name: 'ARPEGGIATOR ON',
  help: 'Turns the arpeggiator on: held keys play one at a time, in the order MODE sets, at the clock’s speed.',
});
knob('arp.octave', 792.5, 75, 'OCTAVE', 98, {
  kind: 'enum',
  def: '1',
  options: ['1', '2', '3'].map((v) => ({ v, label: '' })),
  fmt: (v) => `${v} octave${v === '1' ? '' : 's'}`,
  module: 'mode',
  label: 'OCTAVE',
  name: 'Arpeggiator OCTAVE',
  help: 'How many octaves the arpeggio climbs through: the held notes, then the same an octave up, and so on. The lamps show which.',
});
const ARP_MODES: ControlOption[] = ['up', 'down', 'updown', 'random', 'assign'].map((v) => ({
  v,
  label: '',
}));
const ARP_ENGINE: Record<string, ArpMode> = {
  up: 'up',
  down: 'down',
  updown: 'updown',
  random: 'random',
  assign: 'played',
};
const ARP_NAMES: Record<string, string> = {
  up: 'Up',
  down: 'Down',
  updown: 'Up+Down',
  random: 'Random',
  assign: 'Assign',
};
knob('arp.mode', 740, 134, 'MODE', 156, {
  kind: 'enum',
  def: 'up',
  options: ARP_MODES,
  fmt: (v) => ARP_NAMES[String(v)] ?? String(v),
  module: 'mode',
  label: 'MODE',
  name: 'Arpeggiator MODE',
  help: 'The order of the arpeggio: up, down, up and down, random, or Assign, the order the keys were pressed.',
});
knob('arp.repeat', 795, 134, 'REPEAT', 156, {
  kind: 'enum',
  def: '0',
  options: ['0', '1', '2', '3'].map((v) => ({ v, label: '' })),
  fmt: (v) => (v === '0' ? 'off' : `×${Number(v) + 1}`),
  module: 'mode',
  label: 'REPEAT',
  name: 'Arpeggiator REPEAT',
  ui: true,
  help: `Plays each note of the arpeggio one to three extra times before moving on; the lamps show how many. ${NOT_HERE}`,
});
(
  [
    ['arp.octave', 69],
    ['arp.repeat', 126],
  ] as const
).forEach(([id, y0]) =>
  ['3', '2', '1'].forEach((v, i) => {
    led(770, y0 + i * 10, { id, eq: v });
    label(762.5, y0 + i * 10, v, 11, { weight: 500 });
  })
);

// ── Sequencer ─────────────────────────────────────────────────────────────
btn(
  'seq.record',
  846,
  79,
  'RECORD',
  98,
  {
    label: 'RECORD',
    ui: true,
    help: 'Records a sequence of up to 64 steps, one note or chord per step, with rests (PROGRAM) and ties (WRITE). Here it turns on the sequencer’s step record.',
  },
  WIDE
);
seqButtons['seq.record'] = 'record';
btn(
  'seq.play',
  846,
  137,
  'PLAY',
  156,
  {
    label: 'PLAY',
    ui: true,
    help: 'Starts and stops the sequence saved with the sound. Here it starts and stops the sequencer under the panel.',
  },
  WIDE
);
seqButtons['seq.play'] = 'run';

// ── Effect ────────────────────────────────────────────────────────────────
const FX_TYPES: { v: string; name: string }[] = [
  { v: 'delay', name: 'Stereo delay' },
  { v: 'bbd', name: 'BBD delay' },
  { v: 'tape1', name: 'Tape delay 1' },
  { v: 'tape2', name: 'Tape delay 2' },
  { v: 'chorus', name: 'Chorus' },
  { v: 'flanger', name: 'Flanger' },
  { v: 'phaser', name: 'Phaser' },
  { v: 'hpf', name: 'High-pass filter' },
  { v: 'dist', name: 'Distortion' },
  { v: 'ring', name: 'Ring mod' },
  { v: 'rotary', name: 'Rotating speaker' },
  { v: 'lofi', name: 'Lo-fi' },
];
const FX_NAME: Record<string, string> = Object.fromEntries(FX_TYPES.map((f) => [f.v, f.name]));
btn('fx.on', 892.5, 79, 'ON', 98, {
  label: 'ON',
  name: 'EFFECT ON',
  module: 'fx',
  help: 'Turns the effect on.',
});
knob('fx.type', 939, 75, 'TYPE', 98, {
  kind: 'enum',
  def: 'bbd',
  options: FX_TYPES.map((f) => ({ v: f.v, label: '' })),
  fmt: (v) => FX_NAME[String(v)] ?? String(v),
  module: 'fx',
  label: 'TYPE',
  name: 'Effect TYPE',
  help: 'Chooses the effect: a stereo, bucket-brigade (BBD) or tape delay, chorus, flanger, phaser, high-pass filter, distortion, ring modulator, rotating speaker or lo-fi. The three knobs to its right change job with it.',
});
knob('fx.time', 992.5, 75, 'TIME', 98, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'fx',
  label: 'TIME',
  name: 'Effect TIME',
  fmt: pct,
  help: 'The effect’s main setting: the delay time, the speed of a chorus, flanger, phaser or rotor, the filter’s frequency, the distortion’s gain, the ring modulator’s carrier, or the lo-fi’s sample rate.',
});
knob('fx.mix', 1045, 75, 'DEPTH/MIX', 98, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 3,
  module: 'fx',
  label: 'DEPTH/MIX',
  name: 'Effect DEPTH/MIX',
  fmt: pct,
  help: 'How much of the effect you hear against the dry sound, or how deep a chorus, flanger or phaser sweeps.',
});
knob('fx.misc', 1099, 75, 'FBACK/MISC', 98, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'fx',
  label: 'FBACK/MISC',
  name: 'Effect FBACK/MISC',
  fmt: pct,
  help: 'The effect’s second setting: the repeats of a delay, a flanger’s feedback, a phaser’s or the filter’s resonance, a chorus’s or the distortion’s tone, the rotating speaker’s distance, or the lo-fi’s bit depth. On the ring modulator it is pitch tracking, which is not modelled here.',
});
btn(
  'fx.sync',
  1146,
  79,
  'CLK SYNC',
  98,
  {
    label: 'CLK SYNC',
    name: 'Effect CLK SYNC',
    module: 'fx',
    ui: true,
    help: `Locks a delay’s time to the clock, as a note value. ${NOT_HERE} TIME always sets a free time.`,
  },
  22,
  20
);

// ── Reverb ────────────────────────────────────────────────────────────────
btn('rev.on', 892.5, 137, 'ON', 156, {
  label: 'ON',
  name: 'REVERB ON',
  module: 'fx',
  help: 'Turns the plate reverb on.',
});
const REVERB: [string, number, string, number, string][] = [
  ['rev.mix', 940, 'MIX', 3, 'The balance of dry sound and reverb, from all dry to all wet.'],
  ['rev.size', 991, 'SIZE', 4, 'How big the plate sounds: small and close, or large and spread.'],
  [
    'rev.predelay',
    1047.5,
    'PREDELAY',
    1,
    'A gap before the reverb starts, up to 200 ms, which keeps the front of each note clear of it.',
  ],
  ['rev.decay', 1100, 'DECAY', 4, 'How long the reverb takes to die away.'],
];
REVERB.forEach(([id, x, lab, def, help]) =>
  knob(id, x, 135, lab, 156, {
    kind: 'cont',
    min: 0,
    max: 10,
    def,
    module: 'fx',
    label: lab,
    name: `Reverb ${lab}`,
    fmt: id === 'rev.predelay' ? (v) => `${Math.round(v * 20)} ms` : pct,
    help,
  })
);
label(924, 147, 'Dry', 10, { weight: 500 });
label(955, 147, 'Wet', 10, { weight: 500 });
knob('rev.tone', 1146, 135, 'TONE', 156, {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  module: 'fx',
  label: 'TONE',
  name: 'Reverb TONE',
  fmt: (v) =>
    Math.abs(v) < 0.05 ? 'flat' : v < 0 ? `darker ${pct(-v * 2)}` : `thinner ${pct(v * 2)}`,
  help: 'Tilts the reverb’s tone: left cuts its treble (LP), right cuts its bass (HP), so the tail sits out of the way of the dry sound.',
});
decor.push({ t: 'arc', x: X(1146), y: Y(135), r: 30, a0: -140, a1: 140, w: 1.6 });
label(1131, 148, 'LP', 10, { weight: 500 });
label(1161, 148, 'HP', 10, { weight: 500 });

// ── Glide, vintage, unison and octave ─────────────────────────────────────
knob('glide.time', 186, 194, 'RATE', 214, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 3,
  module: 'glide',
  label: 'RATE',
  name: 'PORTAMENTO RATE',
  fmt: (v) => fmtTime(glideTime(v)),
  help: 'How long each note takes to slide from the last note’s pitch, while PORTAMENTO is on.',
});
knob('voice.vintage', 241, 194, 'VINTAGE', 214, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'osc',
  label: 'VINTAGE',
  fmt: (v) => (v <= 0 ? 'off' : pct(v)),
  help: 'Makes the five voices differ a little from each other, in pitch, filter and envelopes, the way the voices of an old Oberheim do. Here it lets each voice’s pitch wander slowly on its own.',
});
btn(
  'glide.on',
  189,
  242.5,
  'PORTAMENTO',
  262,
  {
    label: 'PORTAMENTO',
    module: 'glide',
    help: 'Turns portamento on: each note slides from the pitch of the last one, over the time RATE sets.',
  },
  WIDE
);
btn(
  'voice.unison',
  246,
  242.5,
  'UNISON',
  262,
  {
    label: 'UNISON',
    module: 'osc',
    help: 'Stacks the voices on one note for a thick mono sound; how many, and how far detuned, are on the UNISON page of the display. On the hardware a held chord can be memorised and played from single keys, which is not modelled here.',
  },
  WIDE
);
const OCT_X = [189, 203, 217.5, 232, 246];
const OCTS = ['-2', '-1', '0', '+1', '+2'];
controls.push({
  id: 'kbd.octave',
  type: 'select',
  x: X(217.5),
  y: Y(285.5),
  w: 10,
  h: 10,
  lamp: 'red',
  kind: 'enum',
  def: '0',
  options: OCTS.map((v, i) => ({ v, label: v, x: X(OCT_X[i]), y: Y(285.5) })),
  module: 'mode',
  label: 'OCTAVE',
  labelPos: 'none',
  help: 'Moves the keyboard up or down by up to two octaves; the lamps show where it is. On the hardware the two buttons below step it; here press a lamp.',
});
OCTS.forEach((t, i) => label(OCT_X[i], 295, t.replace('-', '−'), 11, { weight: 500 }));
btn('ui.octDown', 189, 309, null, 0, {
  label: 'OCTAVE −',
  ui: true,
  help: 'Steps the keyboard down an octave. Here press one of the lamps above it.',
});
btn('ui.octUp', 246, 309, null, 0, {
  label: 'OCTAVE +',
  ui: true,
  help: 'Steps the keyboard up an octave. Here press one of the lamps above it.',
});
label(217.5, 329, 'OCTAVE');

// ── Oscillators ───────────────────────────────────────────────────────────
const WAVES: [string, WaveShape, string][] = [
  ['tri', 'tri', 'TRIANGLE'],
  ['saw', 'saw', 'SAW'],
  ['pulse', 'sq', 'PULSE'],
];
(
  [
    [1, 324, [300.8, 324.7, 348.3]],
    [2, 457.5, [435, 459, 482.5]],
  ] as const
).forEach(([n, fx, bx]) => {
  knob(`osc${n}.freq`, fx, 202.5, `FREQUENCY ${n}`, 223, {
    kind: 'cont',
    min: 0,
    max: 63,
    def: FREQ_HOME,
    step: 1,
    module: 'osc',
    label: `FREQUENCY ${n}`,
    fmt: (v) => fmtSemi(v - FREQ_HOME),
    help: `Tunes Oscillator ${n} in semitones across five octaves and a minor third. Here step ${FREQ_HOME} is the key’s own pitch; 12 steps up is an octave, 7 a fifth.`,
  });
  WAVES.forEach(([w, glyph, name], i) => {
    btn(`osc${n}.${w}`, bx[i], 262, null, 0, {
      label: name,
      name: `OSC ${n} ${name}`,
      module: 'osc',
      def: n === 1 && w === 'saw',
      help: `Turns Oscillator ${n}’s ${name.toLowerCase()} wave on. The three can be on together, summed: triangle and sawtooth, say, for a fuller tone.`,
    });
    decor.push({ t: 'wave', x: X(bx[i]), y: Y(280), size: 10, shape: glyph, w: 1.6 });
  });
});
knob('osc.pw', 391, 202.5, 'PULSE WIDTH', 223, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'osc',
  label: 'PULSE WIDTH',
  fmt: (v) => `${Math.round(50 + 4.7 * v)} %`,
  help: 'The width of both oscillators’ pulse waves: a hollow square at 50 %, narrowing to a thin, nasal buzz at 97 %. On the hardware the wave thins to silence at 100 %; here it stops just short. On the hardware each oscillator keeps its own width, which this knob moves together; here they share one.',
});
knob('osc2.detune', 391, 261, 'OSC 2 DETUNE', 280, {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  module: 'osc',
  label: 'OSC 2 DETUNE',
  fmt: (v) =>
    `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs((v / 5) * DETUNE_CENTS).toFixed(1)} cents`,
  help: 'Detunes Oscillator 2 up to about half a semitone either way, with a detent at the centre. A few cents off Oscillator 1 makes the two beat slowly against each other, which thickens the sound. The lamp above lights while it is off centre.',
});
bipolar(391, 261);
led(392.5, 237.5, { id: 'osc2.detune', eq: 0, near: 0.05, not: true });

// ── Osc mod ───────────────────────────────────────────────────────────────
knob('osc.xmod', 525, 202.5, 'X-MOD', 223, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'osc',
  label: 'X-MOD',
  fmt: (v) => (v <= 0 ? 'off' : pct(v)),
  help: 'Oscillator 2’s triangle frequency-modulates Oscillator 1: a little roughens it, more gives metallic, bell-like and clangorous tones. On the hardware it is through-zero FM, which stays in tune as it deepens; here it bends the pitch exponentially, so deep settings go out of tune.',
});
btn(
  'osc1.sync',
  526,
  262,
  'SYNC',
  280,
  {
    label: 'SYNC',
    module: 'osc',
    help: 'Hard sync: Oscillator 1 restarts its wave every time Oscillator 2 starts a cycle. Oscillator 2 then sets the note and FREQUENCY 1 changes only Oscillator 1’s tone, which turns hard and tearing as you sweep it.',
  },
  WIDE
);

// ── Filter and mixer ──────────────────────────────────────────────────────
knob('vcf.resonance', 594, 202.5, 'RESONANCE', 223, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'filter',
  label: 'RESONANCE',
  fmt: pct,
  help: 'Emphasis at the cutoff: a peak that makes the filter sing and whistle as you sweep it. This filter never rings on its own, however far it is turned.',
});
knob(
  'vcf.cutoff',
  664.5,
  232.5,
  'CUTOFF',
  280,
  {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 7,
    module: 'filter',
    label: 'CUTOFF',
    scale: { ticks: 13, tickR: 1.25 } satisfies KnobScale,
    fmt: (v) => fmtHz(vcfHz(v)),
    help: 'The filter’s cutoff. In low-pass, everything above it is taken away: down, the sound is dark and muffled; up, bright and open. In high-pass it takes away what is below it.',
  },
  48
);
knob('vcf.state', 736, 202.5, 'STATE', 223, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'filter',
  label: 'STATE',
  // with Bandpass on, `filterMode()` plays three steps, not the morph: the readout names the step
  fmt: (v, values) =>
    values?.['vcf.bp'] === 'on'
      ? v < 10 / 3
        ? 'low-pass'
        : v > 20 / 3
          ? 'high-pass'
          : 'band-pass'
      : v < 0.5
        ? 'low-pass'
        : v > 9.5
          ? 'high-pass'
          : Math.abs(v - 5) < 0.5
            ? 'notch'
            : pct(v),
  help: 'Sweeps the filter from low-pass (left) through a notch (top) to high-pass (right), as the SEM’s mode knob does: the low-pass fades as the high-pass comes in. With Bandpass on, on the FILTER page of the display, the middle is a band-pass.',
});
label(736, 185, 'NOTCH', 10, { weight: 500 });
label(711, 213, 'LP', 10, { weight: 500 });
label(760, 213, 'HP', 10, { weight: 500 });
led(736, 232.5, { id: 'vcf.bp', eq: 'on' });
label(736, 242.5, 'BP', 10, { weight: 500 });
(
  [
    ['mix.osc1', 577.5, 'OSC 1', 'Oscillator 1', true],
    ['mix.sub', 607.5, 'SUB', 'the sub-oscillator, a square an octave below Oscillator 1,', false],
    ['mix.osc2', 722, 'OSC 2', 'Oscillator 2', false],
    ['mix.noise', 751, 'NOISE', 'noise', false],
  ] as const
).forEach(([id, x, lab, what, def]) =>
  btn(
    id,
    x,
    262,
    lab,
    280,
    {
      label: lab,
      name: `Mixer ${lab}`,
      module: 'mixer',
      def,
      help: `Sends ${what} into the filter. Its level is on the MIXER LEVELS page of the display; on the hardware hold the button and turn VALUE.`,
    },
    WIDE
  )
);

// ── Envelopes ─────────────────────────────────────────────────────────────
const ROUTINGS: ControlOption[] = [
  { v: 'filter-amp', label: 'Env 1 Filter / Env 2 Amp' },
  { v: 'aux-filteramp', label: 'Env 1 Aux / Env 2 Filter+Amp' },
  { v: 'aux-filtergate', label: 'Env 1 Aux / Env 2 Filter+Gate' },
];
label(808.5, 185, 'ENV 1', 14, { anchor: 'start' });
label(808.5, 242.5, 'ENV 2', 14, { anchor: 'start' });
(
  [
    [194.5, 'Filter', ['filter-amp']],
    [204, 'Aux', ['aux-filteramp', 'aux-filtergate']],
    [251.5, 'Amp', ['filter-amp']],
    [261, 'Filter+Amp', ['aux-filteramp']],
    [271, 'Filter+Gate', ['aux-filtergate']],
  ] as const
).forEach(([y, lab, on]) => {
  led(812.5, y, { id: 'env.routing', in: [...on] });
  label(818, y, lab, 11, { anchor: 'start', weight: 500 });
});
decor.push({
  t: 'path',
  d: `M${X(806)} ${Y(185)} H${X(794)} V${Y(272)} M${X(794)} ${Y(242.5)} H${X(806)}`,
  w: 1.6,
});
btn('env.routing', 796, 279.5, null, 0, {
  kind: 'enum',
  def: 'filter-amp',
  options: ROUTINGS,
  lit: 'always',
  label: 'ENV ROUTING',
  module: 'env',
  help: 'Sets what the two envelopes do; the lamps beside them show which. Filter / Amp: Envelope 1 moves the filter and Envelope 2 the volume. Aux / Filter+Amp: Envelope 2 moves both, and Envelope 1 is free for its own destination, set on the display. Aux / Filter+Gate: as the second, but the volume simply opens while a key is held (a gate).',
});
const ENV_COLS: [string, number, string][] = [
  ['attack', 872.5, 'ATTACK'],
  ['decay', 930, 'DECAY'],
  ['sustain', 988, 'SUSTAIN'],
  ['release', 1045, 'RELEASE'],
];
const ENV_DEF: Record<string, number[]> = {
  attack: [0, 0],
  decay: [5, 5],
  sustain: [5, 10],
  release: [4, 4],
};
(
  [
    [1, 203, 223],
    [2, 261, 280],
  ] as const
).forEach(([n, y, ly]) => {
  const e = `ENV ${n}`;
  ENV_COLS.forEach(([stage, x, lab]) =>
    knob(`env${n}.${stage}`, x, y, lab, ly, {
      kind: 'cont',
      min: 0,
      max: 10,
      def: ENV_DEF[stage][n - 1],
      module: 'env',
      label: lab,
      name: `${e} ${lab}`,
      fmt: stage === 'sustain' ? pct : (v) => fmtTime(envTime(v)),
      help:
        stage === 'attack'
          ? `How long Envelope ${n} takes to rise when a key goes down: short for a sharp start, long for a swell.`
          : stage === 'decay'
            ? `How long Envelope ${n} takes to fall from its peak to the SUSTAIN level.`
            : stage === 'sustain'
              ? `The level Envelope ${n} holds while the key stays down.`
              : `How long Envelope ${n} takes to die away after the key is let go.`,
    })
  );
  knob(`env${n}.amount`, 1100, y, 'AMOUNT', ly, {
    kind: 'cont',
    min: -5,
    max: 5,
    def: n === 1 ? 0 : 5,
    module: 'env',
    label: 'AMOUNT',
    name: `${e} AMOUNT`,
    fmt: signed,
    help:
      n === 1
        ? 'How far Envelope 1 moves the filter, or its Aux destination, either way from the centre. Left of 0 turns the envelope upside down.'
        : 'How far Envelope 2 moves the volume and, when ENV ROUTING gives it the filter, the filter too. Left of 0 turns it upside down for the filter; the volume then stays shut here.',
  });
  bipolar(1100, y);
  btn(
    `env${n}.vel`,
    1137.5,
    y + 1,
    'VELOCITY',
    ly,
    {
      label: 'VELOCITY',
      name: `${e} VELOCITY`,
      module: 'env',
      help: `Makes Envelope ${n} follow how hard each key is played: softer notes give a smaller envelope.`,
    },
    22,
    20
  );
});

// ── Performance and program row ───────────────────────────────────────────
btn('ui.split2', 303.3, 310, null, 0, {
  label: 'LOW SPLIT −2 OCT',
  ui: true,
  help: `Plays the keys below the split point two octaves lower, for a bass under the right hand; hold both LOW SPLIT buttons and press a key to set the split. ${NOT_HERE}`,
});
btn('ui.split1', 351.3, 310, null, 0, {
  label: 'LOW SPLIT −1 OCT',
  ui: true,
  help: `Plays the keys below the split point an octave lower. ${NOT_HERE}`,
});
label(282.5, 310, '−2 oct', 11, { weight: 500 });
label(327, 310, '— set —', 11, { weight: 500 });
label(371, 310, '−1 oct', 11, { weight: 500 });
label(327, 329, 'LOW SPLIT');
btn(
  'kbd.hold',
  408,
  310,
  'HOLD',
  329,
  {
    label: 'HOLD',
    ui: true,
    help: 'Holds the notes you play after you let go, and latches the arpeggio. Here it is the page’s Hold.',
  },
  WIDE
);
seqButtons['kbd.hold'] = 'hold';
btn(
  'ui.factory',
  466,
  310,
  'FACTORY',
  329,
  {
    label: 'FACTORY',
    ui: true,
    help: `Switches the program buttons between the 256 factory and 256 user programs. ${NOT_HERE} The sounds are in the sound list.`,
  },
  WIDE
);
btn(
  'ui.bank',
  524,
  310,
  'BANK',
  329,
  {
    label: 'BANK',
    ui: true,
    help: `With a program button, chooses one of the banks of 16 programs. ${NOT_HERE}`,
  },
  WIDE
);
decor.push({ t: 'rect', x: X(545), y: Y(300), w: 86, h: 38, r: 3, fill: '#140606' });
text(566.5, 316, '702', 28, { fill: '#ff3b2e', weight: 700, spacing: 3 });
line(536, 329, 598, 329, 1.6);
const PROG_X = Array.from({ length: 16 }, (_, i) => 605 + i * 29.6);
PROG_X.forEach((x, i) => {
  decor.push({
    t: 'rect',
    x: X(x) - 14,
    y: Y(309.5) - 12,
    w: 28,
    h: 24,
    r: 2,
    fill: i === 1 ? '#b3241c' : '#2b2c30',
    stroke: '#0c0c0d',
    sw: 1.5,
    hw: true,
  });
  label(x, 329, String(i + 1), 11, { weight: 500 });
  if (i < 15) line(x + 6, 329, x + 23.6, 329, 1.4);
});
btn(
  'ui.manual',
  1119.5,
  309.5,
  'MANUAL',
  329,
  {
    label: 'MANUAL',
    ui: true,
    help: `Switches from the stored program to the panel as the knobs are set (live panel). ${NOT_HERE}`,
  },
  WIDE
);

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: (x1 - x0) * 2,
  h: (y1 - y0) * 2,
});
const areas: Area[] = [
  {
    id: 'master',
    label: 'Volume and overdrive',
    module: 'out',
    keywords: 'volume level master overdrive drive distortion',
    rects: [R(24, 38, 86, 160)],
    help: 'VOLUME sets the output level, and OVERDRIVE drives the summed voices before the effect and the reverb.',
  },
  {
    id: 'lfo1',
    label: 'LFO 1: mono',
    module: 'lfo',
    keywords: 'lfo vibrato wobble wah modulation global mono sync shape destination',
    rects: [R(86, 38, 229, 160)],
    help: 'One LFO for all five voices, so every note moves together. FREQ sets the speed, the five buttons the wave, AMOUNT the depth either way, and DEST what it moves, shown on the display.',
  },
  {
    id: 'lfo2',
    label: 'LFO 2: poly',
    module: 'lfo',
    keywords: 'lfo vibrato wobble wah modulation per voice poly sync shape destination',
    rects: [R(229, 38, 372, 160)],
    help: 'An LFO in each voice, so notes played at different times move out of step with each other. Its controls are LFO 1’s: FREQ, the five wave buttons, AMOUNT and DEST.',
  },
  {
    id: 'mod',
    label: 'Mod matrix',
    module: 'mod',
    keywords: 'modulation matrix source destination assign',
    rects: [R(372, 38, 426, 160)],
    help: 'Sets up the 16-slot mod matrix: hold SOURCE and move a control to choose the source, then DESTINATION and a knob to choose the destination. Here the matrix is left empty.',
  },
  {
    id: 'settings',
    label: 'Display, settings and memory',
    module: 'mode',
    keywords: 'display screen oled menu global program compare write save select value',
    rects: [R(426, 38, 606, 160)],
    help: 'The display shows the program, the menus and the destinations. GLOBAL and PROGRAM open the settings, SELECT and VALUE move through them, and COMPARE and WRITE check and save a sound. Here PROGRAM steps through the display’s pages of settings that have no knob.',
  },
  {
    id: 'clock',
    label: 'Clock',
    module: 'mode',
    keywords: 'tempo bpm clock divide tap',
    rects: [R(606, 38, 712, 160)],
    help: 'The tempo of the arpeggiator and the sequencer. BPM sets the beats a minute and CLK DIVIDE the note value of each arpeggiator step; TAP TEMPO sets the BPM by tapping.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator',
    module: 'mode',
    keywords: 'arpeggiator arp up down random assign octave repeat',
    rects: [R(712, 38, 820, 160)],
    help: 'Plays held keys one at a time in a pattern. ON turns it on, MODE sets the order, OCTAVE how many octaves it climbs, and REPEAT how many times each note plays.',
  },
  {
    id: 'seq',
    label: 'Sequencer',
    module: 'mode',
    keywords: 'sequencer sequence record play step',
    rects: [R(820, 38, 872, 160)],
    help: 'A 64-step sequencer saved with each sound: RECORD writes notes and chords step by step, PLAY runs it. Here they drive the sequencer under the panel.',
  },
  {
    id: 'effect',
    label: 'Effect',
    module: 'fx',
    keywords:
      'effect fx delay echo bbd tape chorus flanger phaser filter distortion ring rotary leslie lofi',
    rects: [R(872, 38, 1169, 108)],
    help: 'One digital effect after the voices. TYPE chooses it; TIME, DEPTH/MIX and FBACK/MISC change job with the type, and CLK SYNC locks a delay to the tempo.',
  },
  {
    id: 'reverb',
    label: 'Reverb',
    module: 'fx',
    keywords: 'reverb plate space room tail',
    rects: [R(872, 108, 1169, 160)],
    help: 'A plate reverb after the effect. MIX balances dry and wet, SIZE sets how big it sounds, PREDELAY holds it back, DECAY sets its length and TONE tilts it darker or thinner.',
  },
  {
    id: 'play',
    label: 'Wheels, portamento, unison and octave',
    module: 'glide',
    keywords: 'pitch bend mod wheel portamento glide vintage drift unison stack octave transpose',
    rects: [R(24, 160, 274, 342)],
    help: 'The pitch and mod wheels, here the ones beside the keyboard. RATE and PORTAMENTO slide between notes, VINTAGE lets the voices drift apart like an old polysynth’s, UNISON stacks them on one note, and OCTAVE moves the keyboard two octaves either way.',
  },
  {
    id: 'osc',
    label: 'Oscillators',
    module: 'osc',
    keywords: 'oscillator vco frequency pitch tune detune waveform triangle saw pulse width',
    rects: [R(274, 160, 500, 292)],
    help: 'Two oscillators per voice, each with triangle, sawtooth and pulse waves that can be on together. FREQUENCY tunes each in semitones, PULSE WIDTH narrows both pulses, and OSC 2 DETUNE sets Oscillator 2 a few cents off.',
  },
  {
    id: 'oscmod',
    label: 'Osc mod',
    module: 'osc',
    keywords: 'cross modulation x-mod fm frequency modulation hard sync',
    rects: [R(500, 160, 550, 292)],
    help: 'Two ways for Oscillator 2 to work on Oscillator 1: X-MOD, frequency modulation by its triangle, and SYNC, which restarts Oscillator 1’s wave with each of Oscillator 2’s cycles.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf cutoff resonance state notch low-pass high-pass band-pass sem multimode',
    rects: [R(550, 160, 778, 250), R(625, 250, 705, 292)],
    help: 'A 12 dB state-variable filter in each voice, after the Oberheim SEM’s. CUTOFF sets how bright the sound is, RESONANCE adds a peak at the cutoff, and STATE sweeps it from low-pass through a notch to high-pass.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mixer oscillator sub oscillator noise level on off',
    rects: [R(550, 250, 625, 292), R(705, 250, 778, 292)],
    help: 'Four buttons send Oscillator 1, the sub-oscillator an octave below it, Oscillator 2 and noise into the filter. Each one’s level is on the display.',
  },
  {
    id: 'env',
    label: 'Envelopes',
    module: 'env',
    keywords: 'envelope adsr attack decay sustain release amount velocity routing contour vca amp',
    rects: [R(778, 160, 1169, 292)],
    help: 'Two envelopes per voice. ENV ROUTING sets their jobs: the filter and the volume, or Envelope 2 doing both while Envelope 1 is free. AMOUNT sets each one’s depth either way and VELOCITY makes it follow how hard you play.',
  },
  {
    id: 'keys',
    label: 'Low split and hold',
    module: 'mode',
    keywords: 'split bass hold latch sustain',
    rects: [R(274, 292, 437, 342)],
    help: 'LOW SPLIT plays the keys below a split point an octave or two lower, and HOLD holds the notes you play and latches the arpeggio.',
  },
  {
    id: 'programs',
    label: 'Programs',
    module: 'mode',
    keywords: 'program preset bank factory user memory patch select manual',
    rects: [R(437, 292, 1169, 342)],
    help: 'Chooses one of 512 stored sounds: FACTORY switches between factory and user sounds, BANK and the sixteen buttons pick one, and MANUAL plays the panel as the knobs are set. Here the sounds are in the sound list.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
/** One of `DESTS` → engine routes, `a` the depth −1..1. */
function destRoutes(src: string, dest: string, a: number): EngineRoute[] {
  if (a === 0) return [];
  const pitch = Math.sign(a) * 12 * a * a;
  switch (dest) {
    case 'osc-all':
      return [
        { src, dst: 'pitch1', amt: pitch },
        { src, dst: 'pitch2', amt: pitch },
      ];
    case 'osc1':
      return [{ src, dst: 'pitch1', amt: pitch }];
    case 'osc2':
      return [{ src, dst: 'pitch2', amt: pitch }];
    case 'pw-all':
      return [
        { src, dst: 'pw1', amt: 0.45 * a },
        { src, dst: 'pw2', amt: 0.45 * a },
      ];
    case 'cutoff':
      return [{ src, dst: 'cutoff', amt: 5 * a }];
    case 'res':
      return [{ src, dst: 'res', amt: 0.6 * a }];
    default:
      return [];
  }
}
const LFO_MIX: Record<string, LfoMix> = {
  tri: { tri: 1 },
  saw: { saw: 1 },
  rsaw: { rsaw: 1 },
  sq: { sq: 1 },
  sh: { sh: 1 },
};
const envOf = (v: ControlValues, n: number, loop: boolean): EnvParams => {
  const dly = num(v, `env${n}.delay`);
  return {
    a: envTime(num(v, `env${n}.attack`)),
    d: envTime(num(v, `env${n}.decay`)),
    s: num(v, `env${n}.sustain`) / 10,
    r: envTime(num(v, `env${n}.release`)),
    ...(dly > 0 ? { dly: envTime(dly) } : {}),
    ...(loop ? { loop: true } : {}),
  };
};
/** STATE, and Bandpass on the display: a sweep from low-pass to high-pass, or three steps with band-pass in the middle. */
function filterMode(v: ControlValues): Pick<FilterParams, 'mode' | 'morph'> {
  const s = clamp(num(v, 'vcf.state') / 10, 0, 1);
  if (v['vcf.bp'] !== 'on') return { mode: 'morph', morph: s };
  return { mode: s < 1 / 3 ? 'lp' : s > 2 / 3 ? 'hp' : 'bp' };
}

/** Each effects algorithm's parameter defaults, by id. */
const FX_DEFAULTS = new Map(
  FX_ALGOS.map((a) => [a.id, Object.fromEntries(a.params.map((q) => [q.ref, q.def]))])
);
/** An effects algorithm's slot, with its defaults and `p` over them. */
function slot(alg: string, p: Record<string, number | string>): FxSlot {
  const base = FX_DEFAULTS.get(alg);
  // every id here is a literal below: a miss is an algorithm renamed in the effects table, not a value from a sound
  if (!base) throw new Error(`TEO-5: no effects algorithm ${alg}`);
  return { alg, level: 1, p: { ...base, ...p } };
}
/** The chosen effect, from TYPE and its three knobs (each 0..1); the ring modulator is not a slot (see `toEngine`). */
function effectSlot(type: string, t: number, m: number, f: number): FxSlot {
  const delay = (max: number, hc: number, fhc: number) =>
    slot('delay', {
      TIM: Math.round(expMap(t, 20, max)),
      MIX: Math.round(m * 100),
      FBL: Math.round(f * 90),
      FBR: Math.round(f * 90),
      HC: hc,
      FHC: fhc,
    });
  switch (type) {
    case 'delay':
      return delay(1000, 12000, 8000);
    case 'bbd':
      return delay(800, 4000, 2500);
    case 'tape1':
    case 'tape2':
      return slot('t-raydelay', {
        DLY: Math.round(t * 100),
        MIX: Math.round(m * 100),
        SUS: Math.round(f * 90),
        WOB: type === 'tape1' ? 25 : 60,
        TON: type === 'tape1' ? 60 : 35,
      });
    case 'chorus':
      return slot('chorus', {
        SPD: Number(expMap(t, 0.05, 5).toFixed(2)),
        WDL: Math.round(m * 100),
        WDR: Math.round(m * 100),
        MIX: 50,
        HC: Math.round(expMap(f, 1500, 20000)),
      });
    case 'flanger':
      return slot('flanger', {
        SPD: Number(expMap(t, 0.05, 5).toFixed(2)),
        WDL: Math.round(m * 100),
        WDR: Math.round(m * 100),
        FD: Math.round(f * 90),
      });
    case 'phaser':
      return slot('phaser', {
        SPD: Number(expMap(t, 0.05, 5).toFixed(2)),
        DEP: Math.round(m * 100),
        RES: Math.round(f * 100),
      });
    case 'hpf':
      return slot('moodfilter', {
        TYP: 'HP',
        FRQ: Math.round(expMap(t, 20, 8000)),
        DEP: 0,
        MIX: Math.round(m * 100),
        RES: Math.round(f * 100),
      });
    case 'dist':
      return slot('mulbnddist', {
        IPG: Math.round(t * 24),
        LDR: Math.round(t * 100),
        MDR: Math.round(t * 100),
        HDR: Math.round(t * 100),
        OPG: Math.round(-12 + m * 12),
        HBL: Math.round(-12 + f * 24),
      });
    case 'rotary':
      return slot('rotaryspkr', {
        SPD: t >= 0.5 ? 'FAST' : 'SLOW',
        MIX: Math.round(m * 100),
        DIS: Math.round(f * 100),
      });
    case 'lofi':
      // the decimator with a one-millisecond, unrepeated delay: only its down-sampling and bit reduction are heard
      return slot('decimdelay', {
        TIM: 1,
        FBL: 0,
        FBR: 0,
        MIX: Math.round(m * 100),
        DSM: Math.round(t * 100),
        BRC: Math.round(24 - f * 20),
        FC: 20000,
        RES: 0,
      });
    default:
      return { alg: null };
  }
}
function reverbSlot(v: ControlValues): FxSlot {
  const tone = num(v, 'rev.tone') / 5;
  return slot('platerev', {
    MIX: Math.round(num(v, 'rev.mix') * 10),
    SIZ: Math.round(expMap(num(v, 'rev.size') / 10, 2, 200)),
    PD: Math.round(num(v, 'rev.predelay') * 20),
    DCY: Number(expMap(num(v, 'rev.decay') / 10, 0.5, 10).toFixed(2)),
    HC: tone < 0 ? Math.round(expMap(1 + tone, 1500, 20000)) : 20000,
    LC: tone > 0 ? Math.round(expMap(tone, 10, 500)) : 10,
  });
}

function toEngine(v: ControlValues): EngineParams {
  const routes: EngineRoute[] = [];
  const routing = String(v['env.routing']);
  const aux = routing !== 'filter-amp';
  const e1v = !!v['env1.vel'];
  const e2v = !!v['env2.vel'];
  const a1 = num(v, 'env1.amount') / 5;
  const a2 = num(v, 'env2.amount') / 5;

  // the LFOs and Envelope 1 (as Aux) to their destinations
  routes.push(...destRoutes('lfo', String(v['lfo1.dest']), num(v, 'lfo1.amt') / 5));
  routes.push(...destRoutes('lfo2', String(v['lfo2.dest']), num(v, 'lfo2.amt') / 5));
  if (aux) routes.push(...destRoutes(e1v ? 'env1v' : 'env1', String(v['env1.dest']), a1));

  // X-MOD: Oscillator 2's triangle on Oscillator 1's pitch
  const xm = num(v, 'osc.xmod') / 10;
  if (xm > 0) routes.push({ src: 'o2tri', dst: 'pitch1', amt: XMOD_ST * xm * xm });
  // the gated VCA of the third routing: open while a key is held
  const gated = routing === 'aux-filtergate';
  if (gated) routes.push({ src: 'gate', dst: 'amp', amt: 1 });

  // the mixer: each channel's button, at its level on the display
  const lvl = (on: string, level: string): number =>
    v[on] ? MIX_LEVEL * clamp(num(v, level) / 10, 0, 1) : 0;
  const l1 = lvl('mix.osc1', 'mix.osc1Lvl');
  const l2 = lvl('mix.osc2', 'mix.osc2Lvl');
  // Osc 2 Filter Bypass: Oscillator 2 goes past the filter, straight to the VCA
  const bypass = v['osc2.bypass'] === 'on';
  if (bypass && l2 > 0) routes.push({ src: 'osc2', dst: 'vcaIn', amt: l2 });

  const pw = 0.5 - 0.047 * clamp(num(v, 'osc.pw'), 0, 10);
  const osc = (n: number, level: number, cents: number): OscParams => {
    const mix: OscMix = {};
    if (v[`osc${n}.tri`]) mix.tri = 1;
    if (v[`osc${n}.saw`]) mix.saw = 1;
    if (v[`osc${n}.pulse`]) mix.pulse = 1;
    const key = v[`osc${n}.key`] !== 'off';
    return {
      level,
      mix,
      pw,
      semi: num(v, `osc${n}.freq`) - FREQ_HOME + cents / 100,
      kbd: key,
      ...(key ? {} : { fixedNote: 60 }),
    };
  };
  const unison = !!v['voice.unison'];
  const uniVoices = clamp(Number(v['voice.uniVoices']) || 5, 1, 5);
  const vintage = num(v, 'voice.vintage') / 10;
  const drive = num(v, 'drive.amount') / 10;
  const div = DIVS.find((d) => d.v === v['clock.div']) ?? DIVS[4];
  const fxOn = !!v['fx.on'];
  const fxType = String(v['fx.type']);
  const ring = fxOn && fxType === 'ring';
  const fxSlot = fxOn && !ring;
  const revOn = !!v['rev.on'];
  const repeat = String(v['env.repeat']);
  const cutAmt = (aux ? a2 : a1) * ENV_CUT_OCT;
  return {
    osc: [
      {
        ...osc(1, l1, 0),
        syncTo: v['osc1.sync'] ? 1 : -1,
        subLevel: lvl('mix.sub', 'mix.subLvl'),
      },
      {
        ...osc(2, bypass ? 0 : l2, (num(v, 'osc2.detune') / 5) * DETUNE_CENTS),
        syncTo: -1,
      },
    ],
    noise: {
      level: lvl('mix.noise', 'mix.noiseLvl'),
      color: v['noise.type'] === 'pink' ? 'pink' : 'white',
    },
    ext: { level: 0 },
    filter: {
      type: 'svf',
      ...filterMode(v),
      cutoff: vcfHz(num(v, 'vcf.cutoff')),
      // the TEO-5's filter does not self-oscillate
      res: (num(v, 'vcf.resonance') / 10) * 0.95,
      envAmt: cutAmt,
      envSrc: aux ? (e2v ? 'env2v' : 'env2') : e1v ? 'env1v' : 'env1',
      kbd: clamp(num(v, 'vcf.key') / 10, 0, 1),
    },
    env1: envOf(v, 1, repeat === 'env1' || repeat === 'both'),
    env2: envOf(v, 2, repeat === 'env2' || repeat === 'both'),
    vca: gated
      ? { envSrc: 'none', bias: 0 }
      : { envSrc: e2v ? 'env2v' : 'env2', bias: 0, gain: clamp(a2, 0, 1) },
    lfo: {
      rate: lfoHz(num(v, 'lfo1.freq')),
      mix: LFO_MIX[String(v['lfo1.shape'])] ?? LFO_MIX.tri,
      keySync: false,
      // LFO 1 is one wave for all five voices
      common: true,
    },
    lfo2: {
      rate: lfoHz(num(v, 'lfo2.freq')),
      mix: LFO_MIX[String(v['lfo2.shape'])] ?? LFO_MIX.tri,
      keySync: false,
    },
    glide: { time: v['glide.on'] ? glideTime(num(v, 'glide.time')) : 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly: {
      voices: 5,
      stack: unison ? uniVoices : 1,
      mono: unison,
      detune: unison ? 0.04 * (Number(v['voice.uniDetune']) || 0) : 0,
    },
    arp: {
      on: !!v['arp.on'],
      // the engine steps in sixteenths: CLK DIVIDE's note value is that many sixteenths
      bpm: num(v, 'clock.bpm') / (4 * div.beats),
      gate: 0.5,
      mode: ARP_ENGINE[String(v['arp.mode'])] ?? 'up',
      octaves: Number(v['arp.octave']) || 1,
      hold: false,
    },
    drift: { depth: vintage > 0 ? 0.3 * vintage * vintage : 0, rate: 1.2 },
    routes,
    normals: {},
    // the separate waveform outputs feed only X-MOD's o2tri route
    oscOuts: xm > 0,
    od: drive > 0 ? { on: true, drive, tone: 0.5, level: 0.8 } : { on: false },
    delay: { on: false },
    ...(ring
      ? {
          ringMod: {
            hz: expMap(num(v, 'fx.time') / 10, 20, 2000),
            depth: clamp(num(v, 'fx.mix') / 10, 0, 1),
            env: { a: 0.01, d: 0.1, amt: 0 },
          },
        }
      : {}),
    fx:
      fxSlot || revOn
        ? {
            mode: 'insert',
            routing: 1,
            slots: [
              fxSlot
                ? effectSlot(
                    fxType,
                    num(v, 'fx.time') / 10,
                    num(v, 'fx.mix') / 10,
                    num(v, 'fx.misc') / 10
                  )
                : { alg: null },
              revOn ? reverbSlot(v) : { alg: null },
              { alg: null },
              { alg: null },
            ],
          }
        : { mode: 'bypass' },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 12 * Number(v['kbd.octave'] ?? 0),
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const teo5: SynthDef & { version: number } = {
  id: 'teo-5',
  version: 1,
  name: 'TEO-5',
  maker: 'Oberheim',
  year: 2024,
  heritage:
    'A compact Oberheim polysynth on the Take 5’s platform, after the OB-X, Four Voice and TVS',
  summary:
    'Five analogue voices, each two oscillators with any mix of triangle, sawtooth and pulse (with sync and X-Mod), a sub-oscillator and white or pink noise → a 12 dB SEM-style state-variable filter sweeping low-pass, notch and high-pass → the VCA, with two envelopes, a global and a per-voice LFO. The voices go through overdrive, one of twelve effects and a plate reverb; an arpeggiator and a sequencer play them.',
  view: { w: X(1172), h: Y(342) },
  theme: {
    panel: '#1b1d22',
    panel2: '#141519',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'none',
    cheekW: 0,
    knobRing: false,
    button: 'black',
  },
  signalNames: {
    env1: 'Envelope 1',
    env2: 'Envelope 2',
    env1v: 'Envelope 1',
    env2v: 'Envelope 2',
    lfo: 'LFO 1',
    lfo2: 'LFO 2',
    osc1: 'Oscillator 1',
    osc2: 'Oscillator 2',
    o2tri: 'Oscillator 2’s triangle',
  },
  tempo: 'clock.bpm',
  seqButtons,
  decor,
  areas,
  controls,
  jacks: [],
  init,
  // Init is already Oscillator 1's sawtooth alone, through the low-pass, with the loudness an organ gate (Envelope 2 at
  // full sustain) and no envelope on the filter. The Default patch opens the filter all the way.
  defaultPatch: {
    checklist: [
      {
        title: 'Start from an initialised program, and set the output',
        module: 'out',
        why: 'The TEO-5 keeps settings in its menus that the knobs do not show, so if you can, start from an initialised program. VOLUME at 7 is the level every patch here assumes, with OCTAVE at 0. OVERDRIVE and VINTAGE fully anticlockwise keep the sound clean and steady.',
        controls: ['out.*', 'drive.*', 'voice.vintage', 'kbd.*'],
      },
      {
        title: 'Play it as a plain polysynth: no arpeggio, portamento or unison',
        module: 'mode',
        why: 'With ARPEGGIATOR ON, PORTAMENTO and UNISON unlit, each key plays one note of its own and lands on its pitch at once. The clock and arpeggiator settings do nothing while it is off; set them as shown.',
        controls: ['arp.*', 'clock.*', 'glide.*', 'voice.unison'],
      },
      {
        title: 'Set Oscillator 1 to the saw alone',
        module: 'osc',
        why: 'The oscillators make the raw tone. On OSC 1 only the SAW button is lit, the buzzy wave with every harmonic; on OSC 2 none is lit. Both FREQUENCY knobs where they play the note you press, OSC 2 DETUNE at the centre. X-MOD fully anticlockwise and SYNC unlit.',
        controls: ['osc1.*', 'osc2.*', 'osc.*'],
      },
      {
        title: 'Mix in OSC 1 alone',
        module: 'mixer',
        why: 'In the mixer only OSC 1 is lit; SUB, OSC 2 and NOISE unlit. One plain saw goes into the filter.',
        controls: ['mix.*'],
      },
      {
        title: 'Take both LFOs off',
        module: 'lfo',
        why: 'LFO AMOUNT at the centre is zero, so neither LFO moves anything. Set their shape and speed anyway, so your TEO-5 matches.',
        controls: ['lfo1.*', 'lfo2.*'],
      },
      {
        title: 'Open the filter all the way',
        module: 'filter',
        why: 'The filter takes brightness away. STATE fully anticlockwise is low-pass; CUTOFF fully clockwise and no RESONANCE let the saw through untouched.',
        controls: ['vcf.*'],
      },
      {
        title: 'Make the loudness a plain gate',
        module: 'env',
        why: 'ENV ROUTING sends envelope 2 to the amplifier. ENV 2 ATTACK fully anticlockwise starts each note at once, SUSTAIN and AMOUNT fully clockwise hold it at full volume while the key is down, and a short RELEASE stops it soon after you let go. Envelope 1 goes to the filter, but its AMOUNT at the centre means it does nothing. VELOCITY unlit on both.',
        controls: ['env.*', 'env1.*', 'env2.*'],
      },
      {
        title: 'Switch the effect and the reverb off',
        module: 'fx',
        why: 'With EFFECT ON and REVERB ON unlit you hear the plain synth. Set their knobs anyway, so your TEO-5 matches when you switch them on.',
        controls: ['fx.*', 'rev.*'],
        listen:
          'play a chord: a bright, steady buzz on every note, starting the moment you press and stopping when you let go.',
      },
    ],
    values: { 'vcf.cutoff': 10 },
  },
  toEngine,
};

export default teo5;
