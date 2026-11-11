/**
 * Make Noise 0-COAST: the definition. Positions are pixels on the owner's photo of the panel straight on,
 * `.context/app/synth-data/0-coast/raw/0-Coast.jpg` (1200 × 675, local only), turned into view units by X() / Y()
 * (doubled, offset to the faceplate's top-left corner). The data model is the owner's spec,
 * `.context/app/synth-data/0-coast/0-coast.synth.json` (0.13.0): 42 parameters, 30 ports and the printed normals.
 *
 * Engine notes. The one triangle-core oscillator is two engine oscillators at the same pitch, the second hard-synced to
 * the first so they stay in phase: oscillator 1 is the plain triangle (BALANCE's FUND side, and the TRIANGLE and SQUARE
 * jacks through `oscOuts`), oscillator 2 the overtone path (`mix.ovt`: OVERTONE's added harmonic, folded by MULTIPLY,
 * t-239). BALANCE is a crossfade between them: attenuator 2 carries the offset (or the BALANCE CV cable) at the knob's
 * gain, and routes take it from oscillator 1's level and add it to oscillator 2's. DYNAMICS is the low-pass gate:
 * attenuator 1 carries CONTOUR (or the DYNAMICS CV cable) at the knob's gain, and routes open the amplifier and the
 * SVF's cutoff from it together. SLOPE is Envelope 2, curved by its Vari-Response, looping while CYCLE is lit and free
 * of the keys (t-241); CONTOUR is Envelope 1, its DECAY also its release. The clock is the LFO's square at a fixed
 * tempo, the stepped random its sample and hold, and Voltage MATH sum 1.
 *
 * The spec gives no oscillator range, no SLOPE or CONTOUR times and no cutoff for DYNAMICS (`not_in_source`), so every
 * range here is this app's choice, noted where it is set. Knob values are the spec's: unmarked knobs 0–10 from 7:00 to
 * 5:00, attenuverters −5 to +5 (`modelling_gaps`). The program pages, MIDI settings, tap tempo and calibration are
 * drawn and explained but not modelled.
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
  LedColor,
  LitWhen,
  OutputJack,
  SynthDef,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y' | 'labelPos'> &
  Partial<Pick<KnobControl, 'labelPos' | 'labelGap' | 'scale'>> & {
    min?: number;
    max?: number;
    def?: number;
    fmt?: (v: number) => string;
  };
type InRest = Omit<InputJack, 'id' | 'x' | 'y' | 'r' | 'dir' | 'label'>;
type OutRest = Omit<OutputJack, 'id' | 'x' | 'y' | 'r' | 'dir' | 'label'>;
type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'anchor' | 'rotate' | 'brand' | 'hw'>>;

// ── Ranges and tapers (this app's choice unless noted: the spec gives none) ─
/** PITCH: two octaves either side of the centre, added to MIDI A's note. */
const pitchSemi = (v: number): number => (v - 5) * 4.8;
/** FINE: a semitone either side of the centre. */
const fineSemi = (v: number): number => (v - 5) / 5;
/** LIN FM depth, in semitones for a full-scale source: up to four octaves, squared so the first turns are fine. */
const linFmSemi = (v: number): number => Math.pow(clamp(v, 0, 10) / 10, 2) * 48;
/** Where OVERTONE reaches the even harmonic; above it, SLOPE is blended into the audio path. */
const OVT_EVEN = 8.5;
/** OVERTONE: the added harmonic, odd (0) through the transitional state to even (1) at {@link OVT_EVEN}. */
const ovtAmt = (v: number): number => clamp(v / OVT_EVEN, 0, 1);
/** OVERTONE above {@link OVT_EVEN}: how much of SLOPE is added to the audio path, up to its full height at 10. */
const slopeBlend = (v: number): number => clamp((v - OVT_EVEN) / (10 - OVT_EVEN), 0, 1);
/** OVERTONE CV: the spec's "50 % modulation depth" at full: a full-scale source moves OVERTONE half its range. */
const ovtCvAmt = (v: number): number => (clamp(v, 0, 10) / 10) * 0.5;
/** MULTIPLY CV attenuverter (−5..+5): a full-scale source moves MULTIPLY its whole range either way. */
const multCvAmt = (v: number): number => clamp(v, -5, 5) / 5;
/** SLOPE RISE and FALL, each: half a millisecond (so it cycles well into audio rate) to 12 s. */
const slopeTime = (v: number): number => expMap(v / 10, 0.0005, 12);
/** CONTOUR ONSET: 1 ms to 8 s. */
const onsetTime = (v: number): number => expMap(v / 10, 0.001, 8);
/** CONTOUR DECAY, which is also its release: 5 ms to 12 s. */
const decayTime = (v: number): number => expMap(v / 10, 0.005, 12);
/** SLOPE TIME and CONTOUR DECAY inputs: octaves of rate for a full-scale source (positive is faster, t-241). */
const TIME_CV_OCT = 3;
/** DYNAMICS' filter element: closed at this cutoff, opening by {@link LPG_OCT} octaves as its CV reaches 1. */
const LPG_FLOOR_HZ = 50;
const LPG_OCT = 9;
/** The clock's tempo, which tap tempo would set on the hardware: 120 BPM, one pulse a beat. */
const CLOCK_HZ = 2;
/** The triangle's level into BALANCE. */
const TRI = 0.8;

const OX = 95,
  OY = 36; // photo pixel of the view's top-left corner
const K = 2;
const X = (x: number): number => (x - OX) * K;
const Y = (y: number): number => (y - OY) * K;
const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const INK = '#f1f0ea';
const PANEL = '#1c1b1e';
const TRACE = '#8a6a3c';
const PLATE = '#ecebe6';
const WINDOW = '#9a9a6a';

