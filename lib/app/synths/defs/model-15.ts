/**
 * Behringer Model 15: the definition (D1). Positions are pixels on the 1200×1200 product photo
 * (ref/behringer-model-15.jpg), written in image space and turned into view units by X() / Y(): the
 * view starts at the left cheek's top corner and is drawn at twice the photo's scale. Sizes (radii,
 * lettering, widths) are written in view units. The data model is ref/behringer-model-15.synth.json
 * (Quick Start Guide, 93 callouts, with the normals and the sample-and-hold wiring taken from the
 * Moog Grandmother manual that the Model 15 copies).
 *
 * Engine notes: the voice runs as a one-voice `poly` synth so the engine's arpeggiator can play it.
 * OSC 2's waveform switch has a second set of positions printed under a SUB bracket; there the
 * sub-oscillator (Oscillator 2 an octave down, signal `sub`) takes over mixer channel 3 from the
 * white noise. The 6 dB HI PASS FILTER is a separate utility (EngineParams `hp6`), only in circuit
 * when patched. The reverb is the engine's spring in `unit` mode, so REVERB MIX is a true dry/wet
 * blend.
 *
 * Transliterated from the prototype file `src/synths/model-15.js` (D3), the way `defs/model-d.ts`
 * was: no content (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand`
 * (the Behringer logo and the printed "MODEL 15 SEMI-MODULAR ANALOG SYNTHESIZER"), and panel values
 * read through `num()`.
 */
import type {
  ArpMode,
  Area,
  ButtonControl,
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
  OscParams,
  RectDecor,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  Partial<Pick<KnobControl, 'r' | 'ring' | 'scale'>> & {
    min?: number;
    max?: number;
    def?: number;
    fmt?: (v: number) => string;
  };
type SwitchRest = Pick<ControlCommon, 'name' | 'module' | 'help'>;
type ButtonRest = Pick<ButtonControl, 'name' | 'module' | 'help'>;
type JackRest = OmitEach<Jack, 'id' | 'x' | 'y' | 'r' | 'labelPos'>;
type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'hw' | 'brand'>>;
type BoxRest = Partial<Pick<RectDecor, 'fill' | 'r' | 'hw' | 'stroke' | 'sw'>>;

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The guide gives the LFO range (0.07 Hz–1.3 kHz), the cutoff range, OSC 2's ±7 semitones, FINE TUNE's ±4 and the
// envelope times. The ARP/SEQ tempo range, the glide time and the modulation depths are this app's choice.
const lfoHz = (v: number): number => expMap(v / 10, 0.07, 1300);
const cutoffHz = (v: number): number => expMap(v / 10, 20, 20000);
const hpHz = (v: number): number => expMap(v / 10, 20, 8000);
const attTime = (v: number): number => expMap(v / 10, 0.002, 16);
const decTime = (v: number): number => expMap(v / 10, 0.002, 40);
const relTime = (v: number): number => expMap(v / 10, 0.002, 20);
const glideTime = (v: number): number => (v <= 0 ? 0 : 0.01 * Math.pow(300, v / 10)); // up to 3 s
const arpBpm = (v: number): number => expMap(v / 10, 40, 240);
const signed = (v: number, max: number, curve = 1.4): number =>
  v === 0 ? 0 : Math.sign(v) * Math.pow(Math.abs(v) / 5, curve) * max;
const OCT1: Record<string, number> = { 32: -24, 16: -12, 8: 0, 4: 12 };
const OCT2: Record<string, number> = { 16: -12, 8: 0, 4: 12, 2: 24 };

const OX = 27,
  OY = 397,
  K = 2; // image pixel of the view's top-left corner, and view units per image pixel
const X = (x: number): number => (x - OX) * K;
const Y = (y: number): number => (y - OY) * K;
const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const INK = '#f1f1ee';
const DARK = '#18181a';
const C = {
  white: '#f2f2ef',
  blue: '#5db7ea',
  yellow: '#efe35a',
  red: '#e9474f',
  green: '#c3ee8d',
};

// ── Drawing helpers (image coordinates in, view units out) ────────────────
const polarXY = (x: number, y: number, r: number, a: number): [number, number] => [
  x + r * Math.sin((a * Math.PI) / 180),
  y - r * Math.cos((a * Math.PI) / 180),
];
/** Text centred on image point (x, y); the renderer places text by its baseline. */
const text = (x: number, y: number, t: string, size = 17, rest: TextRest = {}): void => {
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
const line = (x1: number, y1: number, x2: number, y2: number, w = 3): void => {
  decor.push({ t: 'line', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), w });
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
    r: 7,
    sw: 3,
    labelAt: 'none',
  });
};
/** A section name on a solid plate at the top of its frame, as the panel prints it. */
const tab = (x0: number, x1: number, t: string, fill = C.white, y0 = 416, y1 = 430.5): void => {
  box(x0, y0, x1, y1, { fill, r: 2, hw: true });
  text((x0 + x1) / 2, (y0 + y1) / 2, t, 22, { fill: DARK, weight: 700 });
};
const glyph = (x: number, y: number, shape: WaveShape, size = 11): void => {
  decor.push({ t: 'wave', x: X(x), y: Y(y), size, shape, w: 2.6 });
};
/** The printed arc with an arrow at each end, 0 at the top and − / + at the ends, round a bipolar knob. */
const bipolarArc = (x: number, y: number, r = 24): void => {
  decor.push(
    { t: 'arc', x: X(x), y: Y(y), r: r * K, a0: -62, a1: -8, w: 2.4, cap: 'butt' },
    { t: 'arc', x: X(x), y: Y(y), r: r * K, a0: 8, a1: 62, w: 2.4, cap: 'butt' }
  );
  text(x, y - r, '0', 17, { weight: 700 });
  const [lx, ly] = polarXY(x, y, r + 3, -72);
  const [rx, ry] = polarXY(x, y, r + 3, 72);
  text(lx - 1, ly, '−', 20, { weight: 700 });
  text(rx + 1, ry, '+', 20, { weight: 700 });
};
/** The coloured, segmented ring the panel prints round the LFO depth knobs. */
const segRing = (x: number, y: number, color: string): void => {
  for (let i = 0; i < 8; i++) {
    const a0 = -135 + i * 33.75 + 3;
    decor.push({
      t: 'arc',
      x: X(x),
      y: Y(y),
      r: 21 * K,
      a0,
      a1: a0 + 27.75,
      w: 7,
      cap: 'butt',
      stroke: color,
      hw: true,
    });
  }
};
const TICKS: KnobScale = { ticks: 11, nums: [] };
const knob = (id: string, x: number, y: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r: 27,
    style: 'neutron',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    scale: TICKS,
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
const slide = (
  id: string,
  x: number,
  y: number,
  options: ControlOption[],
  def: string,
  rest: SwitchRest
): void => {
  controls.push({
    id,
    type: 'slide',
    x: X(x),
    y: Y(y),
    w: 92,
    h: 28,
    orient: 'h',
    kind: 'enum',
    options,
    def,
    labelPos: 'none',
    ...rest,
  });
};
/** A square white cap in a coloured printed ring (PLAY, HOLD, TAP, SYNC). */
const ringButton = (id: string, x: number, y: number, ring: string, rest: ButtonRest): void => {
  box(x - 15, y - 15, x + 15, y + 15, { fill: ring, r: 6, hw: true });
  box(x - 11.5, y - 11.5, x + 11.5, y + 11.5, { fill: DARK, r: 3.5, hw: true });
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: 34,
    h: 34,
    capColor: '#efefea',
    kind: 'bool',
    def: false,
    labelPos: 'none',
    ...rest,
  });
};

