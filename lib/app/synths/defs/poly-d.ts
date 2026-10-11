/**
 * Behringer Poly D: the definition (D1). Positions are pixels on the 3000×1694 product photo
 * (ref/behringer-poly-d.jpg), written in photo space and moved into the view by X()/Y() (the main panel) and LX()/LY()
 * (the small panel to the left of the keys). The data model is ref/behringer-poly-d.synth.json (Quick Start Guide, 57
 * numbered controls and 15 sequencer controls).
 *
 * The view is the main panel with the small panel from the left of the keyboard stood beside it: LFO RATE and its wave
 * switch, the GLIDE on/off switch and TRANSPOSE live there on the hardware, and the voice cannot be understood without
 * them. The wheels are drawn for reference only; the mod wheel beside the app's keyboard is the one that works (and on
 * the Poly D it is the only modulation depth control).
 *
 * Engine notes: four oscillators, each able to play a note of its own (`oscAssign`) for MONO / UNI / POLY and AUTO
 * DAMP. Distortion sits after the VCA (`normals`), then a stereo bucket-brigade chorus (`chorus`). The arpeggiator is
 * the engine's own, so the voice runs as a one-voice `poly` synth.
 *
 * Transliterated from the prototype file `src/synths/poly-d.js` (D3), the way `defs/model-d.ts` was: no content
 * (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the printed "POLY" and its "D", and
 * the "behringer" logo), and panel values read through `num()`.
 */
