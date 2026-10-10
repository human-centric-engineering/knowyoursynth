/**
 * Behringer Kobol Expander: the definition (D1). Positions are pixels on the 2000×705 product image
 * (ref/Behringer_KOBOL-EXPANDER.png), used directly as view units; the faceplate ends at y 625, below
 * it is the photo's reflection. The data model is ref/behringer-kobol-expander.synth.json (Quick
 * Start Guide, 66 numbered controls), which follows the RSF Kobol Expander: two VCOs whose single
 * WAVEFORM knob morphs from triangle to pulse, a VCA per VCO in place of a mixer, a 24 dB low-pass
 * filter, two ADS envelopes, an LFO, noise and a two-input voltage processor, with a CV input for
 * almost every knob.
 *
 * The morphing waveform and the CV inputs to each VCO's waveform and level are the engine's
 * `osc.morph` and the `wave1`, `wave2`, `lvl1`, `lvl2` destinations. One control voltage unit here
 * is 5 V: the voltage processor's +10 V normal is 2 units.
 *
 * Transliterated from the prototype file `src/synths/kobol.js` (D3), the way `defs/model-d.ts`
 * was: no content (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand`
 * (the Behringer logo and the printed "kobol EXPANDER"), and panel values read through `num()`.
 */
import type {
  Area,
  Control,
  ControlCommon,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  InputJack,
  Jack,
  KnobControl,
  KnobScale,
  OutputJack,
  SlideControl,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

/** `Omit` over each member of a union, so a discriminated control keeps its variants. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  Pick<KnobControl, 'scale'> & {
    min?: number;
    max?: number;
    def?: number;
    fmt?: (v: number) => string;
  };
type SlideRest = OmitEach<
  SlideControl,
  'id' | 'type' | 'x' | 'y' | 'w' | 'h' | 'orient' | 'labelPos'
>;
type JackRest<J extends Jack> = Omit<J, 'id' | 'x' | 'y' | 'r' | 'label' | 'labelPos' | 'dir'>;

/** A panel value as a number. A continuous control always holds one. */
const num = (v: ControlValues, id: string): number => Number(v[id]);

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The envelope knobs print a time ring as well as 1–10: 10 ms at nine o'clock, .1 (s) at twelve, 1 (s) at three. That is
// one decade per 2.7 knob units, which gives about 2 ms at 1 and 4.6 s at 10. The guide itself gives no times.
const envTime = (v: number): number => 0.1 * Math.pow(10, (v - 5.5) / 2.7);
const lfoHz = (v: number): number => 0.01 * Math.pow(10, v * 0.4); // 0.01 Hz to 100 Hz, as printed
const vcfHz = (v: number): number => expMap(v / 10, 16, 16000); // 16 Hz to 16 kHz, as printed
/** VCO FREQUENCY: 440 Hz at the centre, 10 Hz to 10 kHz across the knob, so one knob unit is about an octave. */
const vcoSemi = (v: number): number => (v - 5) * 12;
const oscLevel = (v: number): number => Math.pow(v / 10, 1.5) * 0.75;
const pwmDepth = 0.25;
/** Where WAVEFORM is on its morph, in words (the knob is continuous; the panel prints seven glyphs round it). */
const waveName = (v: number): string =>
  v < 0.8
    ? 'triangle'
    : v < 4.2
      ? 'ramp'
      : v < 5.8
        ? 'sawtooth'
        : v < 6.4
          ? 'saw/square'
          : v < 7
            ? 'square'
            : v < 9.5
              ? 'pulse'
              : 'pulse + PWM';

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const INK = '#efeee8';

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y): the renderer places text by its baseline. */
const text = (
  x: number,
  y: number,
  t: string,
  size = 14,
  rest: Partial<Pick<TextDecor, 'weight' | 'anchor' | 'brand'>> = {}
): void => {
  decor.push({
    t: 'text',
    x,
    y: y + size * 0.35,
    text: t,
    size,
    anchor: 'middle',
    weight: 700,
    ...rest,
  });
};
const path = (d: string, w = 1.8): void => {
  decor.push({ t: 'path', d, w });
};
const head = (x: number, y: number, dir: 'r' | 'l' | 'u' | 'd'): void => {
  const s = 5;
  const pts = {
    r: `M${x} ${y} L${x - s * 1.6} ${y - s} L${x - s * 1.6} ${y + s} Z`,
    l: `M${x} ${y} L${x + s * 1.6} ${y - s} L${x + s * 1.6} ${y + s} Z`,
    u: `M${x} ${y} L${x - s} ${y + s * 1.6} L${x + s} ${y + s * 1.6} Z`,
    d: `M${x} ${y} L${x - s} ${y - s * 1.6} L${x + s} ${y - s * 1.6} Z`,
  }[dir];
  decor.push({ t: 'path', d: pts, w: 0, fill: INK });
};
/** A block of the printed signal-flow diagram: a box with its name and a two-line description. */
const box = (
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  sub: string,
  tsize = 17
): void => {
  decor.push({ t: 'rect', x, y, w, h, r: 0, stroke: INK, sw: 2 });
  text(x + w / 2, y + 15, title, tsize);
  sub.split('\n').forEach((line, i) => text(x + w / 2, y + 31 + i * 12, line, 10, { weight: 600 }));
};
const knob = (id: string, x: number, y: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 33,
    style: 'kobol',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    labelPos: 'none',
    ...rest,
  });
};
const slide = (id: string, x: number, y: number, rest: SlideRest): void => {
  controls.push({ id, type: 'slide', x, y, w: 52, h: 20, orient: 'h', labelPos: 'none', ...rest });
};
const S10: KnobScale = { nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10], ticks: 0, size: 13, numR: 1.62 };
const BIPOLAR: KnobScale = {
  labels: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((at) => ({ at, text: String(Math.abs(at)) })),
  ticks: 0,
  size: 13,
  numR: 1.62,
};
const ENV_SCALE: KnobScale = {
  ticks: 0,
  size: 13,
  numR: 1.62,
  labels: [
    { at: 1, text: '1' },
    { at: 2.8, text: '10' },
    { at: 5.5, text: '.1' },
    { at: 8.2, text: '1' },
    { at: 10, text: '10' },
  ],
};
const polar = (cx: number, cy: number, r: number, a: number): [number, number] => [
  cx + r * Math.sin((a * Math.PI) / 180),
  cy - r * Math.cos((a * Math.PI) / 180),
];