// ── Drawing helpers (photo pixels in, view units out) ──────────────────────
const text = (x: number, y: number, t: string, size = 22, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y) + size * 0.36,
    text: t,
    size,
    anchor: 'middle',
    weight: 600,
    ...rest,
  });
};
const line = (x1: number, y1: number, x2: number, y2: number, stroke?: string, w = 3): void => {
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
/** A copper trace on the panel, showing the normalled flow (printed, so hardware view only). */
const trace = (pts: [number, number][]): void => {
  decor.push({
    t: 'path',
    hw: true,
    d: pts.map(([x, y], i) => `${i ? 'L' : 'M'}${X(x)} ${Y(y)}`).join(' '),
    w: 2.5,
    stroke: TRACE,
    fill: 'none',
  });
};
const box = (x0: number, y0: number, x1: number, y1: number): void => {
  decor.push({
    t: 'rect',
    x: X(x0),
    y: Y(y0),
    w: (x1 - x0) * K,
    h: (y1 - y0) * K,
    r: 4,
    stroke: TRACE,
    sw: 2.5,
    fill: 'none',
    hw: true,
  });
};
/** The white square printed behind a CV input. */
const plate = (x0: number, y0: number, x1: number, y1: number): void => {
  decor.push({
    t: 'rect',
    x: X(x0),
    y: Y(y0),
    w: (x1 - x0) * K,
    h: (y1 - y0) * K,
    r: 3,
    fill: PLATE,
    hw: true,
  });
};
/** A square activity window; the lit ones carry a lamp. */
const lampWindow = (
  cx: number,
  cy: number,
  s: number,
  color?: LedColor,
  litWhen?: LitWhen
): void => {
  decor.push({
    t: 'rect',
    x: X(cx - s / 2),
    y: Y(cy - s / 2),
    w: s * K,
    h: s * K,
    r: 4,
    fill: WINDOW,
    hw: true,
  });
  if (color)
    decor.push({
      t: 'led',
      x: X(cx),
      y: Y(cy),
      r: (s / 2 - 7) * K,
      color,
      ...(litWhen ? { litWhen } : {}),
    });
};
const led = (x: number, y: number, r: number, color: LedColor, litWhen?: LitWhen): void => {
  decor.push({ t: 'led', x: X(x), y: Y(y), r: r * K, color, ...(litWhen ? { litWhen } : {}) });
};

const knob = (id: string, x: number, y: number, r: number, label: string, rest: KnobRest): void => {
  const { min = 0, max = 10, def = 0, fmt, ...common } = rest;
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r: r * K,
    style: 'neutron',
    kind: 'cont',
    min,
    max,
    def,
    ...(fmt ? { fmt } : {}),
    label,
    labelPos: 'none',
    ...common,
  });
};
const button = (
  id: string,
  x: number,
  y: number,
  rest: Omit<ControlCommon, 'id' | 'x' | 'y'> & { def?: boolean; lamp?: boolean }
): void => {
  const { def = false, lamp = false, ...common } = rest;
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: 26,
    h: 26,
    ...(lamp ? { lamp: 'white' as const } : {}),
    kind: 'bool',
    def,
    labelPos: 'none',
    ...common,
  });
};
const jackIn = (id: string, x: number, y: number, label: string, rest: InRest): void => {
  jacks.push({
    id,
    x: X(x),
    y: Y(y),
    r: 20,
    dir: 'in',
    label,
    labelPos: 'none',
    ...rest,
  });
};
const jackOut = (id: string, x: number, y: number, label: string, rest: OutRest): void => {
  jacks.push({
    id,
    x: X(x),
    y: Y(y),
    r: 20,
    dir: 'out',
    label,
    labelPos: 'none',
    ...rest,
  });
};
/** A knob printed with its ends: `left` at 0 and `right` at 10. */
const ends = (left: string, right: string): KnobScale => ({
  labels: [
    { at: 0, text: left },
    { at: 10, text: right },
  ],
  numR: 1.55,
  size: 15,
});

// ── Faceplate ──────────────────────────────────────────────────────────────
decor.push(
  { t: 'screw', x: X(132), y: Y(70), r: 14, hw: true },
  { t: 'screw', x: X(1066), y: Y(70), r: 14, hw: true },
  { t: 'screw', x: X(128), y: Y(614), r: 14, hw: true },
  { t: 'screw', x: X(1072), y: Y(614), r: 14, hw: true }
);
// The maker's marks: the MAKE NOISE wordmark and the 0-COAST model name under it.
text(158, 102, 'MAKE NOISE', 20, { brand: true });
text(158, 130, '0-COAST', 34, { weight: 700, brand: true });
// the panel's dividing lines
line(216, 175, 216, 238);
line(216, 278, 216, 420);
line(374, 70, 374, 640);
line(654, 92, 654, 640);
line(784, 92, 784, 640);
line(916, 85, 916, 545);
text(218, 142, 'CTRL', 22, { rotate: -90 });
text(384, 142, 'OSCILLATOR', 22, { rotate: -90 });
box(538, 112, 648, 298);
box(510, 326, 650, 508);
box(951, 281, 1070, 392);
// the normalled flow, in copper
trace([
  [417, 104],
  [417, 70],
  [580, 70],
  [580, 112],
]);
trace([
  [477, 104],
  [477, 82],
  [604, 82],
  [604, 112],
]);
trace([
  [654, 82],
  [630, 82],
  [630, 112],
]);
trace([
  [602, 298],
  [602, 326],
]);
trace([
  [417, 104],
  [417, 60],
  [955, 60],
  [955, 100],
]);
trace([
  [1011, 230],
  [1011, 281],
]);
trace([
  [1007, 392],
  [1007, 440],
]);