// ── Faceplate ─────────────────────────────────────────────────────────────
[
  [67.5, 409],
  [482.5, 407.5],
  [717.5, 407.5],
  [1133, 409],
  [67.5, 740],
  [482.5, 740],
  [717.5, 741],
  [1133, 739],
].forEach(([x, y]) => decor.push({ t: 'screw', x: X(x), y: Y(y), r: 11 }));
frame(63, 412.5, 144, 739);
tab(67, 140, 'ARP / SEQ', C.blue);
frame(150, 413, 311, 667);
tab(154, 307, 'LOW FREQUENCY OSC');
frame(150, 674, 311, 739.5);
frame(317.5, 413, 469, 739.5);
box(321, 416, 466, 430.5, { fill: C.yellow, r: 2, hw: true });
text(357.5, 423.2, '1', 22, { fill: DARK, weight: 700 });
text(415, 423.2, 'OSC  2 + SUB', 22, { fill: DARK, weight: 700 });
line(393, 432, 393, 527);
line(393, 562, 393, 660);
frame(475, 413, 552, 667);
tab(479, 548, 'MIXER');
frame(558, 413, 638, 585);
tab(562, 634, 'UTILITIES');
frame(558, 590, 638, 667);
frame(475, 674, 638, 739.5);
frame(644.5, 413, 735, 739.5);
tab(648, 731, 'FILTER', C.red);
frame(741, 413, 822, 739.5);
tab(745, 818, 'ENVELOPE');
frame(828, 413, 905, 641);
tab(832, 901, 'CONTROL');
frame(828, 647.5, 905, 739.5);
tab(832, 901, 'REVERB', C.green, 652, 665);