// ── Faceplate: shared artwork ─────────────────────────────────────────────
[
  [78, 22],
  [557, 22],
  [1442, 20],
  [1920, 20],
  [78, 600],
  [557, 600],
  [1442, 598],
  [1920, 596],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 10 }));
decor.push({
  t: 'logo',
  x: 1155,
  y: 139,
  size: 22,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
text(1857, 168, 'kobol', 64, { weight: 700, brand: true });
text(1857, 205, 'EXPANDER', 18, { brand: true });
decor.push({ t: 'led', x: 1857, y: 235, r: 7, color: 'green', litWhen: 'power' });
decor.push({ t: 'din', x: 1857, y: 95, r: 37 });
text(1857, 39, 'MIDI IN');

// the blocks of the printed diagram
box(178, 250, 85, 51, 'LFO', 'Low frequency\noscillator');
box(178, 324, 85, 52, 'VOLTAGE', '', 12);
text(220.5, 358, 'PROCESSOR', 12);
box(334, 324, 85, 52, 'NOISE', '', 12);
text(376.5, 358, 'GENERATOR', 12);
box(638, 250, 100, 51, 'VCO 1', 'Voltage controlled\noscillator');
box(638, 324, 100, 52, 'VCO 2', 'Voltage controlled\noscillator');
box(872, 250, 100, 51, 'VCA', 'Voltage controlled\namplifier');
box(872, 324, 100, 52, 'VCA', 'Voltage controlled\namplifier');
box(1089, 287, 133, 52, 'VCF', 'Voltage controlled filter\n24 dB/oct');
box(1350, 250, 80, 51, 'ADS 1', 'Envelope\ngenerator');
box(1350, 324, 80, 52, 'ADS 2', 'Envelope\ngenerator');
box(1573, 286, 101, 53, 'VCA', 'Voltage controlled\namplifier');

// the signal-flow lines between them
path('M263 267 H325 L376 216 V102'); // LFO → OUT 2
path('M298 267 V252');
head(298, 250, 'u'); // LFO → VOLUME
path('M298 112 V104 H436');
head(440, 104, 'r'); // VOLUME → OUT 1 and VCO MOD IN
path('M468 96 L532 150 V260');
head(532, 262, 'd'); // mod bus → VCO 1 MOD switch
path('M567 275 H632');
head(636, 275, 'r');
path('M532 290 V332 H632');
head(636, 332, 'r');
path('M567 350 H600 V358 H632');
head(636, 358, 'r'); // sync
path('M738 275 H866');
head(870, 275, 'r');
path('M738 350 H866');
head(870, 350, 'r');
path('M788 313 H760 L744 294'); // PWM source → the VCOs
path('M972 275 H1010 L1045 300 H1083');
head(1087, 300, 'r');
path('M972 350 H1010 L1045 318 H1083');
head(1087, 318, 'r');
path('M988 102 V275'); // VCO 1 OUT taps VCO 1
path('M988 350 V522'); // VCO 2 OUT
path('M1039 522 V372 L1060 330 H1083'); // VCF AUDIO IN
path('M1116 522 L1080 492 V478'); // CV IN → keyboard tracking
path('M1092 368 L1112 341');
path('M1212 368 L1192 341'); // KEYB CTRL and ADS CONTROL → VCF
path('M1234 470 V505 H1311'); // ADS 2 → ADS CONTROL
path('M1222 313 H1567');
head(1571, 313, 'r');
path('M1311 102 V244 L1346 262');
path('M1311 244 V300 L1346 338'); // GATE IN → both envelopes
path('M1350 350 H1311 V518');
head(1311, 522, 'd'); // ADS 2 → ADS 2 OUT
path('M1430 267 H1742 L1779 230 V104');
path('M1624 267 V280');
head(1624, 284, 'd'); // ADS 1 → ADS 1 OUT, VCA
path('M1674 313 H1812');
head(1816, 313, 'r');
path('M1898 313 H1935 V408 L1888 436');
path('M1935 408 V505 L1888 532'); // VOLUME → PHONES, AUDIO OUT
path('M142 400 V344 H174');
head(176, 344, 'r'); // IN 1 GAIN → voltage processor
path('M162 546 H206 V449 L182 412 V360 H174');
path('M263 350 H276 L375 408 V496 L352 530');
path('M360 546 H393'); // → OUT and REV OUT
path('M419 350 H430 L492 392 V522'); // noise → NOISE OUT
text(92, 524, '+10V', 13, { anchor: 'middle' });
path('M110 524 L122 534', 1.6);

// ── LFO ───────────────────────────────────────────────────────────────────
knob('lfo.rate', 142, 172, {
  def: 5,
  name: 'LFO rate',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  scale: {
    ticks: 0,
    size: 13,
    numR: 1.72,
    labels: [
      { at: 0, text: '0.01' },
      { at: 2.5, text: '0.1' },
      { at: 5, text: '1' },
      { at: 7.5, text: '10' },
      { at: 10, text: '100Hz' },
    ],
  },
  help: 'Speed of the LFO, from one cycle every 100 seconds to 100 Hz. The red lamp beside it flashes at this rate.',
});
text(142, 243, 'RATE', 15);
decor.push({ t: 'led', x: 220, y: 225, r: 7, color: 'red', litWhen: 'lfo' });
knob('lfo.volume', 298, 176, {
  def: 0,
  name: 'LFO volume',
  module: 'lfo',
  scale: S10,
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How much LFO reaches the oscillators’ pitch, and the level of LFO OUT 1. It also sets the depth of LFO pulse-width modulation. At 0 the LFO still runs, and LFO OUT 2 still carries it at full level.',
});
text(298, 243, 'VOLUME', 15);
text(352, 297, 'White', 12);
text(403, 297, 'Pink', 12);
controls.push({
  id: 'lfo.shape',
  type: 'slide',
  x: 455,
  y: 313,
  w: 20,
  h: 52,
  orient: 'v',
  kind: 'enum',
  labelPos: 'none',
  options: [
    { v: 'sq', label: 'Square' },
    { v: 'tri', label: 'Triangle' },
  ],
  def: 'tri',
  name: 'LFO waveform',
  module: 'lfo',
  help: 'The LFO’s shape. Triangle rises and falls smoothly, for vibrato and sweeps; square jumps between two values, for trills.',
});
decor.push(
  { t: 'wave', x: 455, y: 276, size: 11, shape: 'sq' },
  { t: 'wave', x: 455, y: 352, size: 11, shape: 'tri' }
);
text(488, 313, 'LFO', 14);

// ── Noise and voltage processor ───────────────────────────────────────────
slide('noise.colour', 376, 275, {
  kind: 'enum',
  options: [
    { v: 'white', label: 'White' },
    { v: 'pink', label: 'Pink' },
  ],
  def: 'white',
  name: 'Noise colour',
  module: 'osc',
  help: 'White noise is bright and hissy; pink has less top end and sounds deeper, like wind or surf. The noise only reaches the sound through a cable from NOISE OUT.',
});
knob('vp.in1', 142, 449, {
  min: 0,
  max: 2,
  def: 1,
  name: 'IN 1 gain',
  module: 'util',
  fmt: (v) => `× ${v.toFixed(2)}`,
  scale: {
    ticks: 0,
    size: 13,
    numR: 1.62,
    labels: [
      { at: 0, text: '0' },
      { at: 0.5, text: '0.5' },
      { at: 1, text: '1' },
      { at: 2, text: '2' },
    ],
  },
  help: 'Scales the voltage processor’s input 1. With nothing plugged into IN 1 that input is a steady +10 V, so this knob sets a fixed voltage: a manual control you can patch anywhere.',
});
text(142, 519, 'IN 1 GAIN', 15);
knob('vp.out', 298, 449, {
  min: 0,
  max: 2,
  def: 1,
  name: 'OUT gain',
  module: 'util',
  fmt: (v) => `× ${v.toFixed(2)}`,
  scale: {
    ticks: 0,
    size: 13,
    numR: 1.62,
    labels: [
      { at: 0, text: '0' },
      { at: 0.5, text: '0.5' },
      { at: 1, text: '1' },
      { at: 2, text: '2' },
    ],
  },
  help: 'Scales the voltage processor’s output: the sum of input 1 (through IN 1 GAIN) and twice input 2. OUT carries it as it is and REV OUT upside down.',
});
text(298, 519, 'OUT GAIN', 15);

// ── Pitch and modulation routing ──────────────────────────────────────────
knob('pitch.tune', 455, 176, {
  min: -5,
  max: 5,
  def: 0,
  name: 'Master tune',
  module: 'osc',
  scale: BIPOLAR,
  fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 10)} cents`,
  help: 'Tunes both oscillators together, up to half a semitone either way.',
});
text(455, 243, 'TUNE', 15);
slide('mod.vco1Off', 532, 275, {
  kind: 'bool',
  def: false,
  onAt: 'bottom',
  name: 'VCO 1 MOD OFF',
  module: 'mod',
  help: 'Left: the LFO (or whatever is in VCO MOD IN) moves the pitch of both VCOs. Right: VCO 1 is left out, so only VCO 2 wobbles.',
});
text(532, 297, 'Vco 1 Mod   Off', 12);
slide('vco2.sync', 532, 350, {
  kind: 'bool',
  def: false,
  onAt: 'bottom',
  name: 'Synchro / VCO 1',
  module: 'osc',
  help: 'Hard sync: VCO 2 restarts each time VCO 1 does. VCO 2’s FREQUENCY then changes its tone rather than its note, from a hollow buzz to a tearing snarl.',
});
text(532, 372, 'Synchro/Vco 1', 12);
slide('mod.pwm', 814, 313, {
  kind: 'enum',
  options: [
    { v: 'lfo', label: 'LFO' },
    { v: 'both', label: 'Both' },
    { v: 'ads', label: 'ADS' },
  ],
  def: 'lfo',
  name: 'PWM source',
  module: 'mod',
  help: 'What moves the pulse width of both VCOs when their WAVEFORM knobs are at the pulse end: the LFO (at LFO VOLUME’s level), ADS 2 (the filter envelope), or both.',
});
text(814, 291, 'Both', 12);
text(787, 335, 'LFO', 12);
text(841, 335, 'ADS', 12);

// ── VCO 1 and VCO 2, each with its VCA ────────────────────────────────────
const WAVE_GLYPHS: [WaveShape, number][] = [
  ['tri', -150],
  ['tri', -100],
  ['shark', -52],
  ['saw', 0],
  ['sq', 52],
  ['pulse', 100],
  ['npulse', 150],
];
[1, 2].forEach((n) => {
  const y = n === 1 ? 174 : 449;
  const ly = n === 1 ? 234 : 510;
  knob(`vco${n}.freq`, 610, y, {
    def: 5,
    name: `VCO ${n} frequency`,
    module: 'osc',
    fmt: (v) => fmtSemi(vcoSemi(v)),
    scale: {
      ticks: 11,
      size: 13,
      numR: 1.72,
      labels: [
        { at: 0, text: '10Hz' },
        { at: 5, text: '440Hz' },
        { at: 10, text: '10kHz' },
      ],
    },
    help: `Tunes VCO ${n}. The knob is continuous and very wide: each step on the scale is about an octave, with 440 Hz (the note played) at the centre. Set octaves and fifths by ear, or against the other VCO.`,
  });
  text(610, ly + 9, 'FREQUENCY', 15);
  knob(`vco${n}.wave`, 766, y, {
    def: 5,
    name: `VCO ${n} waveform`,
    module: 'osc',
    fmt: waveName,
    scale: { ticks: 7, size: 13 },
    help: `VCO ${n}’s shape, turned smoothly from one to the next: triangle (soft), a lopsided ramp, sawtooth (bright and buzzy), square (hollow), then a pulse that narrows. At the far right the pulse width is moved by the PWM source switch.`,
  });
  WAVE_GLYPHS.forEach(([shape, a]) => {
    const [gx, gy] = polar(766, y, 56, a);
    decor.push({ t: 'wave', x: gx, y: gy, size: 10, shape });
  });
  text(766, ly + 9, 'WAVEFORM', 15);
  knob(`vca${n}.level`, 921, y, {
    def: n === 1 ? 8 : 0,
    name: `VCO ${n} volume`,
    module: 'mixer',
    scale: S10,
    help: `Level of VCO ${n} into the filter, set by its own VCA. There is no mixer: these two VOLUME knobs are the mix. Each has a CV input, so the mix can be moved by an envelope or the LFO.`,
  });
  text(921, ly + 9, 'VOLUME', 15);
});
knob('vco2.beat', 455, 449, {
  min: -5,
  max: 5,
  def: 0,
  name: 'VCO 2 beat',
  module: 'osc',
  scale: BIPOLAR,
  fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 10)} cents`,
  help: 'Fine tuning of VCO 2 against VCO 1, up to half a semitone either way. A small offset makes the two beat slowly, which thickens the sound.',
});
text(455, 519, 'VCO 2 BEAT', 15);