// ── CTRL: MIDI and program buttons ─────────────────────────────────────────
text(162, 192, 'PGM A', 20);
button('midi.pgmA', 160, 226, {
  module: 'mode',
  ui: true,
  name: 'PGM_A',
  help: 'On the hardware: held, it opens the seven program pages (arpeggiator type, legato, MIDI channels, MIDI B’s sources, MIDI clock, calibration); tapped twice or more it sets MIDI B’s LFO rate. Not modelled here: the app plays the settings the 0-COAST has from new.',
});
led(200, 256, 14, 'red', 'gate');
text(200, 280, 'MIDI A', 13);
jackIn('j.midi_in', 160, 290, 'MIDI IN', {
  dest: null,
  help: 'MIDI on a minijack, Korg-style (an adapter to DIN comes with it). Here the app’s keyboard and your MIDI controller play the 0-COAST directly, so nothing is patched here.',
});
text(162, 328, 'MIDI IN', 20);
text(142, 432, 'MIDI A', 22);
text(182, 426, 'CV', 13);
text(186, 446, 'GATE', 13);
text(142, 466, 'MIDI B', 22);
led(128, 504, 18, 'red');
text(122, 536, 'CV', 16);
jackOut('j.midi_b_cv', 134, 560, 'MIDI B CV', {
  signal: 'vel',
  help: 'MIDI B’s CV, set to velocity as the 0-COAST comes: how hard each note was played, as a voltage. On the hardware a program page can make it the note, the mod wheel or a triangle LFO instead; here it is always velocity.',
});
text(184, 528, 'GATE', 16);
jackOut('j.midi_b_gate', 196, 560, 'MIDI B GATE', {
  signal: 'wheel',
  help: 'MIDI B’s gate, set as the 0-COAST comes to go high while the mod wheel is over half way. On the hardware a program page can make it note on, velocity over half or a square LFO instead. Here it carries the mod wheel itself, which a gate input reads as high above half way.',
});

// ── CTRL: clock and stepped random ─────────────────────────────────────────
text(306, 92, 'PGM B', 20);
text(274, 116, 'TAP', 15, { rotate: -30 });
button('midi.pgmB', 306, 126, {
  module: 'mode',
  ui: true,
  name: 'PGM_B',
  help: 'On the hardware: tapped, it sets the clock’s tempo (and the arpeggiator’s rate); held, it stops every MIDI and arpeggiator note; in the program pages it steps the value. Not modelled here: the clock runs at 120 BPM.',
});
text(268, 176, 'TEMPO', 17, { rotate: -30 });
jackIn('j.tempo', 302, 192, 'TEMPO', {
  dest: 'shClock',
  help: 'On the hardware, pulses here set the clock’s tempo. Here they clock the stepped random directly, a new value on each pulse (EOC here gives a new value each SLOPE cycle); CLK OUT keeps its own 120 BPM.',
});
text(278, 240, 'CLK', 18, { rotate: -30 });
led(346, 242, 10, 'red', 'lfo');
jackOut('j.clk', 305, 252, 'CLK OUT', {
  signal: 'lfoSq',
  help: 'Gates at the clock’s tempo. On the hardware the tempo is tapped on PGM_B or follows TEMPO and MIDI clock; here it is a steady 120 BPM, one gate a beat.',
});
lampWindow(268, 314, 30, 'green');
jackOut('j.random', 304, 316, 'RANDOM', {
  name: 'Stepped random OUT',
  signal: 'sum2',
  help: 'A new random voltage, from nothing up to full, on every clock (or every pulse at TEMPO). Patched to OVERTONE or MULTIPLY it changes the tone at random in time.',
});

