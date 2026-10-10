/**
 * Moog Grandmother: the definition (D1). Positions are pixels on ref/moog-grandmother-rectified.jpg:
 * the owner's photo (ref/moog-grandmother.jpg, taken at an angle) with the faceplate's perspective
 * taken out, 3940 × 1465. They are written in that image space and turned into view units by X() /
 * Y() (half scale). Sizes (radii, lettering, widths) are in view units. The knobs stand tall and
 * lean away from the camera in the photo, so each knob is placed on its printed tick ring or, where
 * there is none, centred over its own label. The faceplate ends at the blue GRANDMOTHER strip. Below
 * it the view adds the left-hand controller (GLIDE and the PLAY / HOLD / TAP buttons), which sits
 * beside the keys on the hardware, and the top of the keys for reference. The data model is
 * ref/moog-grandmother.synth.json (from the owner's manual: controls, patch points, normals).
 *
 * Engine notes: the voice is the Model 15's (Behringer's copy of this panel), run as a one-voice
 * `poly` synth so the engine's arpeggiator can play it. The MOD wheel is the LFO's master depth, as
 * on the hardware: PITCH AMT, CUTOFF AMT and PULSE WIDTH AMT set how far it can go and the wheel how
 * much of that is used. The 6 dB HIGH PASS is a separate utility (EngineParams `hp6`), only in
 * circuit when patched. MIX crossfades the dry VCA output with the engine's spring, and REVERB IN
 * feeds only the spring. Mixer levels past 1 o'clock drive the filter input harder
 * (`filter.drive`).
 *
 * Transliterated from the prototype file `src/synths/grandmother.js` (D3), the way
 * `defs/model-d.ts` was: no content (sounds, lineage, unusual notes), a `version`, the maker's marks
 * tagged `brand` (the printed "GRANDMOTHER SEMI-MODULAR ANALOG SYNTHESIZER" and the "moog" logo),
 * and panel values read through `num()`.
 */
import type {
  ArpMode,
  Area,
  Control,
  ControlCommon,
  ControlOption,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  Jack,
  KnobControl,
  KnobScale,
  LfoMix,
  LineDecor,
  OscParams,
  RectDecor,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveDecor,
  WaveShape,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  Partial<Pick<KnobControl, 'r' | 'scale'>> & {
    min?: number;
    max?: number;
    def?: number;
    fmt?: (v: number) => string;
  };
type SwitchRest = Pick<ControlCommon, 'name' | 'module' | 'help'>;
type JackRest = OmitEach<Jack, 'id' | 'x' | 'y' | 'r' | 'labelPos'>;
type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight'>>;
type BoxRest = Partial<Pick<RectDecor, 'fill' | 'r' | 'hw' | 'stroke' | 'sw'>>;

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The manual gives the LFO range (0.07 Hz–1.3 kHz), the cutoff range (the panel prints 20 Hz–20 kHz), OSC 2's ±7
// semitones and the ARP/SEQ tempo (20–280 BPM). Envelope times, glide time, the HIGH PASS range, the wider FREQUENCY
// range with SYNC on and the modulation depths are this app's choice.
const lfoHz = (v: number): number => expMap(v / 10, 0.07, 1300);
const cutoffHz = (v: number): number => expMap(v / 10, 20, 20000);
const hpHz = (v: number): number => expMap(v / 10, 20, 8000);
const attTime = (v: number): number => expMap(v / 10, 0.002, 10);
const decTime = (v: number): number => expMap(v / 10, 0.002, 10);
const relTime = (v: number): number => expMap(v / 10, 0.002, 10);
const glideTime = (v: number): number => (v <= 0 ? 0 : 0.01 * Math.pow(300, v / 10)); // up to 3 s
const arpBpm = (v: number): number => expMap(v / 10, 20, 280);
const signed = (v: number, max: number, curve = 1.4): number =>
  v === 0 ? 0 : Math.sign(v) * Math.pow(Math.abs(v) / 5, curve) * max;
const OCT1: Record<string, number> = { 32: -24, 16: -12, 8: 0, 4: 12 };
const OCT2: Record<string, number> = { 16: -12, 8: 0, 4: 12, 2: 24 };

const OX = 40,
  OY = 30,
  K = 0.5; // image pixel of the view's top-left corner, and view units per image pixel
const X = (x: number): number => (x - OX) * K;
const Y = (y: number): number => (y - OY) * K;
const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const INK = '#ededea';
const DARK = '#1b1b1d';
const C = {
  yellow: '#d6dc52',
  blue: '#93cfe3',
  green: '#93d38c',
  red: '#e4787c',
  key: '#f4f4f0',
};

// ── Drawing helpers (image coordinates in, view units out) ────────────────
const polarXY = (x: number, y: number, r: number, a: number): [number, number] => [
  x + r * Math.sin((a * Math.PI) / 180),
  y - r * Math.cos((a * Math.PI) / 180),
];
/** Text centred on image point (x, y); the renderer places text by its baseline. */
const text = (x: number, y: number, t: string, size = 16, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y) + size * 0.36,
    text: t,
    size,
    anchor: 'middle',
    ...rest,
  });
};
const line = (
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  w = 2.4,
  rest: Partial<Pick<LineDecor, 'stroke' | 'hw'>> = {}
): void => {
  decor.push({ t: 'line', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), w, ...rest });
};
const box = (x0: number, y0: number, x1: number, y1: number, rest: BoxRest = {}): void => {
  decor.push({ t: 'rect', x: X(x0), y: Y(y0), w: (x1 - x0) * K, h: (y1 - y0) * K, ...rest });
};
const frame = (x0: number, y0: number, x1: number, y1: number): void => {
  decor.push({
    t: 'frame',
    x: X(x0),
    y: Y(y0),
    w: (x1 - x0) * K,
    h: (y1 - y0) * K,
    r: 6,
    sw: 2.6,
    labelAt: 'none',
  });
};
/** A coloured section: the panel prints these as solid blocks with no outline. */
const block = (x0: number, y0: number, x1: number, y1: number, fill: string): void =>
  box(x0, y0, x1, y1, { fill, r: 6, hw: true });
const title = (x: number, y: number, t: string, fill = INK): void =>
  text(x, y, t, 15.5, { fill, weight: 700 });