// ── VCF ───────────────────────────────────────────────────────────────────
knob('vcf.freq', 1077, 208, {
  def: 7,
  name: 'VCF frequency',
  module: 'filter',
  fmt: (v) => fmtHz(vcfHz(v)),
  scale: {
    ticks: 11,
    size: 13,
    numR: 1.7,
    labels: [
      { at: 0, text: '16Hz' },
      { at: 10, text: '16kHz' },
    ],
  },
  help: 'Cutoff of the 24 dB low-pass filter. Turn it left and the sound gets darker until only a dull thud is left; turn it right and the full buzz of the oscillators comes through.',
});
text(1077, 278, 'VCF FREQ', 15);
knob('vcf.res', 1234, 206, {
  def: 0,
  name: 'Resonance',
  module: 'filter',
  scale: {
    ticks: 0,
    size: 13,
    numR: 1.62,
    labels: [
      ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((at) => ({ at, text: String(at) })),
      { at: 10, text: '10 OSC' },
    ],
  },
  help: 'Boosts a narrow band at the cutoff, so sweeps sound vocal and squelchy. Near 10 (marked OSC) the filter whistles on its own as a sine wave.',
});
text(1234, 278, 'RESONANCE', 15);
decor.push({ t: 'led', x: 1294, y: 295, r: 7, color: 'red', litWhen: 'gate' });
text(1282, 295, 'Gate', 12, { anchor: 'end' });
knob('vcf.kbd', 1077, 418, {
  min: 0,
  max: 2,
  def: 1,
  name: 'Keyboard control',
  module: 'filter',
  fmt: (v) => `${Math.round(v * 100)} %`,
  scale: {
    ticks: 0,
    size: 13,
    numR: 1.62,
    labels: [
      { at: 0, text: '0' },
      { at: 1, text: '1' },
      { at: 2, text: '2V/OC' },
    ],
  },
  help: 'How far the cutoff follows the notes played. At 1 it follows them exactly, so every note has the same brightness; at 0 high notes sound duller; at 2 it moves twice as far.',
});
text(1077, 484, 'KEYB CTRL', 15);
knob('vcf.env', 1234, 407, {
  min: -5,
  max: 5,
  def: 0,
  name: 'ADS control',
  module: 'filter',
  scale: BIPOLAR,
  fmt: (v) =>
    Math.abs(v) < 0.05 ? 'off' : `${v > 0 ? '+' : '−'}${(Math.abs(v) * 1.4).toFixed(1)} oct`,
  help: 'How far ADS 2 sweeps the cutoff on each note. Right of centre it opens the filter; left of centre it closes it. At the centre the envelope does nothing to the filter.',
});
text(1234, 484, 'ADS CONTROL', 15);