// ── Voltage MATH ───────────────────────────────────────────────────────────
plate(226, 358, 276, 402);
plate(284, 358, 334, 402);
jackIn('j.vmath_ch1', 250, 380, 'CH1', {
  name: 'Voltage MATH CH1',
  dest: 'sum1A',
  amt: 1,
  help: 'Voltage MATH’s first input, at unity: whatever is patched here is added to CH2 at both outputs.',
});
jackIn('j.vmath_ch2', 308, 380, 'CH2', {
  name: 'Voltage MATH CH2',
  dest: 'sum1B',
  amt: (v) => num(v, 'vmath.ch2') / 5,
  check: (v) =>
    num(v, 'vmath.ch2') === 0
      ? 'The CH2 knob is at the centre, so nothing patched here reaches the outputs. Turn it either way.'
      : null,
  help: 'Voltage MATH’s second input, through the CH2 knob, which scales it up or turns it upside down. With nothing patched the knob sets a steady voltage instead, positive or negative.',
});
text(288, 425, '−', 22);
text(326, 425, '+', 22);
knob('vmath.ch2', 302, 464, 26, 'CH2', {
  module: 'util',
  min: -5,
  max: 5,
  def: 0,
  name: 'Voltage MATH CH2',
  fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`,
  help: 'An attenuverter: at the centre CH2 adds nothing; turned right it adds CH2 the right way up, left upside down. With nothing in CH2 it is an offset, a steady voltage either side of zero.',
});
lampWindow(304, 516, 30, 'green');
text(266, 518, 'SUM', 15, { rotate: -90 });
jackOut('j.vmath_out1', 272, 560, 'OUT 1', {
  name: 'Voltage MATH OUT 1',
  signal: 'sum1',
  help: 'CH1 plus CH2 (scaled by its knob). Patch it into DYNAMICS CV for a drone, or into another input to add two voltages, offset one or turn it upside down.',
});
jackOut('j.vmath_out2', 332, 560, 'OUT 2', {
  name: 'Voltage MATH OUT 2',
  signal: 'sum1',
  help: 'A second copy of OUT 1, so one sum can go to two places.',
});

// ── Oscillator ─────────────────────────────────────────────────────────────
jackOut('j.tri', 417, 125, 'TRIANGLE', {
  name: 'Oscillator TRIANGLE',
  signal: 'o1tri',
  help: 'The oscillator’s triangle on its own. Patching it takes nothing away: the triangle still reaches OVERTONE and BALANCE inside.',
});
decor.push({ t: 'wave', x: X(416), y: Y(162), size: 22, shape: 'tri', w: 3 });
jackOut('j.square', 477, 125, 'SQUARE', {
  name: 'Oscillator SQUARE',
  signal: 'o1pulse',
  help: 'The oscillator’s square. Into BALANCE’s input it replaces the triangle as the fundamental; into SLOPE TRIG it restarts a cycling SLOPE every cycle, for a synced tone.',
});
decor.push({ t: 'wave', x: X(474), y: Y(162), size: 22, shape: 'sq', w: 3 });
knob('osc.pitch', 449, 232, 46, 'PITCH', {
  module: 'osc',
  def: 5,
  fmt: (v) => fmtSemi(pitchSemi(v)),
  help: 'The oscillator’s tuning, added to the note MIDI A plays: two octaves either way from the centre here (the spec gives no range).',
});
text(446, 304, 'PITCH', 24);
decor.push({
  t: 'circle',
  x: X(407),
  y: Y(292),
  r: 14,
  fill: '#3a2a26',
  stroke: '#6a5a50',
  sw: 2,
  hw: true,
});
knob('osc.fine', 446, 364, 14, 'FINE', {
  module: 'osc',
  def: 5,
  fmt: (v) => fmtSemi(fineSemi(v)),
  help: 'Fine tuning, a semitone either way from the centre.',
});
text(446, 402, 'FINE', 20);
knob('osc.linfm', 444, 462, 22, 'LIN FM', {
  module: 'osc',
  name: 'LIN FM depth',
  help: 'How far the LIN FM input moves the pitch. A slow source is vibrato; a fast one, such as a cycling SLOPE, adds clangorous sidebands, and turned right up it reaches noise.',
});
text(406, 526, '1V/OCT', 18);
jackIn('j.voct', 406, 560, '1V/OCT', {
  dest: 'pitchAll',
  amt: 12,
  add: true,
  help: 'The oscillator’s pitch, one volt per octave, added to MIDI A’s note (which is always on the oscillator). A steady voltage here transposes; SLOPE or CONTOUR here sweeps the pitch.',
});
plate(446, 528, 492, 586);
text(470, 518, 'LIN FM', 18);
jackIn('j.linfm', 468, 560, 'LIN FM', {
  dest: 'pitchAll',
  amt: (v) => linFmSemi(num(v, 'osc.linfm')),
  add: true,
  check: (v) =>
    num(v, 'osc.linfm') <= 0
      ? 'The LIN FM knob is at 0, so nothing patched here moves the pitch. Turn it up.'
      : null,
  help: 'Frequency modulation of the oscillator, at the LIN FM knob’s depth. Cycling SLOPE patched here at audio rate is the 0-COAST’s FM voice.',
});

// ── Overtone ───────────────────────────────────────────────────────────────
text(578, 129, 'OVERTONE', 22);
text(569, 159, 'ii', 15);
text(632, 148, 'EVEN', 13);
text(574, 215, 'ODD', 13);
text(633, 213, '!!', 15);
knob('overtone.amount', 602, 172, 28, 'OVERTONE', {
  module: 'osc',
  help: 'Adds one harmonic to the triangle: the odd one fully left, through a mixed, transitional state, to the even one, an octave up. Right at the end it also blends SLOPE into the sound, which rings like a ring modulator unless SLOPE is tuned to the oscillator.',
});
knob('overtone.cv', 602, 262, 22, 'OVERTONE CV', {
  module: 'osc',
  name: 'OVERTONE CV depth',
  help: 'How far the OVERTONE CV input moves OVERTONE: nothing fully left, half of OVERTONE’s range fully right.',
});
plate(514, 528, 558, 586);
text(538, 518, 'OVRTN', 18);
jackIn('j.overtone_cv', 536, 560, 'OVRTN', {
  name: 'OVERTONE CV',
  dest: 'wave2',
  amt: (v) => ovtCvAmt(num(v, 'overtone.cv')),
  add: true,
  check: (v) =>
    num(v, 'overtone.cv') <= 0
      ? 'The OVERTONE CV knob is at 0, so nothing patched here moves OVERTONE. Turn it up.'
      : null,
  help: 'Moves OVERTONE between its odd and even harmonics, as far as the knob under OVERTONE lets it. Nothing is wired here inside.',
});

// ── Multiply ───────────────────────────────────────────────────────────────
text(548, 372, 'MULTIPLY', 20, { rotate: -90 });
knob('multiply.amount', 602, 360, 28, 'MULTIPLY', {
  module: 'osc',
  help: 'Folds the wave over on itself, adding more and brighter harmonics as it turns right: the opposite of turning a low-pass filter down.',
});
text(584, 423, '−', 22);
text(624, 423, '+', 22);
knob('multiply.cv', 602, 460, 22, 'MULTIPLY CV', {
  module: 'osc',
  min: -5,
  max: 5,
  def: 0,
  name: 'MULTIPLY CV depth',
  fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toFixed(1)}`,
  help: 'An attenuverter for the MULTIPLY CV input, which is SLOPE with nothing patched: right of centre it adds folds as the voltage rises, left of centre it takes them away.',
});
lampWindow(556, 488, 18, 'amber');
plate(582, 528, 626, 586);
text(604, 518, 'MLTPL', 18);
jackIn('j.multiply_cv', 604, 560, 'MLTPL', {
  name: 'MULTIPLY CV',
  dest: 'pw2',
  amt: (v) => multCvAmt(num(v, 'multiply.cv')),
  check: (v) =>
    num(v, 'multiply.cv') === 0
      ? 'The MULTIPLY CV knob is at the centre, so nothing patched here moves MULTIPLY. Turn it either way.'
      : null,
  help: 'Moves MULTIPLY, as far and in the direction its knob says. SLOPE is wired here inside; a cable here replaces it.',
});

