/**
 * EMS VCS3 Mk 1: the definition (D1). There is no flat photo of both panels, so the faceplate is
 * laid out from the user's photo and the manual: the sloping upper panel on the left (x 40–1130),
 * the flat lower panel with the pin matrix, joystick and output amplifiers on the right
 * (x 1170–2060), with the wooden divider between them.
 *
 * Voltages: an engine signal of 1 is 1 V on a matrix row. Each row's numbered LEVEL knob scales its
 * row (the row jack's `gain`, in volts at full level, from the manual's output figures). Each pin is
 * a 2.7 kΩ resistor into a 10 kΩ input, so a column sees 0.79 of the row voltage; the column jacks'
 * `amt` folds that in with the manual's control sensitivities.
 *
 * Transliterated from the prototype file `src/synths/ems-vcs3.js` (D3), the way `defs/model-d.ts`
 * was: no content (sounds, lineage, unusual notes), a `version`, and panel values read through
 * `num()`. The VCS3's panel carries no maker's mark, so nothing here is tagged `brand`.
 */
import type {
  Area,
  Control,
  ControlCommon,
  ControlValues,
  Decor,
  EngineParams,
  InputJack,
  Jack,
  JackHearContext,
  KnobScale,
  OscParams,
  OutAmpParams,
  OutputJack,
  SynthDef,
  TextDecor,
} from '@/lib/app/synths/contract';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtTime, pwl, type CurvePoint } from '@/lib/app/synths/lib/maps';

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> & {
  def: number;
  scale?: KnobScale;
  fmt?: (v: number) => string;
};
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'fill' | 'weight' | 'rotate' | 'hw'>>;
type RowRest = Pick<OutputJack, 'check'>;
type ColRest = Pick<InputJack, 'hear' | 'check'>;
type Hear = (v: ControlValues, x: JackHearContext) => string | null;

const INK = '#18191b';
const PANEL = '#d7d8d3';
const PIN = 10 / 12.7; // a 2.7 kΩ pin into a 10 kΩ input

// ── Scales ────────────────────────────────────────────────────────────────
// Oscillators 1 and 2: 1.5 octaves per division, 261.6 Hz at 6 (the manual's calibration table). Oscillator 3 is the
// same law about 20 times slower: 500 Hz at 10, 2.76 Hz at 5.
const osc12Hz = (v: number): number => 261.6 * Math.pow(2, 1.5 * (v - 6));
const osc3Hz = (v: number): number => 500 * Math.pow(2, 1.5 * (v - 10));
const noteOf = (hz: number): number => 69 + (12 * Math.log(hz / 440)) / Math.LN2;
const vcfHz = (v: number): number => expMap(v / 10, 5, 10000);
// RESPONSE: low-pass at 0, a sharp peak at about 5 to 6, oscillating a little beyond
const RES_PTS: CurvePoint[] = [
  [0, 0],
  [3, 0.35],
  [5, 0.84],
  [6, 0.97],
  [6.6, 1.02],
  [10, 1.12],
];
const attackS = (v: number): number => expMap(v / 10, 0.002, 1);
const onS = (v: number): number => 2.5 * Math.pow(v / 10, 2);
const decayS = (v: number): number => expMap(v / 10, 0.003, 15);
const OFF_MANUAL = 6; // OFF past here: the envelope stops after each decay and waits for a key or the ATTACK button
const offS = (v: number): number => expMap(v / OFF_MANUAL, 0.01, 5);
/** A numbered LEVEL knob: square law (the pots are log-taper), `peak` volts at 10. */
const lvl = (v: number, peak: number): number => peak * Math.pow(clamp(v, 0, 10) / 10, 2);
// The ring modulator's gain: the manual's 1.5 V p-p inputs give 6 V p-p out, so 1 V times 1 V is about 5.3 V.
const RING_GAIN = 5.3;
// The engine's ladder settles into a quieter sine than the VCS3's filter/oscillator, so row 10 is lifted as RESPONSE
// takes it into oscillation (an app correction for the model, not a property of the hardware).
const filterOscBoost = (v: ControlValues): number =>
  1 + 3.5 * clamp((pwl(num(v, 'vcf.response'), RES_PTS) - 0.9) / 0.2, 0, 1);
const fmtV = (x: number): string =>
  `${x < 0.095 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10} V`;

// Knob caps, as on the panel
const CAP = {
  yellow: '#efd640',
  green: '#2f9a4a',
  white: '#f1f1ec',
  red: '#b4232a',
  blue: '#4f8fcf',
  black: '#202124',
};
type CapName = keyof typeof CAP;
const S10: KnobScale = {
  nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  ticks: 11,
  size: 11,
  numR: 1.6,
  tickR: 1.24,
};

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const text = (x: number, y: number, t: string, size = 14, rest: TextRest = {}): void => {
  decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle', ...rest });
};
const knob = (id: string, x: number, y: number, cap: CapName, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 27,
    style: 'vcs3',
    cap: CAP[cap],
    kind: 'cont',
    min: 0,
    max: 10,
    labelPos: 'none',
    scale: S10,
    ...rest,
  });
};
const dial = (id: string, x: number, y: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 48,
    style: 'vcs3-dial',
    cap: CAP.yellow,
    kind: 'cont',
    min: 0,
    max: 10,
    labelPos: 'none',
    ...rest,
  });
};
/** A black square with a white letter or number: the panel's link from a knob to its matrix row or column. */
const box = (x: number, y: number, t: string | number, size = 13): void => {
  const w = Math.max(18, String(t).length * size * 0.62 + 8);
  decor.push({ t: 'rect', x: x - w / 2, y: y - size * 0.75, w, h: size * 1.5, r: 2, fill: INK });
  text(x, y + size * 0.36, String(t), size, { fill: PANEL, weight: 700 });
};
const frame = (x: number, y: number, w: number, h: number): void => {
  decor.push({ t: 'rect', x, y, w, h, r: 0, stroke: INK, sw: 2.2 });
};
const tab = (x: number, y: number, t: string, size = 15): void => {
  decor.push({ t: 'tab', x, y, text: t, size, gap: false });
};

// ── Cabinet ───────────────────────────────────────────────────────────────
decor.push({ t: 'rect', x: 1130, y: 0, w: 40, h: 1000, r: 0, fill: 'url(#kysWood)', hw: true });
decor.push(
  { t: 'line', x1: 1130, y1: 0, x2: 1130, y2: 1000, w: 3 },
  { t: 'line', x1: 1170, y1: 0, x2: 1170, y2: 1000, w: 3 }
);
[
  [60, 14],
  [1110, 14],
  [60, 986],
  [1110, 986],
  [1190, 14],
  [2040, 14],
  [1190, 986],
  [2040, 986],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 7 }));

// ── Upper panel: frames ───────────────────────────────────────────────────
frame(50, 28, 550, 217);
frame(50, 245, 550, 220);
frame(50, 465, 550, 220);
frame(50, 685, 280, 290);
frame(330, 685, 270, 290);
frame(600, 28, 145, 217);
frame(745, 28, 375, 217);
frame(600, 245, 520, 220);
frame(880, 465, 240, 220);
frame(600, 465, 280, 220);
frame(600, 685, 280, 290);
frame(880, 685, 240, 290);

