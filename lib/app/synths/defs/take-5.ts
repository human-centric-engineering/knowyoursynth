/**
 * Sequential Take 5: the definition (D1). Positions are measured on the 2500 × 1313 product photo of the desktop
 * module (`.context/app/synth-data/take-5/raw/Sequential Module 3510 Take 5.jpg`, local only); X() and Y() take photo
 * pixels and move them to the faceplate's corner, at the same scale. The owner's spec is
 * `.context/app/synth-data/take-5/take-5.synth.json` (the Take 5 User's Guide 1.1 and the MIDI implementation).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), following `defs/pro-800.ts`, the nearest
 * instrument: five voices, each two oscillators whose SHAPE morphs sine → sawtooth → pulse, a sub-oscillator and noise
 * → a resonant low-pass filter with DRIVE → the VCA, with two envelopes whose jobs ENV ROUTING sets, a global LFO 1 and
 * a per-voice LFO 2. The voices are summed into overdrive, one of eleven effects and a plate reverb. No content (sounds,
 * lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the SEQUENTIAL and TAKE 5 lettering on the
 * front lip), and panel values read through `num()`.
 *
 * One set of LFO controls edits LFO 1 or LFO 2, chosen by the LFO button: each LFO has its own controls at the same
 * spots, shown while it is chosen. The shape lamps are each LFO's own `select`, since a lamp cannot follow two controls.
 * The 16-slot mod matrix, the menus, program memory and the clock sync are drawn and explained but not modelled; the
 * LFO and Envelope 1 destinations, set on the display on the hardware, are rows on the display here.
 *
 * The effects run on the DeepMind's effects engine (`audio/dm-fx.ts`): slot 1 is the chosen effect, slot 2 the reverb.
 * Each effect takes the nearest algorithm there, with the Take 5's three knobs mapped onto its parameters and the rest
 * left at the algorithm's defaults (`defs/deepmind-12d-fx.ts`).
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
  FxSlot,
  KnobControl,
  KnobScale,
  LfoMix,
  MenuControl,
  OscMix,
  SeqButton,
  ShowCondition,
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
type TextRest = Partial<
  Pick<TextDecor, 'fill' | 'weight' | 'spacing' | 'brand' | 'anchor' | 'rotate'>
>;

const X = (x: number): number => x - 10;
const Y = (y: number): number => y - 250;
const INK = '#d6d7da';
const BOX = '#46484d';
const LIP = '#151516';
const ORANGE = '#e0761c';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The guide gives no envelope or LFO times, no cutoff range and no glide times (`not_in_source`): these are the app's
// estimates, in the range of the other Sequential voices here.
const ENV_PTS: CurvePoint[] = [
  [0, 0.001],
  [2.5, 0.03],
  [5, 0.3],
  [7.5, 2.5],
  [10, 20],
];
const envTime = (v: number): number => pwl(v, ENV_PTS, true);
const lfoHz = (v: number): number => expMap(v / 10, 0.05, 50);
const vcfHz = (v: number): number => expMap(v / 10, 20, 18000);
const glideTime = (v: number): number => 4 * Math.pow(v / 10, 2);
const pct = (v: number): string => `${Math.round(v * 10)} %`;
const signed = (v: number): string =>
  Math.abs(v) < 0.05 ? '0' : `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`;

/** SHAPE, 0..1: sine → sawtooth at the middle → square at three quarters → a narrowing pulse. */
function shapeOf(t: number): { mix: OscMix; pw: number } {
  if (t < 0.5) return { mix: { sine: 1 - t / 0.5, saw: t / 0.5 }, pw: 0.5 };
  if (t < 0.75) {
    const u = (t - 0.5) / 0.25;
    return { mix: { saw: 1 - u, pulse: u }, pw: 0.5 };
  }
  return { mix: { pulse: 1 }, pw: 0.5 - 0.45 * ((t - 0.75) / 0.25) };
}
const shapeName = (v: number): string => {
  const t = v / 10;
  if (t < 0.05) return 'sine';
  if (t < 0.45) return 'sine → saw';
  if (t <= 0.55) return 'sawtooth';
  if (t < 0.7) return 'saw → square';
  if (t <= 0.8) return 'square';
  return `pulse ${Math.round(shapeOf(t).pw * 100)} %`;
};

const controls: Control[] = [];
const decor: Decor[] = [];
const seqButtons: Record<string, SeqButton> = {};

// ── Drawing helpers ───────────────────────────────────────────────────────
const text = (x: number, y: number, t: string, size = 16, rest: TextRest = {}): void => {
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
const label = (x: number, y: number, t: string, size = 16, rest: TextRest = {}): void =>
  text(x, y + size * 0.36, t, size, rest);
const line = (x1: number, y1: number, x2: number, y2: number, w = 2): void => {
  decor.push({ t: 'line', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), w });
};
const led = (x: number, y: number, litWhen: Extract<Decor, { t: 'led' }>['litWhen']): void => {
  decor.push({ t: 'led', x: X(x), y: Y(y), r: 7, color: 'red', litWhen });
};

const TICKS: KnobScale = { ticks: 9, tickR: 1.32, size: 11 };
/** A knob; `lab` is the printed name, centred `ly` below it (null: no name, or one drawn separately). */
const knob = (
  id: string,
  x: number,
  y: number,
  lab: string | null,
  rest: KnobRest,
  r = 30,
  ly = 57
): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r,
    style: 'pro1',
    labelPos: 'none',
    ...rest,
  });
  if (lab) label(x, y + ly, lab);
};
/** A square backlit button; `lab` is the printed name, centred `ly` below it. */
const btn = (
  id: string,
  x: number,
  y: number,
  lab: string | null,
  rest: ButtonRest,
  w = 36,
  h = 32,
  ly = 45
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
  if (lab) label(x, y + ly, lab);
};
const NOT_HERE = 'Not modelled here.';
/** A printed "SYNC 2→1": the panel font has no arrow, so it is drawn. */
const arrowName = (cx: number, y: number, name: string): void => {
  const w = name.length * 9.5;
  label(cx - 12 - w / 2, y, name, 15);
  label(cx - 6, y, '2', 15);
  label(cx + 26, y, '1', 15);
  decor.push({
    t: 'path',
    d: `M${X(cx + 1)} ${Y(y)} H${X(cx + 18)} M${X(cx + 13)} ${Y(y - 4)} L${X(cx + 18)} ${Y(y)} L${X(cx + 13)} ${Y(y + 4)}`,
    w: 1.8,
  });
};