import type {
  ArpMode,
  Area,
  ButtonControl,
  Control,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  Jack,
  KnobControl,
  KnobScale,
  OscMix,
  OscParams,
  RockerControl,
  SynthDef,
  SynthModule,
  TextDecor,
  WaveShape,
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

type KnobRest = OmitEach<KnobControl, 'id' | 'type' | 'x' | 'y' | 'r' | 'style'>;
type RockerRest = OmitEach<
  RockerControl,
  'id' | 'type' | 'x' | 'y' | 'color' | 'w' | 'h' | 'labelPos'
> &
  Partial<Pick<RockerControl, 'w' | 'h' | 'labelPos'>>;
type SeqRest = OmitEach<
  ButtonControl,
  'id' | 'type' | 'lamp' | 'x' | 'y' | 'w' | 'h' | 'labelPos' | 'module'
>;
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'brand'>>;

// ── Ranges and tapers ─────────────────────────────────────────────────────
// Contour times as printed (10 M-SEC · 200 · 600 · 1 SEC · 5 · 10); the guide gives 1 ms to 10 s attack, 4 ms up
// decay.
const ATT_PTS: CurvePoint[] = [
  [0, 0.001],
  [2, 0.2],
  [4, 0.6],
  [6, 1],
  [8, 5],
  [10, 10],
];
const DEC_PTS: CurvePoint[] = [
  [0, 0.004],
  [2, 0.2],
  [4, 0.6],
  [6, 1],
  [8, 5],
  [10, 10],
];
const attTime = (v: number): number => pwl(v, ATT_PTS, true);
const decTime = (v: number): number => pwl(v, DEC_PTS, true);
const ENV_SCALE: KnobScale = {
  ticks: 11,
  size: 9,
  labels: [
    { at: 0, text: '10' },
    { at: 2, text: '200' },
    { at: 4, text: '600' },
    { at: 6, text: '1' },
    { at: 8, text: '5' },
    { at: 10, text: '10' },
  ],
};
const S10: KnobScale = { nums: [0, 2, 4, 6, 8, 10], ticks: 11, size: 10 };
const cutoffHz = (v: number): number => expMap((v + 5) / 10, 20, 20000);
const lfoHz = (v: number): number => expMap(v / 10, 0.05, 200); // the guide's 0.05 to 200 Hz
const glideTime = (v: number): number => Math.pow(v / 10, 2) * 2;
const tempoBpm = (v: number): number => Math.round(expMap(v / 10, 40, 240));

const RANGES = [
  { v: 'lo', label: 'LO', a: -100 },
  { v: '32', label: "32'", a: -60 },
  { v: '16', label: "16'", a: -20 },
  { v: '8', label: "8'", a: 20 },
  { v: '4', label: "4'", a: 60 },
  { v: '2', label: "2'", a: 100 },
];
const RANGE_SEMI: Record<string, number> = { lo: -72, 32: -24, 16: -12, 8: 0, 4: 12, 2: 24 };
const waveShapes = (n: number): WaveShape[] => [
  'tri',
  n === 4 ? 'rsaw' : 'shark',
  'saw',
  'sq',
  'pulse',
  'npulse',
];
const WAVE_V = (n: number): string[] => [
  'tri',
  n === 4 ? 'rsaw' : 'shark',
  'saw',
  'sq',
  'wide',
  'narrow',
];
const WAVE_MIX: Record<string, { mix: OscMix; pw: number }> = {
  tri: { mix: { tri: 1 }, pw: 0.5 },
  shark: { mix: { shark: 1 }, pw: 0.5 },
  rsaw: { mix: { rsaw: 1 }, pw: 0.5 },
  saw: { mix: { saw: 1 }, pw: 0.5 },
  sq: { mix: { pulse: 1 }, pw: 0.5 },
  wide: { mix: { pulse: 1 }, pw: 0.3 },
  narrow: { mix: { pulse: 1 }, pw: 0.14 },
};
const TRANSPOSE: Record<string, number> = { up: 12, norm: 0, down: -12 };
// The guide lists the eight arpeggio orders only in passing; this is how this app plays them.
const ARP_ORDERS: { v: string; label: string; mode: ArpMode; oct: number }[] = [
  { v: 'up', label: 'UP', mode: 'up', oct: 1 },
  { v: 'down', label: 'DOWN', mode: 'down', oct: 1 },
  { v: 'updown', label: 'UP/DOWN', mode: 'updown', oct: 1 },
  { v: 'random', label: 'RANDOM', mode: 'random', oct: 1 },
  { v: 'up2', label: 'UP 2 OCT', mode: 'up', oct: 2 },
  { v: 'down2', label: 'DOWN 2 OCT', mode: 'down', oct: 2 },
  { v: 'updown2', label: 'UP/DOWN 2 OCT', mode: 'updown', oct: 2 },
  { v: 'played', label: 'AS PLAYED', mode: 'played', oct: 1 },
];
const CHORUS_MODES = [0, 1, 2, 3] as const;

// ── Photo → view ──────────────────────────────────────────────────────────
// Main panel: photo x 112…2890, y 25…830 (× 2/3). Left of it, a 280-wide plate for the keyboard-side controls, a wood
// strip.
const X = (x: number): number => Math.round(x * (2 / 3) + 271);
const Y = (y: number): number => Math.round(y * (2 / 3) - 15);
const LX = (x: number): number => Math.round(x * (2 / 3) - 33);
const LY = (y: number): number => Math.round((y - 1060) * (2 / 3) + 50);

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const knob = (
  id: string,
  x: number,
  y: number,
  r: number,
  style: KnobControl['style'],
  rest: KnobRest
): void => {
  controls.push({ id, type: 'knob', x, y, r, style, labelSize: 12, ...rest });
};
const rocker = (
  id: string,
  x: number,
  y: number,
  color: RockerControl['color'],
  rest: RockerRest
): void => {
  controls.push({ id, type: 'rocker', x, y, w: 60, h: 26, color, labelPos: 'none', ...rest });
};
// Silkscreen text centred on a photo point (the renderer's y is the baseline).
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
const T = (px: number, py: number, t: string, size?: number, rest?: TextRest): void =>
  text(X(px), Y(py), t, size, rest);
const LT = (px: number, py: number, t: string, size?: number, rest?: TextRest): void =>
  text(LX(px), LY(py), t, size, rest);
const line = (x1: number, y1: number, x2: number, y2: number, w = 1.6): void => {
  decor.push({ t: 'line', x1, y1, x2, y2, w });
};
const INK = '#ecebe6';
const PANEL = '#1b1c1e';
// The white-on-black plates the panel uses for a button's SHIFT function.
const plate = (px: number, py: number, t: string): void => {
  const w = t.length * 5.6 + 8;
  decor.push({ t: 'rect', x: X(px) - w / 2, y: Y(py) - 6, w, h: 12, r: 2, fill: INK });
  T(px, py, t, 8.5, { fill: PANEL, weight: 700 });
};

// ── Faceplate furniture ───────────────────────────────────────────────────
// The wood strip between the keyboard-side plate and the main panel, and the section lines.
decor.push({ t: 'rect', x: 320, y: -2, w: 26, h: 544, fill: 'url(#kysWood)', hw: true });
line(X(427), Y(40), X(427), Y(800));
line(X(1042), Y(40), X(1042), Y(800));
line(X(1623), Y(40), X(1623), Y(800));
line(X(2150), Y(40), X(2150), Y(617));
line(X(1672), Y(441), X(2150), Y(441));
line(X(1623), Y(617), X(2150), Y(617));
line(X(2737), Y(40), X(2737), Y(800));
line(X(2150), Y(267), X(2737), Y(267));
line(X(2150), Y(443), X(2737), Y(443));
line(X(2812), Y(405), X(2812), Y(465));
const section = (px: number, t: string): void => T(px, 812, t, 24, { weight: 500 });
section(255, 'CONTROLLERS');
section(735, 'OSCILLATOR BANK');
section(1330, 'MIXER');
section(2183, 'SEQUENCER');
section(2812, 'OUTPUT');
text(180, Y(812), 'KEYBOARD', 24, { weight: 500 });
T(1920, 428, 'FILTER', 16);
T(1920, 606, 'LOUDNESS CONTOUR', 16);
T(2382, 252, 'DISTORTION', 17);
T(2383, 427, 'CHORUS', 17);
T(1260, 86, 'POLY', 27, { weight: 700, brand: true });
decor.push({ t: 'logo', x: X(1402), y: Y(84), size: 50, style: 'outline-d', brand: true });

// ── Keyboard-side plate: LFO, glide switch, transpose, wheels ──────────────
knob('lfo.rate', LX(185), LY(1165), 21, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4.5,
  label: 'LFO RATE',
  labelPos: 'top',
  module: 'lfo',
  scale: S10,
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every 20 seconds up to 200 Hz. The lamp beside it flashes at the rate.',
});
decor.push({ t: 'led', x: LX(265), y: LY(1106), r: 4, color: 'red', litWhen: 'lfo' });
controls.push({
  id: 'lfo.shape',
  type: 'rocker',
  color: 'black',
  x: LX(345),
  y: LY(1106),
  w: 60,
  h: 26,
  kind: 'enum',
  module: 'lfo',
  labelPos: 'none',
  options: [
    { v: 'tri', label: 'Triangle' },
    { v: 'sq', label: 'Square' },
  ],
  def: 'tri',
  label: 'LFO wave shape',
  help: 'LFO shape. Triangle gives a smooth wobble (vibrato); square jumps between two values (trills).',
});
decor.push(
  { t: 'wave', x: LX(305), y: LY(1140), size: 9, shape: 'tri' },
  { t: 'wave', x: LX(383), y: LY(1140), size: 9, shape: 'sq' }
);
rocker('glide.on', LX(345), LY(1215), 'white', {
  kind: 'bool',
  def: false,
  module: 'glide',
  label: 'GLIDE',
  labelPos: 'top',
  labelSize: 11,
  help: 'Switches glide on or off. The GLIDE knob in the CONTROLLERS section sets how long the slide takes.',
});
LT(383, 1253, 'ON', 8.5);
controls.push({
  id: 'kbd.transpose',
  type: 'rocker',
  color: 'white',
  orient: 'v',
  x: LX(455),
  y: LY(1160),
  w: 26,
  h: 58,
  kind: 'enum',
  module: 'util',
  options: [
    { v: 'up', label: 'UP' },
    { v: 'norm', label: 'NORM' },
    { v: 'down', label: 'DOWN' },
  ],
  def: 'norm',
  label: 'TRANSPOSE',
  labelPos: 'none',
  help: 'Moves the whole keyboard up or down an octave.',
});
LT(455, 1087, 'TRANSPOSE', 11);
LT(455, 1104, 'UP', 8.5);
LT(493, 1160, 'NORM', 8.5, { anchor: 'start' });
LT(455, 1217, 'DOWN', 8.5);
// The wheels, for reference (hardware view only).
(
  [
    [240, 'PITCH'],
    [385, 'MOD'],
  ] as const
).forEach(([px, name]) => {
  decor.push(
    {
      t: 'rect',
      x: LX(px) - 26,
      y: LY(1305),
      w: 52,
      h: 180,
      r: 4,
      fill: '#060607',
      stroke: '#2a2b2e',
      sw: 1.5,
      hw: true,
    },
    { t: 'rect', x: LX(px) - 19, y: LY(1312), w: 38, h: 166, r: 10, fill: '#d6d7d3', hw: true },
    {
      t: 'rect',
      x: LX(px) - 19,
      y: LY(1312),
      w: 38,
      h: 166,
      r: 10,
      fill: 'url(#kysPatStripes)',
      hw: true,
    }
  );
  LT(px, 1593, name, 10);
});