// ── Slope ──────────────────────────────────────────────────────────────────
text(690, 88, 'SLOPE', 22);
text(706, 128, 'CYCLE', 15, { rotate: 90 });
button('slope.cycle', 736, 126, {
  module: 'env',
  lamp: true,
  name: 'CYCLE',
  help: 'Makes SLOPE repeat on its own, rising and falling over and over: an LFO when slow, an oscillator when fast. Lit while it cycles.',
});
text(674, 212, 'RISE', 20);
knob('slope.rise', 740, 202, 28, 'RISE', {
  module: 'env',
  def: 3,
  fmt: (v) => fmtTime(slopeTime(v)),
  help: 'How long SLOPE takes to rise to the top. Clockwise is slower (here from half a millisecond to 12 seconds; the spec gives no range).',
});
text(676, 314, 'FALL', 20);
knob('slope.fall', 742, 310, 28, 'FALL', {
  module: 'env',
  def: 5,
  fmt: (v) => fmtTime(slopeTime(v)),
  help: 'How long SLOPE takes to fall back to nothing. A short RISE with a long FALL is a sawtooth; the two equal, a triangle.',
});
lampWindow(680, 372, 22, 'green');
knob('slope.response', 736, 420, 22, 'Vari-Response', {
  module: 'env',
  def: 5,
  name: 'SLOPE Vari-Response',
  scale: ends('LOG', 'EXP'),
  help: 'The shape of SLOPE’s rise and fall: curved one way (log) to the left, straight at the centre, curved the other way (expo) to the right.',
});
led(714, 460, 8, 'yellow');
plate(648, 480, 704, 524);
text(680, 470, 'TIME', 18);
jackIn('j.slope_time', 682, 502, 'TIME', {
  name: 'SLOPE TIME',
  dest: 'env2Rate',
  amt: TIME_CV_OCT,
  add: true,
  help: 'Speeds up or slows down SLOPE’s rise and fall together. Here a rising voltage makes it faster.',
});
text(738, 470, 'EOC', 18);
jackOut('j.eoc', 738, 500, 'EOC', {
  signal: 'eoc',
  help: 'End of cycle: a gate that is high except while SLOPE falls. Patched into CONTOUR GATE it fires the envelope once per SLOPE cycle.',
});
text(658, 540, 'TRIG', 15, { rotate: -45 });
jackIn('j.slope_trig', 684, 558, 'TRIG', {
  name: 'SLOPE TRIG',
  dest: 'trigIn',
  amt: 1,
  help: 'A rising edge here fires SLOPE once: one rise and one fall, with no sustain. Nothing is wired here inside, so SLOPE stays still until it is triggered or CYCLE is lit. With CYCLE lit, each trigger starts it again from the rise.',
});
text(742, 532, 'SLOPE', 18);
jackOut('j.slope_out', 738, 558, 'SLOPE', {
  name: 'SLOPE OUT',
  signal: 'env2',
  help: 'SLOPE’s rise and fall, as a voltage. It is already wired to MULTIPLY CV inside, and to the audio path at full OVERTONE.',
});

// ── Contour ────────────────────────────────────────────────────────────────
text(818, 88, 'CONTOUR', 22);
text(810, 162, 'ONSET', 20);
knob('contour.onset', 876, 144, 30, 'ONSET', {
  module: 'env',
  fmt: (v) => fmtTime(onsetTime(v)),
  help: 'CONTOUR’s attack: how long it takes to rise when the gate goes high (here 1 ms to 8 s).',
});
text(814, 256, 'SUSTAIN', 16, { rotate: -90 });
text(848, 294, 'NONE', 12);
text(896, 294, '100%', 12);
knob('contour.sustain', 874, 252, 24, 'SUSTAIN', {
  module: 'env',
  help: 'The level CONTOUR holds while the gate stays high. Fully left the envelope only rises and falls (AD); fully right it holds at the top (ASR).',
});
text(818, 366, 'DECAY', 20);
knob('contour.decay', 876, 352, 30, 'DECAY', {
  module: 'env',
  def: 4,
  fmt: (v) => fmtTime(decayTime(v)),
  help: 'How long CONTOUR takes to fall to SUSTAIN, and to fall away once the gate ends: one knob for both (here 5 ms to 12 s).',
});
lampWindow(929, 355, 38, 'green', 'env1');
knob('contour.response', 870, 460, 24, 'Vari-Response', {
  module: 'env',
  name: 'CONTOUR Vari-Response',
  scale: ends('LIN', 'EXP'),
  help: 'The shape of CONTOUR’s stages, from straight (left) to curved like a natural decay (right), which sounds more percussive.',
});
led(850, 520, 9, 'yellow');
plate(788, 480, 840, 524);
text(812, 470, 'DCY', 18);
jackIn('j.decay_cv', 814, 502, 'DCY', {
  name: 'CONTOUR DECAY',
  dest: 'env1DecRate',
  amt: TIME_CV_OCT,
  add: true,
  help: 'Speeds up or slows down CONTOUR’s decay (and so its release). Here a rising voltage makes it faster.',
});
text(786, 540, 'GATE', 15, { rotate: -45 });
jackIn('j.contour_gate', 814, 558, 'GATE', {
  name: 'CONTOUR GATE',
  dest: 'gate1',
  amt: 1,
  help: 'Fires CONTOUR while it is high. MIDI A’s gate is wired here inside; a cable here replaces it, so a clock or EOC can play the envelope on its own.',
});
text(874, 530, 'EON', 18);
jackOut('j.eon', 872, 558, 'EON', {
  signal: 'eon',
  help: 'End of onset: a gate that goes high when CONTOUR reaches the top and stays high until it has fallen back to nothing.',
});
text(934, 530, 'CNTR', 18);
jackOut('j.contour_out', 930, 558, 'CNTR', {
  name: 'CONTOUR OUT',
  signal: 'env1',
  help: 'CONTOUR as a voltage. It already opens DYNAMICS inside; patched elsewhere it shapes that too, the overtones or the pitch.',
});