// ── Faceplate artwork ─────────────────────────────────────────────────────
// the four grey boxes of the voice
[
  [217, 573, 505, 315],
  [735, 573, 297, 315],
  [1045, 573, 400, 315],
  [1455, 573, 960, 315],
].forEach(([x, y, w, h]) => decor.push({ t: 'rect', x: X(x), y: Y(y), w, h, r: 14, fill: BOX }));
label(469, 864, 'OSCILLATORS', 26);
label(884, 864, 'MIXER', 26);
label(1245, 864, 'FILTER', 26);
label(1936, 864, 'ENVELOPES', 26);

// the top row's section names and the rules between them
label(370, 290, 'LFO 1: MONO  |  LFO 2: POLY', 19);
label(609, 290, 'MOD', 19);
label(729, 290, 'SETTINGS', 19);
label(1038, 290, 'MEMORY', 19);
label(1219, 290, 'CLOCK', 19);
label(1463, 290, 'ARPEGGIATOR', 19);
label(1647, 290, 'SEQ', 19);
label(2064, 290, 'EFFECT', 19);
[197, 550, 670, 1100, 1338, 1588, 1708].forEach((x) => line(x, 278, x, 552));
line(1720, 435, 2010, 435);
line(2118, 435, 2400, 435);
label(2064, 435, 'REVERB', 19);

// the front lip and its lettering
decor.push({ t: 'rect', x: 0, y: Y(1026), w: X(2490), h: 36, fill: LIP });
text(310, 1052, 'SEQUENTIAL', 30, { weight: 800, spacing: 6, brand: true, fill: '#c9cacd' });
text(2150, 1052, 'TAKE 5', 30, { weight: 800, spacing: 6, brand: true, fill: '#c9cacd' });

// ── Master column ─────────────────────────────────────────────────────────
knob('out.volume', 122, 354, 'VOLUME', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  module: 'out',
  label: 'VOLUME',
  scale: TICKS,
  fmt: pct,
  help: 'The level at the outputs and the headphone socket.',
});
knob('drive.amount', 122, 500, 'OVERDRIVE', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'fx',
  label: 'OVERDRIVE',
  scale: TICKS,
  fmt: (v) => (v <= 0 ? 'off' : pct(v)),
  help: 'Analogue-style overdrive on the summed voices, before the effect and the reverb. A little thickens the sound; turned up it growls and then fuzzes. Here it drives each voice on its own, after its filter, so a chord’s notes do not distort against each other.',
});
knob('voice.vintage', 122, 650, 'VINTAGE', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'osc',
  label: 'VINTAGE',
  scale: TICKS,
  fmt: (v) => (v <= 0 ? 'off' : pct(v)),
  help: 'Makes the five voices differ a little from each other, the way the voices of an old analogue polysynth drift. Here it lets each voice’s pitch wander slowly on its own.',
});
knob('glide.time', 122, 798, 'GLIDE', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 3,
  module: 'glide',
  label: 'GLIDE',
  scale: TICKS,
  fmt: (v) => fmtTime(glideTime(v)),
  help: 'How long each note takes to slide from the last note’s pitch, while the GLIDE button below is on.',
});

// ── LFOs ──────────────────────────────────────────────────────────────────
const LFO_SHAPES: ControlOption[] = [
  { v: 'tri', label: 'Triangle' },
  { v: 'saw', label: 'Sawtooth' },
  { v: 'rsaw', label: 'Reverse sawtooth' },
  { v: 'sq', label: 'Square' },
  { v: 'sh', label: 'Sample and hold' },
];
const SHAPE_Y = [333, 360, 387, 414, 441];
const SHAPE_GLYPH: (WaveShape | null)[] = ['tri', 'saw', 'rsaw', 'sq', null];
SHAPE_Y.forEach((y, i) => {
  const g = SHAPE_GLYPH[i];
  if (g) decor.push({ t: 'wave', x: X(522), y: Y(y), size: 12, shape: g, w: 2 });
  else label(523, y, 'S&H', 13);
});
/** Destinations an LFO or Envelope 1 (as aux) can be set to here: the spec's list, cut to what the engine can move. */
const DESTS: ControlOption[] = [
  { v: 'none', label: 'No Dest' },
  { v: 'osc-all', label: 'Osc All Freq' },
  { v: 'osc1', label: 'Osc 1 Freq' },
  { v: 'osc2', label: 'Osc 2 Freq' },
  { v: 'cutoff', label: 'Cutoff' },
  { v: 'res', label: 'Resonance' },
];
const DEST_HELP =
  'Osc All Freq, Osc 1 Freq and Osc 2 Freq move pitch (vibrato and trills), Cutoff the filter (wah) and Resonance its emphasis. The hardware lists 56 destinations; here the six an LFO is most used for.';