/** A jack name printed on a plate: dark on the coloured blocks, light on black (the panel marks most outputs this way). */
const plate = (x: number, y: number, t: string, fill: string, ink: string, w = 116): void => {
  box(x - w / 2, y - 15, x + w / 2, y + 15, { fill, r: 3, hw: true });
  text(x, y, t, 11.5, { fill: ink, weight: 700 });
};
/** A knob name on an outlined (`outline: true`) or solid plate in a section colour (PITCH AMT, CUTOFF AMT, OSCILLATOR 1). */
const namePlate = (
  x: number,
  y: number,
  t: string,
  color: string,
  w: number,
  outline: boolean
): void => {
  box(
    x - w / 2,
    y - 19,
    x + w / 2,
    y + 19,
    outline ? { stroke: color, sw: 2.4, r: 3, hw: true } : { fill: color, r: 3, hw: true }
  );
  text(x, y, t, 14.5, { fill: outline ? color : DARK, weight: 700 });
};
const glyph = (
  x: number,
  y: number,
  shape: WaveShape,
  size = 8.5,
  rest: Partial<Pick<WaveDecor, 'stroke'>> = {}
): void => {
  decor.push({ t: 'wave', x: X(x), y: Y(y), size, shape, w: 2.6, ...rest });
};
/** The printed arc with an arrow at each end, 0 at the top and − / + at the ends, round a bipolar knob. */
const bipolarArc = (x: number, y: number, ink = INK, r = 106): void => {
  decor.push(
    {
      t: 'arc',
      x: X(x),
      y: Y(y),
      r: r * K,
      a0: -62,
      a1: -8,
      w: 2.4,
      cap: 'butt',
      stroke: ink,
    },
    { t: 'arc', x: X(x), y: Y(y), r: r * K, a0: 8, a1: 62, w: 2.4, cap: 'butt', stroke: ink }
  );
  text(x, y - r - 4, '0', 17, { weight: 700, fill: ink });
  const [lx, ly] = polarXY(x, y, r + 14, -70);
  const [rx, ry] = polarXY(x, y, r + 14, 70);
  text(lx, ly, '−', 22, { weight: 700, fill: ink });
  text(rx, ry, '+', 22, { weight: 700, fill: ink });
};
const TICKS: KnobScale = { ticks: 11, nums: [] };
const knob = (id: string, x: number, y: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r: 30,
    style: 'neutron',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    ...rest,
  });
};
/** A rotary switch: the printed positions are drawn by hand (option labels ''). */
const rotary = (
  id: string,
  x: number,
  y: number,
  options: ControlOption[],
  def: string,
  rest: SwitchRest
): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r: 31,
    style: 'd-chicken',
    kind: 'enum',
    options,
    def,
    labelPos: 'none',
    ...rest,
  });
};
/** A three-way bat toggle that throws left – centre – right. */
const toggle = (
  id: string,
  x: number,
  y: number,
  options: ControlOption[],
  def: string,
  rest: SwitchRest
): void => {
  controls.push({
    id,
    type: 'toggle',
    x: X(x),
    y: Y(y),
    w: 30,
    orient: 'h',
    lean: 1.15,
    kind: 'enum',
    options,
    def,
    labelPos: 'none',
    ...rest,
  });
};
const jack = (id: string, x: number, y: number, rest: JackRest): void => {
  jacks.push({ id, x: X(x), y: Y(y), r: 15, labelPos: 'none', ...rest });
};

// ── Faceplate ─────────────────────────────────────────────────────────────
block(125, 75, 415, 1215, C.yellow);
frame(450, 75, 1022, 1215);
block(1061, 75, 1647, 1210, C.blue);
frame(1672, 75, 1969, 1210);
frame(2000, 75, 2289, 1210);
block(2317, 70, 2903, 1205, C.green);
frame(2935, 70, 3506, 1200);
frame(3539, 65, 3833, 860);
block(3533, 890, 3830, 1200, C.red);
block(125, 1243, 3830, 1425, C.blue);
decor.push({
  t: 'text',
  x: X(130),
  y: Y(1395),
  text: 'GRAND',
  size: 82,
  anchor: 'start',
  weight: 800,
  fill: DARK,
  hw: true,
  brand: true,
});
decor.push({
  t: 'text',
  x: X(612),
  y: Y(1395),
  text: 'MOTHER',
  size: 82,
  anchor: 'start',
  weight: 300,
  fill: '#4d6c79',
  hw: true,
  brand: true,
});
decor.push({
  t: 'text',
  x: X(1352),
  y: Y(1330),
  text: 'SEMI-MODULAR',
  size: 33,
  anchor: 'start',
  weight: 800,
  fill: DARK,
  hw: true,
  brand: true,
});
decor.push({
  t: 'text',
  x: X(1352),
  y: Y(1392),
  text: 'ANALOG SYNTHESIZER',
  size: 33,
  anchor: 'start',
  weight: 800,
  fill: DARK,
  hw: true,
  brand: true,
});
decor.push({
  t: 'text',
  x: X(3570),
  y: Y(1385),
  text: 'moog',
  size: 80,
  anchor: 'middle',
  weight: 300,
  fill: '#55646b',
  hw: true,
  brand: true,
});

// ── ARP / SEQ ─────────────────────────────────────────────────────────────
title(270, 112, 'ARP/SEQ', DARK);
knob('arp.rate', 260, 485, {
  r: 40,
  def: 5,
  scale: TICKS,
  name: 'ARP/SEQ rate',
  module: 'mode',
  fmt: (v) => `${Math.round(arpBpm(v))} BPM`,
  help: 'The speed of the arpeggiator, from 20 to 280 BPM, one note per sixteenth. Clockwise is faster.',
});
text(268, 605, 'RATE', 15.5, { fill: DARK, weight: 700 });
decor.push({
  t: 'led',
  x: X(268),
  y: Y(637),
  r: 6,
  color: 'red',
  litWhen: { id: 'arp.play', eq: true },
});
toggle(
  'arp.mode',
  268,
  730,
  [
    { v: 'arp', label: 'ARP' },
    { v: 'seq', label: 'SEQ' },
    { v: 'rec', label: 'REC' },
  ],
  'arp',
  {
    name: 'ARP/SEQ mode',
    module: 'mode',
    help: 'ARP plays the held keys one after another; SEQ plays back a recorded sequence; REC records one. This app has no sequence memory, so SEQ and REC play the keys as they are pressed.',
  }
);
text(213, 785, 'ARP', 12, { fill: DARK, weight: 700 });
text(268, 785, 'SEQ', 12, { fill: DARK, weight: 700 });
plate(320, 785, 'REC', DARK, C.yellow, 46);
text(270, 815, 'MODE', 15.5, { fill: DARK, weight: 700 });
toggle(
  'arp.dir',
  268,
  905,
  [
    { v: 'ordr', label: 'ORDR' },
    { v: 'fb', label: 'FWD/BKWD' },
    { v: 'rndm', label: 'RNDM' },
  ],
  'ordr',
  {
    name: 'ARP/SEQ direction',
    module: 'mode',
    help: 'The order the arpeggio takes: ORDR in the order the keys were pressed, FWD/BKWD up and then back down, RNDM at random.',
  }
);
text(176, 955, 'ORDR', 11, { fill: DARK, weight: 700 });
text(268, 955, 'FWD/BKWD', 11, { fill: DARK, weight: 700 });
text(360, 955, 'RNDM', 11, { fill: DARK, weight: 700 });
text(270, 985, 'DIRECTION', 15.5, { fill: DARK, weight: 700 });
toggle(
  'arp.oct',
  268,
  1075,
  [
    { v: '1', label: '1' },
    { v: '2', label: '2' },
    { v: '3', label: '3' },
  ],
  '1',
  {
    name: 'ARP octaves / SEQ slot',
    module: 'mode',
    help: 'How many octaves the arpeggio climbs through: 1, 2 or 3. In SEQ and REC on the hardware it picks one of three stored sequences.',
  }
);
text(234, 1132, '1', 12, { fill: DARK, weight: 700 });
text(268, 1132, '2', 12, { fill: DARK, weight: 700 });
text(302, 1132, '3', 12, { fill: DARK, weight: 700 });
text(270, 1162, 'OCT / SEQ', 15.5, { fill: DARK, weight: 700 });