// ── Oscillators ───────────────────────────────────────────────────────────
const OSC_Y = [150, 370, 590];
[1, 2, 3].forEach((n) => {
  const y = OSC_Y[n - 1];
  const top = y - 105;
  tab(135, top + 4, `OSCILLATOR ${n}`);
  text(112, top + 36, 'FREQUENCY', 13);
  box(178, top + 32, 'IJK'[n - 1]);
  text(60, y - 44, n === 3 ? '.05 Hz' : '1 Hz', 11, { anchor: 'start' });
  text(198, y - 44, n === 3 ? '500 Hz' : '10 KHz', 11, { anchor: 'end' });
  dial(`osc${n}.freq`, 128, y + 8, {
    def: n === 3 ? 5 : 6,
    module: n === 3 ? 'lfo' : 'osc',
    fmt: (v) => fmtHz(n === 3 ? osc3Hz(v) : osc12Hz(v)),
    name: `Oscillator ${n} FREQUENCY`,
    help:
      n === 3
        ? 'Speed of Oscillator 3, from about one cycle a minute at 0 to 500 Hz at 10. Below 7 it is too slow to hear as a note, which is what it is for: it is the VCS3’s main source of slow movement, the job an LFO does on other synths.'
        : `Pitch of Oscillator ${n}, from below 1 Hz to over 16 kHz. Each division is an octave and a half; 6 is middle C. The numbers are for noting a setting down, not a frequency scale.`,
  });
  text(265, top + 36, 'SHAPE', 13);
  knob(`osc${n}.shape`, 265, y + 8, 'green', {
    def: 5,
    module: n === 3 ? 'lfo' : 'osc',
    name: `Oscillator ${n} SHAPE`,
    help:
      n === 1
        ? 'Changes the sine output only. At 5 it is a pure sine; either side it folds over towards a rectified shape, adding harmonics: brighter one way up, the other way down.'
        : `Changes both of Oscillator ${n}’s outputs together. At 5 they are a square and a triangle; turn either way and the square narrows into a pulse while the triangle leans into a ramp. Near the ends the pulse almost disappears.`,
  });
  text(465, top + 30, 'LEVEL', 13);
  const waves = n === 1 ? (['sine', 'saw'] as const) : (['sq', 'tri'] as const);
  const rowN = [2 * n - 1, 2 * n];
  [405, 525].forEach((x, k) => {
    decor.push({ t: 'wave', x, y: top + 58, size: 13, shape: waves[k] });
    const word = n === 1 ? ['sine', 'ramp'][k] : ['square', 'triangle'][k];
    knob(`osc${n}.${n === 1 ? ['sine', 'ramp'][k] : ['square', 'tri'][k]}`, x, y + 8, 'white', {
      def: 0,
      module: n === 3 ? 'lfo' : 'osc',
      name: `Oscillator ${n} ${word} LEVEL`,
      fmt: (v) => fmtV(lvl(v, n === 1 ? [1.5, 2][k] : [2, 1.5][k])),
      help: `How much of Oscillator ${n}’s ${word} reaches matrix row ${rowN[k]}. It sets the level wherever that row is pinned, so at 0 every pin in row ${rowN[k]} does nothing.`,
    });
    box(x, y + 76, rowN[k]);
  });
});

// ── Noise and input levels ────────────────────────────────────────────────
tab(150, 707, 'NOISE GENERATOR');
text(125, 762, 'COLOUR', 13);
text(125, 790, 'White', 11);
knob('noise.colour', 125, 850, 'white', {
  def: 5,
  module: 'osc',
  scale: {
    ticks: 11,
    labels: [
      { at: 0, text: 'Low' },
      { at: 10, text: 'High' },
    ],
    size: 11,
    numR: 1.75,
    tickR: 1.24,
  },
  help: 'The colour of the noise. At 5 it is white noise, hissing evenly at all pitches. Turn left for darker, rumbling noise (the high end taken away); turn right for thin, hissy noise (the low end taken away).',
});
text(255, 762, 'LEVEL', 13);
knob('noise.level', 255, 850, 'white', {
  def: 0,
  module: 'osc',
  fmt: (v) => fmtV(lvl(v, 1.5)),
  name: 'Noise LEVEL',
  help: 'How much noise reaches matrix row 7.',
});
box(255, 918, 7);

tab(465, 707, 'INPUT LEVEL');
text(400, 762, 'CHANNEL 1', 13);
text(525, 762, 'CHANNEL 2', 13);
knob('in.ch1', 400, 850, 'white', {
  def: 5,
  module: 'util',
  name: 'INPUT LEVEL CHANNEL 1',
  fmt: (v) => `${Math.round(v * 20) / 10} semitones per key`,
  help: 'Gain of input channel 1, which puts the keyboard’s pitch voltage on matrix row 8. Pin row 8 to an oscillator’s frequency column to play it from the keys. At 5 Oscillators 1 and 2 play one semitone per key; lower squeezes the notes together, higher spreads them apart.',
});
knob('in.ch2', 525, 850, 'white', {
  def: 0,
  module: 'util',
  name: 'INPUT LEVEL CHANNEL 2',
  help: 'Gain of input channel 2, onto matrix row 9. Nothing is plugged into it in this app, so it does nothing here.',
});
box(400, 918, 8);
box(525, 918, 9);

// ── Ring modulator and filter ─────────────────────────────────────────────
tab(672, 50, 'RING MODULATOR', 13);
box(628, 80, 'E');
text(672, 85, 'LEVEL', 13);
box(716, 80, 'F');
knob('ring.level', 672, 158, 'white', {
  def: 0,
  module: 'util',
  fmt: (v) => `×${Math.round(lvl(v, RING_GAIN) * 10) / 10}`,
  name: 'Ring modulator LEVEL',
  help: 'How much of the ring modulator’s output reaches matrix row 13. The ring modulator multiplies whatever is pinned into columns E and F.',
});
box(672, 226, 13);

tab(890, 50, 'FILTER/OSCILLATOR');
box(1000, 50, 'H');
text(810, 85, 'FREQUENCY', 13);
box(865, 81, 'N');
knob('vcf.freq', 810, 158, 'green', {
  def: 6,
  module: 'filter',
  fmt: (v) => fmtHz(vcfHz(v)),
  name: 'Filter FREQUENCY',
  help: 'The filter’s cut-off frequency, from 5 Hz to 10 kHz. Above it the sound is cut away, so turning left makes whatever goes through darker. With RESPONSE high it is the pitch of the filter’s own sine tone.',
});
text(935, 85, 'RESPONSE', 13);
knob('vcf.response', 935, 158, 'yellow', {
  def: 0,
  module: 'filter',
  scale: {
    ticks: 11,
    labels: [
      { at: 0, text: 'Low Pass' },
      { at: 10, text: 'Osc.' },
    ],
    size: 11,
    numR: 1.85,
    tickR: 1.24,
  },
  fmt: (v) => (v >= 6.6 ? 'oscillating' : v >= 4.5 ? 'sharp peak' : 'low-pass'),
  help: 'Resonance. At 0 the filter just cuts the top off. Around 5 to 6 it rings sharply at the FREQUENCY setting; a little further and it whistles on its own, a pure sine tone that needs nothing pinned into it.',
});
text(1060, 85, 'LEVEL', 13);
knob('vcf.level', 1060, 158, 'white', {
  def: 0,
  module: 'filter',
  fmt: (v) => fmtV(lvl(v, 2)),
  name: 'Filter LEVEL',
  help: 'How much of the filter’s output reaches matrix row 10.',
});
box(1060, 226, 10);