const display = (
  id: string,
  y: number,
  lab: string,
  rest: Pick<MenuControl, 'name' | 'help' | 'def' | 'module'> & {
    show: ShowCondition;
  }
): void => {
  controls.push({
    id,
    type: 'menu',
    x: X(885),
    y: Y(y),
    w: 172,
    h: 34,
    size: 13,
    vw: 92,
    kind: 'enum',
    options: DESTS,
    label: lab,
    labelPos: 'none',
    deep: true,
    ...rest,
  });
};
const onLfo = (n: number): ShowCondition => ({ id: 'lfo.select', eq: String(n) });
[1, 2].forEach((n) => {
  const lfo = `LFO ${n}`;
  const show = onLfo(n);
  btn(`lfo${n}.sync`, 256, 367, null, {
    label: 'SYNC',
    name: `${lfo} CLK SYNC`,
    module: 'lfo',
    ui: true,
    show,
    help: `Locks ${lfo}’s speed to the clock (the BPM), and FREQUENCY then picks a note value. ${NOT_HERE} FREQUENCY always sets a free speed.`,
  });
  knob(`lfo${n}.freq`, 340, 356, null, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    module: 'lfo',
    label: 'FREQUENCY',
    name: `${lfo} FREQUENCY`,
    scale: TICKS,
    show,
    fmt: (v) => fmtHz(lfoHz(v)),
    help: `How fast ${lfo} cycles, from one cycle every 20 seconds to fast enough to buzz.`,
  });
  controls.push({
    id: `lfo${n}.shape`,
    type: 'select',
    x: X(490),
    y: Y(SHAPE_Y[0]),
    w: 14,
    h: 14,
    lamp: 'red',
    kind: 'enum',
    def: 'tri',
    options: LFO_SHAPES.map((o, i) => ({ ...o, x: X(490), y: Y(SHAPE_Y[i]) })),
    module: 'lfo',
    label: 'SHAPE',
    name: `${lfo} SHAPE`,
    labelPos: 'none',
    show,
    help: `${lfo}’s wave: triangle, sawtooth, reverse sawtooth, square, or sample and hold (a new random level each cycle). Here choose it with the lamps.`,
  });
  knob(`lfo${n}.amt`, 340, 486, null, {
    kind: 'cont',
    min: -5,
    max: 5,
    def: 0,
    module: 'lfo',
    label: 'AMOUNT',
    name: `${lfo} AMOUNT`,
    scale: TICKS,
    show,
    fmt: signed,
    help: `How far ${lfo} moves its destination, either way from the centre. Left of 0 turns the wave upside down.`,
  });
  display(`lfo${n}.dest`, 352, `LFO ${n}`, {
    name: `${lfo} DEST`,
    def: n === 1 ? 'osc-all' : 'cutoff',
    module: 'lfo',
    show,
    help: `What ${lfo} moves, chosen with DEST and the VALUE knob on the hardware. ${DEST_HELP}`,
  });
});
label(256, 412, 'SYNC');
label(340, 412, 'FREQUENCY');
label(340, 543, 'AMOUNT');
label(340, 450, '0', 13);
label(306, 524, '−', 15);
label(375, 524, '+', 15);
btn('lfo.shapeKey', 436, 367, 'SHAPE', {
  label: 'SHAPE',
  name: 'LFO SHAPE button',
  module: 'lfo',
  ui: true,
  help: `Steps the chosen LFO through its five shapes; the lamps beside it show which. Here press a lamp to choose the shape.`,
});
btn('lfo.destKey', 256, 498, 'DEST', {
  label: 'DEST',
  name: 'LFO DEST button',
  module: 'lfo',
  ui: true,
  help: `Shows the chosen LFO’s destination on the display, to change with VALUE. Here the destination is the top row of the display.`,
});
btn('lfo.select', 436, 498, 'LFO', {
  kind: 'enum',
  def: '1',
  options: [
    { v: '1', label: 'LFO 1' },
    { v: '2', label: 'LFO 2' },
  ],
  lit: 'always',
  label: 'LFO',
  name: 'LFO select',
  module: 'lfo',
  ui: true,
  help: 'Chooses which LFO the knobs and buttons in this section set: LFO 1, one wave for all five voices, or LFO 2, a wave of its own in each voice. The lamps beside it show which. Here LFO 1 runs a copy in each voice too, each started at its own point, so the two differ only in their settings.',
});
led(490, 485, { id: 'lfo.select', eq: '1' });
led(490, 512, { id: 'lfo.select', eq: '2' });
label(510, 485, '1', 14);
label(510, 512, '2', 14);

// ── Mod matrix ────────────────────────────────────────────────────────────
btn('mod.src', 609, 367, 'SRC ASSIGN', {
  label: 'SRC ASSIGN',
  name: 'SRC ASSIGN',
  module: 'mod',
  ui: true,
  help: `With DEST ASSIGN, sets up one of 16 mod matrix slots: hold it and move a control to make that the source. ${NOT_HERE} The matrix is left empty.`,
});
btn('mod.dest', 609, 498, 'DEST ASSIGN', {
  label: 'DEST ASSIGN',
  name: 'DEST ASSIGN',
  module: 'mod',
  ui: true,
  help: `Hold it and move a knob to make that knob the destination of the mod slot being set up. ${NOT_HERE} The matrix is left empty.`,
});