// ── ADS 1 (loudness) and ADS 2 (filter) ───────────────────────────────────
const envKnobs = (n: number, y: number, ly: number): void => {
  const who = n === 1 ? 'the loudness' : 'the filter';
  knob(`ads${n}.attack`, 1390, y, {
    min: 1,
    max: 10,
    def: 1,
    name: `ADS ${n} attack`,
    module: n === 1 ? 'amp' : 'env',
    scale: ENV_SCALE,
    fmt: (v) => fmtTime(envTime(v)),
    help: `How long ${who} envelope takes to rise when a note starts. Short for plucks and basses, long for swells.`,
  });
  text(1390, ly + 9, 'ATTACK', 15);
  knob(`ads${n}.decay`, 1545, y, {
    min: 1,
    max: 10,
    def: 5,
    name: `ADS ${n} decay`,
    module: n === 1 ? 'amp' : 'env',
    scale: ENV_SCALE,
    fmt: (v) => fmtTime(envTime(v)),
    help: `How long ${who} envelope takes to fall to the sustain level, and to die away after the key is released: there is no separate release knob.`,
  });
  text(1545, ly + 9, 'DECAY', 15);
  knob(`ads${n}.sustain`, 1701, y, {
    def: n === 1 ? 10 : 5,
    name: `ADS ${n} sustain`,
    module: n === 1 ? 'amp' : 'env',
    scale: S10,
    help:
      n === 1
        ? 'Volume while a key is held. At 10 the note holds at full level; at 0 it dies away even if you keep holding.'
        : 'Where the filter settles while a key is held, as a share of the ADS CONTROL sweep.',
  });
  text(1701, ly + 9, 'SUSTAIN', 15);
};
envKnobs(1, 174, 234);
envKnobs(2, 449, 510);
slide('ads1.decayOff', 1624, 366, {
  kind: 'bool',
  def: false,
  onAt: 'bottom',
  name: 'Decay off',
  module: 'amp',
  help: 'Sets ADS 1’s decay and release to zero, so notes stop dead on release like an organ. With SUSTAIN low they become short clicks.',
});
text(1624, 388, 'Decay Off', 12);