// ── Envelope shaper ───────────────────────────────────────────────────────
tab(705, 267, 'ENVELOPE SHAPER');
box(803, 267, 'D');
const ENV_Y = 382;
text(665, 302, 'ATTACK', 13);
decor.push({ t: 'led', x: 727, y: 300, r: 8, color: 'red', litWhen: 'env1' });
text(790, 302, 'ON', 13);
text(925, 302, 'DECAY', 13);
box(966, 298, 'L');
text(1050, 302, 'OFF', 13);
const tScale = (lo: string, hi: string): KnobScale => ({
  ticks: 11,
  labels: [
    { at: 0, text: lo },
    { at: 10, text: hi },
  ],
  size: 11,
  numR: 1.78,
  tickR: 1.24,
});
knob('env.attack', 665, ENV_Y, 'red', {
  def: 0,
  module: 'env',
  scale: tScale('Fast', 'Slow'),
  fmt: (v) => fmtTime(attackS(v)),
  name: 'Envelope ATTACK',
  help: 'How long the envelope takes to rise, from 2 ms to 1 second.',
});
knob('env.on', 790, ENV_Y, 'red', {
  def: 2,
  module: 'env',
  scale: tScale('0', 'Long'),
  fmt: (v) => fmtTime(onS(v)),
  name: 'Envelope ON',
  help: 'How long the envelope stays at the top before it falls, up to 2.5 seconds. When a key or the ATTACK button starts it, it also stays up for as long as you hold on.',
});
knob('env.decay', 925, ENV_Y, 'red', {
  def: 4,
  module: 'env',
  scale: tScale('Fast', 'Slow'),
  fmt: (v) => fmtTime(decayS(v)),
  name: 'Envelope DECAY',
  help: 'How long the envelope takes to fall back, from 3 ms to 15 seconds. Pins in column L lengthen or shorten it.',
});
knob('env.off', 1050, ENV_Y, 'red', {
  def: 10,
  module: 'env',
  scale: tScale('0', 'Manual'),
  fmt: (v) => (v >= OFF_MANUAL ? 'manual: waits for a key' : `repeats, off ${fmtTime(offS(v))}`),
  help: 'The rest between cycles. Below about 6 the envelope runs round and round on its own, resting this long between cycles. Past 6 it stops after each decay and waits for a key or the ATTACK button.',
});
text(1000, 487, 'LEVEL', 13);
text(945, 516, 'TRAPEZOID', 12);
text(1060, 516, 'SIGNAL', 12);
knob('env.trapLevel', 945, 592, 'blue', {
  def: 0,
  module: 'env',
  fmt: (v) => fmtV(lvl(v, 3)),
  name: 'TRAPEZOID LEVEL',
  help: 'How much of the envelope itself, the trapezoid control voltage, reaches matrix row 11. Pin it to a frequency column to sweep pitch or the filter with each envelope.',
});
knob('env.sigLevel', 1060, 592, 'white', {
  def: 0,
  module: 'env',
  fmt: (v) => fmtV(lvl(v, 2.5)),
  name: 'Envelope SIGNAL LEVEL',
  help: 'How much of the shaped signal reaches matrix row 12: whatever is pinned into column D, made louder and quieter by the envelope.',
});
box(945, 660, 11);
box(1060, 660, 12);

// ── Reverberation ─────────────────────────────────────────────────────────
tab(700, 487, 'REVERBERATION');
box(790, 487, 'G');
text(675, 522, 'MIX', 13);
box(708, 518, 'M');
knob('rev.mix', 675, 592, 'blue', {
  def: 5,
  module: 'fx',
  scale: tScale('Dry', 'Reverb'),
  fmt: (v) => `${Math.round(v * 9.5)}% spring`,
  name: 'Reverb MIX',
  help: 'The balance of the reverberation unit’s output, from the dry signal at 0 to nearly all spring at 10. Pins in column M move it.',
});
text(800, 522, 'LEVEL', 13);
knob('rev.level', 800, 592, 'white', {
  def: 0,
  module: 'fx',
  fmt: (v) => fmtV(lvl(v, 2)),
  name: 'Reverb LEVEL',
  help: 'How much of the reverberation unit’s output reaches matrix row 14.',
});
box(800, 660, 14);

// ── Output filters and speakers ───────────────────────────────────────────
tab(740, 707, 'OUTPUT FILTER');
text(675, 742, 'CHANNEL 1', 13);
text(800, 742, 'CHANNEL 2', 13);
[1, 2].forEach((ch) => {
  const x = ch === 1 ? 675 : 800;
  knob(`out${ch}.filter`, x, 822, 'white', {
    def: 5,
    module: 'out',
    scale: tScale('Low', 'High'),
    name: `OUTPUT FILTER CHANNEL ${ch}`,
    fmt: (v) => (Math.abs(v - 5) < 0.15 ? 'flat' : v < 5 ? 'treble cut' : 'bass cut'),
    help: `Tone of output channel ${ch}. At 5 it is flat. Turn left to cut the treble, right to cut the bass. Put it back to 5 for each new patch.`,
  });
  controls.push({
    id: `out${ch}.speaker`,
    type: 'toggle',
    w: 20,
    x,
    y: 922,
    kind: 'bool',
    def: true,
    module: 'out',
    labelPos: 'none',
    name: `Speaker ${ch} switch`,
    help: `Switches the internal speaker of channel ${ch} on (up) or off. This app plays the L and R signal outputs, which the switch does not affect, so it changes nothing here.`,
  });
  text(x + 22, 914, 'ON', 10, { anchor: 'start' });
  text(x + 22, 942, 'MUTE', 10, { anchor: 'start' });
});
text(738, 962, 'SPEAKERS', 11);

// ── Meter ─────────────────────────────────────────────────────────────────
decor.push(
  { t: 'rect', x: 920, y: 728, w: 150, h: 120, r: 6, fill: '#f6f5ee', stroke: '#9a9a95', sw: 3 },
  { t: 'arc', x: 995, y: 830, r: 72, a0: -50, a1: 50, w: 2 }
);
for (let k = 0; k <= 10; k++) {
  const a = (-50 + 10 * k) * (Math.PI / 180);
  decor.push({
    t: 'line',
    x1: 995 + Math.sin(a) * 72,
    y1: 830 - Math.cos(a) * 72,
    x2: 995 + Math.sin(a) * (k % 5 ? 64 : 58),
    y2: 830 - Math.cos(a) * (k % 5 ? 64 : 58),
    w: 1.5,
  });
}
decor.push(
  { t: 'line', x1: 995, y1: 830, x2: 955, y2: 776, w: 2.5 },
  { t: 'circle', x: 995, y: 832, r: 8, fill: '#2a2a2c', sw: 1 }
);
box(995, 872, 'A');
controls.push({
  id: 'meter.mode',
  type: 'toggle',
  w: 20,
  x: 1092,
  y: 790,
  kind: 'enum',
  ui: true,
  module: 'util',
  labelPos: 'none',
  name: 'METER range switch',
  options: [
    { v: 'signal', label: 'SIGNAL LEVELS' },
    { v: 'control', label: 'CONTROL VOLTAGES' },
  ],
  def: 'signal',
  help: 'Sets the meter to read signal levels (an AC level, zero on the left) or control voltages (DC, zero in the middle). The meter reads matrix column A. It is drawn for reference: its needle does not move in this app.',
});
text(1092, 740, 'SIGNAL\nLEVELS', 10);
text(1092, 828, 'CONTROL\nVOLTS', 10);
text(1000, 958, 'METER', 12);