// ── Modulation ────────────────────────────────────────────────────────────
title(737, 112, 'MODULATION');
knob('lfo.rate', 732, 502, {
  r: 32,
  def: 5,
  scale: TICKS,
  name: 'LFO rate',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'The speed of the LFO, from one cycle every 14 seconds to 1.3 kHz. Above about 20 Hz it is fast enough to be heard as a rough or clangy tone rather than a wobble.',
});
text(737, 605, 'RATE', 15.5, { weight: 700 });
decor.push({ t: 'led', x: X(737), y: Y(637), r: 6, color: 'red', litWhen: 'lfo' });
const depth = (id: string, x: number, y: number, name: string, help: string): void =>
  knob(id, x, y, {
    scale: TICKS,
    name,
    module: 'mod',
    fmt: (v) => `${Math.round(v * 10)} %`,
    help,
  });
depth(
  'lfo.pitch',
  590,
  775,
  'Pitch amount',
  'How far the LFO can move the pitch of both oscillators: a little for vibrato, more for sirens and trills. The MOD wheel sets how much of this is used.'
);
namePlate(590, 883, 'PITCH AMT', C.blue, 160, true);
depth(
  'lfo.cutoff',
  885,
  775,
  'Cutoff amount',
  'How far the LFO can move the filter cutoff: a wah, a pulse or a growl, depending on its speed and shape. The MOD wheel sets how much of this is used.'
);
namePlate(885, 883, 'CUTOFF AMT', C.green, 170, false);
depth(
  'lfo.pw',
  590,
  1052,
  'Pulse width amount',
  'How far the LFO can move the pulse width of both oscillators. It is heard only on the square and narrow pulse waves, as a slow chorus-like movement. The MOD wheel sets how much of this is used.'
);
namePlate(590, 1160, 'PULSE WIDTH AMT', INK, 240, true);
const LFO_OPTS: ControlOption[] = [
  { v: 'sine', a: -45 },
  { v: 'saw', a: -15 },
  { v: 'ramp', a: 15 },
  { v: 'square', a: 45 },
].map((o) => ({ ...o, label: '' }));
rotary('lfo.wave', 885, 1062, LFO_OPTS, 'sine', {
  name: 'LFO waveform',
  module: 'lfo',
  help: 'The LFO’s shape: sine (smooth vibrato and sweeps), sawtooth (falls, then jumps back up), ramp (rises, then drops), or square (jumps between two values, a trill).',
});
(
  [
    ['sine', -45],
    ['rsaw', -15],
    ['saw', 15],
    ['sq', 45],
  ] as [WaveShape, number][]
).forEach(([s, a]) => {
  const [gx, gy] = polarXY(885, 1062, 112, a);
  glyph(gx, gy, s, 7);
});
text(885, 1160, 'WAVEFORM', 15.5, { weight: 700 });

// ── Oscillators ───────────────────────────────────────────────────────────
title(1353, 112, 'OSCILLATORS', DARK);
text(1083, 160, '1', 20, { fill: DARK, weight: 700 });
text(1619, 160, '2', 20, { fill: DARK, weight: 700 });
line(1353, 150, 1353, 680, 2.4, { stroke: DARK });
line(1353, 870, 1353, 1170, 2.4, { stroke: DARK });
const footage = (x: number, y: number, list: string[]): void =>
  list.forEach((t, i) => {
    const [px, py] = polarXY(x, y, 92, -45 + i * 30);
    text(px, py, `${t}’`, 13, { fill: DARK, weight: 700 });
  });
rotary(
  'osc1.oct',
  1214,
  495,
  ['32', '16', '8', '4'].map((v, i) => ({ v, label: '', a: -45 + i * 30 })),
  '8',
  {
    name: 'Oscillator 1 octave',
    module: 'osc',
    help: 'The octave of Oscillator 1, in organ feet: 32 is the lowest, 4 the highest, and each step is an octave. 8 plays at the pitch of the keys.',
  }
);
footage(1214, 495, ['32', '16', '8', '4']);
text(1210, 603, 'OCTAVE', 15.5, { fill: DARK, weight: 700 });
rotary(
  'osc2.oct',
  1497,
  495,
  ['16', '8', '4', '2'].map((v, i) => ({ v, label: '', a: -45 + i * 30 })),
  '8',
  {
    name: 'Oscillator 2 octave',
    module: 'osc',
    help: 'The octave of Oscillator 2: 16 is the lowest, 2 the highest. Its range sits an octave above Oscillator 1’s.',
  }
);
footage(1497, 495, ['16', '8', '4', '2']);
text(1497, 603, 'OCTAVE', 15.5, { fill: DARK, weight: 700 });
controls.push({
  id: 'osc2.sync',
  type: 'button',
  x: X(1208),
  y: Y(783),
  w: 62,
  h: 62,
  capColor: '#ea5a4e',
  capLamp: true,
  kind: 'bool',
  def: false,
  labelPos: 'none',
  name: 'Sync',
  module: 'osc',
  help: 'Hard sync: Oscillator 2 restarts its cycle every time Oscillator 1 does, so it locks to Oscillator 1’s pitch. Then FREQUENCY changes its tone instead of its pitch, a tearing, vocal sound, best heard as it moves.',
});
text(1208, 883, 'SYNC', 15.5, { fill: DARK, weight: 700 });
line(1274, 783, 1415, 783, 2.4, { stroke: DARK });
knob('osc2.freq', 1497, 775, {
  min: -7,
  max: 7,
  def: 0,
  scale: TICKS,
  name: 'Oscillator 2 frequency',
  module: 'osc',
  fmt: (v) => fmtSemi(v), // the readout is the unsynced tuning; with SYNC on the range is wider
  help: 'Tunes Oscillator 2 against Oscillator 1, up to seven semitones either way. A touch off the centre makes the two beat and thicken; further round it sets an interval, such as +7 for a fifth. With SYNC on it sweeps the synced tone instead.',
});
bipolarArc(1497, 775, DARK);
text(1497, 881, 'FREQUENCY', 15.5, { fill: DARK, weight: 700 });
const WAVE4: [v: string, shape: WaveShape][] = [
  ['tri', 'tri'],
  ['saw', 'saw'],
  ['sq', 'sq'],
  ['narrow', 'pulse'],
];
const waveSwitch = (id: string, x: number, name: string): void => {
  rotary(
    id,
    x,
    1050,
    WAVE4.map(([v], i) => ({ v, label: '', a: -45 + i * 30 })),
    'saw',
    {
      name,
      module: 'osc',
      help: `${name.replace(' waveform', '')}’s shape: triangle (soft, flute-like), sawtooth (bright and buzzy), square (hollow) or narrow pulse (thin and nasal).`,
    }
  );
  WAVE4.forEach(([, s], i) => {
    const [gx, gy] = polarXY(x, 1050, 110, -45 + i * 30);
    glyph(gx, gy, s, 7, { stroke: DARK });
  });
  text(x, 1158, 'WAVEFORM', 15.5, { fill: DARK, weight: 700 });
};
waveSwitch('osc1.wave', 1208, 'Oscillator 1 waveform');
waveSwitch('osc2.wave', 1497, 'Oscillator 2 waveform');

// ── Mixer ─────────────────────────────────────────────────────────────────
title(1820, 112, 'MIXER');
const mixKnob = (id: string, y: number, def: number, name: string, help: string): void =>
  knob(id, 1820, y, {
    def,
    scale: TICKS,
    name,
    module: 'mixer',
    fmt: (v) => `${Math.round(v * 10)} %`,
    help,
  });