// ── Output ────────────────────────────────────────────────────────────────
knob('out.volume', 1857, 315, {
  def: 7,
  name: 'Volume',
  module: 'out',
  scale: S10,
  help: 'Overall output level, to AUDIO OUT and the headphones.',
});
text(1857, 378, 'VOLUME', 15);

// ── Jacks ─────────────────────────────────────────────────────────────────
// Top row inputs print ▼ under the name, outputs ▲; the bottom row prints them above.
const jackLabel = (x: number, y: number, label: string, dir: 'in' | 'out'): void => {
  const top = y < 300;
  label.split('\n').forEach((line, i) => text(x, (top ? 39 : 587) + i * 15, line, 14));
  decor.push({ t: 'arrow', x, y: top ? 53 : 573, dir: dir === 'in' ? 'down' : 'up', size: 4 });
};
const jackIn = (
  id: string,
  x: number,
  y: number,
  label: string,
  rest: JackRest<InputJack>
): void => {
  jacks.push({ id, x, y, r: 17, label, labelPos: 'none', dir: 'in', ...rest });
  jackLabel(x, y, label, 'in');
};
const jackOut = (
  id: string,
  x: number,
  y: number,
  label: string,
  rest: JackRest<OutputJack>
): void => {
  jacks.push({ id, x, y, r: 17, label, labelPos: 'none', dir: 'out', ...rest });
  jackLabel(x, y, label, 'out');
};
const lvlAmt = 0.75;
jackIn('j.lfoRate', 142, 78, 'LFO RATE', {
  dest: 'lfoRate',
  amt: 4,
  add: true,
  help: 'Voltage control of the LFO’s speed, added to the RATE knob. Patch an envelope here and the wobble speeds up at the start of each note.',
});
jackOut('j.lfoOut1', 298, 78, 'LFO OUT 1', {
  name: 'LFO OUT 1 (scaled)',
  signal: 'att1',
  help: 'The LFO at the level set by its VOLUME knob. This is the same signal that moves the VCOs.',
});
jackOut('j.lfoOut2', 376, 78, 'LFO OUT 2', {
  name: 'LFO OUT 2 (full level)',
  signal: 'lfo',
  help: 'The LFO at full level, whatever VOLUME is set to.',
});
jackIn('j.vcoModIn', 454, 78, 'VCO\nMOD IN', {
  dest: 'multIn',
  amt: 1,
  hear: (v, x) =>
    `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} takes the LFO’s place as the pitch modulation of ${v['mod.vco1Off'] ? 'VCO 2 only (VCO 1 MOD OFF is on)' : 'both VCOs'}, up to an octave either way at full strength. The LFO no longer moves the pitch, but it still drives LFO OUT 1, LFO OUT 2 and pulse-width modulation.`,
  help: 'Replaces the LFO as the pitch modulation of both VCOs (or VCO 2 alone, with VCO 1 MOD OFF). Plugging anything in here stops the LFO’s vibrato.',
});
jackIn('j.vco1Freq', 610, 78, 'VCO 1 FREQ', {
  dest: 'pitch1',
  amt: 12,
  add: true,
  help: 'Voltage control of VCO 1’s pitch, added to its FREQUENCY knob.',
});
jackIn('j.vco1Wave', 766, 78, 'VCO 1 WAVEFORM', {
  dest: 'wave1',
  amt: 0.5,
  add: true,
  help: 'Voltage control of VCO 1’s WAVEFORM: the shape moves along the knob’s path from triangle to pulse. An LFO here gives a sweeping, filter-like movement to one oscillator only.',
});
jackIn('j.vco1Vol', 883, 78, 'VOLUME', {
  name: 'VCO 1 VOLUME',
  dest: 'lvl1',
  amt: lvlAmt,
  add: true,
  help: 'Voltage control of VCO 1’s VCA, added to its VOLUME knob. Patch an envelope here with VOLUME at 0 and VCO 1 has its own loudness shape.',
});
jackOut('j.vco1Out', 961, 78, 'VCO 1 OUT', {
  signal: 'osc1',
  help: 'VCO 1 on its own, before its VCA. Taking it out here does not stop it reaching the filter.',
});
jackIn('j.vcfFreq', 1077, 78, 'VCF FREQUENCY', {
  dest: 'cutoff',
  amt: 5,
  add: true,
  help: 'Voltage control of the filter cutoff, added to the VCF FREQ knob.',
});
jackIn('j.res', 1233, 78, 'RESONANCE', {
  dest: 'res',
  amt: 1,
  add: true,
  help: 'Voltage control of resonance, added to the RESONANCE knob.',
});
jackIn('j.gateIn', 1311, 78, 'GATE IN', {
  dest: 'gateIn',
  amt: 1,
  help: 'An outside gate for both envelopes, in place of the notes played. Patch LFO OUT 2 with the square LFO here and the envelopes fire on their own, in time with the LFO.',
});
jackIn('j.ads1Attack', 1390, 78, 'ATTACK', {
  name: 'ADS 1 ATTACK',
  signal: null,
  dest: null,
  help: 'Voltage control of ADS 1’s attack time. Not modelled in this app: a cable can be drawn but does nothing.',
});
jackIn('j.ads1Decay', 1545, 78, 'DECAY', {
  name: 'ADS 1 DECAY',
  signal: null,
  dest: null,
  help: 'Voltage control of ADS 1’s decay and release time. Not modelled in this app: a cable can be drawn but does nothing.',
});
jackIn('j.ads1Sustain', 1701, 78, 'SUSTAIN', {
  name: 'ADS 1 SUSTAIN',
  signal: null,
  dest: null,
  help: 'Voltage control of ADS 1’s sustain level. Not modelled in this app: a cable can be drawn but does nothing.',
});
jackOut('j.ads1Out', 1779, 78, 'ADS 1 OUT', {
  signal: 'env1',
  help: 'ADS 1, the loudness envelope, as a voltage.',
});