// ── Lower panel: the matrix ───────────────────────────────────────────────
const MX = 1400,
  MY = 182,
  MP = 30;
decor.push({
  t: 'rect',
  x: MX - 21,
  y: MY - 21,
  w: MP * 15 + 42,
  h: MP * 15 + 42,
  r: 4,
  fill: '#121214',
  stroke: INK,
  sw: 2,
});
decor.push(
  {
    t: 'line',
    x1: MX + MP * 7.5,
    y1: MY - 21,
    x2: MX + MP * 7.5,
    y2: MY + MP * 15 + 21,
    w: 2,
    opacity: 0.6,
  },
  {
    t: 'line',
    x1: MX - 21,
    y1: MY + MP * 7.5,
    x2: MX + MP * 15 + 21,
    y2: MY + MP * 7.5,
    w: 2,
    opacity: 0.6,
  }
);
text(MX + MP * 3.5, 30, 'SIGNAL INPUTS', 12, { weight: 700 });
text(MX + MP * 11.5, 30, 'CONTROL INPUTS', 12, { weight: 700 });
decor.push({
  t: 'path',
  d: `M${MX - 8} 44 V38 H${MX + MP * 7 + 8} V44 M${MX + MP * 8 - 8} 44 V38 H${MX + MP * 15 + 8} V44`,
  w: 1.5,
});
text(1290, 160, 'SOURCES', 12, { weight: 700 });

const rowIds: string[] = [];
const colIds: string[] = [];
/** A matrix row: an output jack drawn as its legend, `gain` = its numbered LEVEL knob in volts. */
const row = (
  n: number,
  id: string,
  label: string,
  signal: string | null,
  gain: OutputJack['gain'],
  help: string,
  rest: RowRest = {}
): void => {
  const y = MY + (n - 1) * MP;
  rowIds.push(id);
  jacks.push({
    id,
    x: 1285,
    y,
    r: 12,
    label,
    name: `${label} (row ${n})`,
    labelPos: 'none',
    dir: 'out',
    signal,
    gain,
    help,
    ...rest,
  });
  text(1372, y + 5, String(n), 13, { anchor: 'end', weight: 700 });
  text(1186, y + 5, label, 13, { anchor: 'start' });
};
/** A matrix column: an input jack drawn as its letter and its name standing above it. Pins add, so every column sums. */
const col = (
  k: number,
  id: string,
  letter: string,
  label: string,
  dest: string | null,
  amt: number,
  help: string,
  rest: ColRest = {}
): void => {
  const x = MX + k * MP;
  colIds.push(id);
  jacks.push({
    id,
    x,
    y: 104,
    r: 12,
    label,
    name: `${label} (column ${letter})`,
    labelPos: 'none',
    dir: 'in',
    dest,
    amt,
    add: true,
    help,
    ...rest,
  });
  text(x, MY - 26, letter, 13, { weight: 700 });
  text(x + 4, 138, label, 11, { anchor: 'start', rotate: -90 });
};
const levelCheck =
  (id: string, knobName: string, n: number) =>
  (v: ControlValues): string | null =>
    num(v, id) <= 0 ? `${knobName} is at 0, so nothing leaves row ${n}. Turn it up.` : null;

row(
  1,
  'r.osc1sine',
  'Osc 1 sine',
  'o1sine',
  (v) => lvl(num(v, 'osc1.sine'), 1.5),
  'Oscillator 1’s sine wave, at the level of its sine LEVEL knob (marked 1). The SHAPE knob bends it.',
  { check: levelCheck('osc1.sine', 'Oscillator 1 sine LEVEL', 1) }
);
row(
  2,
  'r.osc1ramp',
  'Osc 1 ramp',
  'o1saw',
  (v) => lvl(num(v, 'osc1.ramp'), 2),
  'Oscillator 1’s ramp (a sawtooth), at the level of its ramp LEVEL knob (marked 2).',
  { check: levelCheck('osc1.ramp', 'Oscillator 1 ramp LEVEL', 2) }
);
row(
  3,
  'r.osc2sq',
  'Osc 2 square',
  'o2pulse',
  (v) => lvl(num(v, 'osc2.square'), 2),
  'Oscillator 2’s square, a pulse when SHAPE is off centre, at the level of the knob marked 3.',
  { check: levelCheck('osc2.square', 'Oscillator 2 square LEVEL', 3) }
);
row(
  4,
  'r.osc2tri',
  'Osc 2 triangle',
  'o2tri',
  (v) => lvl(num(v, 'osc2.tri'), 1.5),
  'Oscillator 2’s triangle, a ramp when SHAPE is off centre, at the level of the knob marked 4.',
  { check: levelCheck('osc2.tri', 'Oscillator 2 triangle LEVEL', 4) }
);
row(
  5,
  'r.osc3sq',
  'Osc 3 square',
  'o3pulse',
  (v) => lvl(num(v, 'osc3.square'), 2),
  'Oscillator 3’s square or pulse, at the level of the knob marked 5. At low settings of its FREQUENCY it is a slow on-off switch.',
  { check: levelCheck('osc3.square', 'Oscillator 3 square LEVEL', 5) }
);
row(
  6,
  'r.osc3tri',
  'Osc 3 triangle',
  'o3tri',
  (v) => lvl(num(v, 'osc3.tri'), 1.5),
  'Oscillator 3’s triangle or ramp, at the level of the knob marked 6. Slow, it is the VCS3’s usual sweep and vibrato source.',
  { check: levelCheck('osc3.tri', 'Oscillator 3 triangle LEVEL', 6) }
);
row(
  7,
  'r.noise',
  'Noise',
  'noise',
  (v) => lvl(num(v, 'noise.level'), 1.5),
  'The noise generator, coloured by COLOUR, at the level of the knob marked 7.',
  { check: levelCheck('noise.level', 'Noise LEVEL', 7) }
);
row(
  8,
  'r.in1',
  'Input ch 1 (keyboard)',
  'kbd',
  (v) => -0.081 * num(v, 'in.ch1'),
  'Input channel 1. In this app the keyboard is plugged into it, as an EMS DK1 keyboard would be, so this row carries the pitch of the last key played. The input amplifier turns the voltage upside down; the oscillators rise in pitch as their voltage falls, so the two cancel and higher keys play higher notes.',
  { check: levelCheck('in.ch1', 'INPUT LEVEL CHANNEL 1', 8) }
);
row(
  9,
  'r.in2',
  'Input ch 2',
  null,
  0,
  'Input channel 2. Nothing is plugged into it in this app, so this row is always silent.'
);
row(
  10,
  'r.vcf',
  'Filter',
  'vcf1',
  (v) => lvl(num(v, 'vcf.level'), 2) * filterOscBoost(v),
  'The filter’s output, at the level of the filter LEVEL knob (marked 10).',
  { check: levelCheck('vcf.level', 'Filter LEVEL', 10) }
);
row(
  11,
  'r.trap',
  'Trapezoid',
  'trap',
  (v) => lvl(num(v, 'env.trapLevel'), 3),
  'The envelope shaper’s control voltage, the trapezoid, at the level of the knob marked 11. It goes negative while the envelope is up and positive while it rests.',
  { check: levelCheck('env.trapLevel', 'TRAPEZOID LEVEL', 11) }
);
row(
  12,
  'r.envsig',
  'Envelope signal',
  'vca',
  (v) => lvl(num(v, 'env.sigLevel'), 2.5),
  'Whatever is pinned into column D, shaped by the envelope, at the level of the SIGNAL knob (marked 12).',
  { check: levelCheck('env.sigLevel', 'Envelope SIGNAL LEVEL', 12) }
);
row(
  13,
  'r.ring',
  'Ring modulator',
  'ring',
  (v) => lvl(num(v, 'ring.level'), RING_GAIN),
  'The ring modulator’s output: columns E and F multiplied, at the level of the knob marked 13.',
  { check: levelCheck('ring.level', 'Ring modulator LEVEL', 13) }
);
row(
  14,
  'r.rev',
  'Reverberation',
  'rev',
  (v) => lvl(num(v, 'rev.level'), 2),
  'The reverberation unit’s output, already mixed dry and wet by MIX, at the level of the knob marked 14.',
  { check: levelCheck('rev.level', 'Reverb LEVEL', 14) }
);
row(
  15,
  'r.joyx',
  'Stick (horizontal)',
  'joyX',
  (v) => (2 * num(v, 'joy.rangeX')) / 10,
  'The joystick’s left-right position: 0 V in the middle, up to 2 V either way, scaled by the RANGE knob marked 15.',
  { check: levelCheck('joy.rangeX', 'The horizontal RANGE', 15) }
);
row(
  16,
  'r.joyy',
  'Stick (vertical)',
  'joyY',
  (v) => (2 * num(v, 'joy.rangeY')) / 10,
  'The joystick’s up-down position: 0 V in the middle, up to 2 V either way, scaled by the RANGE knob marked 16.',
  { check: levelCheck('joy.rangeY', 'The vertical RANGE', 16) }
);