// ── Balance ────────────────────────────────────────────────────────────────
jackIn('j.balance_in', 954, 122, 'BALANCE IN', {
  dest: 'extIn',
  amt: 1,
  check: (v) =>
    num(v, 'balance.amount') >= 10
      ? 'BALANCE is fully right, on the overtones, so the FUND side this input feeds is not heard. Turn it left.'
      : null,
  help: 'Replaces the triangle on BALANCE’s FUND side with whatever is patched here: the square for a hollower fundamental, or any other sound for DYNAMICS to play.',
});
plate(1030, 104, 1089, 148);
text(1059, 92, 'BALNC', 18);
jackIn('j.balance_cv', 1060, 122, 'BALNC', {
  name: 'BALANCE CV',
  dest: 'att2In',
  amt: 1,
  check: (v) =>
    num(v, 'balance.amount') <= 0
      ? 'BALANCE is fully left, and with a cable here it is the cable’s depth, so nothing patched here is heard. Turn it up.'
      : null,
  help: 'Moves BALANCE between FUND and OVRTN. A cable here turns the BALANCE knob into its depth: rising voltage brings in the overtones.',
});
text(1002, 142, 'BALANCE', 20, { rotate: 90 });
knob('balance.amount', 1014, 202, 28, 'BALANCE', {
  module: 'mixer',
  def: 5,
  scale: ends('FUND', 'OVRTN'),
  help: 'Crossfades the plain triangle (FUND, left) against the overtones from OVERTONE and MULTIPLY (OVRTN, right): sweeping it right is like opening a filter. With a cable in BALANCE CV it is that cable’s depth instead.',
});

// ── Dynamics and the output ────────────────────────────────────────────────
text(992, 294, 'DYNAMICS', 22);
knob('dynamics.amount', 1007, 356, 28, 'DYNAMICS', {
  module: 'amp',
  def: 8,
  help: 'How far CONTOUR (or the DYNAMICS CV input) opens the low-pass gate, which makes the sound louder and brighter together. The manual asks for 3:00 or more (8 here) for the default sound.',
});
lampWindow(1047, 370, 34, 'amber', 'env1');
knob('out.level', 1002, 460, 20, 'LEVEL', {
  module: 'out',
  def: 7,
  help: 'The line output’s volume. On the hardware it is clean to about 8 and then clips, lighting OVL; here it stays clean.',
});
led(1052, 461, 10, 'red', 'overload');
text(1075, 457, 'LINE OUT', 15, { rotate: 90 });
jackOut('j.line_out', 1062, 501, 'LINE OUT', {
  signal: 'out',
  help: 'The 0-COAST’s output at line level, after LEVEL, for headphones or a mixer.',
});
plate(974, 528, 1022, 586);
text(1000, 519, 'DYNMC', 18);
jackIn('j.dynamics_cv', 998, 559, 'DYNMC', {
  name: 'DYNAMICS CV',
  dest: 'att1In',
  amt: 1,
  check: (v) =>
    num(v, 'dynamics.amount') <= 0
      ? 'DYNAMICS is at 0, so nothing patched here opens the low-pass gate. Turn it up.'
      : null,
  help: 'Opens the low-pass gate, as far as the DYNAMICS knob lets it. CONTOUR is wired here inside; a cable replaces it, so a steady voltage from Voltage MATH makes a drone.',
});
text(1037, 545, 'DYNMC', 15, { rotate: -45 });
jackOut('j.dynamics_out', 1057, 559, 'DYNMC OUT', {
  signal: 'vca',
  help: 'The low-pass gate’s output at modular level, the same sound as LINE OUT before LEVEL, to patch back into the 0-COAST or on to other modules.',
});