// ── Controllers ───────────────────────────────────────────────────────────
knob('ctl.tune', X(250), Y(257), 32, 'd-silver', {
  kind: 'cont',
  min: -2.5,
  max: 2.5,
  def: 0,
  label: 'TUNE',
  labelPos: 'top',
  module: 'osc',
  scale: { nums: [-2, -1, 1, 2], ticks: 11, size: 10 },
  fmt: fmtSemi,
  help: 'Master tuning for all four oscillators, about two semitones either way. With OSC 4 CONTROL off, Oscillator 4 ignores it.',
});
rocker('mod.toOsc', X(430), Y(264), 'white', {
  kind: 'bool',
  def: false,
  module: 'mod',
  label: 'OSCILLATOR\nMODULATION',
  labelPos: 'top',
  labelSize: 10,
  help: 'Sends the modulation mix to the pitch of the oscillators: vibrato from the LFO, pitch sweeps from the filter contour, or growl from OSC 4. How much is set by the mod wheel.',
});
T(466, 302, 'ON', 8.5);
controls.push({
  id: 'voice.mode',
  type: 'rocker',
  color: 'green',
  x: X(193),
  y: Y(395),
  w: 60,
  h: 25,
  kind: 'enum',
  module: 'mode',
  options: [
    { v: 'mono', label: 'MONO' },
    { v: 'uni', label: 'UNI' },
    { v: 'poly', label: 'POLY' },
  ],
  def: 'poly',
  label: 'MODE',
  labelPos: 'top',
  labelSize: 11,
  help: 'How notes are shared among the four oscillators. MONO: every oscillator plays the one note. UNI: the oscillators are shared among the keys you hold, all four on one key. POLY: each key gets an oscillator of its own, up to four.',
});
T(143, 428, 'MONO', 8.5);
T(190, 428, 'UNI', 8.5);
T(237, 428, 'POLY', 8.5);
rocker('voice.damp', X(345), Y(395), 'green', {
  kind: 'bool',
  def: false,
  module: 'mode',
  label: 'AUTO DAMP',
  labelPos: 'top',
  labelSize: 11,
  help: 'In POLY, what happens to a note you let go while other keys are still held. Off: it keeps sounding until you let go of everything or play a new note. On: it stops at once and only the held keys go on.',
});
T(382, 432, 'ON', 8.5);
knob('ctl.glide', X(180), Y(525), 24, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 3,
  label: 'GLIDE',
  labelPos: 'top',
  module: 'glide',
  scale: S10,
  fmt: (v) => (v === 0 ? 'none' : fmtTime(glideTime(v))),
  help: 'How long the pitch takes to slide from one note to the next. It only works with the GLIDE switch beside the keyboard on.',
});
knob('mod.mix', X(330), Y(525), 24, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 10,
  label: 'MODULATION MIX',
  labelPos: 'top',
  module: 'mod',
  scale: S10,
  help: 'Crossfades the two modulation sources. Fully left is the left switch’s source (OSC 4 or the filter contour); fully right is the right switch’s source (noise or the LFO).',
});
T(296, 603, 'OSC 4/\nFILTER EG', 8);
T(384, 603, 'NOISE/\nLFO', 8);
controls.push(
  {
    id: 'mod.srcA',
    type: 'rocker',
    color: 'black',
    x: X(190),
    y: Y(703),
    w: 60,
    h: 26,
    kind: 'enum',
    module: 'mod',
    labelPos: 'none',
    options: [
      { v: 'osc4', label: 'OSC 4' },
      { v: 'eg', label: 'FILTER EG' },
    ],
    def: 'osc4',
    label: 'OSC 4 / FILTER EG',
    help: 'First modulation source: Oscillator 4 (a second LFO when set to LO, or clangy FM at audio rate) or the filter contour.',
  },
  {
    id: 'mod.srcB',
    type: 'rocker',
    color: 'black',
    x: X(345),
    y: Y(703),
    w: 60,
    h: 26,
    kind: 'enum',
    module: 'mod',
    labelPos: 'none',
    options: [
      { v: 'noise', label: 'NOISE' },
      { v: 'lfo', label: 'LFO' },
    ],
    def: 'lfo',
    label: 'NOISE / LFO',
    help: 'Second modulation source: noise (a random wobble) or the LFO.',
  }
);
T(148, 735, 'OSC 4', 8);
T(227, 735, 'FILTER EG', 8);
T(312, 735, 'NOISE\n(MOD SRC)', 8);
T(383, 735, 'LFO', 8);
controls.push({
  id: 'osc4.kbd',
  type: 'rocker',
  color: 'white',
  orient: 'v',
  x: X(462),
  y: Y(705),
  w: 26,
  h: 58,
  kind: 'bool',
  def: true,
  module: 'osc',
  label: 'OSC 4\nCONTROL',
  labelPos: 'top',
  labelSize: 10,
  help: 'On: Oscillator 4 follows the keyboard like the others. Off: it runs at a fixed pitch and ignores the keys, the wheels and TUNE, which is what you want when it is a modulator.',
});