// What the explainer says for columns whose effect the generic text cannot know. `x` = the source as the explainer sees it.
const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const slow = (x: JackHearContext): boolean => !['audio', 'noise', 'fast'].includes(x.kind);
const panWord = (p: number): string =>
  p <= 1.5
    ? 'left'
    : p >= 8.5
      ? 'right'
      : p > 3.5 && p < 6.5
        ? 'centre'
        : p < 5
          ? 'left of centre'
          : 'right of centre';
const outHear =
  (ch: number, lvlCol: string): Hear =>
  (v, x) =>
    slow(x)
      ? `${cap(x.src)} is a control voltage, not a sound, so at output channel ${ch} it gives clicks at most. On the hardware this is how a voltage leaves the VCS3: the CONTROL OUTPUT ${ch} socket on the back carries column ${ch === 1 ? 'B' : 'C'}.`
      : `${cap(x.src)} goes to output channel ${ch}: through its amplifier, set by OUTPUT LEVEL and anything pinned into column ${lvlCol}, then its OUTPUT FILTER, then to the ${panWord(num(v, `out${ch}.pan`))} of the stereo output.`;
const outCheck =
  (ch: number, lvlCol: string) =>
  (v: ControlValues): string | null =>
    !v['power']
      ? 'The mains switch is off.'
      : num(v, `out${ch}.level`) <= 5
        ? `OUTPUT LEVEL ${ch} is at ${Math.round(num(v, `out${ch}.level`) * 10) / 10}. Its amplifier only opens past 5 (unless a voltage is pinned into column ${lvlCol}), so turn it up past 5.`
        : null;
const lvlHear =
  (ch: number): Hear =>
  (_v, x) => {
    const what = `the loudness of output channel ${ch}`;
    if (x.kind === 'env')
      return `${cap(x.src)} now moves ${what}. It swings negative while the envelope is up, so the channel gets quieter as each envelope rises and comes back as it falls: an upside-down envelope. Its resting voltage also opens the channel, so turn OUTPUT LEVEL down to compensate.`;
    if (x.kind === 'lfo')
      return `Tremolo: ${what} rises and falls with ${x.live}. Pin a slow oscillator here and another to the other channel, a little out of step, and the sound swings between the speakers.`;
    if (x.kind === 'audio' || x.kind === 'noise')
      return `${cap(x.src)} shakes ${what} at audio rate: amplitude modulation, which adds ring-modulator-like overtones.`;
    return `${cap(x.src)} now adds to OUTPUT LEVEL ${ch}: a higher voltage opens the channel further, a lower one closes it.`;
  };

col(
  0,
  'c.meter',
  'A',
  'Meter',
  null,
  1,
  'The meter, and the SCOPE socket on the back. Pins here are measured, not heard. The meter is drawn for reference: its needle does not move in this app.'
);
col(
  1,
  'c.out1',
  'B',
  'Output ch 1',
  'out1In',
  PIN,
  'Output channel 1. Anything pinned here goes through its amplifier and OUTPUT FILTER to the outputs. Every patch has to end in column B or C to be heard.',
  { hear: outHear(1, 'O'), check: outCheck(1, 'O') }
);
col(
  2,
  'c.out2',
  'C',
  'Output ch 2',
  'out2In',
  PIN,
  'Output channel 2. Anything pinned here goes through its amplifier and OUTPUT FILTER to the outputs.',
  { hear: outHear(2, 'P'), check: outCheck(2, 'P') }
);
col(
  3,
  'c.env',
  'D',
  'Envelope in',
  'vcaIn',
  PIN,
  'The envelope shaper’s signal input. What is pinned here comes out on row 12, made louder and quieter by the envelope.',
  {
    hear: (_v, x) =>
      slow(x)
        ? `${cap(x.src)} is a control voltage, not a sound; the envelope shaper would only make it rise and fall in steps.`
        : `${cap(x.src)} now goes through the envelope shaper’s amplifier: it rises and falls with each envelope. It comes out on row 12 at the SIGNAL LEVEL knob, so pin row 12 to an output to hear it.`,
  }
);
col(
  4,
  'c.ringA',
  'E',
  'Ring mod A',
  'ringA',
  PIN,
  'Ring modulator input A. The output, on row 13, is input A times input B: neither pitch survives, only their sum and difference.'
);
col(
  5,
  'c.ringB',
  'F',
  'Ring mod B',
  'ringB',
  PIN,
  'Ring modulator input B. Both inputs block steady voltages, so a slow signal only gets through while it is changing.'
);
col(
  6,
  'c.rev',
  'G',
  'Reverb in',
  'revIn',
  PIN,
  'The reverberation unit’s input. Its output, already mixed dry and wet by MIX, is on row 14.',
  {
    hear: (v, x) =>
      `${cap(x.src)} now feeds the spring reverberation unit. It comes out on row 14 at the reverb LEVEL knob, mixed ${num(v, 'rev.mix') < 1 ? 'almost all dry' : num(v, 'rev.mix') > 8 ? 'almost all spring' : 'dry and spring'} by MIX. Pin row 14 to an output to hear it.`,
  }
);
col(
  7,
  'c.vcf',
  'H',
  'Filter in',
  'vcfIn',
  PIN,
  'The filter’s signal input. The filtered sound comes out on row 10.',
  {
    hear: (v, x) =>
      slow(x)
        ? `${cap(x.src)} is a control voltage, not a sound. Fed into the filter it gives clicks at most${num(v, 'vcf.response') >= 5 ? ', though with RESPONSE this high each click makes the filter ring' : ''}.`
        : `The filter now takes ${x.src}. Turn FREQUENCY down to darken it and RESPONSE up to make it ring. The result is on row 10 at the filter LEVEL knob, so pin row 10 to an output (or to column D first, to give it an envelope).`,
  }
);
const pitchHear =
  (n: number): Hear =>
  (_v, x) => {
    if (x.kind !== 'kbd') return null;
    const per = x.amount / 12;
    return `Oscillator ${n} now follows the keyboard: ${Math.round(per * 100) / 100} semitones per key${Math.abs(per - 1) < 0.04 ? ', in tune' : per < 1 ? ', so scales come out squeezed' : ', so scales come out stretched'}. FREQUENCY still sets where the keyboard starts.${n === 3 ? ' Oscillator 3 is more sensitive than the other two, so the same INPUT LEVEL spreads its notes wider.' : ''}`;
  };