// ── Settings, display and memory ──────────────────────────────────────────
const SETTINGS: [string, number, number, string, string][] = [
  [
    'ui.global',
    729,
    333,
    'global',
    'Opens the global settings: tuning, MIDI, pedals, velocity and pressure curves, clock.',
  ],
  [
    'ui.program',
    729,
    423,
    'program',
    'Opens the settings saved with each sound that have no knob, such as key tracking, glide mode and the unison voices.',
  ],
  [
    'ui.compare',
    1039,
    333,
    'compare',
    'Plays the sound as it was saved, to compare with your edits.',
  ],
  ['ui.write', 1039, 423, 'write', 'Saves the sound into one of the 128 user programs.'],
];
SETTINGS.forEach(([id, x, y, lab, help]) =>
  btn(id, x, y, lab, {
    label: lab.toUpperCase(),
    ui: true,
    help: `${help} ${NOT_HERE}`,
  })
);
decor.push({
  t: 'rect',
  x: X(795),
  y: Y(307),
  w: 180,
  h: 141,
  r: 4,
  fill: '#08090b',
  stroke: '#2b2c30',
  sw: 2,
});
text(885, 330, 'TAKE 5', 13, { fill: '#8fb8ef', weight: 500, brand: true });
display('env1.dest', 412, 'ENV 1', {
  name: 'ENV 1 DEST',
  def: 'none',
  module: 'env',
  show: { id: 'env.routing', in: ['aux-filteramp', 'aux-filtergate'] },
  help: `What Envelope 1 moves while ENV ROUTING sets it to Aux, chosen in the program settings on the hardware. ${DEST_HELP}`,
});
knob('ui.selectKnob', 797, 498, 'select', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'mode',
  label: 'SELECT',
  ui: true,
  help: `Scrolls through the menus and the mod matrix slots. ${NOT_HERE}`,
});
knob('ui.valueKnob', 967, 498, 'value', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'mode',
  label: 'VALUE',
  ui: true,
  help: `Changes the value on the display, and chooses programs. Here the display’s rows are set directly.`,
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
knob('clock.bpm', 1160, 352, 'BPM', {
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
knob('clock.div', 1278, 352, 'CLK DIV', {
  kind: 'enum',
  def: '1/16',
  options: DIVS.map((d) => ({ v: d.v, label: '' })),
  fmt: (v) => String(v),
  module: 'mode',
  label: 'CLK DIV',
  help: 'The note value of each arpeggiator step against the BPM: from half notes down to 64ths, with triplets.',
});
btn('clock.tap', 1218, 498, 'TAP TEMPO', {
  label: 'TAP TEMPO',
  ui: true,
  help: `Tap it in time to set the BPM; its lamp flashes on the beat. ${NOT_HERE} Turn BPM instead.`,
});

// ── Arpeggiator ───────────────────────────────────────────────────────────
btn('arp.on', 1398, 367, 'ON', {
  label: 'ON',
  name: 'ARPEGGIATOR ON',
  help: 'Turns the arpeggiator on: held keys play one at a time, in the order MODE sets, at the clock’s speed.',
});
knob('arp.octave', 1530, 353, 'OCTAVE', {
  kind: 'enum',
  def: '1',
  options: ['1', '2', '3'].map((v) => ({ v, label: '' })),
  fmt: (v) => `${v} octave${v === '1' ? '' : 's'}`,
  module: 'mode',
  label: 'OCTAVE',
  name: 'Arpeggiator OCTAVE',
  help: 'How many octaves the arpeggio climbs through: the held notes, then the same an octave up, and so on.',
});
[
  [330, '3'],
  [357, '2'],
  [384, '1'],
].forEach(([y, v]) => {
  led(1480, Number(y), { id: 'arp.octave', eq: String(v) });
  label(1463, Number(y), String(v), 13);
});
const ARP_MODES: ControlOption[] = [
  { v: 'up', label: '' },
  { v: 'down', label: '' },
  { v: 'updown', label: '' },
  { v: 'random', label: '' },
  { v: 'assign', label: '' },
];
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
knob('arp.mode', 1398, 488, 'MODE', {
  kind: 'enum',
  def: 'up',
  options: ARP_MODES,
  fmt: (v) => ARP_NAMES[String(v)] ?? String(v),
  module: 'mode',
  label: 'MODE',
  name: 'Arpeggiator MODE',
  help: 'The order of the arpeggio: up, down, up and down, random, or Assign, the order the keys were pressed.',
});
knob('arp.repeat', 1530, 485, 'REPEAT', {
  kind: 'enum',
  def: '0',
  options: ['0', '1', '2', '3'].map((v) => ({ v, label: '' })),
  fmt: (v) => (v === '0' ? 'off' : `×${Number(v) + 1}`),
  module: 'mode',
  label: 'REPEAT',
  name: 'Arpeggiator REPEAT',
  ui: true,
  help: `Plays each note of the arpeggio one to three extra times before moving on. ${NOT_HERE}`,
});
[
  [462, '3'],
  [489, '2'],
  [516, '1'],
].forEach(([y, v]) => {
  led(1480, Number(y), { id: 'arp.repeat', eq: String(v) });
  label(1463, Number(y), String(v), 13);
});

// ── Sequencer ─────────────────────────────────────────────────────────────
btn('seq.record', 1647, 367, 'RECORD', {
  label: 'RECORD',
  ui: true,
  help: 'Records a sequence of up to 64 steps, one note or chord per step, with rests and ties. Here it turns on the sequencer’s step record.',
});
seqButtons['seq.record'] = 'record';
btn('seq.play', 1647, 498, 'PLAY', {
  label: 'PLAY',
  ui: true,
  help: 'Starts and stops the sequence saved with the sound. Here it starts and stops the sequencer under the panel.',
});
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
];
const FX_NAME: Record<string, string> = Object.fromEntries(FX_TYPES.map((f) => [f.v, f.name]));
btn('fx.on', 1766, 367, 'ON', {
  label: 'ON',
  name: 'EFFECT ON',
  module: 'fx',
  help: 'Turns the effect on.',
});
knob('fx.type', 1867, 355, 'TYPE', {
  kind: 'enum',
  def: 'bbd',
  options: FX_TYPES.map((f) => ({ v: f.v, label: '' })),
  fmt: (v) => FX_NAME[String(v)] ?? String(v),
  module: 'fx',
  label: 'TYPE',
  name: 'Effect TYPE',
  help: 'Chooses the effect: a stereo, bucket-brigade (BBD) or tape delay, chorus, flanger, phaser, high-pass filter, distortion, ring modulator or rotating speaker. The three knobs to its right change job with it. The ring modulator is not modelled here: with it chosen the sound passes dry.',
});
knob('fx.time', 1993, 353, 'TIME', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'fx',
  label: 'TIME',
  name: 'Effect TIME',
  scale: TICKS,
  fmt: pct,
  help: 'The effect’s main setting: the delay time, the speed of a chorus, flanger, phaser or rotor, the filter’s frequency or the distortion’s gain.',
});
knob('fx.mix', 2117, 353, 'DEPTH/MIX', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 3,
  module: 'fx',
  label: 'DEPTH/MIX',
  name: 'Effect DEPTH/MIX',
  scale: TICKS,
  fmt: pct,
  help: 'How much of the effect you hear against the dry sound, or how deep a chorus, flanger or phaser sweeps.',
});
knob('fx.misc', 2243, 353, 'FBACK/MISC', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'fx',
  label: 'FBACK/MISC',
  name: 'Effect FBACK/MISC',
  scale: TICKS,
  fmt: pct,
  help: 'The effect’s second setting: the repeats of a delay, a flanger’s feedback, a phaser’s or the filter’s resonance, a chorus’s or the distortion’s tone, or the rotating speaker’s distance.',
});
btn('fx.sync', 2362, 367, 'CLK SYNC', {
  label: 'CLK SYNC',
  name: 'Effect CLK SYNC',
  module: 'fx',
  ui: true,
  help: `Locks a delay’s time to the clock, as a note value. ${NOT_HERE} TIME always sets a free time.`,
});

// ── Reverb ────────────────────────────────────────────────────────────────
btn('rev.on', 1766, 497, 'ON', {
  label: 'ON',
  name: 'REVERB ON',
  module: 'fx',
  help: 'Turns the reverb on.',
});
const REVERB: [string, number, string, number, string][] = [
  ['rev.mix', 1867, 'MIX', 3, 'The balance of dry sound and reverb, from all dry to all wet.'],
  [
    'rev.damping',
    1993,
    'DAMPING',
    4,
    'How quickly the treble dies away inside the reverb: turned up, the tail turns dark and soft.',
  ],
  [
    'rev.predelay',
    2117,
    'PREDELAY',
    1,
    'A gap before the reverb starts, up to 200 ms, which keeps the front of each note clear of it.',
  ],
  ['rev.decay', 2243, 'DECAY', 4, 'How long the reverb takes to die away.'],
];
REVERB.forEach(([id, x, lab, def, help]) =>
  knob(id, x, 486, lab, {
    kind: 'cont',
    min: 0,
    max: 10,
    def,
    module: 'fx',
    label: lab,
    name: `Reverb ${lab}`,
    scale: TICKS,
    fmt: id === 'rev.predelay' ? (v) => `${Math.round(v * 20)} ms` : pct,
    help,
  })
);
label(1830, 522, 'dry', 13, { weight: 500 });
label(1903, 522, 'wet', 13, { weight: 500 });
knob('rev.tone', 2373, 486, 'TONE', {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  module: 'fx',
  label: 'TONE',
  name: 'Reverb TONE',
  fmt: (v) =>
    Math.abs(v) < 0.05 ? 'flat' : v < 0 ? `darker ${pct(-v * 2)}` : `thinner ${pct(v * 2)}`,
  help: 'Tilts the reverb’s tone: left cuts its treble (lpf), right cuts its bass (hpf), so the tail sits out of the way of the dry sound.',
});
decor.push({ t: 'arc', x: X(2373), y: Y(486), r: 46, a0: -140, a1: 140, w: 2 });
label(2318, 522, 'lpf', 13, { weight: 500 });
label(2428, 522, 'hpf', 13, { weight: 500 });