mixKnob(
  'mix.osc1',
  494,
  7,
  'Mixer: Oscillator 1',
  'How loud Oscillator 1 is in the mix going into the filter. Past about 6 (1 o’clock) the mixer starts to overdrive the filter for a thicker, grittier tone.'
);
namePlate(1820, 602, 'OSCILLATOR 1', C.blue, 176, false);
mixKnob(
  'mix.osc2',
  770,
  0,
  'Mixer: Oscillator 2',
  'How loud Oscillator 2 is in the mix. Past about 6 it adds to the overdrive.'
);
namePlate(1820, 878, 'OSCILLATOR 2', C.blue, 176, false);
mixKnob(
  'mix.noise',
  1048,
  0,
  'Mixer: noise',
  'How much white noise goes into the filter: breath, wind and snare sounds.'
);
text(1820, 1156, 'NOISE', 15.5, { weight: 700 });

// ── Utilities ─────────────────────────────────────────────────────────────
title(2144, 112, 'UTILITIES');
box(2063, 175, 2228, 292, { stroke: INK, sw: 2.4, r: 2 });
text(2144, 350, 'MULT', 15.5, { weight: 700 });
knob('hpf.cutoff', 2144, 492, {
  def: 3,
  scale: TICKS,
  name: 'High pass',
  module: 'util',
  fmt: (v) => fmtHz(hpHz(v)),
  help: 'The cutoff of the separate high-pass filter. It is not in the sound until something is patched into its INPUT; its OUTPUT is the jack beside it. Clockwise takes away more of the low end.',
});
text(2144, 600, 'HIGH PASS', 15.5, { weight: 700 });
knob('att.amount', 2144, 905, {
  min: -5,
  max: 5,
  def: 0,
  scale: TICKS,
  name: 'Attenuator',
  module: 'util',
  fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 20)} %`,
  help: 'Scales whatever is patched into its INPUT: 0 at the top passes nothing, clockwise passes more of it, anticlockwise passes it upside down. With nothing patched it puts out a steady voltage you set with the knob.',
});
bipolarArc(2144, 905);
text(2142, 1013, 'ATTENUATOR', 15.5, { weight: 700 });

// ── Filter ────────────────────────────────────────────────────────────────
title(2611, 108, 'FILTER', DARK);
knob('vcf.cutoff', 2611, 500, {
  r: 44,
  def: 6,
  name: 'Cutoff',
  module: 'filter',
  fmt: (v) => fmtHz(cutoffHz(v)),
  scale: { ticks: 31, nums: [], tickR: 1.3 },
  help: 'The cutoff of the low-pass ladder filter. Turned down, the sound gets darker and duller; turned up, brighter. The printed scale runs from 20 Hz to 20 kHz.',
});
text(2478, 413, '200Hz', 13, { fill: DARK, weight: 700 });
text(2737, 413, '2kHz', 13, { fill: DARK, weight: 700 });
text(2517, 620, '20Hz', 13, { fill: DARK, weight: 700 });
text(2700, 620, '20kHz', 13, { fill: DARK, weight: 700 });
text(2608, 645, 'CUTOFF', 15.5, { fill: DARK, weight: 700 });
line(2611, 668, 2611, 742, 2.4, { stroke: DARK });
toggle(
  'vcf.kbd',
  2610,
  789,
  [
    { v: 'half', label: '1:2' },
    { v: 'off', label: 'OFF' },
    { v: 'full', label: '1:1' },
  ],
  'off',
  {
    name: 'Keyboard tracking',
    module: 'filter',
    help: 'How far the cutoff follows the keys. OFF keeps it still, so high notes sound darker than low ones. 1:2 moves it half as far as the pitch; 1:1 moves it with the pitch, so every note has the same tone, and a filter that is ringing on its own plays in tune.',
  }
);
text(2546, 843, '1:2', 12, { fill: DARK, weight: 700 });
text(2611, 843, 'OFF', 12, { fill: DARK, weight: 700 });
text(2672, 843, '1:1', 12, { fill: DARK, weight: 700 });
text(2611, 875, 'KBD TRACK', 15.5, { fill: DARK, weight: 700 });
knob('vcf.env', 2461, 1040, {
  min: -5,
  max: 5,
  def: 2,
  scale: TICKS,
  name: 'Envelope amount',
  module: 'filter',
  fmt: (v) => `${v > 0 ? '+' : ''}${signed(v, 7).toFixed(1)} oct`,
  help: 'How far the envelope moves the cutoff on each note. Clockwise from 0 the filter opens with the envelope and closes again, the classic pluck or swell; anticlockwise it dips darker instead.',
});
bipolarArc(2461, 1040, DARK);
text(2461, 1148, 'ENVELOPE AMT', 15.5, { fill: DARK, weight: 700 });
knob('vcf.res', 2750, 1040, {
  def: 2,
  scale: TICKS,
  name: 'Resonance',
  module: 'filter',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Boosts a narrow band at the cutoff, so sweeps sound vocal and squelchy. Near the top the filter rings on its own and whistles a tone of its own, and the bass thins out.',
});
text(2750, 1148, 'RESONANCE', 15.5, { fill: DARK, weight: 700 });

// ── Envelope ──────────────────────────────────────────────────────────────
title(3222, 105, 'ENVELOPE');
knob('env.attack', 3074, 487, {
  def: 0,
  name: 'Attack',
  module: 'env',
  fmt: (v) => fmtTime(attTime(v)),
  help: 'How long the envelope takes to rise when a key goes down. Short is a hard start; long is a slow swell.',
});
text(3074, 595, 'ATTACK', 15.5, { weight: 700 });
knob('env.decay', 3074, 765, {
  def: 5,
  name: 'Decay',
  module: 'env',
  fmt: (v) => fmtTime(decTime(v)),
  help: 'How long the envelope takes to fall from its peak to the sustain level while the key is held.',
});
text(3074, 873, 'DECAY', 15.5, { weight: 700 });
knob('env.release', 3074, 1040, {
  def: 3,
  name: 'Release',
  module: 'env',
  fmt: (v) => fmtTime(relTime(v)),
  help: 'How long the envelope takes to fall back to nothing after the key is let go.',
});
text(3074, 1148, 'RELEASE', 15.5, { weight: 700 });
controls.push({
  id: 'env.sustain',
  type: 'fader',
  x: X(3363),
  y: Y(770),
  len: 220,
  orient: 'v',
  ticks: 0,
  pad: 20,
  cap: 'black',
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  labelPos: 'none',
  name: 'Sustain',
  module: 'env',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The level the envelope holds at for as long as the key is down, after the decay.',
});
for (let i = 0; i <= 16; i++) {
  const y = 550 + i * 27.5;
  line(3292, y, 3338, y, 1.6, { hw: true });
  line(3388, y, 3434, y, 1.6, { hw: true });
}
text(3363, 1148, 'SUSTAIN', 15.5, { weight: 700 });

// ── Output ────────────────────────────────────────────────────────────────
title(3686, 100, 'OUTPUT');
knob('out.volume', 3683, 482, {
  r: 38,
  def: 7,
  name: 'Volume',
  module: 'out',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The level at the main output and headphones, after the reverb.',
});
text(3683, 590, 'VOLUME', 15.5, { weight: 700 });
toggle(
  'vca.mode',
  3683,
  728,
  [
    { v: 'env', label: 'ENV' },
    { v: 'kbrls', label: 'KB RLS' },
    { v: 'drone', label: 'DRONE' },
  ],
  'env',
  {
    name: 'VCA mode',
    module: 'amp',
    help: 'What opens the VCA, the stage that sets the loudness. ENV: the envelope, so each note follows ATTACK, DECAY, SUSTAIN and RELEASE. KB RLS: full level while the key is held, fading out over RELEASE after it is let go, while the envelope still shapes the filter. DRONE: always open, and a cable into VCA AMT IN sets the level.',
  }
);
text(3617, 772, 'ENV', 11, { weight: 700 });
text(3683, 772, 'KB RLS', 11, { weight: 700 });
text(3756, 772, 'DRONE', 11, { weight: 700 });
text(3683, 800, 'VCA MODE', 15.5, { weight: 700 });

// ── Spring reverb ─────────────────────────────────────────────────────────
title(3683, 930, 'SPRING REVERB', '#8f3338');
knob('rev.mix', 3683, 1028, {
  r: 35,
  def: 2,
  name: 'Reverb mix',
  module: 'fx',
  fmt: (v) => `${Math.round(v * 10)} % wet`,
  help: 'The balance between the dry sound and the spring reverb. At 0 there is no reverb; at 10 there is only the reverb.',
});
text(3683, 1143, 'MIX', 15.5, { fill: '#8f3338', weight: 700 });

// ── Left-hand controller (beside the keys) ────────────────────────────────
knob('glide', 200, 1560, {
  r: 28,
  scale: TICKS,
  name: 'Glide',
  module: 'glide',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: 'Portamento: each note slides from the last one instead of jumping. Fully anticlockwise is off; clockwise is a slower slide.',
});
namePlate(200, 1660, 'GLIDE', C.blue, 110, false);
const lhButton = (
  id: string,
  x: number,
  color: string,
  name: string,
  upper: string,
  lower: string,
  sub: string,
  help: string
): void => {
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(1548),
    w: 56,
    h: 50,
    capColor: color,
    capLamp: true,
    kind: 'bool',
    def: false,
    labelPos: 'none',
    name,
    module: 'mode',
    help,
  });
  text(x, 1478, upper, 11, { weight: 700 });
  text(x, 1647, lower, 16, { fill: DARK, weight: 700 });
  text(x, 1690, sub, 12, { weight: 700 });
};
box(352, 1628, 768, 1666, { fill: C.yellow, r: 3, hw: true });
lhButton(
  'arp.play',
  420,
  '#86d48e',
  'Play / tie',
  '[ ◀ KB ]',
  'PLAY',
  '(TIE)',
  'Starts and stops the arpeggiator: with it on, held keys play one after another at RATE. On the hardware, in REC it enters a tie, and with SHIFT it moves the keyboard down an octave.'
);
lhButton(
  'arp.hold',
  560,
  '#86cde6',
  'Hold / rest',
  '[ SHIFT ]',
  'HOLD',
  '(REST)',
  'Keeps the arpeggio playing after the keys are let go. On the hardware, in REC it enters a rest.'
);
lhButton(
  'arp.tap',
  700,
  '#e8df58',
  'Tap / accent',
  '[ KB ▶ ]',
  'TAP',
  '(ACCENT)',
  'On the hardware, three or more taps set the tempo, and in REC it marks an accent. It does nothing to the sound here: set the speed with RATE.'
);
// the top of the keys, for reference only (the keyboard strip under the panel is the one that plays)
{
  const x0 = 850,
    x1 = 3880,
    top = 1462,
    bottom = 1745,
    kw = (x1 - x0) / 19;
  for (let i = 0; i < 19; i++)
    box(x0 + i * kw + 3, top, x0 + (i + 1) * kw - 3, bottom, { fill: C.key, r: 2, hw: true });
  // F to C: black keys after F, G, A, C and D of each octave
  const after = [0, 1, 2, 4, 5];
  for (let i = 0; i < 18; i++)
    if (after.includes(i % 7))
      box(x0 + (i + 1) * kw - 50, top, x0 + (i + 1) * kw + 50, top + 175, {
        fill: '#111113',
        r: 3,
        hw: true,
      });
}

// ── Jacks ─────────────────────────────────────────────────────────────────
const lvl =
  (id: string) =>
  (v: ControlValues): number =>
    level10(num(v, id), 1);
const levelCheck =
  (id: string, name: string) =>
  (v: ControlValues): string | null =>
    num(v, id) <= 0
      ? `The ${name} knob is at 0, so nothing patched here reaches the filter. Turn it up.`
      : null;
// ARP / SEQ
jack('j.gate_out', 265, 178, {
  dir: 'out',
  label: 'GATE OUT',
  signal: 'gate',
  help: 'High while a key is held (or while the arpeggiator plays a note), low when it is let go.',
});
plate(268, 238, 'GATE OUT', DARK, C.yellow, 122);
jack('j.kb_out', 180, 292, {
  dir: 'out',
  label: 'KB OUT',
  signal: 'kbd',
  help: 'The pitch of the key played, as a voltage at one volt per octave.',
});
plate(190, 350, 'KB OUT', DARK, C.yellow, 96);
jack('j.vel_out', 345, 292, {
  dir: 'out',
  label: 'KB VEL OUT',
  signal: 'vel',
  help: 'How hard each key was played, as a voltage. Nothing inside uses it: patch it to CUTOFF IN so harder notes are brighter.',
});
plate(345, 350, 'KB VEL OUT', DARK, C.yellow, 124);
// Modulation
jack('j.rate_in', 513, 175, {
  dir: 'in',
  label: 'RATE IN',
  dest: 'lfoRate',
  amt: 4,
  add: true,
  help: 'Speeds the LFO up and slows it down, adding to the RATE knob. KB OUT here makes the LFO follow the keys.',
});
text(513, 238, 'RATE IN', 12, { weight: 700 });
jack('j.lfo_out', 960, 175, {
  dir: 'out',
  label: 'WAVE OUT',
  name: 'LFO WAVE OUT',
  signal: 'lfo',
  help: 'The LFO, in the shape set by its WAVEFORM switch, at full depth whatever the MOD wheel says.',
});
plate(960, 238, 'WAVE OUT', INK, DARK, 118);
jack('j.sync_in', 665, 292, {
  dir: 'in',
  label: 'SYNC IN',
  dest: 'lfoTrig',
  amt: 1,
  help: 'Restarts the LFO’s cycle on each rising edge, for example from GATE OUT so every note starts its vibrato or wah from the same point.',
});
text(665, 350, 'SYNC IN', 12, { weight: 700 });
jack('j.sh_out', 812, 292, {
  dir: 'out',
  label: 'S/H OUT',
  signal: 'sh',
  help: 'The sample and hold: a new random level each LFO cycle, held until the next. Patched to pitch or cutoff it gives stepped, computer-like patterns.',
});
plate(812, 350, 'S/H OUT', INK, DARK, 100);
// Oscillators
const pwCheck =
  (id: string, n: number) =>
  (v: ControlValues): string | null =>
    v[id] === 'sq' || v[id] === 'narrow'
      ? null
      : `Oscillator ${n} is not on the square or narrow pulse wave, and pulse width only changes those. Switch its WAVEFORM to one of them.`;
jack('j.osc1_out', 1211, 178, {
  dir: 'out',
  label: 'WAVE OUT',
  name: 'OSC 1 WAVE OUT',
  signal: 'osc1',
  help: 'Oscillator 1 on its own, before the mixer.',
});
plate(1211, 238, 'WAVE OUT', DARK, C.blue, 118);
jack('j.osc1_pitch', 1131, 294, {
  dir: 'in',
  label: 'PITCH IN',
  name: 'OSC 1 PITCH IN',
  dest: 'pitch1',
  amt: 12,
  add: true,
  help: 'Moves the pitch of Oscillator 1, added to the keys.',
});
text(1131, 355, 'PITCH IN', 12, { fill: DARK, weight: 700 });
jack('j.osc1_pwm', 1287, 294, {
  dir: 'in',
  label: 'PWM IN',
  name: 'OSC 1 PWM IN',
  dest: 'pw1',
  amt: 0.4,
  add: true,
  check: pwCheck('osc1.wave', 1),
  help: 'Moves the pulse width of Oscillator 1’s square and narrow pulse waves, adding to the LFO’s PULSE WIDTH AMT.',
});
text(1287, 355, 'PWM IN', 12, { fill: DARK, weight: 700 });
jack('j.osc2_out', 1497, 178, {
  dir: 'out',
  label: 'WAVE OUT',
  name: 'OSC 2 WAVE OUT',
  signal: 'osc2',
  help: 'Oscillator 2 on its own, before the mixer.',
});
plate(1497, 238, 'WAVE OUT', DARK, C.blue, 118);
jack('j.osc2_pitch', 1417, 294, {
  dir: 'in',
  label: 'PITCH IN',
  name: 'OSC 2 PITCH IN',
  dest: 'pitch2',
  amt: 12,
  add: true,
  help: 'Moves the pitch of Oscillator 2, added to the keys.',
});
text(1417, 355, 'PITCH IN', 12, { fill: DARK, weight: 700 });
jack('j.osc2_fm', 1578, 294, {
  dir: 'in',
  label: 'LIN FM IN',
  name: 'OSC 2 LIN FM IN',
  dest: 'pitch2',
  amt: 12,
  add: true,
  help: 'Frequency modulation of Oscillator 2. A slow signal bends its pitch; an audio-rate one, such as Oscillator 1, gives clangy, bell-like and metallic tones.',
});
text(1578, 355, 'LIN FM IN', 12, { fill: DARK, weight: 700 });
// Mixer
jack('j.mix1', 1744, 178, {
  dir: 'in',
  label: 'OSC 1 IN',
  name: 'Mixer OSC 1 IN',
  dest: 'extIn',
  amt: lvl('mix.osc1'),
  check: levelCheck('mix.osc1', 'OSCILLATOR 1'),
  help: 'Into the mixer’s first channel, in place of Oscillator 1. The OSCILLATOR 1 knob sets its level.',
});
text(1744, 238, 'OSC 1 IN', 12, { weight: 700 });
jack('j.mix2', 1902, 178, {
  dir: 'in',
  label: 'OSC 2 IN',
  name: 'Mixer OSC 2 IN',
  dest: 'extIn',
  amt: lvl('mix.osc2'),
  check: levelCheck('mix.osc2', 'OSCILLATOR 2'),
  help: 'Into the mixer’s second channel, in place of Oscillator 2. The OSCILLATOR 2 knob sets its level.',
});
text(1902, 238, 'OSC 2 IN', 12, { weight: 700 });
jack('j.mix3', 1744, 294, {
  dir: 'in',
  label: 'NOISE IN',
  dest: 'extIn',
  amt: lvl('mix.noise'),
  check: levelCheck('mix.noise', 'NOISE'),
  help: 'Into the mixer’s noise channel, in place of the noise. The NOISE knob sets its level.',
});
text(1744, 355, 'NOISE IN', 12, { weight: 700 });
jack('j.mixer_out', 1902, 294, {
  dir: 'out',
  label: 'OUTPUT',
  name: 'MIXER OUTPUT',
  signal: 'mixer',
  help: 'The mixer’s output, before the filter.',
});
plate(1902, 355, 'OUTPUT', INK, DARK, 92);
// Utilities
const MULT =
  'A multiple: the four jacks are joined, so one signal can go to three places. Here the top-left jack is the input and the other three are copies of it.';
jack('j.m1', 2063, 175, {
  dir: 'in',
  label: 'MULT',
  name: 'MULT input',
  dest: 'multIn',
  amt: 1,
  help: MULT,
});
jack('j.m2', 2228, 175, {
  dir: 'out',
  label: 'MULT',
  name: 'MULT copy (2)',
  signal: 'mult',
  help: MULT,
});
jack('j.m3', 2063, 292, {
  dir: 'out',
  label: 'MULT',
  name: 'MULT copy (3)',
  signal: 'mult',
  help: MULT,
});
jack('j.m4', 2228, 292, {
  dir: 'out',
  label: 'MULT',
  name: 'MULT copy (4)',
  signal: 'mult',
  help: MULT,
});
jack('j.hp_in', 2063, 683, {
  dir: 'in',
  label: 'INPUT',
  name: 'HIGH PASS INPUT',
  dest: 'hp6In',
  amt: 1,
  help: 'Into the separate high-pass filter. Its output is the OUTPUT jack beside it, and HIGH PASS sets the cutoff.',
});
text(2063, 737, 'INPUT', 12, { weight: 700 });
jack('j.hp_out', 2226, 683, {
  dir: 'out',
  label: 'OUTPUT',
  name: 'HIGH PASS OUTPUT',
  signal: 'hp6',
  help: 'The separate high-pass filter’s output. It is silent until something is patched into its INPUT.',
});
plate(2224, 737, 'OUTPUT', INK, DARK, 92);
jack('j.att_in', 2063, 1093, {
  dir: 'in',
  label: 'INPUT',
  name: 'ATTENUATOR INPUT',
  dest: 'att1In',
  amt: 1,
  help: 'Into the attenuator. Its OUTPUT is this signal scaled, or turned upside down, by the ATTENUATOR knob. With nothing here it puts out a steady voltage instead.',
});
text(2063, 1155, 'INPUT', 12, { weight: 700 });
jack('j.att_out', 2226, 1093, {
  dir: 'out',
  label: 'OUTPUT',
  name: 'ATTENUATOR OUTPUT',
  signal: 'att1',
  help: 'The attenuator’s output: its INPUT scaled or turned upside down by the ATTENUATOR knob, or with nothing patched in, a steady voltage set by the knob.',
});
plate(2224, 1155, 'OUTPUT', INK, DARK, 92);
// Filter
jack('j.filter_in', 2383, 172, {
  dir: 'in',
  label: 'INPUT',
  name: 'FILTER INPUT',
  dest: 'vcfIn',
  amt: 1,
  help: 'Audio into the ladder filter, in place of the mixer.',
});
text(2383, 235, 'INPUT', 12, { fill: DARK, weight: 700 });
jack('j.filter_out', 2839, 170, {
  dir: 'out',
  label: 'OUTPUT',
  name: 'FILTER OUTPUT',
  signal: 'vcf1',
  help: 'The ladder filter’s output, before the VCA.',
});
plate(2839, 235, 'OUTPUT', DARK, C.green, 92);
jack('j.env_amt', 2530, 292, {
  dir: 'in',
  label: 'ENV AMT IN',
  dest: null,
  help: 'On the hardware, a voltage here adds to ENVELOPE AMT, so velocity or an LFO can change how far the envelope sweeps the filter. This app cannot model it: a cable here changes nothing.',
});
text(2530, 350, 'ENV AMT IN', 12, { fill: DARK, weight: 700 });
jack('j.cutoff', 2689, 292, {
  dir: 'in',
  label: 'CUTOFF IN',
  dest: 'cutoff',
  amt: 5,
  add: true,
  help: 'Moves the filter cutoff, adding to the CUTOFF knob, the envelope and the LFO.',
});
text(2689, 350, 'CUTOFF IN', 12, { fill: DARK, weight: 700 });
// Envelope
jack('j.trig_in', 3228, 168, {
  dir: 'in',
  label: 'TRIGGER IN',
  dest: 'gateIn',
  amt: 1,
  help: 'Fires the envelope, in place of the keys. A square LFO here plays the envelope over and over by itself.',
});
text(3228, 230, 'TRIGGER IN', 12, { weight: 700 });
jack('j.env_pos', 3081, 290, {
  dir: 'out',
  label: '+ ENV OUT',
  signal: 'env1',
  help: 'The envelope, rising and falling with each note.',
});
plate(3081, 345, '+ ENV OUT', INK, DARK, 112);
jack('j.env_neg', 3367, 290, {
  dir: 'out',
  label: '− ENV OUT',
  signal: 'env1',
  gain: -1,
  help: 'The envelope upside down: it falls when the envelope rises.',
});
plate(3367, 345, '− ENV OUT', INK, DARK, 112);
// Output
jack('j.vca_cv', 3689, 165, {
  dir: 'in',
  label: 'VCA AMT IN',
  dest: 'amp',
  amt: 1,
  add: true,
  help: 'Opens the VCA. In DRONE a cable here takes over the level, so the patched signal sets the loudness; in ENV and KB RLS the hardware scales the envelope by it, and here it adds to the envelope.',
});
text(3689, 225, 'VCA AMT IN', 12, { weight: 700 });
jack('j.vca_in', 3614, 285, {
  dir: 'in',
  label: 'VCA IN',
  dest: 'vcaIn',
  amt: 1,
  help: 'Audio into the VCA, in place of the filter output.',
});
text(3614, 343, 'VCA IN', 12, { weight: 700 });
jack('j.rev_in', 3772, 285, {
  dir: 'in',
  label: 'REVERB IN',
  dest: 'revIn',
  amt: 1,
  check: (v) =>
    num(v, 'rev.mix') <= 0
      ? 'Reverb MIX is at 0, so only the dry sound is heard, and that does not pass through here. Turn MIX up to hear what is patched in.'
      : null,
  help: 'Straight into the spring reverb, in place of the VCA. The dry sound stays the VCA’s, so what is patched here is heard only as reverb, as much as MIX lets through.',
});
text(3772, 343, 'REVERB IN', 12, { weight: 700 });

// ── Areas (image coordinates) ─────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: (x1 - x0) * K,
  h: (y1 - y0) * K,
});
const areas: Area[] = [
  {
    id: 'arp',
    label: 'Arpeggiator / sequencer',
    module: 'mode',
    keywords: 'arp arpeggio sequencer seq tempo clock keyboard cv gate velocity',
    rects: [R(100, 50, 432, 1232)],
    help: 'Hold a chord, press PLAY beside the keys, and the arpeggiator plays its notes one after another at RATE. MODE, DIRECTION and OCT / SEQ set what it does. The jacks at the top are the keyboard as voltages: GATE OUT, KB OUT (pitch) and KB VEL OUT (how hard the key was played).',
  },
  {
    id: 'lfo',
    label: 'Modulation (LFO)',
    module: 'lfo',
    keywords: 'lfo vibrato wobble trill tremolo wah pwm rate shape sample hold mod wheel',
    rects: [R(432, 50, 1040, 1232)],
    help: 'The LFO makes no sound itself; it moves other things. RATE sets its speed and WAVEFORM its shape. PITCH AMT, CUTOFF AMT and PULSE WIDTH AMT set how far it can move each one, and the MOD wheel beside the keys sets how much of that is used. With the wheel down, the LFO moves nothing except through a cable from WAVE OUT.',
  },
  {
    id: 'osc1',
    label: 'Oscillator 1',
    module: 'osc',
    keywords: 'oscillator vco octave footage waveform sawtooth square triangle pulse',
    rects: [R(1040, 50, 1353, 690), R(1040, 870, 1353, 1232)],
    help: 'Oscillator 1: OCTAVE picks its range in organ feet and WAVEFORM its shape. It is the master for sync.',
  },
  {
    id: 'osc2',
    label: 'Oscillator 2',
    module: 'osc',
    keywords: 'oscillator vco detune interval sync octave fm',
    rects: [R(1353, 50, 1660, 1232), R(1040, 690, 1353, 870)],
    help: 'Oscillator 2: OCTAVE, FREQUENCY to tune it up to seven semitones against Oscillator 1, SYNC to lock it to Oscillator 1, and WAVEFORM. LIN FM IN lets another signal modulate its pitch.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mixer level volume noise overdrive',
    rects: [R(1660, 50, 1985, 1232)],
    help: 'Levels into the filter: Oscillator 1, Oscillator 2 and white noise. Past about 1 o’clock the levels start to overdrive the filter for a thicker tone. A cable into one of the IN jacks replaces that channel’s source.',
  },
  {
    id: 'mult',
    label: 'Mult',
    module: 'util',
    keywords: 'mult multiple split copy',
    rects: [R(1985, 50, 2305, 400)],
    help: 'Four joined jacks, for sending one signal to several places.',
  },
  {
    id: 'hpf',
    label: 'High pass filter',
    module: 'util',
    keywords: 'high-pass highpass hpf low cut thin',
    rects: [R(1985, 400, 2305, 780)],
    help: 'A separate 6 dB high-pass filter, not in the sound until something is patched into its INPUT. The knob sets its cutoff.',
  },
  {
    id: 'att',
    label: 'Attenuator',
    module: 'util',
    keywords: 'attenuverter invert scale offset voltage',
    rects: [R(1985, 780, 2305, 1232)],
    help: 'Scales or turns upside down whatever is patched into its INPUT; with nothing patched it is a steady voltage set by the knob, useful for offsetting a pitch or cutoff by cable.',
  },
  {
    id: 'vcf',
    label: 'Filter',
    module: 'filter',
    keywords:
      'ladder low-pass lowpass cutoff resonance emphasis key tracking envelope amount brightness',
    rects: [R(2305, 50, 2920, 1232)],
    help: 'A 24 dB low-pass ladder filter, the Moog design. CUTOFF sets how bright the sound is, RESONANCE how sharply it rings at the cutoff, KBD TRACK how far the cutoff follows the keys, and ENVELOPE AMT how far the envelope sweeps it, up or down.',
  },
  {
    id: 'env',
    label: 'Envelope',
    module: 'env',
    keywords: 'adsr attack decay sustain release contour',
    rects: [R(2920, 50, 3520, 1232)],
    help: 'One ADSR envelope, fired by each key or by TRIGGER IN. It always moves the filter, by ENVELOPE AMT, and in VCA MODE ENV it shapes the loudness too. + ENV OUT and − ENV OUT send it, the right way up and upside down, anywhere else.',
  },
  {
    id: 'output',
    label: 'Output: VCA and volume',
    module: 'amp',
    keywords: 'volume vca drone amplifier loudness',
    rects: [R(3520, 50, 3880, 875)],
    help: 'VOLUME is the output level. VCA MODE chooses what opens the amplifier: the envelope (ENV), the keys with the envelope’s release time (KB RLS), or nothing, left open as a drone (DRONE).',
  },
  {
    id: 'reverb',
    label: 'Spring reverb',
    module: 'fx',
    keywords: 'spring reverb echo room space',
    rects: [R(3520, 875, 3880, 1232)],
    help: 'A real spring reverb tank inside the case, after the VCA. MIX blends the dry sound with the reverb; REVERB IN feeds it something else.',
  },
  {
    id: 'glide',
    label: 'Glide',
    module: 'glide',
    keywords: 'portamento slide legato',
    rects: [R(40, 1440, 300, 1745)],
    help: 'GLIDE makes each note slide into the next instead of jumping. Fully anticlockwise is off.',
  },
  {
    id: 'lhc',
    label: 'Play, hold and tap',
    module: 'mode',
    keywords: 'play hold latch tap tempo tie rest accent shift octave',
    rects: [R(300, 1440, 830, 1745)],
    help: 'The buttons beside the keys run the arpeggiator: PLAY starts and stops it, HOLD keeps it going after the keys are let go. TAP sets the tempo on the hardware. While recording a sequence they enter a TIE, a REST and an ACCENT.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const WAVE_MIX: Record<string, Pick<OscParams, 'mix' | 'pw'>> = {
  tri: { mix: { tri: 1 }, pw: 0.5 },
  saw: { mix: { saw: 0.8 }, pw: 0.5 },
  sq: { mix: { pulse: 0.75 }, pw: 0.5 },
  narrow: { mix: { pulse: 0.75 }, pw: 0.25 },
};
const LFO_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  saw: { rsaw: 1 },
  ramp: { saw: 1 },
  square: { sq: 1 },
};
const ARP_ORDER: Record<string, ArpMode> = { ordr: 'played', fb: 'updown', rndm: 'random' };
const KBD: Record<string, number> = { half: 0.5, off: 0, full: 1 };
/** How far a mixer knob is past 1 o'clock (6 on the 0–10 scale), where the mixer starts to overdrive. */
const over = (v: number): number => Math.max(0, v - 6) / 4;

function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const patched = ctx.patched;
  const mod = clamp(ctx.wheel || 0, 0, 1);
  const routes: EngineRoute[] = [];
  const add = (dst: string, amt: number): void => {
    if (amt) routes.push({ src: 'lfo', dst, amt });
  };
  add('pitchAll', Math.pow(num(v, 'lfo.pitch') / 10, 2) * 24 * mod);
  const pwAmt = (num(v, 'lfo.pw') / 10) * 0.4 * mod;
  add('pw1', pwAmt);
  add('pw2', pwAmt);
  add('cutoff', (num(v, 'lfo.cutoff') / 10) * 5 * mod);
  const rate = lfoHz(num(v, 'lfo.rate'));
  const a = attTime(num(v, 'env.attack')),
    d = decTime(num(v, 'env.decay')),
    r = relTime(num(v, 'env.release'));
  const mode = v['vca.mode'];
  const sync = !!v['osc2.sync'];
  const drive = over(num(v, 'mix.osc1')) + over(num(v, 'mix.osc2')) + over(num(v, 'mix.noise'));
  const wet = num(v, 'rev.mix') / 10;
  return {
    osc: [
      {
        level: patched['j.mix1'] ? 0 : level10(num(v, 'mix.osc1'), 1),
        ...WAVE_MIX[String(v['osc1.wave'])],
        semi: OCT1[String(v['osc1.oct'])],
        kbd: true,
        syncTo: -1,
      },
      // with SYNC on, FREQUENCY reaches three times as far, to sweep the synced tone
      {
        level: patched['j.mix2'] ? 0 : level10(num(v, 'mix.osc2'), 1),
        ...WAVE_MIX[String(v['osc2.wave'])],
        semi: OCT2[String(v['osc2.oct'])] + num(v, 'osc2.freq') * (sync ? 3 : 1),
        kbd: true,
        syncTo: sync ? 0 : -1,
      },
    ],
    noise: {
      level: patched['j.mix3'] ? 0 : level10(num(v, 'mix.noise'), 1) * 0.7,
      color: 'white',
    },
    ext: { level: 1 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: cutoffHz(num(v, 'vcf.cutoff')),
      res: (num(v, 'vcf.res') / 10) * 1.08,
      envAmt: signed(num(v, 'vcf.env'), 7),
      envSrc: 'env1',
      kbd: KBD[String(v['vcf.kbd'])],
      drive: 0.8 + drive * 1.6,
    },
    env1: { a, d, s: num(v, 'env.sustain') / 10, r },
    // VCA MODE KB RLS: the loudness is a plain gate with the envelope's release on the end
    env2: { a: 0.002, d: 0.01, s: 1, r },
    vca:
      mode === 'drone'
        ? { envSrc: 'none', bias: patched['j.vca_cv'] ? 0 : 1 }
        : { envSrc: mode === 'kbrls' ? 'env2' : 'env1', bias: 0 },
    lfo: { rate, mix: LFO_MIX[String(v['lfo.wave'])], keySync: false },
    glide: { time: glideTime(num(v, 'glide')), legato: false },
    // both envelopes fire from TRIGGER IN, which is normalled to the key gate
    trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'] },
    routes,
    // MIX crossfades the dry VCA output with the spring; REVERB IN replaces only the spring's feed
    normals: { gateIn: 'gate', att1In: ['one', 0.8], revIn: 'out', dryIn: ['out', 1 - wet] },
    hp6: { cutoff: hpHz(num(v, 'hpf.cutoff')) },
    rev: { on: true, mix: wet, decay: 0.8, damp: 0.45 },
    od: { on: false },
    delay: { on: false },
    sh: { rate, glide: 0, clock: 'lfo' },
    slew: { time: 0.1 },
    att: [clamp(num(v, 'att.amount') / 5, -1, 1), 1],
    poly: { voices: 1, stack: 1, mono: true },
    arp: {
      on: !!v['arp.play'],
      bpm: arpBpm(num(v, 'arp.rate')),
      gate: 0.5,
      mode: ARP_ORDER[String(v['arp.dir'])],
      octaves: Number(v['arp.oct']),
      hold: !!v['arp.hold'],
    },
    tune: 0,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const grandmother: SynthDef & { version: number } = {
  id: 'grandmother',
  version: 1,
  name: 'Grandmother',
  maker: 'Moog',
  year: 2018,
  heritage: 'Built on circuits from the Moog modular systems and the Minimoog',
  summary:
    'A semi-modular mono synth with a 32-key keyboard: two oscillators with sync, white noise, a 24 dB ladder filter, one ADSR envelope, an LFO that reaches audio rates, a real spring reverb, an arpeggiator and sequencer, and 41 patch points that change the internal wiring without needing any cables to play.',
  view: { w: (3900 - OX) * K, h: (1745 - OY) * K },
  theme: {
    panel: '#202124',
    panel2: '#17181a',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'none',
  },
  signalNames: {
    osc1: 'Oscillator 1',
    osc2: 'Oscillator 2',
    env1: 'the envelope',
    env2: 'the KB RLS gate',
    lfo: 'the LFO',
    sh: 'the sample and hold',
    att1: 'the attenuator',
    mult: 'the MULT',
    vcf1: 'the ladder filter',
    hp6: 'the HIGH PASS filter',
    rev: 'the spring reverb',
    master: 'the main output',
    mixer: 'the mixer',
    kbd: 'KB OUT',
    vel: 'KB VEL OUT',
  },
  destNames: { extIn: 'the mixer', revIn: 'the spring reverb', hp6In: 'the HIGH PASS filter' },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default grandmother;