// ── Oscillator bank ───────────────────────────────────────────────────────
const OSC_Y = [170, 345, 520, 698];
const LED_Y = [100, 276, 452, 628];
T(585, 88, 'RANGE', 11);
T(765, 88, 'OSCILLATOR-1\nFREQUENCY', 11);
T(950, 88, 'WAVEFORM', 11);
[2, 3, 4].forEach((n) => T(765, [264, 440, 617][n - 2], `OSCILLATOR-${n}`, 11));
[1, 2, 3, 4].forEach((n) => {
  const y = Y(OSC_Y[n - 1]);
  knob(`osc${n}.range`, X(578), y, 26, 'd-chicken', {
    kind: 'enum',
    options: RANGES,
    def: '8',
    label: `Osc ${n} range`,
    labelPos: 'none',
    module: 'osc',
    scale: { size: 9 },
    help: 'Octave of the oscillator in organ-pipe feet: 32’ is lowest, 2’ highest. LO drops it below hearing so it clicks, or acts as an LFO.',
  });
  decor.push({
    t: 'led',
    x: X(642),
    y: Y(LED_Y[n - 1]),
    r: 4,
    color: 'red',
    litWhen: { osc: n - 1 },
  });
  const shapes = waveShapes(n);
  knob(`osc${n}.wave`, X(945), y, 26, 'd-chicken', {
    kind: 'enum',
    options: WAVE_V(n).map((v, i) => ({ v, label: '', a: -100 + i * 40 })),
    def: 'saw',
    label: `Osc ${n} waveform`,
    labelPos: 'none',
    module: 'osc',
    help:
      n === 4
        ? 'Raw tone of Oscillator 4. The second position is a reverse sawtooth, there for when it is used as a modulator: a ramp that falls instead of rising.'
        : 'Raw tone of the oscillator. Triangle is soft, sawtooth bright and brassy, square hollow, and the two pulses thinner and more nasal.',
  });
  shapes.forEach((shape, i) => {
    const a = ((-100 + i * 40) * Math.PI) / 180;
    decor.push({
      t: 'wave',
      x: X(945) + Math.sin(a) * 47,
      y: y - Math.cos(a) * 44,
      size: 8,
      shape,
    });
  });
  if (n > 1) {
    knob(`osc${n}.freq`, X(760), y, 31, 'd-silver', {
      kind: 'cont',
      min: -7.5,
      max: 7.5,
      def: 0,
      label: `Osc ${n} frequency`,
      labelPos: 'none',
      module: 'osc',
      scale: { nums: [-7, -5, -3, -1, 1, 3, 5, 7], ticks: 15, size: 9 },
      fmt: fmtSemi,
      help:
        n === 4
          ? 'Tunes Oscillator 4 against Oscillator 1, up to a fifth either way. With OSC 4 CONTROL off it sets Oscillator 4’s fixed pitch instead, over a much wider range.'
          : `Tunes Oscillator ${n} against Oscillator 1, up to a fifth either way. A hair off zero makes the two beat and sound thicker; a whole number of semitones gives an interval.`,
    });
  }
});

// ── Mixer ─────────────────────────────────────────────────────────────────
const VOL_Y = [165, 345, 520, 705];
const ON_Y = [177, 353, 528, 704];
[1, 2, 3, 4].forEach((n) => {
  knob(`mix.osc${n}`, X(1115), Y(VOL_Y[n - 1]), 24, 'd-silver', {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 6,
    label: 'VOLUME',
    labelPos: 'top',
    labelSize: 11,
    module: 'mixer',
    scale: S10,
    help: `Level of Oscillator ${n} going into the filter. High levels from several oscillators drive the filter harder and thicken the tone.`,
  });
  rocker(`mix.osc${n}On`, X(1262), Y(ON_Y[n - 1]), 'orange', {
    kind: 'bool',
    def: true,
    module: 'mixer',
    label: `Osc ${n} on`,
    help: `Connects Oscillator ${n} to the mixer. In POLY every key is given an oscillator, so a key that lands on a switched-off oscillator plays nothing.`,
  });
  line(X(1170), Y(ON_Y[n - 1]), X(1215), Y(ON_Y[n - 1]), 1.3);
  T(1298, ON_Y[n - 1] + 37, 'ON', 8.5);
});
rocker('mix.extOn', X(1262), Y(265), 'orange', {
  kind: 'bool',
  def: false,
  module: 'mixer',
  label: 'External input on',
  help: 'Connects the external input. Nothing can be plugged in here in this app, so with this on the channel feeds the synth’s own output back into the mixer, a built-in overdrive.',
});
rocker('mix.noiseOn', X(1262), Y(616), 'orange', {
  kind: 'bool',
  def: false,
  module: 'mixer',
  label: 'Noise on',
  help: 'Connects the noise generator to the mixer.',
});
T(1298, 302, 'ON', 8.5);
T(1298, 653, 'ON', 8.5);
line(X(1308), Y(265), X(1345), Y(265), 1.3);
line(X(1308), Y(616), X(1345), Y(616), 1.3);
knob('mix.ext', X(1402), Y(265), 24, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'EXT IN\nVOLUME',
  labelPos: 'top',
  labelSize: 11,
  module: 'mixer',
  scale: S10,
  help: 'Level of the external input. In this app it sets how much of the synth’s own output is fed back into the mixer: a little thickens the sound, a lot distorts it.',
});
knob('mix.noise', X(1400), Y(617), 24, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'NOISE\nVOLUME',
  labelPos: 'top',
  labelSize: 11,
  module: 'mixer',
  scale: S10,
  help: 'Level of noise into the filter. A little adds breath and grit; on its own it makes wind, surf and percussion.',
});
T(1513, 246, 'OVERLOAD', 10);
decor.push({ t: 'led', x: X(1514), y: Y(268), r: 4, color: 'red', litWhen: 'overload' });
controls.push({
  id: 'noise.colour',
  type: 'rocker',
  color: 'orange',
  orient: 'v',
  x: X(1513),
  y: Y(617),
  w: 26,
  h: 58,
  kind: 'enum',
  module: 'mixer',
  options: [
    { v: 'white', label: 'WHITE' },
    { v: 'pink', label: 'PINK' },
  ],
  def: 'white',
  label: 'Noise colour',
  labelPos: 'none',
  help: 'White noise is bright and hissy. Pink noise has less top end and sounds deeper, more like wind or surf.',
});
T(1513, 552, 'WHITE', 8.5);
T(1513, 684, 'PINK', 8.5);