// ── Oscillators ───────────────────────────────────────────────────────────
const OCTAVES: ControlOption[] = ['-2', '-1', '0', '+1', '+2'].map((v) => ({ v, label: '' }));
const OCT_DX = [-46, -26, 0, 26, 46];
const OCT_DY = [-24, -42, -49, -42, -24];
[
  [1, 646],
  [2, 776],
].forEach(([n, y]) => {
  text(240, y + 6, `OSC ${n}`, 16, { rotate: -90 });
  knob(`osc${n}.octave`, 314, y, 'OCTAVE', {
    kind: 'enum',
    def: '0',
    options: OCTAVES,
    fmt: (v) => `${v === '0' ? '' : v} ${v === '0' ? 'centre' : 'oct'}`.trim(),
    module: 'osc',
    label: 'OCTAVE',
    name: `OSC ${n} OCTAVE`,
    help: `Sets Oscillator ${n} two octaves down to two up, in octave steps. The lamps show which.`,
  });
  OCTAVES.forEach((o, i) => {
    led(314 + OCT_DX[i], y + OCT_DY[i], { id: `osc${n}.octave`, eq: o.v });
    label(314 + OCT_DX[i] + Math.sign(OCT_DX[i]) * 6, y + OCT_DY[i] - 15, String(o.v), 12);
  });
  knob(`osc${n}.pitch`, 455, y, 'PITCH', {
    kind: 'cont',
    min: -7,
    max: 7,
    def: 0,
    module: 'osc',
    label: 'PITCH',
    name: `OSC ${n} PITCH`,
    scale: TICKS,
    fmt: fmtSemi,
    help: `Tunes Oscillator ${n} up to seven semitones either way, with a detent at the centre. A few cents off the other oscillator thickens the sound; seven semitones is a fifth.`,
  });
  label(455, y - 37, '0', 13);
  label(421, y + 28, '−', 15);
  label(489, y + 28, '+', 15);
  knob(`osc${n}.shape`, 642, y, 'SHAPE', {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    module: 'osc',
    label: 'SHAPE',
    name: `OSC ${n} SHAPE`,
    scale: TICKS,
    fmt: shapeName,
    help: `Morphs Oscillator ${n}’s wave: a pure sine at the left, a bright sawtooth at the middle, a hollow square at three quarters, then a pulse that thins to a nasal buzz at the right.`,
  });
  decor.push(
    { t: 'wave', x: X(612), y: Y(y - 34), size: 12, shape: 'saw', w: 2 },
    { t: 'wave', x: X(672), y: Y(y - 34), size: 12, shape: 'sq', w: 2 },
    { t: 'wave', x: X(612), y: Y(y + 36), size: 12, shape: 'sine', w: 2 },
    { t: 'wave', x: X(672), y: Y(y + 36), size: 12, shape: 'npulse', w: 2 }
  );
});
btn('osc1.sync', 552, 710, null, {
  label: 'SYNC 2→1',
  name: 'SYNC 2→1',
  module: 'osc',
  help: 'Hard sync: Oscillator 1 restarts its wave every time Oscillator 2 starts a cycle. Oscillator 2 then sets the note and Oscillator 1’s PITCH and OCTAVE change only its tone, which turns hard and tearing.',
});
arrowName(553, 752, 'SYNC');

// ── Mixer ─────────────────────────────────────────────────────────────────
const MIX: [string, number, number, string, number, string][] = [
  ['mix.osc1', 811, 646, 'OSC 1', 7, 'The level of Oscillator 1 into the filter.'],
  [
    'mix.sub',
    955,
    646,
    'OSC 1 SUB',
    0,
    'The level of the sub-oscillator: a square wave an octave below Oscillator 1, which adds weight underneath.',
  ],
  [
    'mix.osc2',
    811,
    776,
    'OSC 2',
    0,
    'The level of Oscillator 2 into the filter. With FM 2→1 on, it sets how hard Oscillator 2 frequency-modulates Oscillator 1 instead, and Oscillator 2 is not heard.',
  ],
];
MIX.forEach(([id, x, y, lab, def, help]) =>
  knob(id, x, y, lab, {
    kind: 'cont',
    min: 0,
    max: 10,
    def,
    module: 'mixer',
    label: lab,
    name: `Mixer ${lab}`,
    scale: TICKS,
    fmt: pct,
    help,
  })
);
knob('mix.noise', 955, 776, 'NOISE', {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  module: 'mixer',
  label: 'NOISE',
  name: 'Mixer NOISE',
  scale: TICKS,
  fmt: (v) => (Math.abs(v) < 0.05 ? 'off' : `${v < 0 ? 'pink' : 'white'} ${pct(Math.abs(v) * 2)}`),
  help: 'Noise into the filter: off at the centre, pink (darker, rumbling) turned left and white (bright, hissing) turned right.',
});
label(955, 739, '0', 13);
label(912, 808, 'pink', 13, { weight: 500 });
label(1000, 808, 'white', 13, { weight: 500 });
btn('osc.fm', 882, 710, null, {
  label: 'FM 2→1',
  name: 'FM 2→1',
  module: 'osc',
  help: 'Lets Oscillator 2 frequency-modulate Oscillator 1, with the OSC 2 knob as the amount. A little gives a metallic edge, more gives clangorous, bell-like tones.',
});
arrowName(885, 752, 'FM');
decor.push({
  t: 'path',
  d: `M${X(846)} ${Y(830)} H${X(882)} V${Y(768)} M${X(876)} ${Y(776)} L${X(882)} ${Y(766)} L${X(888)} ${Y(776)}`,
  w: 2,
});

// ── Filter ────────────────────────────────────────────────────────────────
knob('vcf.resonance', 1122, 646, 'RESONANCE', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'filter',
  label: 'RESONANCE',
  scale: TICKS,
  fmt: pct,
  help: 'Emphasis at the cutoff: a peak that makes the filter sing and whistle, and turned up near full, a sine tone of its own.',
});
knob('vcf.drive', 1122, 776, 'DRIVE', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 2,
  module: 'filter',
  label: 'DRIVE',
  scale: TICKS,
  fmt: pct,
  help: 'How hard the mixer drives the filter: turned up, the filter saturates, sounding thicker and grittier, and its resonance is held back.',
});
knob(
  'vcf.cutoff',
  1300,
  710,
  'CUTOFF',
  {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 7,
    module: 'filter',
    label: 'CUTOFF',
    scale: { ticks: 13, tickR: 1.32 },
    fmt: (v) => fmtHz(vcfHz(v)),
    help: 'The low-pass filter’s cutoff: everything above it is taken away. Down, the sound is dark and muffled; up, bright and open.',
  },
  62,
  119
);
decor.push({
  t: 'arc',
  x: X(1300),
  y: Y(710),
  r: 74,
  a0: -150,
  a1: 150,
  w: 7,
  cap: 'butt',
  stroke: ORANGE,
  hw: true,
});