// ── Areas (photo coordinates) ──────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: (x1 - x0) * K,
  h: (y1 - y0) * K,
});
const areas: Area[] = [
  {
    id: 'midi',
    label: 'MIDI',
    module: 'mode',
    keywords: 'midi in program pages pgm_a midi a midi b velocity mod wheel gate cv converter',
    rects: [R(95, 36, 216, 640)],
    help: 'The 0-COAST is played over MIDI. MIDI A always sets the oscillator’s pitch and fires CONTOUR; MIDI B is a second converter with its own CV and GATE jacks (velocity and the mod wheel as it comes). PGM_A opens the program pages, which are not modelled here.',
  },
  {
    id: 'clock',
    label: 'Clock and random',
    module: 'mod',
    keywords: 'clock tempo tap pgm_b random stepped sample and hold s&h',
    rects: [R(216, 36, 374, 345)],
    help: 'A clock, its tempo tapped on PGM_B on the hardware and a steady 120 BPM here, and a stepped random voltage that changes on each clock or each pulse at TEMPO.',
  },
  {
    id: 'vmath',
    label: 'Voltage MATH',
    module: 'util',
    keywords: 'voltage math mixer offset inverter attenuverter mult sum drone',
    rects: [R(216, 345, 374, 640)],
    help: 'Adds CH1 to CH2, which passes through an attenuverter, at two identical outputs. With CH2 empty the knob is a steady voltage: patched into DYNAMICS CV it holds the gate open for a drone.',
  },
  {
    id: 'osc',
    label: 'Oscillator',
    module: 'osc',
    keywords: 'vco oscillator triangle square pitch fine tune linear fm 1v/oct',
    rects: [R(374, 36, 510, 640)],
    help: 'One triangle-core oscillator, played by MIDI A and 1V/OCT. Its triangle is the fundamental BALANCE starts from, and with its square it feeds OVERTONE; both have jacks. LIN FM bends it from another signal at its knob’s depth.',
  },
  {
    id: 'overtone',
    label: 'Overtone',
    module: 'osc',
    keywords: 'overtone harmonic odd even waveshaper additive west coast',
    rects: [R(510, 36, 654, 310), R(510, 310, 570, 640)],
    help: 'Adds a single harmonic to the triangle: odd to the left, even to the right, a mix between, and SLOPE blended in at the very end. Its CV input moves it, at the depth of the knob beneath.',
  },
  {
    id: 'multiply',
    label: 'Multiply',
    module: 'osc',
    keywords: 'multiply wavefolder folder fold timbre harmonics west coast',
    rects: [R(570, 310, 654, 640)],
    help: 'A wavefolder after OVERTONE: turned up it multiplies that one harmonic into many, brighter as it goes. SLOPE moves it with nothing patched, at the attenuverter’s depth and direction.',
  },
  {
    id: 'slope',
    label: 'Slope',
    module: 'env',
    keywords: 'slope function generator rise fall cycle lfo vari-response eoc trigger',
    rects: [R(654, 36, 784, 640)],
    help: 'A rise and fall: fired once by SLOPE TRIG, or repeating with CYCLE lit, from a slow LFO up to audio rate. Vari-Response bends its shape. It moves MULTIPLY with nothing patched, and EOC marks each fall.',
  },
  {
    id: 'contour',
    label: 'Contour',
    module: 'env',
    keywords: 'contour envelope adsr onset attack decay sustain release eon vari-response',
    rects: [R(784, 36, 942, 640)],
    help: 'The envelope MIDI A fires: ONSET, DECAY and SUSTAIN, with DECAY also the release. It opens DYNAMICS with nothing patched. EON is high from the top of the onset until it has fallen away.',
  },
  {
    id: 'balance',
    label: 'Balance',
    module: 'mixer',
    keywords: 'balance crossfade fund ovrtn fundamental mix',
    rects: [R(942, 36, 1101, 275)],
    help: 'A crossfade between the plain triangle (FUND) and the overtones from OVERTONE and MULTIPLY (OVRTN). BALANCE IN replaces the triangle; BALANCE CV moves the blend, the knob then setting its depth.',
  },
  {
    id: 'dynamics',
    label: 'Dynamics and output',
    module: 'amp',
    keywords: 'dynamics low-pass gate lpg vca amplifier level line out headphones buchla 292',
    rects: [R(942, 275, 1101, 640)],
    help: 'DYNAMICS is a low-pass gate in place of a filter and VCA: one control that makes the sound louder and brighter together, opened by CONTOUR. LEVEL sets LINE OUT; DYNMC OUT is the same sound at modular level.',
  },
];