// ── Filter switches (the column between the mixer and the filter) ─────────
const col = { w: 52, h: 19 };
rocker('filter.mode', X(1623), Y(177), 'teal', {
  ...col,
  kind: 'enum',
  options: [
    { v: 'lp', label: 'LO' },
    { v: 'hp', label: 'HI' },
  ],
  def: 'lp',
  module: 'filter',
  label: 'Filter mode',
  help: 'LO is the usual low-pass: it takes brightness away above the cutoff. HI is high-pass: it takes bass away below the cutoff, for thin, reedy tones.',
});
rocker('mod.toFilter', X(1623), Y(265), 'teal', {
  ...col,
  kind: 'bool',
  def: false,
  module: 'mod',
  label: 'Filter modulation',
  help: 'Sends the modulation mix to the filter cutoff: wah-style sweeps from the LFO, or a rasp from OSC 4 at audio rate. How much is set by the mod wheel.',
});
rocker('filter.kbd1', X(1623), Y(353), 'teal', {
  ...col,
  kind: 'bool',
  def: false,
  module: 'filter',
  label: 'Keyboard control 1',
  help: 'Adds one third keyboard tracking: higher notes open the filter a little so they do not sound duller than low ones.',
});
rocker('filter.kbd2', X(1623), Y(441), 'teal', {
  ...col,
  kind: 'bool',
  def: false,
  module: 'filter',
  label: 'Keyboard control 2',
  help: 'Adds two thirds keyboard tracking. Switch both on for full tracking, where the cutoff follows the notes exactly.',
});
rocker('env.decay', X(1623), Y(529), 'white', {
  ...col,
  kind: 'bool',
  def: true,
  module: 'env',
  label: 'Decay',
  help: 'On: after you let go, the note fades (and the filter closes) over the DECAY times. Off: the note stops dead.',
});
T(1623, 140, 'FILTER MODE', 9);
T(1588, 212, 'LO', 8);
T(1658, 212, 'HI', 8);
T(1623, 212, 'FILTER\nMODULATION', 8.5);
T(1658, 300, 'ON', 8);
T(1658, 320, 'ON', 8);
T(1571, 353, '1', 9);
T(1623, 382, 'KEYBOARD\nCONTROL', 8.5);
T(1571, 441, '2', 9);
T(1658, 476, 'ON', 8);
T(1623, 495, 'DECAY', 9);
T(1658, 564, 'ON', 8);

// ── Filter and contours ───────────────────────────────────────────────────
knob('filter.cutoff', X(1770), Y(170), 24, 'd-silver', {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 1,
  label: 'CUTOFF\nFREQUENCY',
  labelPos: 'top',
  labelSize: 11,
  module: 'filter',
  scale: { nums: [-4, -2, 2, 4], ticks: 11, size: 10 },
  fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the filter starts cutting. Turn it left and the sound gets duller until only a thud is left; turn it right and the full buzz of the oscillators comes through.',
});
knob('filter.emphasis', X(1927), Y(170), 24, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'EMPHASIS',
  labelPos: 'top',
  labelSize: 11,
  module: 'filter',
  scale: S10,
  help: 'Resonance: boosts a narrow band right at the cutoff so sweeps sound vocal and squelchy. Near the top the filter whistles on its own.',
});
knob('filter.contour', X(2085), Y(170), 24, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'AMOUNT\nOF CONTOUR',
  labelPos: 'top',
  labelSize: 11,
  module: 'filter',
  scale: S10,
  help: 'How far the filter contour pushes the cutoff above where the knob leaves it, each time the contour starts.',
});
const envKnob = (
  id: string,
  px: number,
  py: number,
  label: string,
  isTime: boolean,
  help: string,
  def: number,
  module: SynthModule
): void =>
  knob(id, X(px), Y(py), 24, 'd-silver', {
    kind: 'cont',
    min: 0,
    max: 10,
    def,
    label,
    labelPos: 'top',
    labelSize: 11,
    module,
    scale: isTime ? ENV_SCALE : S10,
    fmt: isTime ? (v) => fmtTime(id.endsWith('attack') ? attTime(v) : decTime(v)) : undefined,
    help,
  });
envKnob(
  'fenv.attack',
  1772,
  347,
  'ATTACK',
  true,
  'How long the filter takes to open after a key is pressed. Short for plucks and basses, long for slow brassy swells.',
  0,
  'env'
);
envKnob(
  'fenv.decay',
  1927,
  347,
  'DECAY',
  true,
  'How long the filter takes to fall from its peak to the sustain level, and with DECAY on, how long it takes to close after you let go.',
  4,
  'env'
);
envKnob(
  'fenv.sustain',
  2086,
  347,
  'SUSTAIN',
  false,
  'Where the filter settles while keys are held, as a share of AMOUNT OF CONTOUR.',
  4,
  'env'
);
envKnob(
  'aenv.attack',
  1772,
  527,
  'ATTACK',
  true,
  'How quickly the sound reaches full volume. Near zero it starts at once; higher values fade it in.',
  0,
  'amp'
);
envKnob(
  'aenv.decay',
  1927,
  527,
  'DECAY',
  true,
  'How long the volume takes to fall to the sustain level, and with DECAY on, how long the sound rings after you let go.',
  3.5,
  'amp'
);
envKnob(
  'aenv.sustain',
  2086,
  527,
  'SUSTAIN',
  false,
  'Volume while keys are held. At 10 the sound holds at full level; at 0 it dies away even if you keep holding.',
  10,
  'amp'
);
[
  [1772, 347],
  [1927, 347],
  [1772, 527],
  [1927, 527],
].forEach(([x, y]) => {
  T(x - 45, y + 64, 'M-SEC', 7.5);
  T(x + 24, y + 64, 'SEC', 7.5);
});

// ── Distortion and chorus ─────────────────────────────────────────────────
const fxKnob = (id: string, px: number, label: string, def: number, help: string): void =>
  knob(id, X(px), Y(170), 24, 'd-silver', {
    kind: 'cont',
    min: 0,
    max: 10,
    def,
    label,
    labelPos: 'top',
    labelSize: 11,
    module: 'fx',
    scale: S10,
    help,
  });
fxKnob(
  'fx.dist',
  2240,
  'DIST',
  3,
  'How hard the distortion is driven. Low settings warm and thicken the sound; high settings turn it into a buzzing, compressed fuzz.'
);
fxKnob(
  'fx.tone',
  2385,
  'TONE',
  5,
  'Brightness of the distortion. Left is darker and smoother, right is brighter and harsher.'
);
fxKnob(
  'fx.level',
  2550,
  'LEVEL',
  5,
  'Output level of the distortion, so it can be matched to the sound with the distortion switched off.'
);
rocker('fx.distOn', X(2673), Y(182), 'orange', {
  kind: 'bool',
  def: false,
  module: 'fx',
  label: 'Distortion on',
  help: 'Switches the distortion in or out.',
});
T(2710, 219, 'ON', 8.5);
(
  [
    [
      'fx.chorus1',
      2308,
      'I',
      'Chorus I: a slow, gentle sweep. The sound widens and shimmers across the two outputs.',
    ],
    [
      'fx.chorus2',
      2462,
      'II',
      'Chorus II: a faster, deeper sweep. Press I and II together for a quick, shallow vibrato-like shimmer.',
    ],
  ] as const
).forEach(([id, px, name, help]) => {
  controls.push({
    id,
    type: 'button',
    lamp: 'amber',
    x: X(px),
    y: Y(356),
    w: 46,
    h: 45,
    kind: 'bool',
    def: false,
    module: 'fx',
    label: `Chorus ${name}`,
    labelPos: 'none',
    help,
  });
  decor.push({ t: 'led', x: X(px - 2), y: Y(296), r: 4, color: 'red', litWhen: { id, eq: true } });
  T(px, 401, name, 11, { weight: 700 });
});
rocker('fx.chorusOn', X(2673), Y(358), 'orange', {
  kind: 'bool',
  def: false,
  module: 'fx',
  label: 'Chorus on',
  help: 'Switches the chorus in or out. It is what makes the Poly D stereo: with it off, both outputs carry the same sound.',
});
T(2710, 395, 'ON', 8.5);