// ── Envelopes ─────────────────────────────────────────────────────────────
const ROUTINGS: ControlOption[] = [
  { v: 'filter-amp', label: 'Env 1 Filter / Env 2 Amp' },
  { v: 'aux-filteramp', label: 'Env 1 Aux / Env 2 Filter+Amp' },
  { v: 'aux-filtergate', label: 'Env 1 Aux / Env 2 Filter+Gate' },
];
label(1546, 601, 'ENV 1', 17, { anchor: 'start' });
label(1546, 733, 'ENV 2', 17, { anchor: 'start' });
(
  [
    [626, 'Filter', ['filter-amp']],
    [652, 'Aux', ['aux-filteramp', 'aux-filtergate']],
    [757, 'Amp', ['filter-amp']],
    [784, 'Filter+Amp', ['aux-filteramp']],
    [811, 'Filter+Gate', ['aux-filtergate']],
  ] as const
).forEach(([y, lab, on]) => {
  led(1525, y, { id: 'env.routing', in: [...on] });
  label(1540, y, lab, 14, { anchor: 'start', weight: 500 });
});
decor.push({
  t: 'path',
  d: `M${X(1538)} ${Y(601)} H${X(1500)} V${Y(840)} M${X(1500)} ${Y(733)} H${X(1538)}`,
  w: 2,
});
btn(
  'env.routing',
  1492,
  852,
  null,
  {
    kind: 'enum',
    def: 'filter-amp',
    options: ROUTINGS,
    lit: 'always',
    label: 'ENV ROUTING',
    module: 'env',
    help: 'Sets what the two envelopes do. First: Envelope 1 moves the filter and Envelope 2 the volume. Second: Envelope 2 moves both, and Envelope 1 is free for its own destination (Aux). Third: as the second, but the volume simply opens while a key is held (a gate) instead of following an envelope.',
  },
  36,
  32
);
label(1522, 852, 'ENV ROUTING', 14, { anchor: 'start' });
const ENV_COLS: [string, number, string][] = [
  ['attack', 1678, 'ATTACK'],
  ['decay', 1820, 'DECAY'],
  ['sustain', 1962, 'SUSTAIN'],
  ['release', 2106, 'RELEASE'],
];
const ENV_DEF: Record<string, number[]> = {
  attack: [0, 0],
  decay: [5, 5],
  sustain: [5, 10],
  release: [4, 4],
};
[
  [1, 646],
  [2, 776],
].forEach(([n, y]) => {
  const e = `ENV ${n}`;
  ENV_COLS.forEach(([stage, x, lab]) =>
    knob(`env${n}.${stage}`, x, y, lab, {
      kind: 'cont',
      min: 0,
      max: 10,
      def: ENV_DEF[stage][n - 1],
      module: 'env',
      label: lab,
      name: `${e} ${lab}`,
      scale: TICKS,
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
  knob(`env${n}.amount`, 2250, y, 'AMOUNT', {
    kind: 'cont',
    min: -5,
    max: 5,
    def: n === 1 ? 0 : 5,
    module: 'env',
    label: 'AMOUNT',
    name: `${e} AMOUNT`,
    scale: TICKS,
    fmt: signed,
    help:
      n === 1
        ? 'How far Envelope 1 moves the filter, or its Aux destination, either way from the centre. Left of 0 turns the envelope upside down.'
        : 'How far Envelope 2 moves the volume and, when ENV ROUTING gives it the filter, the filter too. Left of 0 turns it upside down for the filter; the volume then stays shut here.',
  });
  btn(`env${n}.vel`, 2350, y + 6, 'VELOCITY', {
    label: 'VELOCITY',
    name: `${e} VELOCITY`,
    module: 'env',
    help: `Makes Envelope ${n} follow how hard each key is played: softer notes give a smaller envelope.`,
  });
});
label(2250, 611, '0', 13);
label(2216, 676, '−', 15);
label(2284, 676, '+', 15);

// ── Performance and program row ───────────────────────────────────────────
const WIDE = 56;
btn(
  'glide.on',
  137,
  928,
  'GLIDE',
  {
    label: 'GLIDE',
    module: 'glide',
    help: 'Turns glide on: each note slides from the pitch of the last one, over the time the GLIDE knob sets.',
  },
  WIDE,
  30
);
btn(
  'voice.unison',
  316,
  928,
  'UNISON',
  {
    label: 'UNISON',
    module: 'osc',
    help: 'Stacks the voices on one note for a huge, thick mono sound; on the hardware a held chord can be memorised and played from single keys. Here all five voices stack, slightly detuned.',
  },
  WIDE,
  30
);
btn(
  'kbd.hold',
  496,
  928,
  'HOLD',
  {
    label: 'HOLD',
    ui: true,
    help: 'Holds the notes you play after you let go, and latches the arpeggio. Here it is the page’s Hold.',
  },
  WIDE,
  30
);
seqButtons['kbd.hold'] = 'hold';
btn(
  'ui.factory',
  674,
  928,
  'FACTORY',
  {
    label: 'FACTORY',
    ui: true,
    help: `Switches the program buttons between the 128 factory and 128 user programs. ${NOT_HERE} The sounds are in the sound list.`,
  },
  WIDE,
  30
);
btn(
  'ui.bank',
  812,
  928,
  null,
  {
    label: 'BANK',
    ui: true,
    help: `With a program button, chooses one of the eight banks of 16 programs. ${NOT_HERE}`,
  },
  WIDE,
  30
);
decor.push({
  t: 'rect',
  x: X(782),
  y: Y(959),
  w: 62,
  h: 28,
  r: 14,
  fill: 'none',
  stroke: INK,
  sw: 2,
});
label(813, 973, 'BANK', 14);
decor.push({ t: 'rect', x: X(863), y: Y(908), w: 110, h: 40, r: 3, fill: '#140606' });
text(918, 941, '101', 30, { fill: '#ff3b2e', weight: 700, spacing: 3 });
const PROG_X = [
  1015, 1087, 1157, 1228, 1313, 1384, 1456, 1527, 1610, 1683, 1753, 1826, 1910, 1981, 2052, 2124,
];
line(844, 973, 2140, 973);
PROG_X.forEach((x, i) => {
  decor.push({
    t: 'rect',
    x: X(x - 18),
    y: Y(912),
    w: 36,
    h: 32,
    r: 3,
    fill: i === 0 ? '#b3241c' : '#3b3c40',
    stroke: '#111',
    sw: 1.5,
    hw: true,
  });
  decor.push({ t: 'circle', x: X(x), y: Y(973), r: 14, fill: '#2a2b2e', stroke: INK, sw: 2 });
  label(x, 973, String(i + 1), 13);
  if (i >= 9) label(x + 18, 990, 'ABCDEFG'[i - 9], 10);
});
line(1000, 1002, 1490, 1002);
line(1646, 1002, 2140, 1002);
label(1568, 1002, 'PROGRAM SELECT', 15);
btn(
  'ui.preset',
  2308,
  928,
  'PRESET',
  {
    label: 'PRESET',
    ui: true,
    help: `Switches between the stored program and the panel as the knobs are set (live panel). ${NOT_HERE}`,
  },
  WIDE,
  30
);

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'master',
    label: 'Volume, overdrive, vintage and glide',
    module: 'out',
    keywords: 'volume level overdrive drive distortion vintage drift glide portamento',
    rects: [R(12, 270, 196, 890)],
    help: 'VOLUME sets the output level and OVERDRIVE drives the summed voices before the effects. VINTAGE lets the five voices drift apart like an old polysynth’s, and GLIDE sets how long notes slide when glide is on.',
  },
  {
    id: 'lfo',
    label: 'LFOs',
    module: 'lfo',
    keywords: 'lfo vibrato wobble tremolo wah modulation sync shape destination',
    rects: [R(198, 270, 549, 560)],
    help: 'Two LFOs share these controls, and the LFO button chooses which one they set. On the Take 5, LFO 1 is one wave for all the voices and LFO 2 runs on its own in each voice; here both run in each voice. FREQUENCY sets the speed, SHAPE the wave, AMOUNT the depth, and DEST, on the display, what it moves.',
  },
  {
    id: 'mod',
    label: 'Mod matrix',
    module: 'mod',
    keywords: 'modulation matrix source destination assign',
    rects: [R(551, 270, 669, 560)],
    help: 'Sets up the 16-slot mod matrix: hold SRC ASSIGN and move a control to choose the source, then DEST ASSIGN and a knob to choose the destination. Here the matrix is left empty.',
  },
  {
    id: 'settings',
    label: 'Display, settings and memory',
    module: 'mode',
    keywords: 'display screen menu global program compare write save select value',
    rects: [R(671, 270, 1099, 560)],
    help: 'The display shows the program, the menus and the destinations. global and program open the settings menus, SELECT and VALUE move through them, and compare and write check and save a sound. Here the display shows the LFO and Envelope 1 destinations.',
  },
  {
    id: 'clock',
    label: 'Clock',
    module: 'mode',
    keywords: 'tempo bpm clock divide tap',
    rects: [R(1101, 270, 1337, 560)],
    help: 'The tempo of the arpeggiator and the sequencer. BPM sets the beats a minute and CLK DIV the note value of each arpeggiator step; TAP TEMPO sets the BPM by tapping.',
  },
  {
    id: 'arp',
    label: 'Arpeggiator',
    module: 'mode',
    keywords: 'arpeggiator arp up down random octave repeat',
    rects: [R(1339, 270, 1587, 560)],
    help: 'Plays held keys one at a time in a pattern. ON turns it on, MODE sets the order, OCTAVE how many octaves it climbs, and REPEAT how many times each note plays.',
  },
  {
    id: 'seq',
    label: 'Sequencer',
    module: 'mode',
    keywords: 'sequencer sequence record play step',
    rects: [R(1589, 270, 1707, 560)],
    help: 'A 64-step sequencer saved with each sound: RECORD writes notes and chords step by step, PLAY runs it. Here they drive the sequencer under the panel.',
  },
  {
    id: 'effect',
    label: 'Effect',
    module: 'fx',
    keywords:
      'effect fx delay echo bbd tape chorus flanger phaser filter distortion ring rotary leslie',
    rects: [R(1709, 270, 2450, 432)],
    help: 'One digital effect after the voices. TYPE chooses it; TIME, DEPTH/MIX and FBACK/MISC change job with the type, and CLK SYNC locks a delay to the tempo.',
  },
  {
    id: 'reverb',
    label: 'Reverb',
    module: 'fx',
    keywords: 'reverb space room hall plate tail',
    rects: [R(1709, 438, 2450, 560)],
    help: 'A reverb after the effect. MIX balances dry and wet, DAMPING darkens the tail, PREDELAY holds it back, DECAY sets its length and TONE tilts it darker or thinner.',
  },
  {
    id: 'osc',
    label: 'Oscillators',
    module: 'osc',
    keywords: 'oscillator vco octave pitch tune detune shape waveform sine saw square pulse sync',
    rects: [R(217, 573, 722, 888)],
    help: 'Two oscillators per voice. OCTAVE and PITCH set each one’s tuning, and SHAPE morphs its wave from sine through sawtooth to a narrowing pulse. SYNC 2→1 locks Oscillator 1 to Oscillator 2.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mixer level sub oscillator noise pink white fm frequency modulation',
    rects: [R(735, 573, 1032, 888)],
    help: 'The levels into the filter: the two oscillators, the sub-oscillator an octave below Oscillator 1, and noise, pink one way and white the other. FM 2→1 turns the OSC 2 knob into the depth of Oscillator 2’s frequency modulation of Oscillator 1.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf cutoff resonance drive low-pass lowpass 4-pole brightness',
    rects: [R(1045, 573, 1445, 888)],
    help: 'A resonant low-pass filter in each voice. CUTOFF sets how bright the sound is, RESONANCE adds a peak at the cutoff, and DRIVE pushes the filter into saturation.',
  },
  {
    id: 'env',
    label: 'Envelopes',
    module: 'env',
    keywords: 'envelope adsr attack decay sustain release amount velocity routing contour vca amp',
    rects: [R(1455, 573, 2415, 888)],
    help: 'Two ADSR envelopes per voice. ENV ROUTING sets their jobs: the filter and the volume, or Envelope 2 doing both while Envelope 1 is free. AMOUNT sets each one’s depth and VELOCITY makes it follow how hard you play.',
  },
  {
    id: 'play',
    label: 'Glide, unison and hold',
    module: 'mode',
    keywords: 'glide portamento unison stack hold latch sustain',
    rects: [R(12, 900, 580, 1000)],
    help: 'GLIDE turns glide on, UNISON stacks the voices on one note, and HOLD holds the notes you play and latches the arpeggio.',
  },
  {
    id: 'programs',
    label: 'Programs',
    module: 'mode',
    keywords: 'program preset bank factory user memory patch select',
    rects: [R(600, 900, 2450, 1020)],
    help: 'Chooses one of 256 stored sounds: FACTORY switches between factory and user sounds, BANK and the sixteen buttons pick one, and PRESET switches between the stored sound and the knobs as they are. Here the sounds are in the sound list.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
/** One of `DESTS` → an engine route, `a` the depth −1..1. */
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
const envOf = (v: ControlValues, n: number): EnvParams => ({
  a: envTime(num(v, `env${n}.attack`)),
  d: envTime(num(v, `env${n}.decay`)),
  s: num(v, `env${n}.sustain`) / 10,
  r: envTime(num(v, `env${n}.release`)),
});

/** Each effects algorithm's parameter defaults, by id. */
const FX_DEFAULTS = new Map(
  FX_ALGOS.map((a) => [a.id, Object.fromEntries(a.params.map((q) => [q.ref, q.def]))])
);
/** An effects algorithm's slot, with its defaults and `p` over them. */
function slot(alg: string, p: Record<string, number | string>): FxSlot {
  const base = FX_DEFAULTS.get(alg);
  // every id here is a literal below: a miss is an algorithm renamed in the effects table, not a value from a sound
  if (!base) throw new Error(`Take 5: no effects algorithm ${alg}`);
  return { alg, level: 1, p: { ...base, ...p } };
}
/** The chosen effect, from TYPE and its three knobs (each 0..1). */
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
    default:
      // the ring modulator: no algorithm for it, so the sound passes dry
      return { alg: null };
  }
}
function reverbSlot(v: ControlValues): FxSlot {
  const tone = num(v, 'rev.tone') / 5;
  return slot('platerev', {
    MIX: Math.round(num(v, 'rev.mix') * 10),
    DMP: Math.round(expMap(1 - num(v, 'rev.damping') / 10, 1500, 18000)),
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

  // FM 2→1: the OSC 2 knob is the depth, and Oscillator 2 leaves the mixer
  const fm = !!v['osc.fm'];
  const o2 = num(v, 'mix.osc2') / 10;
  if (fm && o2 > 0) routes.push({ src: 'osc2', dst: 'pitch1', amt: 24 * o2 * o2 });
  // the gated VCA of the third routing: open while a key is held
  const gated = routing === 'aux-filtergate';
  if (gated) routes.push({ src: 'gate', dst: 'amp', amt: 1 });

  const noise = num(v, 'mix.noise') / 5;
  const osc = (n: number, level: number) => {
    const { mix, pw } = shapeOf(num(v, `osc${n}.shape`) / 10);
    return {
      level,
      mix,
      pw,
      semi: 12 * Number(v[`osc${n}.octave`]) + num(v, `osc${n}.pitch`),
      kbd: true,
    };
  };
  const unison = !!v['voice.unison'];
  const vintage = num(v, 'voice.vintage') / 10;
  const drive = num(v, 'drive.amount') / 10;
  const div = DIVS.find((d) => d.v === v['clock.div']) ?? DIVS[4];
  const fxOn = !!v['fx.on'];
  const revOn = !!v['rev.on'];
  return {
    osc: [
      {
        ...osc(1, 0.6 * (num(v, 'mix.osc1') / 10)),
        syncTo: v['osc1.sync'] ? 1 : -1,
        subLevel: 0.6 * (num(v, 'mix.sub') / 10),
      },
      { ...osc(2, fm ? 0 : 0.6 * o2), syncTo: -1 },
    ],
    noise: {
      level: level10(Math.abs(noise) * 10, 0.8),
      color: noise < 0 ? 'pink' : 'white',
    },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.cutoff')),
      res: (num(v, 'vcf.resonance') / 10) * 1.1,
      envAmt: (aux ? a2 : a1) * 7,
      envSrc: aux ? (e2v ? 'env2v' : 'env2') : e1v ? 'env1v' : 'env1',
      kbd: 0.5,
      drive: 0.5 + 0.25 * num(v, 'vcf.drive'),
    },
    env1: envOf(v, 1),
    env2: envOf(v, 2),
    vca: gated
      ? { envSrc: 'none', bias: 0 }
      : { envSrc: e2v ? 'env2v' : 'env2', bias: 0, gain: clamp(a2, 0, 1) },
    lfo: {
      rate: lfoHz(num(v, 'lfo1.freq')),
      mix: LFO_MIX[String(v['lfo1.shape'])] ?? LFO_MIX.tri,
      keySync: false,
    },
    lfo2: {
      rate: lfoHz(num(v, 'lfo2.freq')),
      mix: LFO_MIX[String(v['lfo2.shape'])] ?? LFO_MIX.tri,
      keySync: false,
    },
    glide: { time: v['glide.on'] ? glideTime(num(v, 'glide.time')) : 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly: { voices: 5, stack: unison ? 5 : 1, mono: unison, detune: unison ? 0.12 : 0 },
    arp: {
      on: !!v['arp.on'],
      // the engine steps in sixteenths: CLK DIV's note value is that many sixteenths
      bpm: num(v, 'clock.bpm') / (4 * div.beats),
      gate: 0.5,
      mode: ARP_ENGINE[String(v['arp.mode'])] ?? 'up',
      octaves: Number(v['arp.octave']),
      hold: false,
    },
    drift: { depth: vintage > 0 ? 0.3 * vintage * vintage : 0, rate: 1.2 },
    routes,
    normals: {},
    od: drive > 0 ? { on: true, drive, tone: 0.5, level: 0.8 } : { on: false },
    delay: { on: false },
    fx:
      fxOn || revOn
        ? {
            mode: 'insert',
            routing: 1,
            slots: [
              fxOn
                ? effectSlot(
                    String(v['fx.type']),
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
    tune: 0,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const take5: SynthDef & { version: number } = {
  id: 'take-5',
  version: 1,
  name: 'Take 5',
  maker: 'Sequential',
  year: 2021,
  heritage: 'A compact sibling of the 2020 Prophet-5 Rev4',
  summary:
    'Five analogue voices, each two oscillators morphing sine → saw → pulse (with sync and FM), a sub-oscillator and pink or white noise → a resonant low-pass filter with drive → the VCA, with two envelopes and two LFOs. The voices go through overdrive, one of eleven effects and a reverb; an arpeggiator and a sequencer play them.',
  view: { w: X(2490), h: Y(1062) },
  theme: {
    panel: '#2c2d30',
    panel2: '#222326',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'none',
    cheekW: 0,
    knobRing: false,
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
  },
  tempo: 'clock.bpm',
  seqButtons,
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
};

export default take5;