col(
  8,
  'c.osc1',
  'I',
  'Osc 1 frequency',
  'pitch1',
  (-12 * PIN) / 0.32,
  'Oscillator 1’s frequency control. Pins here add to the FREQUENCY dial. A voltage that goes down raises the pitch.',
  { hear: pitchHear(1) }
);
col(
  9,
  'c.osc2',
  'J',
  'Osc 2 frequency',
  'pitch2',
  (-12 * PIN) / 0.32,
  'Oscillator 2’s frequency control. Pins here add to the FREQUENCY dial. A voltage that goes down raises the pitch.',
  { hear: pitchHear(2) }
);
col(
  10,
  'c.osc3',
  'K',
  'Osc 3 frequency',
  'pitch3',
  (-12 * PIN) / 0.26,
  'Oscillator 3’s frequency control. Pins here add to the FREQUENCY dial. A voltage that goes down raises the speed.',
  { hear: pitchHear(3) }
);
col(
  11,
  'c.decay',
  'L',
  'Envelope decay',
  'decayCv',
  PIN / 0.4,
  'The envelope’s decay time. A rising voltage lengthens DECAY, doubling it for every 0.4 V, and so also slows the repeats.',
  {
    hear: (_v, x) =>
      x.kind === 'lfo' || x.kind === 'env'
        ? `${cap(x.live)} now lengthens and shortens each DECAY as it moves, so the envelopes ring for different lengths and, while the envelope repeats, come at an uneven pace.`
        : x.kind === 'kbd'
          ? 'Each note’s DECAY now depends on the key: higher keys give shorter notes.'
          : `${cap(x.src)} now moves the DECAY time quickly, so each envelope falls in a ragged, uneven way.`,
  }
);
col(
  12,
  'c.revMix',
  'M',
  'Reverb mix',
  'revMix',
  PIN / 4,
  'The reverberation unit’s MIX. A rising voltage makes it wetter: −2 V is dry and +2 V full.',
  {
    hear: (_v, x) =>
      x.kind === 'lfo' || x.kind === 'env'
        ? `The reverb comes and goes with ${x.live}: wetter as the voltage rises, drier as it falls.`
        : `${cap(x.src)} now moves the reverb MIX, so the amount of spring changes with it.`,
  }
);
col(
  13,
  'c.cutoff',
  'N',
  'Filter frequency',
  'cutoff',
  -PIN / 0.2,
  'The filter’s frequency control. Pins here add to the FREQUENCY knob. A voltage that goes down raises the frequency.'
);
col(
  14,
  'c.lvl1',
  'O',
  'Output ch 1 level',
  'out1Lvl',
  PIN * 0.5,
  'Output channel 1’s level control. A voltage here adds to the OUTPUT LEVEL knob, which is itself a control voltage.',
  { hear: lvlHear(1) }
);
col(
  15,
  'c.lvl2',
  'P',
  'Output ch 2 level',
  'out2Lvl',
  PIN * 0.5,
  'Output channel 2’s level control. A voltage here adds to the OUTPUT LEVEL knob, which is itself a control voltage.',
  { hear: lvlHear(2) }
);

// ── Lower panel: ATTACK button, power, output amplifiers, joystick ────────
text(1968, 196, 'ATTACK', 13, { weight: 700 });
controls.push({
  id: 'env.button',
  type: 'button',
  w: 46,
  h: 46,
  x: 1968,
  y: 245,
  kind: 'bool',
  def: false,
  module: 'env',
  labelPos: 'none',
  name: 'ATTACK button',
  face: 'ring',
  faceColor: 'red',
  caption: '',
  help: 'Starts the envelope by hand, like a key. Click to hold it down (lit) and click again to let go: the envelope stays at the top for as long as it is held, then decays.',
});
text(1968, 62, 'MAINS', 13, { weight: 700 });
controls.push({
  id: 'power',
  type: 'toggle',
  w: 22,
  x: 1940,
  y: 102,
  kind: 'bool',
  def: true,
  module: 'out',
  labelPos: 'none',
  name: 'MAINS switch',
  help: 'Power. Off silences everything.',
});
decor.push({ t: 'led', x: 2000, y: 102, r: 8, color: 'red', litWhen: { id: 'power', eq: true } });

tab(1300, 700, 'OUTPUT CH 1');
box(1378, 700, 'B');
box(1400, 700, 'O');
tab(1555, 700, 'OUTPUT CH 2');
box(1633, 700, 'C');
box(1655, 700, 'P');
const outLevelScale: KnobScale = {
  nums: [0, 2, 4, 6, 8, 10],
  ticks: 11,
  size: 12,
  numR: 1.55,
  tickR: 1.22,
};
[1, 2].forEach((ch) => {
  const lx = ch === 1 ? 1255 : 1610,
    px = ch === 1 ? 1365 : 1500;
  text(lx, 760, 'LEVEL', 13);
  text(px, 760, 'PAN (EXT)', 13);
  controls.push({
    id: `out${ch}.level`,
    type: 'knob',
    x: lx,
    y: 850,
    r: 36,
    style: 'vcs3',
    cap: CAP.white,
    kind: 'cont',
    min: 0,
    max: 10,
    def: 8,
    module: 'out',
    labelPos: 'none',
    scale: outLevelScale,
    name: `OUTPUT LEVEL CHANNEL ${ch}`,
    fmt: (v) => (v <= 5 ? 'shut (opens past 5)' : `${Math.round((v - 5) * 20)}% open`),
    help: `Level of output channel ${ch}. The knob is a control voltage for the channel’s amplifier, not a plain volume: with nothing pinned into column ${ch === 1 ? 'O' : 'P'} the sound only comes in past half way, and a voltage pinned there adds to it.`,
  });
  controls.push({
    id: `out${ch}.pan`,
    type: 'knob',
    x: px,
    y: 850,
    r: 29,
    style: 'vcs3',
    cap: CAP.green,
    kind: 'cont',
    min: 0,
    max: 10,
    def: ch === 1 ? 0 : 10,
    module: 'out',
    labelPos: 'none',
    scale: {
      ticks: 11,
      labels: [
        { at: 0, text: 'Left' },
        { at: 10, text: 'Right' },
      ],
      size: 11,
      numR: 1.75,
      tickR: 1.24,
    },
    name: `PAN CHANNEL ${ch}`,
    fmt: (v) => panWord(v),
    help: `Where output channel ${ch} sits between the left and right outputs. The internal speakers do not pan; this app plays the panned L and R outputs.`,
  });
});
text(1438, 960, 'Every patch ends at column B or C: pin a row there, and turn LEVEL past 5', 11, {
  hw: true,
});