// ── Engine mapping ─────────────────────────────────────────────────────────
function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const patched = ctx.patched;
  const routes: EngineRoute[] = [];
  const ovt = num(v, 'overtone.amount');
  const balanceIn = !!patched['j.balance_in'];
  const balanceCv = !!patched['j.balance_cv'];
  const trig = !!patched['j.slope_trig'];
  // CYCLE runs SLOPE freely; a cable in SLOPE TRIG fires it once per trigger instead, so each one restarts it
  const cycle = !!v['slope.cycle'] && !trig;
  // SLOPE is normalled to MULTIPLY CV until a cable goes in
  const multCv = multCvAmt(num(v, 'multiply.cv'));
  if (!patched['j.multiply_cv'] && multCv) routes.push({ src: 'env2', dst: 'pw2', amt: multCv });
  // full-clockwise OVERTONE blends SLOPE into the audio path, ahead of MULTIPLY
  const blend = slopeBlend(ovt);
  if (blend) routes.push({ src: 'env2', dst: 'ovtIn', amt: blend });
  // BALANCE: attenuator 2 is the offset (or the BALANCE CV cable) at the knob's gain, taken from FUND and given to OVRTN.
  // With BALANCE IN patched the FUND side is that input, set by the knob alone.
  if (!balanceIn) routes.push({ src: 'att2', dst: 'lvl1', amt: -1 });
  routes.push({ src: 'att2', dst: 'lvl2', amt: 1 });
  // DYNAMICS: attenuator 1 is CONTOUR (or the DYNAMICS CV cable) at the knob's gain, opening level and cutoff together
  routes.push({ src: 'att1', dst: 'amp', amt: 1 }, { src: 'att1', dst: 'cutoff', amt: LPG_OCT });
  const bal = clamp(num(v, 'balance.amount'), 0, 10) / 10;
  const semi = pitchSemi(num(v, 'osc.pitch')) + fineSemi(num(v, 'osc.fine'));
  const slopeShape = clamp(num(v, 'slope.response'), 0, 10) / 10;
  const contourShape = 0.5 + clamp(num(v, 'contour.response'), 0, 10) / 20;
  const decay = decayTime(num(v, 'contour.decay'));
  const fall = slopeTime(num(v, 'slope.fall'));
  const trigOff = { retrig: false, drone: false, repeat: false };
  return {
    osc: [
      // FUND: the plain triangle (and the TRIANGLE and SQUARE jacks)
      { level: balanceIn ? 0 : 1, mix: { tri: TRI }, pw: 0.5, semi, syncTo: -1 },
      // OVRTN: the same oscillator through OVERTONE and MULTIPLY, synced to FUND so the two stay in phase
      {
        level: 0,
        mix: { ovt: TRI },
        pw: 0.5,
        semi,
        syncTo: 0,
        ovt: ovtAmt(ovt),
        fold: clamp(num(v, 'multiply.amount'), 0, 10) / 10,
      },
    ],
    noise: { level: 0 },
    ext: { level: balanceIn ? (balanceCv ? TRI : TRI * (1 - bal)) : 0 },
    filter: {
      type: 'svf',
      mode: 'lp',
      cutoff: LPG_FLOOR_HZ,
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    },
    // CONTOUR: ONSET, DECAY (also the release) and SUSTAIN, linear to expo
    env1: {
      a: onsetTime(num(v, 'contour.onset')),
      d: decay,
      s: clamp(num(v, 'contour.sustain'), 0, 10) / 10,
      r: decay,
      curve: { a: contourShape, d: 1 - contourShape, r: 1 - contourShape },
    },
    // SLOPE: RISE and FALL, log to expo, deaf to the keys
    env2: {
      a: slopeTime(num(v, 'slope.rise')),
      d: fall,
      s: 0,
      r: fall,
      curve: { a: slopeShape, d: 1 - slopeShape, r: 1 - slopeShape },
      ...(cycle ? { loop: true } : {}),
      free: true,
    },
    vca: { envSrc: 'none', bias: 0 },
    lfo: { rate: CLOCK_HZ, mix: { sq: 1 }, keySync: false },
    sh: { rate: CLOCK_HZ, glide: 0, clock: 'lfo' },
    att: [clamp(num(v, 'dynamics.amount'), 0, 10) / 10, bal],
    glide: { time: 0, legato: false },
    // MIDI A is legato as it comes: one CONTOUR until every key is let go
    trig: trig ? { ...trigOff, src: ['gate', 'trig'] } : trigOff,
    normals: {
      att1In: 'env1',
      att2In: 'one',
      // SLOPE has no gate of its own: it cycles, or waits for SLOPE TRIG
      gate2: cycle ? 'one' : null,
      gateIn: 'gate',
      sum1B: ['one', num(v, 'vmath.ch2') / 5],
      // the stepped random, 0 to full
      sum2A: ['sh', 0.5],
      sum2B: ['one', 0.5],
    },
    routes,
    od: { on: false },
    delay: { on: false },
    oscOuts: !!patched['j.tri'] || !!patched['j.square'],
    tune: 0,
    volume: level10(num(v, 'out.level'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const zeroCoast: SynthDef & { version: number } = {
  id: '0-coast',
  version: 1,
  name: '0-COAST',
  maker: 'Make Noise',
  year: 2016,
  heritage: 'An original Make Noise design mixing East Coast and West Coast synthesis: “no coast”',
  summary:
    'A single-voice semi-modular analogue synth with no filter: one triangle-core oscillator, OVERTONE and MULTIPLY to add harmonics, BALANCE to crossfade them against the plain triangle, and DYNAMICS, a low-pass gate opened by CONTOUR. SLOPE rises and falls, once or cycling up to audio rate, and Voltage MATH, a clock, stepped random and MIDI B are free to patch.',
  view: { w: (1101 - OX) * K, h: (640 - OY) * K },
  theme: {
    panel: PANEL,
    panel2: '#141316',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'none',
    jack: 'black',
  },
  signalNames: {
    osc1: 'the triangle (FUND)',
    osc2: 'the overtones (OVRTN)',
    o1tri: 'the oscillator’s triangle',
    o1pulse: 'the oscillator’s square',
    env1: 'CONTOUR',
    env2: 'SLOPE',
    eoc: 'SLOPE’s EOC',
    eon: 'CONTOUR’s EON',
    att1: 'the DYNAMICS CV',
    att2: 'the BALANCE CV',
    sum1: 'Voltage MATH',
    sum2: 'the stepped random',
    lfoSq: 'the clock',
    vel: 'MIDI B CV (velocity)',
    wheel: 'MIDI B GATE (the mod wheel)',
    gate: 'MIDI A’s gate',
    vca: 'DYNAMICS',
    out: 'the line output',
  },
  destNames: {
    extIn: 'BALANCE’s FUND side',
    att1In: 'DYNAMICS CV',
    att2In: 'BALANCE CV',
    wave2: 'OVERTONE',
    pw2: 'MULTIPLY',
    ovtIn: 'OVERTONE’s SLOPE blend',
    lvl1: 'BALANCE (FUND)',
    lvl2: 'BALANCE (OVRTN)',
    amp: 'the low-pass gate’s level',
    cutoff: 'the low-pass gate’s brightness',
    env2Rate: 'SLOPE TIME',
    env1DecRate: 'CONTOUR DECAY',
    sum1A: 'Voltage MATH CH1',
    sum1B: 'Voltage MATH CH2',
    shClock: 'the stepped random’s clock',
    trigIn: 'SLOPE TRIG',
    gate1: 'CONTOUR GATE',
    pitchAll: 'the oscillator’s pitch',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  // Init is the triangle half-way to its overtones, opened by a plucked CONTOUR through DYNAMICS at 8. The 0-COAST has
  // no sawtooth: the Default patch is its plainest tone, the triangle on its own (BALANCE fully on FUND), with CONTOUR
  // a plain gate (full sustain, a short decay that is also the release) opening DYNAMICS all the way.
  defaultPatch: {
    values: {
      'balance.amount': 0,
      'contour.sustain': 10,
      'contour.decay': 2,
      'dynamics.amount': 10,
    },
    listen:
      'The plain triangle, soft and round like a flute with no breath: the 0-COAST has no sawtooth, and its triangle is the tone everything else is added to.',
  },
  toEngine,
};

export default zeroCoast;