// ── Sequencer (the arpeggiator part of it) ────────────────────────────────
knob('arp.tempo', X(2318), Y(528), 23, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  label: 'TEMPO/GATE LENGTH',
  labelPos: 'top',
  labelSize: 10,
  module: 'util',
  scale: { nums: [0, 10], ticks: 11, size: 10 },
  fmt: (v) => `${tempoBpm(v)} BPM`,
  help: 'Speed of the arpeggiator (and, on the hardware, of the sequencer). The arpeggiator plays sixteenth notes at this tempo.',
});
plate(2305, 598, 'SWING');
decor.push({
  t: 'logo',
  x: X(2535),
  y: Y(566),
  size: 20,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
decor.push({
  t: 'path',
  d: `M${X(2535)} ${Y(470)} L${X(2585)} ${Y(530)} H${X(2485)} Z`,
  w: 1.6,
  fill: 'none',
  hw: true,
});
const seqBtn = (id: string, px: number, py: number, rest: SeqRest): void => {
  controls.push({
    id,
    type: 'button',
    lamp: 'red',
    x: X(px),
    y: Y(py),
    w: 36,
    h: 15,
    labelPos: 'none',
    module: 'util',
    ...rest,
  });
};
// the sequencer buttons this app does not model: printed, and lit as they are in the photo
const deadBtn = (px: number, py: number, w = 36, h = 15): void => {
  decor.push(
    {
      t: 'rect',
      x: X(px) - w / 2 - 3,
      y: Y(py) - h / 2 - 3,
      w: w + 6,
      h: h + 6,
      r: 4,
      fill: '#060607',
      hw: true,
    },
    {
      t: 'rect',
      x: X(px) - w / 2,
      y: Y(py) - h / 2,
      w,
      h,
      r: 3,
      fill: '#b3261c',
      stroke: '#000',
      sw: 1,
      hw: true,
    },
    {
      t: 'rect',
      x: X(px) - w / 2 + 3,
      y: Y(py) - h / 2 + 2,
      w: w - 6,
      h: h * 0.35,
      r: 2,
      fill: '#ff8a7a',
      hw: true,
    }
  );
};
seqBtn('arp.hold', 1702, 670, {
  kind: 'bool',
  def: false,
  label: 'HOLD',
  name: 'HOLD (arpeggiator latch)',
  help: 'With the arpeggiator on, HOLD keeps it playing the last chord after you let go. A new chord replaces the old one. (On the hardware it also rests or holds steps in the sequencer.)',
});
deadBtn(1766, 670);
seqBtn('arp.on', 1830, 670, {
  kind: 'bool',
  def: false,
  label: 'ARP',
  name: 'ARP (arpeggiator on)',
  help: 'Starts the arpeggiator: the keys you hold are played one after another at the TEMPO rate, in the order the LOCATION lamps show.',
});
deadBtn(1896, 670);
deadBtn(1702, 740);
deadBtn(1766, 740);
deadBtn(1830, 740);
deadBtn(1896, 740);
T(1702, 696, 'HOLD/\nREST', 8);
T(1766, 696, 'RESET/\nACCENT', 8);
T(1830, 696, 'ARP', 8);
plate(1830, 712, 'SET END');
T(1896, 696, 'PATTERN', 8);
plate(1896, 712, 'BANK');
plate(1702, 767, 'SHIFT');
T(1766, 767, 'PAGE', 8);
T(1830, 767, 'PLAY/STOP', 8);
T(1896, 767, 'REC', 8);
// LOCATION lamps: here they show which arpeggio order STEP has chosen.
ARP_ORDERS.forEach((o, i) => {
  decor.push({
    t: 'led',
    x: X(1981 + i * 23.4),
    y: Y(670),
    r: 4.5,
    color: 'amber',
    litWhen: { id: 'arp.order', eq: o.v },
  });
  T(1981 + i * 23.4, 697, String(i + 1), 8);
});
decor.push(
  { t: 'path', d: `M${X(1973)} ${Y(740)} L${X(1990)} ${Y(729)} V${Y(751)} Z`, w: 0, fill: INK },
  { t: 'path', d: `M${X(2153)} ${Y(740)} L${X(2136)} ${Y(729)} V${Y(751)} Z`, w: 0, fill: INK }
);
deadBtn(2030, 740);
plate(2030, 767, 'KYBD');
seqBtn('arp.order', 2097, 740, {
  kind: 'enum',
  options: ARP_ORDERS.map(({ v, label }) => ({ v, label })),
  def: 'up',
  lit: 'always',
  label: 'STEP',
  name: 'STEP (arpeggio order)',
  help: 'Chooses the order the arpeggiator plays the held keys in: each press moves on to the next of eight orders, shown on the LOCATION lamps 1 to 8. On the hardware KYBD steps back and STEP forward.',
});
plate(2097, 767, 'STEP');
for (let i = 0; i < 8; i++) {
  deadBtn(2230 + i * 63.6, 706, 38, 34);
  T(2230 + i * 63.6, 750, String(i + 1), 9);
}

// ── Output ────────────────────────────────────────────────────────────────
knob('out.volume', X(2828), Y(173), 24, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  label: 'VOLUME',
  labelPos: 'top',
  labelSize: 11,
  module: 'out',
  scale: S10,
  help: 'Main output level. With the external input switched on, it also sets how hard the feedback path is driven.',
});
knob('out.phones', X(2828), Y(356), 24, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  label: 'PHONES',
  labelPos: 'top',
  labelSize: 11,
  module: 'out',
  scale: S10,
  help: 'Headphone level on the hardware. It has no effect in this app.',
});
jacks.push({
  id: 'j.phones',
  x: X(2812),
  y: Y(528),
  r: 17,
  label: 'PHONES',
  labelPos: 'none',
  dir: 'out',
  signal: 'out',
  help: 'Headphone output.',
});
decor.push({ t: 'led', x: X(2812), y: Y(617), r: 4.5, color: 'amber', litWhen: 'power' });
T(2812, 648, 'POWER', 9);
decor.push(
  {
    t: 'rect',
    x: X(2815) - 15,
    y: Y(705) - 30,
    w: 30,
    h: 60,
    r: 4,
    fill: '#08080a',
    stroke: '#2a2b2e',
    sw: 1.5,
    hw: true,
  },
  {
    t: 'rect',
    x: X(2815) - 11,
    y: Y(705) - 22,
    w: 22,
    h: 40,
    r: 3,
    fill: '#1e1f21',
    stroke: '#000',
    sw: 1,
    hw: true,
  }
);