tab(1880, 700, 'JOYSTICK');
const rangeKnob = (id: string, y: number, n: number, axis: string): void => {
  text(1748, y - 46, 'RANGE', 12);
  controls.push({
    id,
    type: 'knob',
    x: 1748,
    y,
    r: 24,
    style: 'vcs3',
    cap: CAP.blue,
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    module: 'mod',
    labelPos: 'none',
    scale: { ticks: 11, size: 10, numR: 1.6, tickR: 1.24 },
    name: `RANGE (${axis})`,
    fmt: (v) => `±${Math.round(v * 2) / 10} V`,
    help: `How far the joystick’s ${axis} movement reaches: nothing at 0, up to 2 V either way at 10. It scales matrix row ${n}.`,
  });
  box(1748, y + 42, n);
};
rangeKnob('joy.rangeX', 790, 15, 'horizontal');
rangeKnob('joy.rangeY', 925, 16, 'vertical');
controls.push(
  {
    id: 'joy.x',
    type: 'joystick',
    pair: 'joy.y',
    x: 1915,
    y: 850,
    r: 82,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (left-right)',
    fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`,
    help: 'The joystick. Its left-right position is a voltage on matrix row 15, scaled by the RANGE knob marked 15. Drag the stick; double-click to centre it.',
  },
  {
    id: 'joy.y',
    type: 'joystick',
    pairOf: 'joy.x',
    x: 1915,
    y: 851,
    r: 82,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (up-down)',
    fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`,
    help: 'The joystick’s up-down position, a voltage on matrix row 16 scaled by the RANGE knob marked 16. Drawn as part of the joystick.',
  }
);

// ── Areas ─────────────────────────────────────────────────────────────────
const oscHelp = (n: number): string =>
  n === 3
    ? 'Oscillator 3 is built slow: from about a cycle a minute up to 500 Hz, so it is the VCS3’s source of sweeps, wobbles and trills, the job an LFO does elsewhere. Like Oscillator 2 it has a square (row 5) and a triangle (row 6), both changed by SHAPE. It is only audible near the top of its range.'
    : n === 1
      ? 'Oscillator 1 makes a sine (row 1) and a ramp (row 2), each with its own LEVEL knob. SHAPE bends the sine only. The large dial sets the pitch over the whole range, 1.5 octaves per division. Nothing is heard until a row is pinned to an output.'
      : 'Oscillator 2 makes a square (row 3) and a triangle (row 4). One SHAPE knob changes both: off centre the square becomes a pulse and the triangle a ramp. The large dial sets the pitch.';