// ── ARP / SEQ ─────────────────────────────────────────────────────────────
decor.push({
  t: 'led',
  x: X(75.5),
  y: Y(441),
  r: 7,
  color: 'red',
  litWhen: { id: 'arp.play', eq: true },
});
knob('arp.rate', 103, 469, {
  def: 5,
  name: 'ARP/SEQ rate',
  module: 'mode',
  fmt: (v) => `${Math.round(arpBpm(v))} BPM`,
  help: 'The speed of the arpeggiator, in steps of a sixteenth note. Clockwise is faster.',
});
text(103, 500, 'RATE', 19);
slide(
  'arp.mode',
  106,
  536,
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
text(75, 522, 'ARP', 15);
text(103, 522, 'SEQ', 15);
box(123, 517, 139, 527, { fill: INK, r: 1.5, hw: true });
text(131, 522, 'REC', 14, { fill: DARK });
text(103, 552, 'MODE', 19);
slide(
  'arp.dir',
  106,
  583,
  [
    { v: 'ordr', label: 'ORDR' },
    { v: 'bf', label: 'BACK AND FORTH' },
    { v: 'rndm', label: 'RNDM' },
  ],
  'ordr',
  {
    name: 'ARP/SEQ direction',
    module: 'mode',
    help: 'The order the arpeggio takes: ORDR in the order the keys were pressed, ◀◀/▶▶ up and then back down, RNDM at random.',
  }
);
text(75, 568, 'ORDR', 15);
text(103, 568, '◀◀/▶▶', 15);
text(131, 568, 'RNDM', 15);
text(103, 599, 'DIRECTION', 19);
slide(
  'arp.oct',
  106,
  630,
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
text(82, 615, '1', 15);
text(103, 615, '2', 15);
text(126, 615, '3', 15);
text(103, 645, 'OCT / SEQ', 19);
knob('glide', 103, 697.5, {
  name: 'Glide',
  module: 'glide',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: 'Portamento: each note slides from the last one instead of jumping. Fully anticlockwise is off; clockwise is a slower slide.',
});
text(103, 728, 'GLIDE', 19);

ringButton('arp.play', 191, 706, C.blue, {
  name: 'Play / tie',
  module: 'mode',
  help: 'Starts and stops the arpeggiator: with it on, held keys play one after another at RATE. On the hardware, in REC it enters a tie.',
});
ringButton('arp.hold', 231, 706, C.blue, {
  name: 'Hold / rest',
  module: 'mode',
  help: 'Keeps the arpeggio playing after the keys are let go. On the hardware, in REC it enters a rest.',
});
ringButton('arp.tap', 271, 706, C.blue, {
  name: 'Tap / accent',
  module: 'mode',
  help: 'On the hardware, three or more taps set the tempo, and in REC it marks an accent. It does nothing to the sound here: set the speed with RATE.',
});
text(191, 683, 'PLAY', 17);
text(231, 683, 'HOLD', 17);
text(271, 683, 'TAP', 17);
text(191, 729, 'TIE', 15);
text(231, 729, 'REST', 15);
text(271, 729, 'ACCENT', 15);

// ── Low frequency osc ─────────────────────────────────────────────────────
decor.push({ t: 'led', x: X(189), y: Y(440), r: 7, color: 'red', litWhen: 'lfo' });
knob('lfo.rate', 230, 469.5, {
  r: 38,
  def: 5,
  name: 'LFO rate',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'The speed of the LFO, from one cycle every 14 seconds to 1.3 kHz. Above about 20 Hz it is fast enough to be heard as a rough or clangy tone rather than a wobble.',
});
text(230, 507, 'RATE', 19);
segRing(187.5, 545, C.yellow);
knob('lfo.pitch', 187.5, 545, {
  ring: false,
  scale: undefined,
  name: 'LFO pitch mod',
  module: 'mod',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the LFO can move the pitch of both oscillators: a little for vibrato, more for sirens and trills. MODULATION sets how much of this is used.',
});
text(187.5, 576, 'PITCH MOD', 19);
segRing(272.5, 545, C.yellow);
knob('lfo.pw', 272.5, 545, {
  ring: false,
  scale: undefined,
  name: 'LFO pulse width',
  module: 'mod',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the LFO can move the pulse width of both oscillators. It is heard only on the square and narrow pulse waves, as a slow chorus-like movement. MODULATION sets how much of this is used.',
});
text(272.5, 576, 'PULSE WIDTH', 19);
segRing(187.5, 621, C.red);
knob('lfo.filter', 187.5, 621, {
  ring: false,
  scale: undefined,
  name: 'LFO filter mod',
  module: 'mod',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How far the LFO can move the filter cutoff: a wah, a tremolo-like pulse or a growl, depending on its speed and shape. MODULATION sets how much of this is used.',
});
text(187.5, 652, 'FILTER MOD', 19);
const LFO_OPTS: ControlOption[] = [
  { v: 'sine', a: -45 },
  { v: 'saw', a: -15 },
  { v: 'ramp', a: 15 },
  { v: 'square', a: 45 },
].map((o) => ({ ...o, label: '' }));
rotary('lfo.wave', 272, 621, LFO_OPTS, 'sine', {
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
  const [gx, gy] = polarXY(272, 621, 34, a);
  glyph(gx, gy, s);
});
text(272, 652, 'WAVEFORM', 19);

// ── Oscillators ───────────────────────────────────────────────────────────
const footage = (x: number, y: number, list: string[]): void =>
  list.forEach((t, i) => {
    const [px, py] = polarXY(x, y, 33, -45 + i * 30);
    text(px, py, `${t}’`, 15, { weight: 700 });
  });
rotary(
  'osc1.oct',
  357.5,
  469,
  ['32', '16', '8', '4'].map((v, i) => ({ v, label: '', a: -45 + i * 30 })),
  '8',
  {
    name: 'Oscillator 1 octave',
    module: 'osc',
    help: 'The octave of Oscillator 1, in organ feet: 32 is the lowest, 4 the highest, and each step is an octave. 8 plays at the pitch of the keys.',
  }
);
footage(357.5, 469, ['32', '16', '8', '4']);
text(357.5, 500, 'OCTAVE', 19);
rotary(
  'osc2.oct',
  427.5,
  469,
  ['16', '8', '4', '2'].map((v, i) => ({ v, label: '', a: -45 + i * 30 })),
  '8',
  {
    name: 'Oscillator 2 octave',
    module: 'osc',
    help: 'The octave of Oscillator 2: 16 is the lowest, 2 the highest. Its range sits an octave above Oscillator 1’s.',
  }
);
footage(427.5, 469, ['16', '8', '4', '2']);
text(427.5, 500, 'OCTAVE', 19);
ringButton('osc2.sync', 357.5, 544, C.yellow, {
  name: 'Sync',
  module: 'osc',
  help: 'Hard sync: Oscillator 2 restarts its cycle every time Oscillator 1 does, so it locks to Oscillator 1’s pitch. Then FREQUENCY changes its tone instead of its pitch, a tearing, vocal sound, best heard as it moves.',
});
text(357.5, 568, 'SYNC', 19);
line(374, 545, 401, 545);
knob('osc2.freq', 428, 545, {
  min: -7,
  max: 7,
  def: 0,
  name: 'Oscillator 2 frequency',
  module: 'osc',
  fmt: (v) => fmtSemi(v),
  help: 'Tunes Oscillator 2 against Oscillator 1, up to seven semitones either way. A touch off the centre makes the two beat and thicken; further round it sets an interval, such as +7 for a fifth.',
});
bipolarArc(428, 545);
text(428, 576, 'FREQUENCY', 19);
const WAVE4: [v: string, shape: WaveShape][] = [
  ['tri', 'tri'],
  ['saw', 'saw'],
  ['sq', 'sq'],
  ['narrow', 'pulse'],
];
rotary(
  'osc1.wave',
  357.5,
  621,
  WAVE4.map(([v], i) => ({ v, label: '', a: -45 + i * 30 })),
  'saw',
  {
    name: 'Oscillator 1 waveform',
    module: 'osc',
    help: 'Oscillator 1’s shape: triangle (soft, flute-like), sawtooth (bright and buzzy), square (hollow) or narrow pulse (thin and nasal).',
  }
);
WAVE4.forEach(([, s], i) => {
  const [gx, gy] = polarXY(357.5, 621, 34, -45 + i * 30);
  glyph(gx, gy, s);
});
text(357.5, 664, 'WAVEFORM', 19);
const WAVE8 = [...WAVE4.map(([v]) => v), ...WAVE4.map(([v]) => `${v}+sub`)];
rotary(
  'osc2.wave',
  427.5,
  621,
  WAVE8.map((v, i) => ({ v, label: '', a: -45 + i * 30 })),
  'saw',
  {
    name: 'Oscillator 2 / sub waveform',
    module: 'osc',
    help: 'Oscillator 2’s shape: triangle, sawtooth, square or narrow pulse. The four positions round the right, under the SUB bracket, give the same shapes and also put the sub-oscillator, a square an octave below Oscillator 2, on mixer channel 3 in place of the white noise.',
  }
);
WAVE4.forEach(([, s], i) => {
  const [gx, gy] = polarXY(427.5, 621, 34, -45 + i * 30);
  glyph(gx, gy, s);
  const [hx, hy] = polarXY(427.5, 621, 35, 77 + i * 29);
  glyph(hx, hy, s, 9);
});
for (let i = 0; i < 6; i++)
  decor.push({
    t: 'arc',
    x: X(427.5),
    y: Y(621),
    r: 30 * K,
    a0: 66 + i * 18,
    a1: 76 + i * 18,
    w: 2.4,
    cap: 'butt',
  });
text(414, 654, 'SUB', 15, { weight: 700 });
text(427.5, 664, 'WAVEFORM', 19);
knob('osc.fine', 392.5, 697.5, {
  min: -4,
  max: 4,
  def: 0,
  name: 'Fine tune',
  module: 'osc',
  fmt: (v) => fmtSemi(v),
  help: 'Tunes both oscillators together, up to four semitones either way, to match other instruments. Leave it at 0, the top, to play in tune.',
});
bipolarArc(392.5, 697.5);
text(392.5, 728, 'FINE TUNE', 19);

// ── Mixer ─────────────────────────────────────────────────────────────────
knob('mix.1', 513, 469.5, {
  def: 7,
  name: 'Mixer 1 (Oscillator 1)',
  module: 'mixer',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How loud Oscillator 1 is in the mix going into the filter. A cable in MIX 1 replaces Oscillator 1 here with whatever is patched.',
});
text(513, 500, '1', 19);
knob('mix.2', 513, 545, {
  def: 0,
  name: 'Mixer 2 (Oscillator 2)',
  module: 'mixer',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How loud Oscillator 2 is in the mix. A cable in MIX 2 replaces Oscillator 2 here.',
});
text(513, 576, '2', 19);
knob('mix.3', 513, 621, {
  def: 0,
  name: 'Mixer 3 (sub / white noise)',
  module: 'mixer',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The third channel: white noise, or the sub-oscillator when OSC 2’s waveform switch is under its SUB bracket. Noise gives breath, wind and snare sounds; the sub gives weight an octave under Oscillator 2.',
});
text(513, 652, '3 / W NOISE', 19);

// ── Utilities ─────────────────────────────────────────────────────────────
knob('hpf.cutoff', 599, 469.5, {
  def: 3,
  name: 'Hi pass filter',
  module: 'util',
  fmt: (v) => fmtHz(hpHz(v)),
  help: 'The cutoff of the separate high-pass filter. It is not in the sound until something is patched into the HI PASS input; its output is the HI PASS jack. Clockwise takes away more of the low end.',
});
text(599, 500, 'HI PASS FILTER', 19);
knob('att.amount', 599, 545, {
  min: -5,
  max: 5,
  def: 0,
  name: 'Attenuator',
  module: 'util',
  fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 20)} %`,
  help: 'Scales whatever is patched into ATT INPUT: 0 at the top passes nothing, clockwise passes more of it, anticlockwise passes it upside down. With nothing patched it puts out a steady voltage you set with the knob.',
});
bipolarArc(599, 545);
text(599, 576, 'ATTENUATOR', 19);
knob('mod.amount', 599, 621, {
  def: 0,
  name: 'Modulation',
  module: 'mod',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The master depth for the LFO: PITCH MOD, PULSE WIDTH and FILTER MOD set how far the LFO can move each destination, and MODULATION sets how much of that is used. At 0 the LFO moves nothing.',
});
text(599, 652, 'MODULATION', 19);

// ── Logo ──────────────────────────────────────────────────────────────────
decor.push({
  t: 'logo',
  x: X(504),
  y: Y(717),
  size: 13,
  text: 'behringer',
  style: 'behringer',
  hw: true,
  brand: true,
});
decor.push({
  t: 'text',
  x: X(531),
  y: Y(710),
  text: 'MODEL',
  size: 46,
  anchor: 'start',
  weight: 800,
  hw: true,
  brand: true,
});
decor.push({
  t: 'text',
  x: X(605),
  y: Y(710),
  text: '15',
  size: 46,
  anchor: 'start',
  weight: 500,
  hw: true,
  brand: true,
});
text(582, 720, 'SEMI-MODULAR ANALOG SYNTHESIZER', 11, { weight: 700, hw: true, brand: true });

// ── Filter ────────────────────────────────────────────────────────────────
knob('vcf.cutoff', 690, 469.5, {
  r: 38,
  def: 6,
  name: 'Cutoff',
  module: 'filter',
  fmt: (v) => fmtHz(cutoffHz(v)),
  scale: { ticks: 31, nums: [], tickR: 1.32 },
  help: 'The cutoff of the low-pass ladder filter. Turned down, the sound gets darker and duller; turned up, brighter. The printed scale runs from 20 Hz to 20 kHz.',
});
text(657, 442, '200', 15, { weight: 700 });
text(657, 450, 'Hz', 15, { weight: 700 });
text(725, 442, '2', 15, { weight: 700 });
text(725, 450, 'kHz', 15, { weight: 700 });
text(666, 501, '20 Hz', 15, { weight: 700 });
text(717, 501, '20 kHz', 15, { weight: 700 });
text(690, 510, 'CUTOFF', 19);
line(690, 516, 690, 525);
slide(
  'vcf.kbd',
  692,
  545,
  [
    { v: 'half', label: '1:2' },
    { v: 'off', label: 'OFF' },
    { v: 'full', label: '1:1' },
  ],
  'off',
  {
    name: 'Key tracking',
    module: 'filter',
    help: 'How far the cutoff follows the keys. OFF keeps it still, so high notes sound darker than low ones. 1:2 moves it half as far as the pitch; 1:1 moves it with the pitch, so every note has the same tone, and a filter that is ringing on its own plays in tune.',
  }
);
text(665, 530.5, '1:2', 15);
text(690, 530.5, 'OFF', 15);
text(714, 530.5, '1:1', 15);
text(690, 561, 'KEY TRACKING', 19);
knob('vcf.res', 690, 621, {
  def: 2,
  name: 'Resonance',
  module: 'filter',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Boosts a narrow band at the cutoff, so sweeps sound vocal and squelchy. Near the top the filter rings on its own and whistles a tone of its own.',
});
text(690, 652, 'RESONANCE', 19);
knob('vcf.env', 690, 697.5, {
  min: -5,
  max: 5,
  def: 2,
  name: 'Envelope amount',
  module: 'filter',
  fmt: (v) => `${v > 0 ? '+' : ''}${signed(v, 7).toFixed(1)} oct`,
  help: 'How far the envelope moves the cutoff on each note. Clockwise from 0 the filter opens with the envelope and closes again, the classic pluck or swell; anticlockwise it dips darker instead.',
});
bipolarArc(690, 697.5);
text(690, 728, 'ENV AMT', 19);

// ── Envelope ──────────────────────────────────────────────────────────────
knob('env.attack', 781, 469.5, {
  def: 0,
  name: 'Attack',
  module: 'env',
  fmt: (v) => fmtTime(attTime(v)),
  help: 'How long the envelope takes to rise when a key goes down. Short is a hard start; long is a slow swell, up to 16 seconds.',
});
text(781, 500, 'ATTACK', 19);
knob('env.decay', 781, 545, {
  def: 5,
  name: 'Decay',
  module: 'env',
  fmt: (v) => fmtTime(decTime(v)),
  help: 'How long the envelope takes to fall from its peak to the sustain level while the key is held.',
});
text(781, 576, 'DECAY', 19);
knob('env.sustain', 781, 621, {
  def: 7,
  name: 'Sustain',
  module: 'env',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The level the envelope holds at for as long as the key is down, after the decay.',
});
text(781, 652, 'SUSTAIN', 19);
knob('env.release', 781, 697.5, {
  def: 3,
  name: 'Release',
  module: 'env',
  fmt: (v) => fmtTime(relTime(v)),
  help: 'How long the envelope takes to fall back to nothing after the key is let go.',
});
text(781, 728, 'RELEASE', 19);

// ── Control ───────────────────────────────────────────────────────────────
decor.push({ t: 'led', x: X(839.5), y: Y(441), r: 7, color: 'red', litWhen: 'gate' });
decor.push({ t: 'din', x: X(866), y: Y(469), r: 40 });
text(866, 500, 'MIDI IN', 19);
knob('out.volume', 866, 545, {
  def: 7,
  name: 'Volume',
  module: 'out',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The overall output level.',
});
text(866, 576, 'VOLUME', 19);
slide(
  'vca.mode',
  873,
  612.5,
  [
    { v: 'env', label: 'ENV' },
    { v: 'release', label: 'RELEASE' },
    { v: 'on', label: 'ON' },
  ],
  'env',
  {
    name: 'VCA mode',
    module: 'amp',
    help: 'What opens the VCA, the stage that sets the loudness. ENV: the envelope, so each note follows ATTACK, DECAY, SUSTAIN and RELEASE. RELEASE: full level while the key is held, fading out over RELEASE after it is let go, while the envelope still shapes the filter. ON: always open, a drone, and a cable into VCA CV sets the level.',
  }
);
text(839, 597.5, 'ENV', 15);
text(866, 597.5, 'RELEASE', 15);
text(895, 597.5, 'ON', 15);
text(866, 628, 'VCA MODE', 19);

// ── Reverb ────────────────────────────────────────────────────────────────
knob('rev.mix', 866, 697.5, {
  def: 2,
  name: 'Reverb mix',
  module: 'fx',
  fmt: (v) => `${Math.round(v * 10)} % wet`,
  help: 'The balance between the dry sound and the spring reverb. At 0 there is no reverb; turned up, the sound gets more distant and splashy.',
});
text(866, 728, 'MIX', 19);

// ── Patch bay ─────────────────────────────────────────────────────────────
const COLS = [928.5, 966.5, 1004.5, 1042.5, 1080.5, 1118.5];
const ROWS = [475, 508.4, 542, 576, 609.6, 643, 676.6];
const jack = (id: string, x: number, y: number, rest: JackRest): void => {
  jacks.push({ id, x: X(x), y: Y(y), r: 15, labelPos: 'none', ...rest });
};
/** One cell of the patch bay: a printed box with the jack's name on a strip under it, coloured by section. */
const cell = (x: number, y: number, label: string, color: string): void => {
  box(x - 17.5, y - 13.5, x + 17.5, y + 17.5, {
    stroke: color === C.white ? INK : color,
    sw: 2.4,
    r: 2,
  });
  box(x - 17.5, y + 11, x + 17.5, y + 17.5, { fill: color, r: 1, hw: true });
  if (label) text(x, y + 14.4, label, 10.5, { fill: DARK, weight: 700 });
};
frame(911, 412.6, 1023, 739);
frame(1025, 412.6, 1137.4, 739);
tab(915, 1019, 'INPUTS', C.white, 416, 431);
tab(1029, 1133, 'OUTPUTS', C.white, 416, 431);
box(914, 433, 1020, 452, { stroke: INK, sw: 2.4, r: 2 });
text(966.5, 456, 'AUDIO', 10.5, { weight: 700 });
box(1028, 433, 1134.5, 452, { stroke: INK, sw: 2.4, r: 2 });
text(1080.5, 456, 'AUDIO', 10.5, { weight: 700 });
box(914, 697, 1020, 725, { stroke: INK, sw: 2.4, r: 2 });
text(966.5, 729.5, 'MULTI 1', 10.5, { weight: 700 });
box(1028, 697, 1134.5, 725, { stroke: INK, sw: 2.4, r: 2 });
text(1080.5, 729.5, 'MULTI 2', 10.5, { weight: 700 });
[
  [938, 948],
  [976, 986],
  [1052, 1062],
  [1090, 1100],
].forEach(([a, b]) => line(a, 711, b, 711, 2.4));

/** [column, row, id, label, colour, jack fields] for every jack in the bay. */
const lvl =
  (id: string) =>
  (v: ControlValues): number =>
    level10(num(v, id), 1);
type BayJack = OmitEach<JackRest, 'label'>;
const BAY: [
  c: number,
  r: number,
  id: string | null,
  label: string,
  color: string,
  j: BayJack | null,
][] = [
  [
    0,
    0,
    'j.mix1',
    'MIX 1',
    C.white,
    {
      dir: 'in',
      dest: 'extIn',
      amt: lvl('mix.1'),
      name: 'MIX 1 input',
      check: (v) =>
        num(v, 'mix.1') <= 0
          ? 'Mixer knob 1 is at 0, so nothing patched here reaches the filter. Turn knob 1 up.'
          : null,
      help: 'Into mixer channel 1, in place of Oscillator 1. Mixer knob 1 sets its level.',
    },
  ],
  [
    1,
    0,
    'j.mix2',
    'MIX 2',
    C.white,
    {
      dir: 'in',
      dest: 'extIn',
      amt: lvl('mix.2'),
      name: 'MIX 2 input',
      check: (v) =>
        num(v, 'mix.2') <= 0
          ? 'Mixer knob 2 is at 0, so nothing patched here reaches the filter. Turn knob 2 up.'
          : null,
      help: 'Into mixer channel 2, in place of Oscillator 2. Mixer knob 2 sets its level.',
    },
  ],
  [
    2,
    0,
    'j.mix3',
    'MIX 3',
    C.white,
    {
      dir: 'in',
      dest: 'extIn',
      amt: lvl('mix.3'),
      name: 'MIX 3 input',
      check: (v) =>
        num(v, 'mix.3') <= 0
          ? 'Mixer knob 3 is at 0, so nothing patched here reaches the filter. Turn knob 3 up.'
          : null,
      help: 'Into mixer channel 3, in place of the white noise or sub-oscillator. Mixer knob 3 sets its level.',
    },
  ],
  [
    0,
    1,
    'j.rev_in',
    'REVERB',
    C.green,
    {
      dir: 'in',
      dest: 'revIn',
      amt: 1,
      name: 'REVERB input',
      check: (v) =>
        num(v, 'rev.mix') <= 0
          ? 'REVERB MIX is at 0, so only the dry signal is heard, and that is now whatever is patched here. Turn MIX up to hear the reverb.'
          : null,
      help: 'Straight into the reverb, in place of the VCA. The reverb feeds the output, so whatever is patched here is what you hear, dry and wet as MIX sets.',
    },
  ],
  [
    1,
    1,
    'j.filter_in',
    'FILTER',
    C.red,
    {
      dir: 'in',
      dest: 'vcfIn',
      amt: 1,
      name: 'FILTER input',
      help: 'Audio into the ladder filter, in place of the mixer.',
    },
  ],
  [
    2,
    1,
    'j.hp_in',
    'HI PASS',
    C.white,
    {
      dir: 'in',
      dest: 'hp6In',
      amt: 1,
      name: 'HI PASS input',
      help: 'Into the separate high-pass filter. Its output is the HI PASS jack on the right, and HI PASS FILTER sets the cutoff.',
    },
  ],
  [
    0,
    2,
    'j.osc1_pwm',
    'OSC 1 PWM',
    C.yellow,
    {
      dir: 'in',
      dest: 'pw1',
      amt: 0.4,
      add: true,
      check: (v) =>
        /^(sq|narrow)/.test(String(v['osc1.wave']))
          ? null
          : 'Oscillator 1 is not on the square or narrow pulse wave, and pulse width only changes those. Switch its WAVEFORM to one of them.',
      help: 'Moves the pulse width of Oscillator 1’s square and narrow pulse waves, adding to the LFO’s PULSE WIDTH modulation.',
    },
  ],
  [
    1,
    2,
    'j.env_amt',
    'ENV AMT',
    C.red,
    {
      dir: 'in',
      dest: null,
      name: 'ENV AMT input',
      help: 'On the hardware, a voltage here sets how far the envelope moves the cutoff, so velocity or an LFO can change the filter sweep. This app cannot model it: a cable here changes nothing.',
    },
  ],
  [
    2,
    2,
    'j.cutoff',
    'CUTOFF',
    C.red,
    {
      dir: 'in',
      dest: 'cutoff',
      amt: 5,
      add: true,
      name: 'CUTOFF input',
      help: 'Moves the filter cutoff, adding to the CUTOFF knob, the envelope and the LFO.',
    },
  ],
  [
    0,
    3,
    'j.osc2_fm',
    'OSC 2 FM',
    C.yellow,
    {
      dir: 'in',
      dest: 'pitch2',
      amt: 12,
      add: true,
      name: 'OSC 2 FM input',
      help: 'Frequency modulation of Oscillator 2. A slow signal bends its pitch; an audio-rate one, such as Oscillator 1, gives clangy, bell-like and metallic tones.',
    },
  ],
  [
    1,
    3,
    'j.osc1_cv',
    'OSC 1 CV',
    C.yellow,
    {
      dir: 'in',
      dest: 'pitch1',
      amt: 12,
      add: true,
      name: 'OSC 1 CV input',
      help: 'Moves the pitch of Oscillator 1, added to the keys.',
    },
  ],
  [
    2,
    3,
    'j.osc2_cv',
    'OSC 2 CV',
    C.yellow,
    {
      dir: 'in',
      dest: 'pitch2',
      amt: 12,
      add: true,
      name: 'OSC 2 CV input',
      help: 'Moves the pitch of Oscillator 2, added to the keys.',
    },
  ],
  [
    0,
    4,
    'j.env_trig',
    'ENV TRIG',
    C.white,
    {
      dir: 'in',
      dest: 'gateIn',
      amt: 1,
      name: 'ENV TRIG input',
      help: 'Fires the envelope, in place of the keys. A square LFO here plays the envelope over and over by itself.',
    },
  ],
  [
    1,
    4,
    'j.vca_in',
    'VCA',
    C.white,
    {
      dir: 'in',
      dest: 'vcaIn',
      amt: 1,
      name: 'VCA input',
      help: 'Audio into the VCA, in place of the filter output.',
    },
  ],
  [
    2,
    4,
    'j.vca_cv',
    'VCA CV',
    C.white,
    {
      dir: 'in',
      dest: 'amp',
      amt: 1,
      add: true,
      name: 'VCA CV input',
      help: 'Opens the VCA. In VCA MODE ON a cable here takes over the level, so the patched signal sets the loudness; in the other modes it adds to the envelope.',
    },
  ],
  [
    0,
    5,
    'j.lfo_trig',
    'LFO TRIG',
    C.white,
    {
      dir: 'in',
      dest: 'lfoTrig',
      amt: 1,
      name: 'LFO TRIG input',
      help: 'Restarts the LFO’s cycle on each rising edge, for example from GATE so every note starts its vibrato or wah from the same point.',
    },
  ],
  [
    1,
    5,
    'j.lfo_rate',
    'LFO RATE',
    C.white,
    {
      dir: 'in',
      dest: 'lfoRate',
      amt: 4,
      add: true,
      name: 'LFO RATE input',
      help: 'Speeds the LFO up and slows it down, adding to the RATE knob.',
    },
  ],
  [
    2,
    5,
    'j.att_in',
    'ATT',
    C.white,
    {
      dir: 'in',
      dest: 'att1In',
      amt: 1,
      name: 'ATT input',
      help: 'Into the attenuator. Its output, ATT on the right, is this signal scaled, or turned upside down, by the ATTENUATOR knob. With nothing here it puts out a steady voltage instead.',
    },
  ],
  [
    0,
    6,
    'j.arp_sync',
    'ARP/SEQ SYN',
    C.blue,
    {
      dir: 'in',
      dest: null,
      name: 'ARP/SEQ SYNC input',
      help: 'On the hardware, a clock here sets the arpeggiator’s tempo. This app cannot model it: a cable here changes nothing.',
    },
  ],
  [
    1,
    6,
    'j.arp_reset',
    'ARP/SEQ RES',
    C.blue,
    {
      dir: 'in',
      dest: null,
      name: 'ARP/SEQ RESET input',
      help: 'On the hardware, a pulse here sends the arpeggio or sequence back to its first step. This app cannot model it: a cable here changes nothing.',
    },
  ],
  [
    2,
    6,
    'j.arp_on',
    'ARP/SEQ ON',
    C.blue,
    {
      dir: 'in',
      dest: null,
      name: 'ARP/SEQ ON input',
      help: 'On the hardware, a high voltage here starts the arpeggiator and a low one stops it. This app cannot model it: a cable here changes nothing.',
    },
  ],
  [
    3,
    0,
    'j.vca_out',
    'VCA',
    C.white,
    {
      dir: 'out',
      signal: 'vca',
      name: 'VCA output',
      help: 'The VCA’s output, before the reverb.',
    },
  ],
  [4, 0, null, '', C.white, null],
  [
    5,
    0,
    'j.mixer_out',
    'MIXER',
    C.white,
    {
      dir: 'out',
      signal: 'mixer',
      name: 'MIXER output',
      help: 'The mixer’s output, before the filter.',
    },
  ],
  [
    3,
    1,
    'j.hp_out',
    'HI PASS',
    C.white,
    {
      dir: 'out',
      signal: 'hp6',
      name: 'HI PASS output',
      help: 'The separate high-pass filter’s output. It is silent until something is patched into the HI PASS input.',
    },
  ],
  [
    4,
    1,
    'j.filter_out',
    'FILTER',
    C.red,
    {
      dir: 'out',
      signal: 'vcf1',
      name: 'FILTER output',
      help: 'The ladder filter’s output, before the VCA.',
    },
  ],
  [
    5,
    1,
    'j.rev_out',
    'REVERB',
    C.green,
    {
      dir: 'out',
      signal: 'rev',
      name: 'REVERB output',
      help: 'The reverb’s output: the dry and reverberated signal, blended by MIX.',
    },
  ],
  [
    3,
    2,
    'j.white',
    'W NOISE',
    C.yellow,
    {
      dir: 'out',
      signal: 'noise',
      name: 'White noise output',
      help: 'White noise: an even hiss across the whole range.',
    },
  ],
  [4, 2, null, '', C.yellow, null],
  [
    5,
    2,
    'j.pink',
    'P NOISE',
    C.yellow,
    {
      dir: 'out',
      signal: 'pink',
      name: 'Pink noise output',
      help: 'Pink noise: hiss with more weight in the low end, closer to rain or surf than white noise.',
    },
  ],
  [
    3,
    3,
    'j.osc1_out',
    'OSC 1',
    C.yellow,
    {
      dir: 'out',
      signal: 'osc1',
      name: 'OSC 1 output',
      help: 'Oscillator 1 on its own, before the mixer.',
    },
  ],
  [
    4,
    3,
    'j.sub_out',
    'SUB',
    C.yellow,
    {
      dir: 'out',
      signal: 'sub',
      name: 'SUB output',
      help: 'The sub-oscillator on its own: a square wave an octave below Oscillator 2.',
    },
  ],
  [
    5,
    3,
    'j.osc2_out',
    'OSC 2',
    C.yellow,
    {
      dir: 'out',
      signal: 'osc2',
      name: 'OSC 2 output',
      help: 'Oscillator 2 on its own, before the mixer.',
    },
  ],
  [
    3,
    4,
    'j.env_out',
    'ENV',
    C.white,
    {
      dir: 'out',
      signal: 'env1',
      name: 'ENV output',
      help: 'The envelope, rising and falling with each note.',
    },
  ],
  [
    4,
    4,
    'j.sh_out',
    'S&H',
    C.white,
    {
      dir: 'out',
      signal: 'sh',
      name: 'S&H output',
      help: 'The sample and hold: a new random level each LFO cycle, held until the next. Patched to pitch or cutoff it gives stepped, computer-like patterns.',
    },
  ],
  [
    5,
    4,
    'j.env_inv',
    'ENV INV',
    C.white,
    {
      dir: 'out',
      signal: 'env1',
      gain: -1,
      name: 'ENV INV output',
      help: 'The envelope upside down: it falls when the envelope rises.',
    },
  ],
  [
    3,
    5,
    'j.att_out',
    'ATT',
    C.white,
    {
      dir: 'out',
      signal: 'att1',
      name: 'ATT output',
      help: 'The attenuator’s output: ATT INPUT scaled or turned upside down by the ATTENUATOR knob, or with nothing patched in, a steady voltage set by the knob.',
    },
  ],
  [
    4,
    5,
    'j.lfo_out',
    'LFO',
    C.white,
    {
      dir: 'out',
      signal: 'lfo',
      name: 'LFO output',
      help: 'The LFO, in the shape set by its WAVEFORM switch.',
    },
  ],
  [
    5,
    5,
    'j.velocity',
    'VELOCITY',
    C.blue,
    {
      dir: 'out',
      signal: 'vel',
      name: 'VELOCITY output',
      help: 'How hard each key was played, as a voltage. Patch it to CUTOFF so harder notes are brighter.',
    },
  ],
  [
    3,
    6,
    'j.note_cv',
    'NOTE CV',
    C.blue,
    {
      dir: 'out',
      signal: 'kbd',
      name: 'NOTE CV output',
      help: 'The pitch of the key played, as a voltage.',
    },
  ],
  [
    4,
    6,
    'j.gate_out',
    'GATE',
    C.blue,
    {
      dir: 'out',
      signal: 'gate',
      name: 'GATE output',
      help: 'High while a key is held, low when it is let go.',
    },
  ],
  [
    5,
    6,
    'j.sync_out',
    'SYNC',
    C.blue,
    {
      dir: 'out',
      signal: null,
      name: 'SYNC output',
      help: 'On the hardware, the arpeggiator’s clock, to keep other gear in time. This app cannot model it: a cable from here carries nothing.',
    },
  ],
];
for (const [c, r, id, label, color, j] of BAY) {
  cell(COLS[c], ROWS[r], label, color);
  if (id && j) jack(id, COLS[c], ROWS[r], { label, ...j });
}
jack('j.audio_in', 966.5, 441.4, {
  dir: 'in',
  label: 'AUDIO',
  name: 'AUDIO input',
  dest: 'extIn',
  amt: lvl('mix.3'),
  check: (v) =>
    num(v, 'mix.3') <= 0
      ? 'Mixer knob 3 is at 0, so nothing patched here reaches the filter. Turn knob 3 up.'
      : null,
  help: 'Outside audio into the synth. The guide does not say where it enters; here it takes mixer channel 3’s place, like MIX 3, so knob 3 sets its level and the filter shapes it.',
});
jack('j.audio_out', 1080.5, 441.4, {
  dir: 'out',
  label: 'AUDIO',
  name: 'AUDIO output',
  signal: 'master',
  help: 'The main audio output, after the reverb.',
});
const MULTI =
  'A multiple: the three jacks are joined, so one signal can go to two places. Here the first jack of each group is the input and the other two are copies of it.';
jack('j.m1a', 928.5, 711, {
  dir: 'in',
  label: 'MULTI 1',
  name: 'MULTI 1 input',
  dest: 'multIn',
  amt: 1,
  help: MULTI,
});
jack('j.m1b', 966.5, 711, {
  dir: 'out',
  label: 'MULTI 1',
  name: 'MULTI 1 copy (2)',
  signal: 'mult',
  help: MULTI,
});
jack('j.m1c', 1004.5, 711, {
  dir: 'out',
  label: 'MULTI 1',
  name: 'MULTI 1 copy (3)',
  signal: 'mult',
  help: MULTI,
});
jack('j.m2a', 1042.5, 711, {
  dir: 'in',
  label: 'MULTI 2',
  name: 'MULTI 2 input',
  dest: 'sum1A',
  amt: 1,
  help: MULTI,
});
jack('j.m2b', 1080.5, 711, {
  dir: 'out',
  label: 'MULTI 2',
  name: 'MULTI 2 copy (2)',
  signal: 'sum1',
  help: MULTI,
});
jack('j.m2c', 1118.5, 711, {
  dir: 'out',
  label: 'MULTI 2',
  name: 'MULTI 2 copy (3)',
  signal: 'sum1',
  help: MULTI,
});

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
    keywords: 'arp arpeggio sequencer seq tempo clock hold latch play tap',
    rects: [R(60, 405, 147, 672), R(147, 670, 314, 745)],
    help: 'Hold a chord, press PLAY, and the arpeggiator plays its notes one after another at RATE. DIRECTION picks the order, OCT / SEQ how many octaves it climbs, and HOLD keeps it going after the keys are let go. On the hardware the same section records and plays three sequences of up to 256 steps.',
  },
  {
    id: 'glide',
    label: 'Glide',
    module: 'glide',
    keywords: 'portamento slide legato',
    rects: [R(60, 672, 147, 745)],
    help: 'GLIDE makes each note slide into the next instead of jumping. Fully anticlockwise is off.',
  },
  {
    id: 'lfo',
    label: 'Low frequency osc (LFO)',
    module: 'lfo',
    keywords: 'lfo vibrato wobble trill tremolo wah pwm rate shape',
    rects: [R(147, 405, 314, 670)],
    help: 'The LFO makes no sound itself; it moves other things. RATE sets its speed and WAVEFORM its shape. The three coloured knobs set how far it can move the pitch, the pulse width and the filter, and MODULATION in the utilities is the master depth for all three.',
  },
  {
    id: 'osc1',
    label: 'Oscillator 1',
    module: 'osc',
    keywords: 'oscillator vco octave footage waveform sawtooth square triangle pulse',
    rects: [R(314, 405, 393, 527), R(314, 575, 393, 662)],
    help: 'Oscillator 1: OCTAVE picks its range in organ feet and WAVEFORM its shape. It is the master for sync.',
  },
  {
    id: 'osc2',
    label: 'Oscillator 2 and sub',
    module: 'osc',
    keywords: 'oscillator vco detune interval sync sub suboscillator octave',
    rects: [R(393, 405, 472, 662), R(314, 527, 393, 575)],
    help: 'Oscillator 2: OCTAVE, FREQUENCY to tune it up to seven semitones against Oscillator 1, SYNC to lock it to Oscillator 1, and WAVEFORM. The positions under the SUB bracket also bring in the sub-oscillator, a square an octave below, on mixer channel 3.',
  },
  {
    id: 'tune',
    label: 'Fine tune',
    module: 'osc',
    keywords: 'tuning pitch master tune',
    rects: [R(314, 662, 472, 745)],
    help: 'FINE TUNE moves both oscillators together, up to four semitones either way.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mixer level volume noise sub',
    rects: [R(472, 405, 555, 670)],
    help: 'Levels into the filter: Oscillator 1, Oscillator 2, and channel 3, which is white noise or, with OSC 2’s waveform under its SUB bracket, the sub-oscillator. Pushing the levels up drives the filter harder for a thicker, slightly overdriven tone.',
  },
  {
    id: 'hpf',
    label: 'Hi pass filter',
    module: 'util',
    keywords: 'high-pass highpass hpf low cut thin',
    rects: [R(555, 405, 641, 507)],
    help: 'A separate 6 dB high-pass filter in the patch bay, not in the sound until something is patched into HI PASS. The knob sets its cutoff.',
  },
  {
    id: 'att',
    label: 'Attenuator',
    module: 'util',
    keywords: 'attenuverter invert scale offset voltage',
    rects: [R(555, 507, 641, 587)],
    help: 'Scales or turns upside down whatever is patched into ATT INPUT; with nothing patched it is a steady voltage set by the knob, useful for offsetting a pitch or cutoff by cable.',
  },
  {
    id: 'modamt',
    label: 'Modulation',
    module: 'mod',
    keywords: 'mod depth amount lfo master',
    rects: [R(555, 587, 641, 670)],
    help: 'MODULATION is the master depth for the LFO. At 0 the LFO moves nothing; turned up, it applies the depths set on PITCH MOD, PULSE WIDTH and FILTER MOD.',
  },
  {
    id: 'vcf',
    label: 'Filter',
    module: 'filter',
    keywords:
      'ladder low-pass lowpass cutoff resonance emphasis key tracking envelope amount brightness',
    rects: [R(641, 405, 738, 745)],
    help: 'A 24 dB low-pass ladder filter, the Moog design. CUTOFF sets how bright the sound is, RESONANCE how sharply it rings at the cutoff, KEY TRACKING how far the cutoff follows the keys, and ENV AMT how far the envelope sweeps it, up or down.',
  },
  {
    id: 'env',
    label: 'Envelope',
    module: 'env',
    keywords: 'adsr attack decay sustain release contour',
    rects: [R(738, 405, 825, 745)],
    help: 'One ADSR envelope, fired by each key. It always moves the filter, by ENV AMT, and in VCA MODE ENV it shapes the loudness too.',
  },
  {
    id: 'control',
    label: 'Control: volume and VCA mode',
    module: 'amp',
    keywords: 'midi volume vca drone amplifier loudness',
    rects: [R(825, 405, 908, 644)],
    help: 'MIDI IN is where the keyboard plays the synth. VOLUME is the output level. VCA MODE chooses what opens the amplifier: the envelope (ENV), the keys with the envelope’s release time (RELEASE), or nothing, left open as a drone (ON).',
  },
  {
    id: 'reverb',
    label: 'Reverb',
    module: 'fx',
    keywords: 'spring reverb echo room space',
    rects: [R(825, 644, 908, 745)],
    help: 'A spring reverb after the VCA. MIX blends the dry sound with the reverb.',
  },
  {
    id: 'bay-audio',
    label: 'Patch bay: audio path',
    module: 'util',
    keywords: 'patch jack input output audio mixer filter vca reverb high-pass',
    rects: [R(908, 405, 1140, 525)],
    help: 'Inputs on the left, outputs on the right. Each stage of the sound path can be taken out (MIXER, FILTER, VCA, REVERB) or fed from elsewhere (MIX 1–3, FILTER, VCA, REVERB). A cable into an audio input replaces what was wired there. The HI PASS pair is the separate high-pass filter.',
  },
  {
    id: 'bay-osc',
    label: 'Patch bay: oscillators and noise',
    module: 'osc',
    keywords: 'patch fm pwm cv pitch noise white pink sub',
    rects: [R(908, 525, 1140, 593)],
    help: 'Pitch, FM and pulse-width inputs for the oscillators, the filter’s CUTOFF and ENV AMT inputs, and outputs for each oscillator, the sub-oscillator and white and pink noise. Pitch inputs add to the keys rather than replacing them.',
  },
  {
    id: 'bay-mod',
    label: 'Patch bay: envelope, VCA, LFO and utilities',
    module: 'mod',
    keywords: 'patch envelope trigger lfo sample hold attenuator velocity inverted',
    rects: [R(908, 593, 1140, 660)],
    help: 'The envelope’s trigger input and its normal and upside-down outputs, the VCA’s inputs, the LFO’s reset and rate inputs and its output, the sample and hold, the attenuator, and key VELOCITY.',
  },
  {
    id: 'bay-midi',
    label: 'Patch bay: keyboard and arpeggiator',
    module: 'util',
    keywords: 'patch note cv gate clock sync reset',
    rects: [R(908, 660, 1140, 694)],
    help: 'NOTE CV and GATE are the keyboard as voltages, for driving other gear or the synth’s own inputs. The blue inputs clock, reset and start the arpeggiator on the hardware.',
  },
  {
    id: 'bay-multi',
    label: 'Multiples',
    module: 'util',
    keywords: 'mult multiple split copy',
    rects: [R(908, 694, 1140, 745)],
    help: 'Two groups of three joined jacks, for sending one signal to two places.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const WAVE_MIX: Record<string, Pick<OscParams, 'mix' | 'pw'>> = {
  tri: { mix: { tri: 1 }, pw: 0.5 },
  saw: { mix: { saw: 0.8 }, pw: 0.5 },
  sq: { mix: { pulse: 0.75 }, pw: 0.5 },
  narrow: { mix: { pulse: 0.75 }, pw: 0.15 },
};
const LFO_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  saw: { rsaw: 1 },
  ramp: { saw: 1 },
  square: { sq: 1 },
};
const ARP_ORDER: Record<string, ArpMode> = { ordr: 'played', bf: 'updown', rndm: 'random' };
const KBD: Record<string, number> = { half: 0.5, off: 0, full: 1 };

function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const patched = ctx.patched;
  const w2 = String(v['osc2.wave']);
  const sub = w2.endsWith('+sub');
  const wave2 = WAVE_MIX[sub ? w2.slice(0, -4) : w2];
  const wave1 = WAVE_MIX[String(v['osc1.wave'])];
  const ch3 = patched['j.mix3'] || patched['j.audio_in'] ? 0 : level10(num(v, 'mix.3'), 1);
  const mod = num(v, 'mod.amount') / 10;
  const routes: EngineRoute[] = [];
  const add = (dst: string, amt: number): void => {
    if (amt) routes.push({ src: 'lfo', dst, amt });
  };
  add('pitchAll', Math.pow(num(v, 'lfo.pitch') / 10, 2) * 24 * mod);
  const pwAmt = (num(v, 'lfo.pw') / 10) * 0.4 * mod;
  add('pw1', pwAmt);
  add('pw2', pwAmt);
  add('cutoff', (num(v, 'lfo.filter') / 10) * 5 * mod);
  const rate = lfoHz(num(v, 'lfo.rate'));
  const a = attTime(num(v, 'env.attack')),
    d = decTime(num(v, 'env.decay')),
    r = relTime(num(v, 'env.release'));
  const mode = v['vca.mode'];
  return {
    osc: [
      {
        level: patched['j.mix1'] ? 0 : level10(num(v, 'mix.1'), 1),
        ...wave1,
        semi: OCT1[String(v['osc1.oct'])],
        kbd: true,
        syncTo: -1,
      },
      {
        level: patched['j.mix2'] ? 0 : level10(num(v, 'mix.2'), 1),
        ...wave2,
        semi: OCT2[String(v['osc2.oct'])] + num(v, 'osc2.freq'),
        kbd: true,
        syncTo: v['osc2.sync'] ? 0 : -1,
        subLevel: sub ? ch3 * 0.8 : 0,
      },
    ],
    subOut: true,
    noise: { level: sub ? 0 : ch3 * 0.7, color: 'white' },
    ext: { level: 1 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: cutoffHz(num(v, 'vcf.cutoff')),
      res: (num(v, 'vcf.res') / 10) * 1.08,
      envAmt: signed(num(v, 'vcf.env'), 7),
      envSrc: 'env1',
      kbd: KBD[String(v['vcf.kbd'])],
    },
    env1: { a, d, s: num(v, 'env.sustain') / 10, r },
    // VCA MODE RELEASE: the loudness is a plain gate with the envelope's release on the end
    env2: { a: 0.002, d: 0.01, s: 1, r },
    vca:
      mode === 'on'
        ? { envSrc: 'none', bias: patched['j.vca_cv'] ? 0 : 1 }
        : { envSrc: mode === 'release' ? 'env2' : 'env1', bias: 0 },
    lfo: { rate, mix: LFO_MIX[String(v['lfo.wave'])], keySync: false },
    glide: { time: glideTime(num(v, 'glide')), legato: false },
    // both envelopes fire from ENV TRIG, which is normalled to the key gate
    trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'] },
    routes,
    normals: { gateIn: 'gate', att1In: ['one', 0.8], revIn: 'out', dryIn: 'rev' },
    hp6: { cutoff: hpHz(num(v, 'hpf.cutoff')) },
    rev: { on: true, unit: true, mix: (num(v, 'rev.mix') / 10) * 0.85, decay: 0.8, damp: 0.45 },
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
    tune: num(v, 'osc.fine'),
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const model15: SynthDef & { version: number } = {
  id: 'model-15',
  version: 1,
  name: 'Model 15',
  maker: 'Behringer',
  year: 2022,
  heritage:
    'Built on Moog modular circuits, with the layout and features of the 2018 Moog Grandmother',
  summary:
    'A semi-modular mono synth: two oscillators with sync and a sub-oscillator, white or pink noise, a 24 dB ladder filter, one ADSR envelope, an LFO that reaches audio rates, a spring reverb, an arpeggiator, and 48 patch points that change the internal wiring without needing any cables to play.',
  view: { w: (1173 - OX) * K, h: (745 - OY) * K },
  theme: {
    panel: '#1d1d1f',
    panel2: '#151516',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'wood',
    cheekW: 34,
    jack: 'black',
  },
  signalNames: {
    osc1: 'Oscillator 1',
    osc2: 'Oscillator 2',
    env1: 'the envelope',
    env2: 'the RELEASE-mode gate',
    lfo: 'the LFO',
    sh: 'the sample and hold',
    att1: 'the attenuator',
    mult: 'MULTI 1',
    sum1: 'MULTI 2',
    vcf1: 'the ladder filter',
    hp6: 'the HI PASS filter',
    rev: 'the reverb',
    master: 'the main output',
    mixer: 'the mixer',
  },
  destNames: { extIn: 'the mixer', revIn: 'the reverb', hp6In: 'the HI PASS filter' },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default model15;