// ── Areas ─────────────────────────────────────────────────────────────────
const areas: Area[] = [
  {
    id: 'keyside',
    label: 'Beside the keyboard: LFO, glide, transpose',
    module: 'lfo',
    keywords:
      'lfo vibrato wobble rate shape glide portamento transpose octave wheels pitch bend mod wheel',
    rects: [{ x: 38, y: 0, w: 284, h: 540 }],
    help: 'The small panel to the left of the keys on the hardware. LFO RATE and the switch beside it set the LFO’s speed and shape, the GLIDE switch turns the slide between notes on or off, and TRANSPOSE moves the keyboard an octave either way. The pitch and mod wheels are printed for reference: use the mod wheel beside the keyboard below.',
  },
  {
    id: 'controllers',
    label: 'Controllers',
    module: 'mod',
    keywords: 'tune glide modulation mix osc 4 filter eg noise lfo vibrato',
    rects: [
      { x: 346, y: 0, w: 258, h: Y(340) },
      { x: 346, y: Y(450), w: 258, h: 540 - Y(450) },
    ],
    help: 'Tuning, glide time and the modulation mix. TUNE moves all the oscillators together and GLIDE sets how long notes slide. MODULATION MIX blends two sources, picked by the switches under it, and OSCILLATOR MODULATION sends the blend to pitch. There is no depth knob: the mod wheel sets how much modulation you hear.',
  },
  {
    id: 'voices',
    label: 'Voice mode',
    module: 'mode',
    keywords: 'mono unison poly paraphonic chords polyphony auto damp voices',
    rects: [{ x: 346, y: Y(340), w: 258, h: Y(450) - Y(340) }],
    help: 'MODE decides how notes are shared among the four oscillators: all on one note (MONO), shared among the keys held (UNI) or one each, for four-note chords (POLY). The chords share one filter and one pair of contours, so every note of a chord opens and closes together. AUTO DAMP decides whether a key you let go stops at once or rings until the next new note.',
  },
  {
    id: 'oscbank',
    label: 'Oscillator bank',
    module: 'osc',
    keywords: 'vco range waveform detune pitch feet octave interval',
    rects: [{ x: 604, y: 0, w: 362, h: 540 }],
    help: 'Four oscillators make the raw sound. RANGE sets each one’s octave and WAVEFORM its shape. Oscillators 2 to 4 have a FREQUENCY knob to tune them against Oscillator 1. The red lamp by each RANGE knob lights while that oscillator is playing a note, which shows how POLY and UNI share them out. With OSC 4 CONTROL off, Oscillator 4 stops following the keys so it can be a modulator.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'volume level noise external input overload white pink',
    rects: [{ x: 966, y: 0, w: 355, h: 540 }],
    help: 'How loud each source is going into the filter: the four oscillators, the external input and noise, each with its own on/off switch. In POLY a key can land on any oscillator, so all four need to be on for full chords.',
  },
  {
    id: 'switches',
    label: 'Filter switches',
    module: 'filter',
    keywords: 'filter mode high-pass keyboard control tracking decay release filter modulation',
    rects: [{ x: 1321, y: 0, w: 65, h: 392 }],
    help: 'The column of switches between the mixer and the filter. From the top: low-pass or high-pass, modulation to the filter, two keyboard-tracking switches that make higher notes brighter, and DECAY, which decides whether notes fade out or stop dead when you let go.',
  },
  {
    id: 'filter',
    label: 'Filter and filter contour',
    module: 'filter',
    keywords: 'cutoff emphasis resonance contour envelope ladder brightness',
    rects: [{ x: 1386, y: 0, w: 318, h: Y(441) }],
    help: 'CUTOFF FREQUENCY sets how bright the sound is and EMPHASIS adds resonance at the cutoff. AMOUNT OF CONTOUR sets how far the ATTACK, DECAY and SUSTAIN knobs below it sweep the cutoff. It is one filter for all four notes.',
  },
  {
    id: 'loudness',
    label: 'Loudness contour',
    module: 'env',
    keywords: 'envelope attack decay sustain volume amplifier vca',
    rects: [{ x: 1386, y: Y(441), w: 318, h: 392 - Y(441) }],
    help: 'Shapes the volume. ATTACK is the fade-in and DECAY the fall to the SUSTAIN level, which holds while keys are down. With the DECAY switch on, DECAY is also the fade-out after you let go. Like the filter contour, it is shared by every note.',
  },
  {
    id: 'distortion',
    label: 'Distortion',
    module: 'fx',
    keywords: 'overdrive fuzz drive dirt',
    rects: [{ x: 1704, y: 0, w: 391, h: Y(267) }],
    help: 'A distortion after the amplifier. DIST sets how hard it is driven, TONE how bright it is and LEVEL how loud it comes out. The switch puts it in or takes it out.',
  },
  {
    id: 'chorus',
    label: 'Chorus',
    module: 'fx',
    keywords: 'chorus stereo width juno shimmer ensemble',
    rects: [{ x: 1704, y: Y(267), w: 391, h: Y(443) - Y(267) }],
    help: 'A stereo chorus after the distortion. It mixes in copies of the sound that are slightly delayed, with the delay swept up and down, which thickens the sound and spreads it across the two outputs. I is slow and gentle, II faster and deeper, both together a quick shimmer. The switch puts it in or takes it out.',
  },
  {
    id: 'sequencer',
    label: 'Sequencer and arpeggiator',
    module: 'util',
    keywords: 'arpeggiator arp tempo bpm hold latch sequencer pattern step',
    rects: [
      { x: 1704, y: Y(443), w: 391, h: 392 - Y(443) },
      { x: 1321, y: 392, w: 774, h: 148 },
    ],
    help: 'The arpeggiator plays the keys you hold one after another. ARP starts it, TEMPO sets the speed, HOLD keeps it going after you let go and STEP picks one of eight orders, shown on the LOCATION lamps. The 32-step sequencer and its pattern memories are printed but not modelled.',
  },
  {
    id: 'output',
    label: 'Output',
    module: 'out',
    keywords: 'volume headphones phones power',
    rects: [{ x: 2095, y: 0, w: 103, h: 540 }],
    help: 'Main VOLUME, a separate headphone volume and socket, and the power switch with its lamp.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const osc: OscParams[] = [1, 2, 3, 4].map((n) => {
    const kbd = n === 4 ? !!v['osc4.kbd'] : true;
    const det = n === 1 ? 0 : num(v, `osc${n}.freq`);
    return {
      level: v[`mix.osc${n}On`] ? level10(num(v, `mix.osc${n}`), 0.8) : 0,
      ...WAVE_MIX[String(v[`osc${n}.wave`])],
      semi:
        RANGE_SEMI[String(v[`osc${n}.range`])] +
        (kbd ? det : det * (36 / 7)) +
        (kbd ? num(v, 'ctl.tune') : 0),
      kbd,
      fixedNote: 60,
      syncTo: -1,
    };
  });
  // The Minimoog bus: MODULATION MIX blends the two switched sources, and the mod wheel alone sets the depth.
  const m = num(v, 'mod.mix') / 10;
  const depth = clamp(ctx.wheel || 0, 0, 1);
  const srcA = v['mod.srcA'] === 'osc4' ? 'osc4' : 'env1';
  const srcB = v['mod.srcB'] === 'lfo' ? 'lfo' : 'noise';
  const routes: EngineRoute[] = [];
  const bus = (dst: string, max: number): void => {
    if ((1 - m) * depth > 0.0005) routes.push({ src: srcA, dst, amt: (1 - m) * depth * max });
    if (m * depth > 0.0005) routes.push({ src: srcB, dst, amt: m * depth * max });
  };
  if (v['mod.toOsc']) bus('pitchAll', 12);
  if (v['mod.toFilter']) bus('cutoff', 4.5);
  const fDecay = decTime(num(v, 'fenv.decay'));
  const aDecay = decTime(num(v, 'aenv.decay'));
  const rel = (d: number): number => (v['env.decay'] ? d : 0.012);
  const mode = v['voice.mode'];
  const order = ARP_ORDERS.find((o) => o.v === v['arp.order']) || ARP_ORDERS[0];
  const chorusMode = CHORUS_MODES[(v['fx.chorus1'] ? 1 : 0) + (v['fx.chorus2'] ? 2 : 0)];
  return {
    osc,
    oscAssign:
      mode === 'mono'
        ? undefined
        : { mode: mode === 'uni' ? 'unison' : 'poly', damp: !!v['voice.damp'] },
    noise: {
      level: v['mix.noiseOn'] ? level10(num(v, 'mix.noise'), 0.8) : 0,
      color: v['noise.colour'] === 'pink' ? 'pink' : 'white',
    },
    ext: {
      level: v['mix.extOn']
        ? level10(num(v, 'mix.ext'), 1.6) * (0.4 + num(v, 'out.volume') / 10)
        : 0,
    },
    filter: {
      type: 'ladder',
      mode: v['filter.mode'] === 'hp' ? 'hp' : 'lp',
      cutoff: cutoffHz(num(v, 'filter.cutoff')),
      res: (num(v, 'filter.emphasis') / 10) * 1.06,
      envAmt: (num(v, 'filter.contour') / 10) * 8.5,
      envSrc: 'env1',
      kbd: (v['filter.kbd1'] ? 1 / 3 : 0) + (v['filter.kbd2'] ? 2 / 3 : 0),
    },
    env1: {
      a: attTime(num(v, 'fenv.attack')),
      d: fDecay,
      s: num(v, 'fenv.sustain') / 10,
      r: rel(fDecay),
    },
    env2: {
      a: attTime(num(v, 'aenv.attack')),
      d: aDecay,
      s: num(v, 'aenv.sustain') / 10,
      r: rel(aDecay),
    },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: {
      rate: lfoHz(num(v, 'lfo.rate')),
      mix: v['lfo.shape'] === 'tri' ? { tri: 1 } : { sq: 1 },
      keySync: false,
    },
    glide: { time: v['glide.on'] ? glideTime(num(v, 'ctl.glide')) : 0, legato: false },
    // multi-trigger is the Poly D's default: every new key starts both contours again
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    routes,
    // distortion after the VCA, then the chorus
    normals: { extIn: 'out', vcaIn: 'vcf1', odIn: 'vca', delayIn: 'od' },
    od: {
      on: !!v['fx.distOn'],
      drive: num(v, 'fx.dist') / 10,
      tone: num(v, 'fx.tone') / 10,
      level: level10(num(v, 'fx.level'), 1.8),
    },
    delay: { on: false },
    chorus: { on: !!v['fx.chorusOn'], mode: chorusMode },
    poly: { voices: 1, stack: 1, mono: true },
    arp: {
      on: !!v['arp.on'],
      bpm: tempoBpm(num(v, 'arp.tempo')),
      gate: 0.5,
      mode: order.mode,
      octaves: order.oct,
      hold: !!v['arp.hold'],
    },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: TRANSPOSE[String(v['kbd.transpose'])],
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const polyD: SynthDef & { version: number } = {
  id: 'poly-d',
  version: 1,
  name: 'Poly D',
  maker: 'Behringer',
  year: 2019,
  heritage: 'A four-oscillator Minimoog Model D, with chords',
  summary:
    'Four oscillators and noise feed a mixer, then one 24 dB ladder filter and one amplifier, then distortion and a stereo chorus. In POLY each key takes an oscillator of its own, so it plays four-note chords through the shared filter and contours.',
  view: { w: 2238, h: 540 },
  theme: { panel: PANEL, panel2: '#121314', ink: INK, font: 'din', cheeks: 'wood', cheekW: 40 },
  signalNames: {
    env1: 'the filter contour',
    env2: 'the loudness contour',
    osc4: 'Oscillator 4',
    mixer: 'the mixer output (oscillators and noise)',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default polyD;