const areas: Area[] = [
  {
    id: 'osc1',
    label: 'Oscillator 1',
    module: 'osc',
    keywords: 'vco sine ramp sawtooth pitch frequency dial',
    rects: [{ x: 50, y: 28, w: 550, h: 217 }],
    help: oscHelp(1),
  },
  {
    id: 'osc2',
    label: 'Oscillator 2',
    module: 'osc',
    keywords: 'vco square pulse triangle pitch frequency dial pulse width',
    rects: [{ x: 50, y: 245, w: 550, h: 220 }],
    help: oscHelp(2),
  },
  {
    id: 'osc3',
    label: 'Oscillator 3',
    module: 'lfo',
    keywords: 'lfo vibrato wobble sweep slow modulation',
    rects: [{ x: 50, y: 465, w: 550, h: 220 }],
    help: oscHelp(3),
  },
  {
    id: 'noise',
    label: 'Noise generator',
    module: 'osc',
    keywords: 'white noise pink wind hiss colour',
    rects: [{ x: 50, y: 685, w: 280, h: 290 }],
    help: 'Noise for wind, surf, breath and percussion. COLOUR tilts it from a dark rumble through white noise to a thin hiss; LEVEL sets how much reaches row 7.',
  },
  {
    id: 'input',
    label: 'Input level',
    module: 'util',
    keywords: 'keyboard dk1 input amplifier external tracking',
    rects: [{ x: 330, y: 685, w: 270, h: 290 }],
    help: 'The two input amplifiers bring outside signals onto rows 8 and 9. In this app the keyboard is plugged into channel 1, as an EMS DK1 keyboard would be: pin row 8 to an oscillator’s frequency column to play it, and set CHANNEL 1 to about 5 for one semitone per key.',
  },
  {
    id: 'ring',
    label: 'Ring modulator',
    module: 'util',
    keywords: 'ring mod bell metallic multiply',
    rects: [{ x: 600, y: 28, w: 145, h: 217 }],
    help: 'Multiplies the two signals pinned into columns E and F. Neither input survives, only their sum and difference frequencies: bells, clangs and robot voices. Its LEVEL knob sets row 13.',
  },
  {
    id: 'filter',
    label: 'Filter/oscillator',
    module: 'filter',
    keywords: 'vcf cutoff resonance response sine oscillator',
    rects: [{ x: 745, y: 28, w: 375, h: 217 }],
    help: 'A low-pass filter for whatever is pinned into column H. FREQUENCY sets where it cuts and RESPONSE adds resonance; turn RESPONSE past about 6 and the filter becomes a pure sine oscillator. Its output is row 10. Column N moves FREQUENCY.',
  },
  {
    id: 'env',
    label: 'Envelope shaper',
    module: 'env',
    keywords: 'envelope trapezoid attack decay hold repeat loop vca amplifier',
    rects: [
      { x: 600, y: 245, w: 520, h: 220 },
      { x: 880, y: 465, w: 240, h: 220 },
    ],
    help: 'An envelope with its own amplifier. ATTACK, ON (hold), DECAY and OFF (rest) make a cycle that repeats on its own until OFF is past about 6; then it waits for a key or the ATTACK button. Whatever is pinned into column D comes out on row 12 shaped by it, and the envelope itself, the trapezoid, is on row 11. The lamp is bright while the envelope is up.',
  },
  {
    id: 'reverb',
    label: 'Reverberation',
    module: 'fx',
    keywords: 'reverb spring echo space',
    rects: [{ x: 600, y: 465, w: 280, h: 220 }],
    help: 'A spring reverb for whatever is pinned into column G. MIX sets the balance of dry and spring in its output, row 14, and column M moves MIX.',
  },
  {
    id: 'outfilter',
    label: 'Output filters and speakers',
    module: 'out',
    keywords: 'tone treble bass mute speaker',
    rects: [{ x: 600, y: 685, w: 280, h: 290 }],
    help: 'A tone control for each output channel: flat at 5, left cuts treble, right cuts bass. The switches mute the internal speakers, which this app does not play.',
  },
  {
    id: 'meter',
    label: 'Meter',
    module: 'util',
    keywords: 'meter scope voltmeter level',
    rects: [{ x: 880, y: 685, w: 240, h: 290 }],
    help: 'A meter on matrix column A, for checking signal levels and control voltages. It is drawn for reference and does not move in this app.',
  },
  {
    id: 'sources',
    label: 'Matrix rows (sources)',
    module: 'patch',
    keywords: 'pins matrix rows outputs patch',
    rects: [{ x: 1176, y: 150, w: 202, h: 498 }],
    help: 'Every output in the VCS3 has a row of the matrix, numbered like the LEVEL knob that sets it. A row can be pinned to any number of columns at once.',
  },
  {
    id: 'dests',
    label: 'Matrix columns (destinations)',
    module: 'patch',
    keywords: 'pins matrix columns inputs patch',
    rects: [{ x: 1380, y: 20, w: 490, h: 140 }],
    help: 'Every input has a column, lettered like the knob it adds to. A to H are signal inputs (the meter, the two outputs, the envelope shaper, the ring modulator, the reverb and the filter); I to P are control inputs, which add to the knob with the same letter.',
  },
  {
    id: 'matrix',
    label: 'Pin matrix',
    module: 'patch',
    keywords: 'pin board patch bay routing connection',
    rects: [{ x: 1380, y: 162, w: 490, h: 486 }],
    help: 'Nothing on the VCS3 is connected until a pin goes in. A pin joins a row (an output) to a column (an input); pins in one column add together, and one row can feed many columns. Click a hole to put a pin in or take it out, and point at one to read what it does.',
  },
  {
    id: 'start',
    label: 'ATTACK button and mains',
    module: 'env',
    keywords: 'trigger gate power button',
    rects: [{ x: 1878, y: 20, w: 178, h: 300 }],
    help: 'The ATTACK button starts the envelope shaper by hand, like a key. The MAINS switch is the power, with its neon beside it.',
  },
  {
    id: 'outputs',
    label: 'Output amplifiers',
    module: 'out',
    keywords: 'volume level pan stereo vca amplifier output',
    rects: [{ x: 1176, y: 668, w: 520, h: 318 }],
    help: 'Two output channels, fed by columns B and C. Each LEVEL knob is a control voltage for its amplifier, so the sound only comes in past half way; columns O and P add to it. PAN places each channel between left and right.',
  },
  {
    id: 'joystick',
    label: 'Joystick',
    module: 'mod',
    keywords: 'joystick controller xy performance',
    rects: [{ x: 1698, y: 668, w: 358, h: 318 }],
    help: 'Two voltages from one stick: left-right on row 15 and up-down on row 16, each scaled by its RANGE knob. Pin them to frequency columns to bend pitch, or to the output levels to pan and fade by hand.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues): EngineParams {
  const skew = (s: number): number => clamp(0.5 + (s - 5) / 10, 0.005, 0.995);
  const osc = [1, 2, 3].map((n): OscParams => {
    const f = num(v, `osc${n}.freq`);
    const hz = n === 3 ? osc3Hz(f) : osc12Hz(f);
    // The oscillators feed only the matrix (oscOuts); `level` keeps them counted as running, `mix` is empty, so the
    // engine's built-in mixer stays silent.
    const o: OscParams = {
      level: 1,
      mix: {},
      semi: 0,
      kbd: false,
      fixedNote: noteOf(hz),
      syncTo: -1,
    };
    if (n === 1) o.sineShape = (num(v, 'osc1.shape') - 5) / 5;
    else {
      o.skew = skew(num(v, `osc${n}.shape`));
      o.pw = clamp(o.skew, 0.03, 0.97);
    }
    return o;
  });
  const off = num(v, 'env.off');
  const amp = (ch: number): OutAmpParams => ({
    level: (num(v, `out${ch}.level`) - 5) / 5,
    tone: (num(v, `out${ch}.filter`) - 5) / 5,
    pan: num(v, `out${ch}.pan`) / 10,
  });
  return {
    osc,
    oscOuts: true,
    pwSplit: true,
    noise: { level: 0, color: 'white', tilt: (num(v, 'noise.colour') - 5) / 5 },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.freq')),
      res: pwl(num(v, 'vcf.response'), RES_PTS),
      envAmt: 0,
      envSrc: 'env2',
      kbd: 0,
    },
    env1: { a: 0.01, d: 0.1, s: 0, r: 0.1 },
    env2: { a: 0.001, d: 0.1, s: 1, r: 0.01 },
    trap: {
      a: attackS(num(v, 'env.attack')),
      on: onS(num(v, 'env.on')),
      d: decayS(num(v, 'env.decay')),
      off: off < OFF_MANUAL ? offS(off) : 0,
      auto: off < OFF_MANUAL,
      hold: !!v['env.button'],
    },
    vca: { envSrc: 'env1', bias: 0 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    routes: [],
    // Nothing is wired inside a VCS3: the filter and the envelope shaper hear only what is pinned to them.
    normals: { vcfIn: null, vcaIn: null },
    ring: { ac: true, acB: true },
    rev: { on: true, unit: true, mix: (num(v, 'rev.mix') / 10) * 0.95, decay: 0.86, damp: 0.32 },
    joy: [num(v, 'joy.x'), num(v, 'joy.y')],
    outAmps: [amp(1), amp(2)],
    od: { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 0,
    volume: v['power'] ? 1.1 : 0,
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const emsVcs3: SynthDef & { version: number } = {
  id: 'ems-vcs3',
  version: 1,
  name: 'VCS3 Mk 1',
  maker: 'EMS',
  year: 1969,
  heritage: 'The original “Putney”, designed by David Cockerell for EMS in London',
  summary:
    'A small studio rather than a keyboard synth: three free-running oscillators, noise, a ring modulator, a filter that doubles as a sine oscillator, a repeating trapezoid envelope with its own amplifier and a spring reverb, all connected by pins in a 16 × 16 matrix and heard through two output amplifiers. A joystick gives two voltages; here the keyboard plays through input channel 1, as an EMS DK1 would.',
  view: { w: 2100, h: 1000 },
  theme: {
    panel: PANEL,
    panel2: '#c8c9c3',
    ink: INK,
    font: 'helv',
    cheeks: 'wood',
    cheekW: 40,
    tabs: true,
  },
  matrix: {
    x: MX,
    y: MY,
    pitch: MP,
    rows: rowIds,
    cols: colIds,
    legend: { row: [200, MP - 2], col: [MP - 2, 140] },
  },
  silentInit:
    'Nothing on the VCS3 is connected until a pin is placed, so with no pins it is silent.',
  signalNames: {
    o1sine: 'Oscillator 1’s sine',
    o1saw: 'Oscillator 1’s ramp',
    o2pulse: 'Oscillator 2’s square',
    o2tri: 'Oscillator 2’s triangle',
    o3pulse: 'Oscillator 3’s square',
    o3tri: 'Oscillator 3’s triangle',
    vcf1: 'the filter',
    vca: 'the envelope shaper’s output',
    kbd: 'the keyboard voltage on input channel 1',
    ring: 'the ring modulator',
    rev: 'the reverberation unit',
    noise: 'the noise generator',
  },
  destNames: {
    pitch1: 'Oscillator 1 frequency',
    pitch2: 'Oscillator 2 frequency',
    pitch3: 'Oscillator 3 frequency',
    cutoff: 'the filter frequency',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default emsVcs3;