jackIn('j.vpIn1', 142, 546, 'IN 1', {
  dest: 'sum1A',
  amt: (v) => num(v, 'vp.in1') * num(v, 'vp.out'),
  help: 'Voltage processor input 1, scaled by IN 1 GAIN. With nothing plugged in it carries a steady +10 V; a cable replaces that.',
});
jackIn('j.vpIn2', 259, 546, 'IN 2', {
  dest: 'sum1B',
  amt: (v) => 2 * num(v, 'vp.out'),
  help: 'Voltage processor input 2, at a fixed gain of 2, added to input 1.',
});
jackOut('j.vpOut', 338, 546, 'OUT', {
  name: 'Voltage processor OUT',
  signal: 'sum1',
  help: 'The voltage processor’s output: input 1 plus input 2, scaled by OUT GAIN. With nothing patched in, a steady positive voltage.',
});
jackOut('j.vpRev', 415, 546, 'REV OUT', {
  signal: 'invert',
  help: 'The voltage processor’s output upside down. With nothing patched in, a steady negative voltage.',
});
jackOut('j.noise', 492, 546, 'NOISE OUT', {
  signal: 'noise',
  help: 'The noise generator. It is not wired into the sound: patch it to VCF AUDIO IN for hiss and breath, or to a CV input for random movement.',
});
jackIn('j.vco2Freq', 610, 546, 'VCO 2 FREQ', {
  dest: 'pitch2',
  amt: 12,
  add: true,
  help: 'Voltage control of VCO 2’s pitch, added to its FREQUENCY knob.',
});
jackIn('j.vco2Wave', 766, 546, 'VCO 2 WAVEFORM', {
  dest: 'wave2',
  amt: 0.5,
  add: true,
  help: 'Voltage control of VCO 2’s WAVEFORM: the shape moves along the knob’s path from triangle to pulse.',
});
jackIn('j.vco2Vol', 883, 546, 'VOLUME', {
  name: 'VCO 2 VOLUME',
  dest: 'lvl2',
  amt: lvlAmt,
  add: true,
  help: 'Voltage control of VCO 2’s VCA, added to its VOLUME knob. Patch an envelope here with VOLUME at 0 and VCO 2 has its own loudness shape.',
});
jackOut('j.vco2Out', 961, 546, 'VCO 2 OUT', {
  signal: 'osc2',
  help: 'VCO 2 on its own. Unlike VCO 1 OUT, a cable here takes VCO 2 out of the filter’s input, so it only goes where you patch it.',
});
jackIn('j.vcfIn', 1039, 546, 'VCF\nAUDIO IN', {
  dest: 'extIn',
  amt: 1,
  add: true,
  help: 'Audio into the filter, alongside the two VCOs. Patch VCO 2 OUT here to take VCO 2 round its VCA, or NOISE OUT for breath.',
});
jackIn('j.cvIn', 1116, 546, 'CV IN\n1V/OCT', {
  dest: 'pitchAll',
  amt: 60,
  add: true,
  help: 'Pitch control voltage for both VCOs and the filter tracking, 1 V per octave, added to the notes played.',
});
jackIn('j.adsCtrl', 1233, 546, 'ADS CTRL', {
  signal: null,
  dest: null,
  help: 'Voltage control of the ADS CONTROL depth. Not modelled in this app: a cable can be drawn but does nothing.',
});
jackOut('j.ads2Out', 1311, 546, 'ADS 2 OUT', {
  signal: 'env2',
  help: 'ADS 2, the filter envelope, as a voltage. Patch it to a VCO’s WAVEFORM or VOLUME input and that oscillator follows the filter’s shape.',
});
jackIn('j.ads2Attack', 1390, 546, 'ATTACK', {
  name: 'ADS 2 ATTACK',
  signal: null,
  dest: null,
  help: 'Voltage control of ADS 2’s attack time. Not modelled in this app: a cable can be drawn but does nothing.',
});
jackIn('j.ads2Decay', 1545, 546, 'DECAY', {
  name: 'ADS 2 DECAY',
  signal: null,
  dest: null,
  help: 'Voltage control of ADS 2’s decay and release time. Not modelled in this app: a cable can be drawn but does nothing.',
});
jackIn('j.ads2Sustain', 1701, 546, 'SUSTAIN', {
  name: 'ADS 2 SUSTAIN',
  signal: null,
  dest: null,
  help: 'Voltage control of ADS 2’s sustain level. Not modelled in this app: a cable can be drawn but does nothing.',
});
jackOut('j.audioOut', 1857, 546, 'AUDIO OUT', { signal: 'out', help: 'The main audio output.' });
jacks.push({
  id: 'j.phones',
  x: 1857,
  y: 450,
  r: 17,
  label: 'PHONES',
  labelPos: 'none',
  dir: 'out',
  signal: 'out',
  help: 'Headphone output.',
});
text(1857, 482, 'PHONES', 14);

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'lfo',
    label: 'LFO',
    module: 'lfo',
    keywords: 'vibrato wobble trill rate',
    rects: [R(38, 0, 420, 250), R(420, 280, 505, 370)],
    help: 'One LFO, triangle or square, from 0.01 to 100 Hz. VOLUME sets how much of it reaches the pitch of the VCOs and LFO OUT 1; LFO OUT 2 is always at full level. It also drives pulse-width modulation when the PWM switch is on LFO or Both.',
  },
  {
    id: 'noise',
    label: 'Noise generator',
    module: 'osc',
    keywords: 'white pink hiss breath',
    rects: [R(320, 250, 420, 392), R(462, 500, 522, 625)],
    help: 'White or pink noise. It has no level knob and is not wired into the sound: patch NOISE OUT to VCF AUDIO IN to hear it, or to a CV input for random movement.',
  },
  {
    id: 'vp',
    label: 'Voltage processor',
    module: 'util',
    keywords: 'offset attenuator inverter mixer cv utility +10v',
    rects: [R(38, 250, 320, 392), R(38, 392, 420, 625)],
    help: 'Adds two control voltages and scales the result. IN 1 carries +10 V until something is plugged in, so with no cables OUT is a fixed positive voltage set by IN 1 GAIN and OUT GAIN, and REV OUT the same voltage negative: a manual control for any CV input.',
  },
  {
    id: 'modbus',
    label: 'Tune and VCO modulation',
    module: 'mod',
    keywords: 'tune pitch vibrato mod bus',
    rects: [R(420, 0, 580, 280)],
    help: 'TUNE moves both VCOs together. The LFO, at the level set by its VOLUME knob, is wired to the pitch of both VCOs; VCO MOD IN replaces it with whatever you patch in, and VCO 1 MOD OFF leaves VCO 1 out so only VCO 2 moves.',
  },
  {
    id: 'vco1',
    label: 'VCO 1',
    module: 'osc',
    keywords: 'oscillator pitch waveform morph triangle sawtooth square pulse',
    rects: [R(580, 0, 840, 295)],
    help: 'The first oscillator. FREQUENCY tunes it over the whole audio range, about an octave per step, and WAVEFORM turns its shape smoothly from triangle through ramp and sawtooth to square and a narrowing pulse. Both have CV inputs above them.',
  },
  {
    id: 'pwm',
    label: 'PWM source',
    module: 'mod',
    keywords: 'pulse width modulation pwm',
    rects: [R(760, 295, 840, 340)],
    help: 'Chooses what moves the pulse width of both VCOs: the LFO, ADS 2, or both. It is only heard with a WAVEFORM knob at the pulse end of its travel.',
  },
  {
    id: 'vco2',
    label: 'VCO 2',
    module: 'osc',
    keywords: 'oscillator pitch waveform morph sync beat detune',
    rects: [
      R(580, 340, 840, 625),
      R(580, 295, 760, 340),
      R(505, 295, 580, 370),
      R(420, 370, 580, 500),
    ],
    help: 'The second oscillator, the same as VCO 1, plus VCO 2 BEAT to detune it finely against VCO 1 and SYNCHRO to hard-sync it to VCO 1.',
  },
  {
    id: 'vcas',
    label: 'VCO levels (VCAs)',
    module: 'mixer',
    keywords: 'mixer volume level balance vca crossfade',
    rects: [R(840, 0, 1010, 625)],
    help: 'In place of a mixer each VCO has its own VCA. The VOLUME knobs set each VCO’s level into the filter, and the VOLUME inputs let a voltage move them, so an envelope or the LFO can crossfade the two. VCO 1 OUT and VCO 2 OUT carry each oscillator on its own.',
  },
  {
    id: 'vcf',
    label: 'VCF (filter)',
    module: 'filter',
    keywords: 'cutoff resonance brightness low-pass tracking envelope amount self-oscillation',
    rects: [R(1010, 0, 1275, 625)],
    help: 'A 24 dB low-pass filter. VCF FREQ sets the cutoff and RESONANCE the peak at it, up to self-oscillation. KEYB CTRL sets how far the cutoff follows the notes, and ADS CONTROL how far ADS 2 sweeps it, opening or closing. VCF AUDIO IN adds any other audio to the filter’s input.',
  },
  {
    id: 'ads1',
    label: 'ADS 1 and the output VCA',
    module: 'amp',
    keywords: 'loudness envelope attack decay sustain release gate organ',
    rects: [R(1275, 0, 1820, 312), R(1575, 312, 1820, 392)],
    help: 'The loudness envelope. ATTACK is the fade-in and DECAY the fall to the SUSTAIN level; DECAY is also the release time, as there is no release knob. DECAY OFF makes notes stop dead. GATE IN fires both envelopes from outside.',
  },
  {
    id: 'ads2',
    label: 'ADS 2 (filter envelope)',
    module: 'env',
    keywords: 'filter envelope contour attack decay sustain',
    rects: [R(1275, 392, 1820, 625), R(1275, 312, 1575, 392)],
    help: 'The filter envelope, with the same ATTACK, DECAY and SUSTAIN as ADS 1. ADS CONTROL sets how far it moves the cutoff, and the PWM switch can send it to the pulse width too. ADS 2 OUT carries it to any other input.',
  },
  {
    id: 'output',
    label: 'Output and MIDI',
    module: 'out',
    keywords: 'volume headphones phones midi',
    rects: [R(1820, 0, 1962, 625)],
    help: 'MIDI IN is how the hardware is played; here the on-screen keyboard plays it. VOLUME sets the level at AUDIO OUT and the headphone socket.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const patched = ctx.patched;
  const osc = [1, 2].map((n) => ({
    level:
      n === 2 && patched['j.vco2Out']
        ? 0
        : num(v, `vca${n}.level`) > 0
          ? oscLevel(num(v, `vca${n}.level`))
          : 0,
    morph: num(v, `vco${n}.wave`) / 10,
    pw: 0.5,
    semi: vcoSemi(num(v, `vco${n}.freq`)) + (n === 2 ? num(v, 'vco2.beat') * 0.1 : 0),
    kbd: true,
    fixedNote: 60,
    syncTo: n === 2 && v['vco2.sync'] ? 0 : -1,
  }));
  const lfoGain = Math.pow(num(v, 'lfo.volume') / 10, 2);
  const routes: EngineRoute[] = [];
  // the mod bus (the scaled LFO, or VCO MOD IN) to pitch: one unit of signal is an octave
  if (!v['mod.vco1Off']) routes.push({ src: 'mult', dst: 'pitch1', amt: 12 });
  routes.push({ src: 'mult', dst: 'pitch2', amt: 12 });
  const pwm = v['mod.pwm'];
  if (pwm !== 'ads' && lfoGain > 0)
    ['pw1', 'pw2'].forEach((dst) => routes.push({ src: 'att1', dst, amt: pwmDepth }));
  if (pwm !== 'lfo')
    ['pw1', 'pw2'].forEach((dst) => routes.push({ src: 'env2', dst, amt: pwmDepth }));
  const d1 = v['ads1.decayOff'] ? 0.003 : envTime(num(v, 'ads1.decay'));
  const d2 = envTime(num(v, 'ads2.decay'));
  const vpOut = num(v, 'vp.out');
  return {
    osc,
    noise: { level: 0, color: v['noise.colour'] === 'pink' ? 'pink' : 'white' },
    ext: { level: 1 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.freq')),
      res: (num(v, 'vcf.res') / 10) * 1.1,
      envAmt: num(v, 'vcf.env') * 1.4,
      envSrc: 'env2',
      kbd: num(v, 'vcf.kbd'),
    },
    env1: { a: envTime(num(v, 'ads1.attack')), d: d1, s: num(v, 'ads1.sustain') / 10, r: d1 },
    env2: { a: envTime(num(v, 'ads2.attack')), d: d2, s: num(v, 'ads2.sustain') / 10, r: d2 },
    vca: { envSrc: 'env1', bias: 0 },
    lfo: {
      rate: lfoHz(num(v, 'lfo.rate')),
      mix: v['lfo.shape'] === 'tri' ? { tri: 1 } : { sq: 1 },
      keySync: false,
    },
    glide: { time: 0, legato: false },
    trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'] },
    paraphonic: false,
    routes,
    normals: {
      att1In: 'lfo',
      multIn: 'att1',
      gateIn: 'gate',
      sum1A: ['one', 2 * num(v, 'vp.in1') * vpOut],
      invertIn: 'sum1',
    },
    od: { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [lfoGain, 1],
    tune: num(v, 'pitch.tune') * 0.1,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const kobol: SynthDef & { version: number } = {
  id: 'kobol',
  version: 1,
  name: 'Kobol Expander',
  maker: 'Behringer',
  year: 2023,
  heritage: 'Modelled on the 1979 RSF Kobol Expander, from France',
  summary:
    'Two VCOs whose WAVEFORM knobs morph from triangle to pulse, each with its own VCA, into a 24 dB low-pass filter and an output VCA. Two ADS envelopes, an LFO, noise, a voltage processor and a CV input for almost every knob.',
  view: { w: 2000, h: 625 },
  theme: {
    panel: '#1e1f21',
    panel2: '#141516',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'wood',
    cheekW: 38,
    jack: 'black',
  },
  signalNames: {
    osc1: 'VCO 1',
    osc2: 'VCO 2',
    env1: 'ADS 1 (the loudness envelope)',
    env2: 'ADS 2 (the filter envelope)',
    lfo: 'the LFO',
    att1: 'the LFO at LFO VOLUME’s level',
    mult: 'the VCO modulation bus',
    sum1: 'the voltage processor output',
    invert: 'REV OUT',
    noise: 'the noise generator',
  },
  destNames: { multIn: 'the pitch of the VCOs' },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default kobol;
