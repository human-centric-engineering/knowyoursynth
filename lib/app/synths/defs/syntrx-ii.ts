/**
 * Erica Synths SYNTRX II: the definition (D1). Positions are measured on the owner's 1946 × 1946 straight-on product
 * photo (`.context/app/synth-data/syntrx-ii/raw/erica-synths-syntrx-ii.jpg`, local only); X() and Y() take photo
 * pixels and move them to the left cheek's outer edge and the top of the cheeks, at the same scale. The owner's spec is
 * `.context/app/synth-data/syntrx-ii/syntrx-ii.synth.json` (the SYNTRX II User Manual, March 2023, also in `raw/`).
 *
 * The photo shows an earlier panel than the manual: its effects section is DELAY only, with a HOLD / ADD switch, and
 * matrix column M is "Delay Time". The panel is drawn as the manual describes it: an EFFECTS section with a DELAY /
 * REVERB switch, and column M the S&H Input. The column order is the manual's panel drawing (Ch1 Output, Scope, Ch2
 * Output … Decay, S&H Input), which is also the photo's; the spec lists Ch2 Output before Scope and S&H Input before
 * Decay.
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), following `defs/ems-vcs3.ts`, the
 * nearest instrument: the SYNTRX is a re-imagined Synthi, with the same 16 × 16 matrix of sources (rows) and
 * destinations (columns), a looping trapezoid envelope with its own VCA, a joystick and two output amplifiers. Unlike
 * the VCS3 its oscillators follow the keyboard directly, as CV1 does on the hardware. Where a row or a column does more
 * than one engine signal or destination can, it goes through one of the engine's utilities:
 *
 * - Row 3, Oscillator 2, is `sum1`: its pulse and saw mixed by their LEVEL knobs (and the "dual super saw" partner,
 *   Oscillator 4 detuned against it by SHAPE).
 * - Row 5 is `att1`, fed Oscillator 3's pulse or the S&H by the OSC 3 / S&H switch; row 14 is `att2`, fed the delay or
 *   the reverb by the DELAY / REVERB switch.
 * - The Scope column is `mult`, and because the SCOPE OUTPUT is normalled to both inputs, Input 1 (row 7), the
 *   envelope follower (row 8, on Input 1) and Input 2 (row 9, through the `preamp`) all hear it.
 * - Column I goes through `inv1` to Oscillator 2 and its super saw partner, column K through `sum2` to the pulse
 *   widths the shape switches choose, and column N through `invert` to the HPF, the LPF or both.
 *
 * Voltages: an engine signal of 1 is 1 V. The internal audio level is about 3.7 V peak to peak, so a source at full
 * LEVEL is ±1.85 V; control voltages reach ±5 V. Pitch is 1 V per octave. The filter's, the decay's and the output
 * levels' sensitivities, the knob laws and the envelope follower's times are this app's estimates (`not_in_source`).
 *
 * Not modelled, and said so in the help and the limits: the three pin gains (every pin here is gain 1), the patch
 * memory, the sequencer and its stepped lanes, motion recording, the envelope follower's gate and DECAY, the S&H
 * clocked by gates, CV on the sine and saw shapes, and the long delay range.
 */
import type {
  Area,
  Control,
  ControlOption,
  ControlValues,
  Decor,
  EngineParams,
  EngineRoute,
  InputJack,
  Jack,
  JackHearContext,
  KnobScale,
  NormalSource,
  OscParams,
  OutAmpParams,
  OutputJack,
  SynthDef,
  SynthModule,
  TextDecor,
  ViewRect,
} from '@/lib/app/synths/contract';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtTime, pwl, type CurvePoint } from '@/lib/app/synths/lib/maps';

type TextRest = Partial<
  Pick<TextDecor, 'anchor' | 'fill' | 'weight' | 'rotate' | 'brand' | 'spacing'>
>;
type KnobRest = {
  module: SynthModule;
  name: string;
  help: string;
  def: number;
  min?: number;
  max?: number;
  scale?: KnobScale;
  fmt?: (v: number) => string;
  ui?: boolean;
};
type Hear = (v: ControlValues, x: JackHearContext) => string | null;

const X = (x: number): number => x - 75;
const Y = (y: number): number => y - 348;
const PANEL = '#2b2c30';
const PANEL2 = '#232427';
const INK = '#e6e6e1';
const CAP = '#1c1c1e';
/** Full LEVEL on an audio row: half the internal 3.7 V peak to peak. */
const AUDIO_V = 1.85;

// ── Ranges and tapers ─────────────────────────────────────────────────────
/** A LEVEL knob: square law, `peak` volts (or gain) at 10. */
const lvl = (v: number, peak: number): number => peak * Math.pow(clamp(v, 0, 10) / 10, 2);
/** TUNE: about two octaves, in tune at 5. */
const tuneSemi = (v: number): number => (v - 5) * 2.4;
/** Oscillator 3: 0.05–500 Hz (the manual). */
const osc3Hz = (v: number): number => expMap(v / 10, 0.05, 500);
const noteOf = (hz: number): number => 69 + (12 * Math.log(hz / 440)) / Math.LN2;
const hpfHz = (v: number): number => expMap(v / 10, 10, 12000);
const lpfHz = (v: number): number => expMap(v / 10, 20, 20000);
// RESONANCE: a pure sine from 7 (the manual)
const RES_PTS: CurvePoint[] = [
  [0, 0],
  [4, 0.45],
  [6, 0.85],
  [7, 1.0],
  [10, 1.1],
];
// The engine's ladder sings more quietly on its own than with something to filter, so row 10 is lifted as RESONANCE
// takes it into oscillation (an app correction for the model, as on the VCS3).
const filterOscBoost = (v: ControlValues): number =>
  1 + 3 * clamp((pwl(num(v, 'vcf.res'), RES_PTS) - 0.92) / 0.18, 0, 1);
// Trapezoid stage times (the manual): attack 6–850 ms, on 0–1.5 s, decay 16 ms–2 s, off 14 ms–1.3 s.
const attackS = (v: number): number => expMap(v / 10, 0.006, 0.85);
const onS = (v: number): number => 1.5 * Math.pow(v / 10, 2);
const decayS = (v: number): number => expMap(v / 10, 0.016, 2);
const OFF_MANUAL = 9; // OFF above 9 stops the looping
const offS = (v: number): number => expMap(clamp(v, 0, OFF_MANUAL) / OFF_MANUAL, 0.014, 1.3);
/** Delay TIME in the default SHORT range and tape mode: 50–500 ms (the manual). */
const delayS = (v: number): number => expMap(v / 10, 0.05, 0.5);
/** The S&H's own clock. The manual gives no range: this app's estimate. */
const shHz = (v: number): number => expMap(v / 10, 0.2, 200);
const fmtV = (x: number): string =>
  `${x < 0.095 ? Math.round(x * 100) / 100 : Math.round(x * 10) / 10} V`;
const fmtSigned = (v: number): string =>
  `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(Math.round(v * 10) / 10)}`;

const S10: KnobScale = {
  nums: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10],
  ticks: 11,
  size: 10,
  numR: 1.55,
  tickR: 1.22,
};
const SBI: KnobScale = {
  nums: [-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5],
  ticks: 11,
  size: 10,
  numR: 1.55,
  tickR: 1.22,
};

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y) (the renderer places text by its baseline). */
const label = (x: number, y: number, t: string, size = 13, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y + size * 0.36),
    text: t,
    size,
    anchor: 'middle',
    ...rest,
  });
};
const tab = (x: number, y: number, t: string, size = 12): void => {
  decor.push({ t: 'tab', x: X(x), y: Y(y), text: t, size, gap: false });
};
const box = (x0: number, y0: number, x1: number, y1: number, sw = 1.6): void => {
  decor.push({ t: 'rect', x: X(x0), y: Y(y0), w: x1 - x0, h: y1 - y0, r: 0, stroke: INK, sw });
};
const rect = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: x1 - x0,
  h: y1 - y0,
});
const knob = (id: string, x: number, y: number, r: number, rest: KnobRest): void => {
  const { min = 0, max = 10, scale = min < 0 ? SBI : S10, ...more } = rest;
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r,
    style: 'vcs3',
    cap: CAP,
    kind: 'cont',
    min,
    max,
    labelPos: 'none',
    scale,
    ...more,
  });
};
/** A square slide switch, top option first. */
const slide = (
  id: string,
  x: number,
  y: number,
  options: ControlOption[],
  def: string,
  rest: { module: SynthModule; name: string; help: string; ui?: boolean }
): void => {
  controls.push({
    id,
    type: 'slide',
    x: X(x),
    y: Y(y),
    w: 40,
    h: options.length === 3 ? 62 : 56,
    orient: 'v',
    kind: 'enum',
    options,
    def,
    labelPos: 'none',
    ...rest,
  });
};
const button = (
  id: string,
  x: number,
  y: number,
  size: number,
  rest: { module: SynthModule; name: string; help: string; ui?: boolean; red?: boolean }
): void => {
  const { red, ...more } = rest;
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: size,
    h: size,
    kind: 'bool',
    def: false,
    labelPos: 'none',
    face: 'ring',
    caption: '',
    ...(red ? { faceColor: 'red' as const } : {}),
    ...more,
  });
};
const opts = (...pairs: [string, string][]): ControlOption[] =>
  pairs.map(([v, l]) => ({ v, label: l }));

// ── Cabinet and frames ────────────────────────────────────────────────────
// Wooden cheeks are the theme's; the panel's printed frame and section lines, as on the photo.
box(147, 408, 1790, 1525, 2);
box(147, 408, 812, 565);
box(147, 565, 477, 722);
box(477, 565, 812, 722);
box(147, 722, 812, 1143);
box(147, 1143, 812, 1330);
box(147, 1330, 812, 1525);
box(812, 408, 1240, 722);
box(1240, 408, 1515, 565);
box(1515, 408, 1790, 565);
box(1240, 565, 1515, 722);
box(1515, 565, 1790, 722);
box(812, 722, 1310, 908);
box(1310, 722, 1790, 908);
box(812, 908, 1310, 1525);
box(1310, 908, 1790, 1262);
box(1310, 1262, 1790, 1525);
// The line from the input boxes down into the oscillator section, and between the three switches
decor.push(
  { t: 'line', x1: X(477), y1: Y(722), x2: X(477), y2: Y(760), w: 1.6 },
  { t: 'line', x1: X(477), y1: Y(875), x2: X(477), y2: Y(895), w: 1.6 },
  { t: 'line', x1: X(477), y1: Y(1005), x2: X(477), y2: Y(1030), w: 1.6 }
);

// ── Input 1 and the envelope follower ─────────────────────────────────────
tab(477, 416, 'INPUT 1 / E.F.');
knob('in1.level', 220, 485, 36, {
  module: 'util',
  name: 'Input 1 LEVEL',
  def: 0,
  fmt: (v) => `×${Math.round(lvl(v, 1.5) * 100) / 100}`,
  help: 'How much of Input 1 reaches matrix row 7, and how much the envelope follower hears. Nothing is plugged into the jack in this app, so Input 1 carries the SCOPE OUTPUT, which is normalled to it: whatever is pinned into the Scope column.',
});
label(220, 549, 'LEVEL');
knob('in1.thresh', 350, 485, 36, {
  module: 'util',
  name: 'Envelope follower THRESH',
  def: 5,
  help: 'The level at which the envelope follower decides there is a beat and makes a gate, lighting the lamp. The gate is not modelled in this app, so this knob changes nothing here.',
});
label(350, 549, 'THRESH');
decor.push({ t: 'led', x: X(418), y: Y(442), r: 7, color: 'red' });
knob('in1.decay', 488, 485, 36, {
  module: 'util',
  name: 'Envelope follower DECAY',
  def: 0,
  help: 'How slowly the envelope follower lets go after each peak: at 0 it follows the input closely, turned up it falls away more slowly. This app’s follower has one fixed fall of about 90 ms, so the knob changes nothing here.',
});
label(488, 549, 'DECAY');
slide('in1.toGate', 608, 492, opts(['on', 'TO GATE'], ['off', 'Off']), 'off', {
  module: 'util',
  name: 'TO GATE switch',
  help: 'Up, the gates the envelope follower finds join the keyboard’s, the sequencer’s and the GATE button’s, and fire the trapezoid. The follower’s gate is not modelled in this app, so the switch changes nothing here.',
});
label(608, 441, 'TO GATE');
knob('in1.ef', 736, 485, 36, {
  module: 'util',
  name: 'EF LEVEL',
  min: -5,
  max: 5,
  def: 0,
  fmt: (v) => (v === 0 ? 'off' : `${fmtSigned(v)} (${v < 0 ? 'inverted' : 'upright'})`),
  help: 'How much of the envelope follower’s voltage reaches matrix row 8, and which way up. Right of centre it rises as Input 1 gets louder; left of centre it falls, which is how you duck one sound with another.',
});
label(736, 549, 'EF LEVEL');

// ── Input 2 and noise ─────────────────────────────────────────────────────
tab(308, 575, 'INPUT 2');
knob('in2.level', 220, 645, 36, {
  module: 'util',
  name: 'Input 2 LEVEL',
  def: 0,
  help: 'How much of Input 2 reaches matrix row 9. Far clockwise it overdrives. Input 2 carries the SCOPE OUTPUT in this app, as it does on the hardware with nothing plugged in.',
});
label(220, 707, 'LEVEL');
slide('in2.gain', 328, 657, opts(['mic', 'MIC'], ['line', 'LINE']), 'line', {
  module: 'util',
  name: 'Input 2 MIC / LINE',
  help: 'The gain range of Input 2: LINE for line-level signals, MIC for a microphone or a guitar. Here it hears the SCOPE OUTPUT, so MIC drives it far harder and it distorts sooner.',
});
label(328, 603, 'MIC');
label(328, 707, 'LINE');
slide('in2.polarity', 418, 657, opts(['direct', 'DIRECT'], ['invert', 'INVERT']), 'direct', {
  module: 'util',
  name: 'Input 2 DIRECT / INVERT',
  help: 'Turns Input 2 upside down. Input 2 is DC coupled, so it can carry a control voltage too: pin a voltage into the Scope column and row 9 gives it back inverted, for panning one output against the other.',
});
label(418, 603, 'DIRECT');
label(418, 707, 'INVERT');

tab(647, 575, 'NOISE');
knob('noise.tone', 573, 645, 36, {
  module: 'osc',
  name: 'NOISE TONE',
  min: -5,
  max: 5,
  def: 0,
  fmt: (v) => (Math.abs(v) < 0.3 ? 'white' : v < 0 ? 'darker' : 'brighter'),
  help: 'The colour of the noise. At 0 it is white noise; turn left for a darker rumble, right for a thinner hiss.',
});
label(573, 707, 'NOISE TONE');
knob('noise.level', 735, 645, 36, {
  module: 'osc',
  name: 'Noise LEVEL',
  def: 0,
  fmt: (v) => fmtV(lvl(v, AUDIO_V)),
  help: 'How much noise reaches matrix row 6.',
});
label(735, 707, 'LEVEL');

// ── Oscillators 1 and 2 ───────────────────────────────────────────────────
tab(292, 731, 'OSCILLATOR 1');
tab(662, 731, 'OSCILLATOR 2');
const octOpts: ControlOption[] = [-3, -2, -1, 0, 1, 2, 3].map((n) => ({
  v: String(n),
  label: n > 0 ? `+${n}` : String(n),
}));
[1, 2].forEach((n) => {
  const x = n === 1 ? 290 : 665;
  knob(`osc${n}.tune`, x, 813, 44, {
    module: 'osc',
    name: `Oscillator ${n} TUNE`,
    def: 5,
    fmt: (v) => {
      const s = Math.round(tuneSemi(v) * 10) / 10;
      return s === 0 ? 'in tune' : `${s > 0 ? '+' : '−'}${Math.abs(s)} semitones`;
    },
    help: `Fine pitch of Oscillator ${n}, over about two octaves: in tune with the keyboard at 5, an octave down at 0 and up at 10. OCTAVE moves it in whole octaves.`,
  });
  label(x, 883, 'TUNE');
  controls.push({
    id: `osc${n}.octave`,
    type: 'knob',
    x: X(n === 1 ? 218 : 735),
    y: Y(945),
    r: 34,
    style: 'vcs3',
    cap: CAP,
    kind: 'enum',
    options: octOpts,
    def: '0',
    module: 'osc',
    labelPos: 'none',
    scale: { size: 10, numR: 1.6 },
    name: `Oscillator ${n} OCTAVE`,
    help: `Moves Oscillator ${n} up or down by up to three octaves.`,
  });
  label(n === 1 ? 218 : 735, 1002, 'OCTAVE');
});
knob('osc1.shape', 362, 945, 34, {
  module: 'osc',
  name: 'Oscillator 1 SHAPE',
  min: -5,
  max: 5,
  def: 0,
  fmt: (v) => (Math.abs(v) < 0.3 ? 'square and pure sine' : `${v < 0 ? 'inverted ' : ''}sharkfin`),
  help: 'Changes both of Oscillator 1’s waves at once. The pulse narrows either way from a square at 0; the sine bends into an upside-down sharkfin to the left and a sharkfin to the right, gaining harmonics.',
});
label(362, 1002, 'SHAPE');
knob('osc2.shape', 590, 945, 34, {
  module: 'osc',
  name: 'Oscillator 2 SHAPE',
  def: 0,
  fmt: (v) => (v < 0.3 ? 'square and saw' : `pulse ${Math.round(50 - v * 4.5)} %, super saw`),
  help: 'Changes both of Oscillator 2’s waves at once: the pulse narrows from a square at 0, and the saw thickens from a plain saw at 0 into a “dual super saw” at 10, a second saw drifting further out of tune against it.',
});
label(590, 1002, 'SHAPE');
[
  ['osc1.pulse', 218, 'Oscillator 1 pulse LEVEL', 'pulse', 1, 'pulse'],
  ['osc1.sine', 362, 'Oscillator 1 sine LEVEL', 'sine', 2, 'sine'],
  ['osc2.pulse', 590, 'Oscillator 2 pulse LEVEL', 'pulse', 3, 'pulse'],
  ['osc2.saw', 735, 'Oscillator 2 saw LEVEL', 'saw', 3, 'saw'],
].forEach(([id, x, name, word, row, glyph]) => {
  const osc1 = String(id).startsWith('osc1');
  knob(String(id), Number(x), 1075, 34, {
    module: 'osc',
    name: String(name),
    def: 0,
    fmt: (v) => fmtV(lvl(v, AUDIO_V)),
    help: osc1
      ? `How much of Oscillator 1’s ${word} reaches matrix row ${row}. Each of its waves has its own row, so they can go to different places.`
      : `How much of Oscillator 2’s ${word} goes into its mix. The pulse and the saw are mixed by these two knobs and share one matrix row, row 3.`,
  });
  decor.push({
    t: 'wave',
    x: X(Number(x) - 40),
    y: Y(1131),
    size: 10,
    shape: glyph === 'pulse' ? 'sq' : glyph === 'sine' ? 'sine' : 'saw',
  });
  label(Number(x) + 8, 1131, 'LEVEL');
});
slide('osc2.sync', 478, 820, opts(['free', 'Free'], ['sync', 'OSC2 → OSC1']), 'free', {
  module: 'osc',
  name: 'SYNC switch',
  help: 'Right, Oscillator 2 is hard-synced to Oscillator 1: it restarts with every cycle of Oscillator 1, so its pitch follows Oscillator 1 and tuning Oscillator 2 changes its tone instead, the classic sync sweep.',
});
label(478, 776, 'SYNC');
label(478, 865, 'OSC2 → OSC1', 12);
slide('osc1.shapeCv', 478, 957, opts(['pwm', 'PWM'], ['both', 'Both'], ['sine', 'SINE']), 'both', {
  module: 'osc',
  name: 'OSC1 SHAPE switch',
  help: 'Which of Oscillator 1’s waves the matrix Oscillator Shape column changes: the pulse width (PWM), both, or the sine’s shape. In this app the column moves the pulse width only, so SINE gives no change from the column.',
});
label(478, 905, 'OSC1 SHAPE', 12);
label(478, 1000, 'PWM + SINE', 12);
slide('osc2.shapeCv', 478, 1092, opts(['pwm', 'PWM'], ['none', 'Off'], ['saw', 'SAW']), 'none', {
  module: 'osc',
  name: 'OSC2 SHAPE switch',
  help: 'Which of Oscillator 2’s waves the matrix Oscillator Shape column changes: the pulse width (PWM), neither (centre), or the saw’s shape. In this app the column moves the pulse width only, so SAW gives no change from the column.',
});
label(478, 1045, 'OSC2 SHAPE', 12);
label(478, 1132, 'PWM ↔ SAW', 12);

// ── Oscillator 3 ──────────────────────────────────────────────────────────
tab(480, 1152, 'OSCILLATOR 3');
knob('osc3.tune', 225, 1245, 36, {
  module: 'lfo',
  name: 'Oscillator 3 TUNE',
  def: 5,
  fmt: (v) => fmtHz(osc3Hz(v)),
  help: 'Speed of Oscillator 3, from one cycle every 20 seconds to 500 Hz. It is built mainly as the SYNTRX’s LFO, but its top end is audible. With KEY FOL on, this is its speed at middle C.',
});
label(225, 1305, 'TUNE');
knob('osc3.shape', 365, 1245, 36, {
  module: 'lfo',
  name: 'Oscillator 3 SHAPE',
  def: 5,
  fmt: (v) =>
    Math.abs(v - 5) < 0.3 ? 'triangle and square' : v < 5 ? 'falling ramp' : 'rising ramp',
  help: 'Changes both of Oscillator 3’s waves together. At 5 they are a triangle and a square; turn either way and the triangle leans into a ramp while the pulse narrows.',
});
label(365, 1305, 'SHAPE');
slide('osc3.keyFol', 478, 1260, opts(['free', 'FREE'], ['key', 'KEY FOL']), 'free', {
  module: 'lfo',
  name: 'Oscillator 3 FREE / KEY FOL',
  help: 'FREE, Oscillator 3 runs at the speed TUNE sets whatever you play. KEY FOL, it follows the keyboard like the other two, so it can be a third audio oscillator.',
});
label(478, 1201, 'FREE');
label(478, 1305, 'KEY FOL');
knob('osc3.pulse', 585, 1245, 36, {
  module: 'lfo',
  name: 'Oscillator 3 pulse LEVEL',
  def: 0,
  fmt: (v) => fmtV(lvl(v, AUDIO_V)),
  help: 'How much of Oscillator 3’s pulse reaches matrix row 5, when the OSC 3 / S&H switch in the RANDOM section is at OSC 3. Row 5 is shared with the S&H.',
});
decor.push({ t: 'wave', x: X(545), y: Y(1305), size: 10, shape: 'sq' });
label(593, 1305, 'LEVEL');
knob('osc3.tri', 732, 1245, 36, {
  module: 'lfo',
  name: 'Oscillator 3 triangle LEVEL',
  def: 0,
  fmt: (v) => fmtV(lvl(v, AUDIO_V)),
  help: 'How much of Oscillator 3’s triangle (a ramp when SHAPE is off centre) reaches matrix row 4.',
});
decor.push({ t: 'wave', x: X(692), y: Y(1305), size: 10, shape: 'tri' });
label(740, 1305, 'LEVEL');

// ── Filter ────────────────────────────────────────────────────────────────
tab(478, 1338, 'FILTER');
knob('vcf.hpf', 225, 1435, 36, {
  module: 'filter',
  name: 'HPF',
  def: 0,
  fmt: (v) => (v <= 0.05 ? 'open' : fmtHz(hpfHz(v))),
  help: 'The high-pass cut-off: below it the sound is cut away. At 0 the high-pass is fully open, so the filter is a plain low-pass.',
});
label(225, 1495, 'HPF');
knob('vcf.lpf', 365, 1435, 36, {
  module: 'filter',
  name: 'LPF',
  def: 10,
  fmt: (v) => (v >= 9.95 ? 'open' : fmtHz(lpfHz(v))),
  help: 'The low-pass cut-off: above it the sound is cut away, so turning left darkens it. At 10 the low-pass is fully open, so the filter is a plain high-pass. Between the two knobs is a band-pass.',
});
label(365, 1495, 'LPF');
slide('vcf.cvTarget', 478, 1452, opts(['hpf', 'HPF'], ['both', 'Both'], ['lpf', 'LPF']), 'lpf', {
  module: 'filter',
  name: 'HPF / LPF switch',
  help: 'Which cut-off the matrix Filter Frequency column moves: the high-pass, both together (which moves the centre of a band-pass), or the low-pass.',
});
label(478, 1390, 'HPF');
label(478, 1495, 'LPF');
knob('vcf.res', 585, 1435, 36, {
  module: 'filter',
  name: 'RESONANCE',
  def: 0,
  fmt: (v) => (v >= 7 ? 'oscillating' : v >= 4 ? 'ringing' : 'smooth'),
  help: 'Emphasis at the low-pass cut-off. Turned up, the filter rings; from 7 it whistles on its own, a pure sine tone at the LPF setting that needs nothing pinned into it.',
});
label(585, 1495, 'RESONANCE');
knob('vcf.level', 732, 1435, 36, {
  module: 'filter',
  name: 'Filter LEVEL',
  def: 0,
  fmt: (v) => `×${Math.round(lvl(v, 2) * 100) / 100}`,
  help: 'How much of the filter’s output reaches matrix row 10.',
});
label(732, 1495, 'LEVEL');

// ── Scope ─────────────────────────────────────────────────────────────────
slide('scope.mode', 890, 573, opts(['audio', 'AUDIO'], ['cv', 'CV']), 'audio', {
  module: 'util',
  ui: true,
  name: 'Scope AUDIO / CV switch',
  help: 'Sets the meter to read audio (from the left, full scale about 4.5 V) or control voltages (zero in the middle). It reads whatever is pinned into the Scope column. The meter is drawn for reference: its needle does not move in this app.',
});
label(890, 520, 'AUDIO');
label(890, 622, 'CV');
decor.push(
  {
    t: 'rect',
    x: X(962),
    y: Y(452),
    w: 230,
    h: 228,
    r: 12,
    fill: '#141416',
    stroke: '#3a3b3f',
    sw: 3,
  },
  {
    t: 'rect',
    x: X(985),
    y: Y(470),
    w: 184,
    h: 140,
    r: 10,
    fill: '#efe2c4',
    stroke: '#8d826a',
    sw: 1.5,
  },
  { t: 'arc', x: X(1077), y: Y(600), r: 95, a0: -48, a1: 48, w: 1.5, stroke: '#2a2a2a' },
  { t: 'line', x1: X(1077), y1: Y(600), x2: X(1022), y2: Y(527), w: 1.6, stroke: '#2a2a2a' }
);
for (let k = 0; k <= 12; k++) {
  const a = (-48 + 8 * k) * (Math.PI / 180);
  decor.push({
    t: 'line',
    x1: X(1077) + Math.sin(a) * 95,
    y1: Y(600) - Math.cos(a) * 95,
    x2: X(1077) + Math.sin(a) * (k % 3 ? 88 : 84),
    y2: Y(600) - Math.cos(a) * (k % 3 ? 88 : 84),
    w: 1.2,
    stroke: k > 9 ? '#b4232a' : '#2a2a2a',
  });
}
label(1077, 575, 'VU', 18, { fill: '#2a2a2a', weight: 700 });
[
  [980, 466],
  [1174, 466],
  [980, 664],
  [1174, 664],
].forEach(([x, y]) => decor.push({ t: 'screw', x: X(x), y: Y(y), r: 7 }));

// ── Output channels ───────────────────────────────────────────────────────
tab(1372, 416, 'OUTPUT CH 1');
tab(1648, 416, 'OUTPUT CH 2');
const panWord = (p: number): string =>
  Math.abs(p) < 0.5
    ? 'centre'
    : p <= -4.5
      ? 'left'
      : p >= 4.5
        ? 'right'
        : p < 0
          ? 'left of centre'
          : 'right of centre';
[1, 2].forEach((ch) => {
  const lx = ch === 1 ? 1322 : 1602,
    px = ch === 1 ? 1447 : 1728;
  knob(`out${ch}.level`, lx, 488, 36, {
    module: 'out',
    name: `Output channel ${ch} LEVEL`,
    def: 7,
    fmt: (v) => `${Math.round(v * 10)} %`,
    help: `Level of output channel ${ch}. Each channel has a VCA, so a voltage pinned into the Output ch. level ${ch} column adds to this knob.`,
  });
  label(lx, 549, 'LEVEL');
  knob(`out${ch}.pan`, px, 488, 36, {
    module: 'out',
    name: `Output channel ${ch} PAN`,
    min: -5,
    max: 5,
    def: 0,
    fmt: panWord,
    help: `Where output channel ${ch} sits between the left and right outputs.`,
  });
  label(px, 549, 'PAN');
});

// ── Ring modulator and output filters ─────────────────────────────────────
tab(1380, 575, 'RINGMODULATOR');
const SOURCE_B: [string, string, number, NormalSource][] = [
  ['osc2', 'OSC2', -90, 'sum1'],
  ['osc3', 'OSC3', -60, 'o3tri'],
  ['in1', 'IN1', -30, 'mult'],
  ['in2', 'IN2', 0, 'preamp'],
  ['noise', 'NOISE', 30, 'noise'],
  ['vcf', 'VCF', 60, 'vcf1'],
  ['sign', 'SIGN', 90, null],
];
controls.push({
  id: 'ring.sourceB',
  type: 'knob',
  x: X(1315),
  y: Y(648),
  r: 34,
  style: 'vcs3',
  cap: CAP,
  kind: 'enum',
  options: SOURCE_B.map(([v, l, a]) => ({ v, label: l, a })),
  def: 'osc2',
  module: 'util',
  labelPos: 'none',
  scale: { size: 9, numR: 1.75 },
  name: 'Ring modulator SOURCE B',
  help: 'Chooses the ring modulator’s second signal, B, inside the instrument: Oscillator 2, Oscillator 3’s triangle, Input 1, Input 2, the noise or the filter. The manual does not say what SIGN is, so in this app it gives no B, and the ring modulator is silent there.',
});
label(1315, 707, 'SOURCE B');
knob('ring.level', 1448, 648, 36, {
  module: 'util',
  name: 'Ring modulator LEVEL',
  def: 0,
  fmt: (v) => `×${Math.round(lvl(v, 2) * 100) / 100}`,
  help: 'How much of the ring modulator’s output reaches matrix row 13: whatever is pinned into the Ringmod A column, multiplied by SOURCE B.',
});
label(1448, 707, 'LEVEL');
tab(1651, 575, 'OUTPUT FILTER');
[1, 2].forEach((ch) => {
  const x = ch === 1 ? 1603 : 1728;
  knob(`out${ch}.filter`, x, 648, 36, {
    module: 'out',
    name: `OUTPUT FILTER channel ${ch}`,
    def: 5,
    fmt: (v) => (Math.abs(v - 5) < 0.15 ? 'flat' : v < 5 ? 'lows up' : 'highs up'),
    help: `Tone control for output channel ${ch}. Flat at 5; turn left to bring up the lows, right to bring up the highs.`,
  });
  label(x, 707, `CHANNEL ${ch}`);
});

// ── Random (sample and hold) ──────────────────────────────────────────────
tab(1060, 731, 'RANDOM');
knob('snh.rate', 898, 817, 36, {
  module: 'mod',
  name: 'S&H RATE',
  def: 5,
  fmt: (v) => fmtHz(shHz(v)),
  help: 'How often the sample and hold takes a new sample of whatever is pinned into the S&H Input column, from about once every five seconds to 200 times a second. Fast, on an audio signal, it is a bit-crusher.',
});
label(898, 885, 'S&H RATE');
decor.push({ t: 'led', x: X(962), y: Y(767), r: 7, color: 'red' });
slide('snh.clock', 1023, 833, opts(['free', 'FREE'], ['gate', 'GATE']), 'free', {
  module: 'mod',
  name: 'S&H FREE / GATE',
  help: 'FREE, the sample and hold runs on its own clock at S&H RATE. GATE, it takes a sample at each new note instead. The GATE setting is not modelled in this app: the S&H keeps its own clock.',
});
label(1023, 772, 'FREE');
label(1023, 885, 'GATE');
slide('snh.select', 1115, 833, opts(['osc3', 'OSC 3'], ['snh', 'S&H']), 'osc3', {
  module: 'mod',
  name: 'OSC 3 / S&H switch',
  help: 'Matrix row 5 is shared: up, it carries Oscillator 3’s pulse; down, the sample and hold’s stepped voltage.',
});
label(1115, 772, 'OSC 3');
label(1115, 885, 'S&H');
knob('snh.level', 1240, 817, 36, {
  module: 'mod',
  name: 'S&H LEVEL',
  def: 0,
  fmt: (v) => `×${Math.round(lvl(v, 2) * 100) / 100}`,
  help: 'How much of the sample and hold’s output reaches matrix row 5, when the OSC 3 / S&H switch is at S&H.',
});
label(1240, 885, 'LEVEL');

// ── Effects ───────────────────────────────────────────────────────────────
tab(1548, 731, 'EFFECTS');
knob('fx.time', 1395, 817, 36, {
  module: 'fx',
  name: 'Effects TIME',
  def: 5,
  fmt: (v) => fmtTime(delayS(v)),
  help: 'The delay time, from 50 ms to half a second; with the switch at REVERB, the size of the room.',
});
label(1395, 885, 'TIME');
decor.push({ t: 'led', x: X(1468), y: Y(760), r: 7, color: 'red' });
knob('fx.feedback', 1530, 827, 32, {
  module: 'fx',
  name: 'Effects FEEDBACK',
  def: 3,
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How many repeats the delay makes; turned up it runs away into self-oscillation. With REVERB, how long the reverb rings: at the top it keeps going on its own.',
});
label(1530, 885, 'FEEDBACK');
decor.push({ t: 'led', x: X(1628), y: Y(757), r: 7, color: 'red' });
slide('fx.type', 1628, 833, opts(['delay', 'DELAY'], ['reverb', 'REVERB']), 'delay', {
  module: 'fx',
  name: 'DELAY / REVERB switch',
  help: 'Chooses the effect: a tape-style delay, or a reverb.',
});
label(1628, 778, 'DELAY');
label(1628, 885, 'REVERB');
knob('fx.level', 1728, 827, 32, {
  module: 'fx',
  name: 'Effects LEVEL',
  def: 0,
  fmt: (v) => `×${Math.round(lvl(v, 2) * 100) / 100}`,
  help: 'How much of the effect reaches matrix row 14. The effect gives the wet signal only: for a mix, pin the dry sound and row 14 to the same output.',
});
label(1728, 885, 'LEVEL');

// ── Trapezoid ─────────────────────────────────────────────────────────────
tab(1545, 916, 'TRAPEZOID');
decor.push({ t: 'led', x: X(1478), y: Y(947), r: 9, color: 'red', litWhen: 'env1' });
const trapKnob = (
  id: string,
  x: number,
  y: number,
  def: number,
  rest: Omit<KnobRest, 'def' | 'module'>
) => knob(id, x, y, 44, { module: 'env', def, ...rest });
trapKnob('trap.attack', 1400, 1005, 0, {
  name: 'Trapezoid ATTACK',
  fmt: (v) => fmtTime(attackS(v)),
  help: 'How long the trapezoid takes to rise, from 6 ms to 850 ms.',
});
label(1400, 1077, 'ATTACK');
trapKnob('trap.on', 1555, 1005, 3, {
  name: 'Trapezoid ON',
  fmt: (v) => fmtTime(onS(v)),
  help: 'How long the trapezoid stays at the top before it falls, up to 1.5 seconds. Played from the keys, it stays up for as long as the key is held.',
});
label(1555, 1077, 'ON');
trapKnob('trap.decay', 1708, 1005, 4, {
  name: 'Trapezoid DECAY',
  fmt: (v) => fmtTime(decayS(v)),
  help: 'How long the trapezoid takes to fall back, from 16 ms to 2 seconds. Pins in the Decay column lengthen or shorten it.',
});
label(1708, 1077, 'DECAY');
trapKnob('trap.off', 1400, 1172, 10, {
  name: 'Trapezoid OFF',
  fmt: (v) => (v > OFF_MANUAL ? 'manual: waits for a gate' : `loops, off ${fmtTime(offS(v))}`),
  help: 'The rest between cycles, 14 ms to 1.3 seconds: the trapezoid loops on its own. Above 9 it stops looping and waits for a key or the GATE button, which is how to play it from a keyboard.',
});
label(1400, 1245, 'OFF');
label(1453, 1222, 'MANUAL', 8);
trapKnob('trap.level', 1555, 1172, 0, {
  name: 'TRAPEZOID level',
  fmt: (v) => fmtV(lvl(v, 5)),
  help: 'How much of the envelope itself, as a control voltage up to 5 V, reaches matrix row 11. Pin it to a frequency column to sweep pitch or the filter with each envelope.',
});
label(1555, 1245, 'TRAPEZOID');
trapKnob('trap.signal', 1708, 1172, 0, {
  name: 'Trapezoid SIGNAL',
  fmt: (v) => `×${Math.round(lvl(v, 2) * 100) / 100}`,
  help: 'How much of the trapezoid’s VCA reaches matrix row 12: whatever is pinned into the Envelope Signal column, made louder and quieter by the envelope.',
});
label(1708, 1245, 'SIGNAL');

// ── Joystick ──────────────────────────────────────────────────────────────
knob('joy.yLevel', 1385, 1352, 34, {
  module: 'mod',
  name: 'Joystick Y LEVEL',
  def: 0,
  fmt: (v) => `±${fmtV(5 * (v / 10))}`,
  help: 'The range of the joystick’s up-down voltage on matrix row 15, up to ±5 V.',
});
label(1385, 1405, '↕ LEVEL');
knob('joy.xLevel', 1722, 1352, 34, {
  module: 'mod',
  name: 'Joystick X LEVEL',
  def: 0,
  fmt: (v) => `±${fmtV(5 * (v / 10))}`,
  help: 'The range of the joystick’s left-right voltage on matrix row 16, up to ±5 V.',
});
label(1722, 1405, '↔ LEVEL');
decor.push(
  { t: 'led', x: X(1453), y: Y(1300), r: 7, color: 'amber' },
  { t: 'led', x: X(1655), y: Y(1300), r: 7, color: 'amber' }
);
controls.push(
  {
    id: 'joy.x',
    type: 'joystick',
    pair: 'joy.y',
    x: X(1555),
    y: Y(1385),
    r: 100,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (left-right)',
    fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`,
    help: 'The joystick. Its left-right position is a voltage on matrix row 16, its up-down position one on row 15, each scaled by its LEVEL knob. Drag the stick; double-click to centre it.',
  },
  {
    id: 'joy.y',
    type: 'joystick',
    pairOf: 'joy.x',
    x: X(1555),
    y: Y(1386),
    r: 100,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (up-down)',
    fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`,
    help: 'The joystick’s up-down position, a voltage on matrix row 15 scaled by the ↕ LEVEL knob. Drawn as part of the joystick.',
  }
);
button('ui.rec', 1407, 1465, 40, {
  module: 'mod',
  ui: true,
  red: true,
  name: 'REC/CLEAR button',
  help: 'Hold it and move the joystick, press GATE or turn the effects TIME knob to record up to 8 seconds of that motion, which then plays back in a loop; tap it twice to clear. Recording is not modelled in this app.',
});
label(1407, 1505, 'REC/CLEAR');
button('trap.gate', 1703, 1465, 36, {
  module: 'env',
  name: 'GATE button',
  help: 'Fires the trapezoid by hand, like a key, when OFF is above 9. Click to hold it down and click again to let go: the trapezoid stays up for as long as it is held. On the hardware SHIFT + GATE opens the sequencer, which this app does not model.',
});
label(1703, 1505, 'GATE');

// ── Patch memory and the encoders ─────────────────────────────────────────
const MEM =
  'The SYNTRX II keeps 256 patches of the matrix, the sequence and the settings (but not the knobs). Patch memory is not modelled in this app: use the app’s own sounds and saving instead.';
knob('ui.encX', 920, 1408, 34, {
  module: 'mode',
  ui: true,
  name: 'Left (Y) encoder',
  def: 5,
  scale: { ticks: 0 },
  help: 'On the hardware this encoder moves up and down the matrix, and a push sets the point under it: gain 1, then 0.7, then 0.3, then off. Here you click a point of the matrix instead, and every point is gain 1.',
});
knob('ui.encY', 1220, 1408, 34, {
  module: 'mode',
  ui: true,
  name: 'Right (X) encoder',
  def: 5,
  scale: { ticks: 0 },
  help: 'On the hardware this encoder moves left and right along the matrix, and a push sets the point under it at gain 1 or clears it. Here you click a point of the matrix instead.',
});
decor.push(
  { t: 'path', d: `M${X(920)} ${Y(1360)} l-5 8 h10 z`, w: 0, fill: INK },
  { t: 'path', d: `M${X(920)} ${Y(1456)} l-5 -8 h10 z`, w: 0, fill: INK },
  { t: 'path', d: `M${X(1168)} ${Y(1400)} l8 -5 v10 z`, w: 0, fill: INK },
  { t: 'path', d: `M${X(1272)} ${Y(1400)} l-8 -5 v10 z`, w: 0, fill: INK }
);
(
  [
    [
      'ui.recall',
      1003,
      1405,
      'RECALL',
      'RECALL button',
      `Loads a saved patch; SHIFT + RECALL clears the matrix. ${MEM}`,
    ],
    ['ui.save', 1063, 1405, 'SAVE', 'SAVE button', `Saves the patch to one of 256 places. ${MEM}`],
    [
      'ui.shift',
      1120,
      1405,
      'SHIFT',
      'SHIFT button',
      'Gives the other buttons and the encoders their second functions: the sequencer, the configuration pages, random patches. None of those are modelled in this app.',
    ],
    [
      'ui.patchPrev',
      1003,
      1467,
      '',
      'PATCH < button',
      `Steps back through the saved patches; on the sequencer page it starts and stops the sequence. ${MEM}`,
    ],
    [
      'ui.patchNext',
      1120,
      1467,
      '',
      'PATCH > button',
      `Steps on through the saved patches; SHIFT + PATCH > makes a random patch. ${MEM}`,
    ],
  ] as const
).forEach(([id, x, y, text, name, help]) => {
  button(id, x, y, 24, { module: 'mode', ui: true, name, help });
  if (text) label(x, y + 25, text, 11);
});
label(1063, 1467, 'PATCH', 11);
decor.push(
  { t: 'path', d: `M${X(978)} ${Y(1467)} l7 -5 v10 z`, w: 0, fill: INK },
  { t: 'path', d: `M${X(1146)} ${Y(1467)} l-7 -5 v10 z`, w: 0, fill: INK }
);
label(1068, 1508, 'SYNTRX II', 40, { weight: 300, spacing: 6, brand: true });

// ── The matrix ────────────────────────────────────────────────────────────
// Holes measured on the photo: row 1 column A at (928, 1048), row 16 column P at (1212, 1332).
const MX0 = 928,
  MY0 = 1048,
  MP = 18.93;
const colX = (k: number): number => MX0 + k * MP;
const rowY = (n: number): number => MY0 + (n - 1) * MP;
decor.push(
  { t: 'rect', x: X(912), y: Y(911), w: 133, h: 13, r: 0, fill: INK },
  { t: 'rect', x: X(1047), y: Y(911), w: 168, h: 13, r: 0, fill: INK }
);
label(978, 917, 'SIGNAL INPUTS', 8.5, { fill: PANEL, weight: 700 });
label(1131, 917, 'CONTROL INPUTS', 8.5, { fill: PANEL, weight: 700 });
box(MX0 - MP / 2, 926, MX0 + 15.5 * MP, 1030, 1.2);
for (const k of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  decor.push({
    t: 'line',
    x1: X(MX0 + (k - 0.5) * MP),
    y1: Y(926),
    x2: X(MX0 + (k - 0.5) * MP),
    y2: Y(1030),
    w: 0.8,
  });
'ABCDEFGHIJKLMNOP'.split('').forEach((l, k) => label(colX(k), 1347, l, 11, { weight: 600 }));
for (let n = 1; n <= 16; n++) label(1232, rowY(n), String(n), 11, { weight: 600 });
label(818, 1085, 'SOURCES', 9, { rotate: -90 });
box(828, 1036, 910, 1342, 1.2);

const rowIds: string[] = [];
const colIds: string[] = [];
/** A matrix row: an output jack at its printed legend, `gain` = its LEVEL knob. */
const row = (
  n: number,
  id: string,
  name: string,
  signal: string | null,
  gain: OutputJack['gain'],
  help: string,
  rest: Pick<OutputJack, 'check'> = {}
): void => {
  rowIds.push(id);
  jacks.push({
    id,
    x: X(869),
    y: Y(rowY(n)),
    r: 9,
    label: name,
    name: `${name} (row ${n})`,
    labelPos: 'none',
    dir: 'out',
    signal,
    gain,
    help,
    ...rest,
  });
};
/** A matrix column: an input jack at its printed name. Points in one column add together. */
const col = (
  k: number,
  id: string,
  name: string,
  dest: string | null,
  amt: number,
  help: string,
  rest: Pick<InputJack, 'hear' | 'check'> = {}
): void => {
  colIds.push(id);
  jacks.push({
    id,
    x: X(colX(k)),
    y: Y(978),
    r: 9,
    label: name,
    name: `${name} (column ${'ABCDEFGHIJKLMNOP'[k]})`,
    labelPos: 'none',
    dir: 'in',
    dest,
    amt,
    add: true,
    help,
    ...rest,
  });
};
const levelCheck =
  (id: string, knobName: string, n: number) =>
  (v: ControlValues): string | null =>
    num(v, id) <= 0 ? `${knobName} is at 0, so nothing leaves row ${n}. Turn it up.` : null;

// Row legends, grouped as the panel prints them
const rowText = (n: number, t: string, size = 9.5): void =>
  label(834, n, t, size, { anchor: 'start' });
rowText(rowY(1.5), 'Oscillator 1');
rowText(rowY(3), 'Oscillator 2');
rowText(rowY(4.25), 'Oscillator 3');
rowText(rowY(4.85), '+S&H', 8.5);
[
  'Noise',
  'Input 1',
  'Env. Follower',
  'Input 2',
  'Filter',
  'Trapezoid',
  'Env. signal',
  'Ring mod',
  'Effects',
].forEach((t, i) => rowText(rowY(6 + i), t));
rowText(rowY(15.5), 'Joystick');
[
  [1, 'sq'],
  [2, 'sine'],
  [4, 'tri'],
  [5, 'sq'],
].forEach(([n, s]) =>
  decor.push({
    t: 'wave',
    x: X(900),
    y: Y(rowY(Number(n))),
    size: 7,
    shape: s as 'sq' | 'sine' | 'tri',
  })
);
label(900, rowY(15), '↕', 9);
label(900, rowY(16), '↔', 9);
for (const n of [3, 4, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15])
  decor.push({
    t: 'line',
    x1: X(828),
    y1: Y(rowY(n) - MP / 2),
    x2: X(910),
    y2: Y(rowY(n) - MP / 2),
    w: 0.8,
  });

row(
  1,
  'r.osc1pulse',
  'Oscillator 1 pulse',
  'o1pulse',
  (v) => lvl(num(v, 'osc1.pulse'), AUDIO_V),
  'Oscillator 1’s pulse, at the level of its pulse LEVEL knob. SHAPE sets its width.',
  { check: levelCheck('osc1.pulse', 'Oscillator 1 pulse LEVEL', 1) }
);
row(
  2,
  'r.osc1sine',
  'Oscillator 1 sine',
  'o1sine',
  (v) => lvl(num(v, 'osc1.sine'), AUDIO_V),
  'Oscillator 1’s sine, at the level of its sine LEVEL knob. SHAPE bends it into a sharkfin either way.',
  { check: levelCheck('osc1.sine', 'Oscillator 1 sine LEVEL', 2) }
);
row(
  3,
  'r.osc2',
  'Oscillator 2',
  'sum1',
  AUDIO_V,
  'Oscillator 2’s pulse and saw, already mixed by their two LEVEL knobs.',
  {
    check: (v) =>
      num(v, 'osc2.pulse') <= 0 && num(v, 'osc2.saw') <= 0
        ? 'Both of Oscillator 2’s LEVEL knobs are at 0, so nothing leaves row 3. Turn up the pulse or the saw.'
        : null,
  }
);
row(
  4,
  'r.osc3tri',
  'Oscillator 3 triangle',
  'o3tri',
  (v) => lvl(num(v, 'osc3.tri'), AUDIO_V),
  'Oscillator 3’s triangle, a ramp when SHAPE is off centre. Slow, it is the SYNTRX’s usual vibrato and sweep source.',
  { check: levelCheck('osc3.tri', 'Oscillator 3 triangle LEVEL', 4) }
);
row(
  5,
  'r.osc3sh',
  'Oscillator 3 pulse / S&H',
  'att1',
  (v) =>
    v['snh.select'] === 'snh' ? lvl(num(v, 'snh.level'), 2) : lvl(num(v, 'osc3.pulse'), AUDIO_V),
  'Shared by Oscillator 3’s pulse and the sample and hold: the OSC 3 / S&H switch in the RANDOM section chooses, and the chosen one’s LEVEL knob sets it.',
  {
    check: (v) =>
      v['snh.select'] === 'snh'
        ? num(v, 'snh.level') <= 0
          ? 'The S&H LEVEL is at 0, so nothing leaves row 5. Turn it up.'
          : null
        : num(v, 'osc3.pulse') <= 0
          ? 'Oscillator 3’s pulse LEVEL is at 0, so nothing leaves row 5. Turn it up, or switch row 5 to the S&H.'
          : null,
  }
);
row(
  6,
  'r.noise',
  'Noise',
  'noise',
  (v) => lvl(num(v, 'noise.level'), AUDIO_V),
  'The noise generator, coloured by NOISE TONE, at the level of its LEVEL knob.',
  { check: levelCheck('noise.level', 'Noise LEVEL', 6) }
);
row(
  7,
  'r.in1',
  'Input 1',
  'mult',
  (v) => lvl(num(v, 'in1.level'), 1.5),
  'Input 1. Nothing is plugged into it in this app, so it carries the SCOPE OUTPUT, normalled to it as on the hardware: whatever is pinned into the Scope column comes back here.',
  { check: levelCheck('in1.level', 'Input 1 LEVEL', 7) }
);
row(
  8,
  'r.ef',
  'Envelope follower',
  'envf',
  (v) => (num(v, 'in1.ef') / 5) * 3,
  'The envelope follower’s voltage: it rises as Input 1 gets louder, scaled and turned over by EF LEVEL.',
  {
    check: (v) =>
      num(v, 'in1.ef') === 0
        ? 'EF LEVEL is at 0, so nothing leaves row 8. Turn it either way.'
        : num(v, 'in1.level') <= 0
          ? 'Input 1 LEVEL is at 0, so the envelope follower hears nothing. Turn it up.'
          : null,
  }
);
row(
  9,
  'r.in2',
  'Input 2',
  'preamp',
  (v) => (v['in2.polarity'] === 'invert' ? -AUDIO_V : AUDIO_V),
  'Input 2, through its gain stage. With nothing plugged in it carries the SCOPE OUTPUT, as on the hardware; INVERT turns it upside down.',
  { check: levelCheck('in2.level', 'Input 2 LEVEL', 9) }
);
row(
  10,
  'r.vcf',
  'Filter',
  'vcf1',
  (v) => lvl(num(v, 'vcf.level'), 2) * filterOscBoost(v),
  'The filter’s output, at the level of the filter LEVEL knob.',
  { check: levelCheck('vcf.level', 'Filter LEVEL', 10) }
);
row(
  11,
  'r.trap',
  'Trapezoid',
  'env1',
  (v) => lvl(num(v, 'trap.level'), 5),
  'The trapezoid envelope as a control voltage, at the level of the TRAPEZOID knob.',
  { check: levelCheck('trap.level', 'The TRAPEZOID level', 11) }
);
row(
  12,
  'r.envsig',
  'Env. signal',
  'vca',
  (v) => lvl(num(v, 'trap.signal'), 2),
  'Whatever is pinned into the Envelope Signal column, made louder and quieter by the trapezoid, at the level of the SIGNAL knob.',
  { check: levelCheck('trap.signal', 'The trapezoid SIGNAL level', 12) }
);
row(
  13,
  'r.ring',
  'Ring mod',
  'ring',
  (v) => lvl(num(v, 'ring.level'), 2),
  'The ring modulator: the Ringmod A column multiplied by SOURCE B, at the level of its LEVEL knob.',
  { check: levelCheck('ring.level', 'Ring modulator LEVEL', 13) }
);
row(
  14,
  'r.fx',
  'Effects',
  'att2',
  (v) => lvl(num(v, 'fx.level'), 2),
  'The effect’s wet output: the delay, or the reverb, of whatever is pinned into the Effects column.',
  { check: levelCheck('fx.level', 'Effects LEVEL', 14) }
);
row(
  15,
  'r.joyy',
  'Joystick Y',
  'joyY',
  (v) => (5 * num(v, 'joy.yLevel')) / 10,
  'The joystick’s up-down position: 0 V in the middle, up to ±5 V by its ↕ LEVEL knob.',
  { check: levelCheck('joy.yLevel', 'The joystick’s ↕ LEVEL', 15) }
);
row(
  16,
  'r.joyx',
  'Joystick X',
  'joyX',
  (v) => (5 * num(v, 'joy.xLevel')) / 10,
  'The joystick’s left-right position: 0 V in the middle, up to ±5 V by its ↔ LEVEL knob.',
  { check: levelCheck('joy.xLevel', 'The joystick’s ↔ LEVEL', 16) }
);

// Column legends: each name stands up above its column, as printed
const colText = (k: number, t: string, size = 8.5, y = 1022): void =>
  label(colX(k) + 3, y, t, size, { anchor: 'start', rotate: -90 });
['Ch1 Output', 'Scope', 'Ch2 Output', 'Envelope Signal', 'Ringmod A', 'Effects', 'Filter'].forEach(
  (t, k) => colText(k, t)
);
colText(8, 'Oscillator frequency', 8, 1011);
['1', '2', '3'].forEach((t, i) => label(colX(7 + i), 1022, t, 8));
colText(10, 'Oscillator Shape');
colText(11, 'Decay');
colText(12, 'S&H Input');
colText(13, 'Filter Frequency');
colText(14.5, 'Output ch. level', 8, 1011);
['1', '2'].forEach((t, i) => label(colX(14 + i), 1022, t, 8));

const cap = (t: string): string => t.charAt(0).toUpperCase() + t.slice(1);
const slow = (x: JackHearContext): boolean => !['audio', 'noise', 'fast'].includes(x.kind);
const outHear =
  (ch: number): Hear =>
  (v, x) =>
    slow(x)
      ? `${cap(x.src)} is a control voltage, not a sound, so at output channel ${ch} it gives clicks at most.`
      : `${cap(x.src)} goes to output channel ${ch}: through its VCA (LEVEL plus anything pinned into Output ch. level ${ch}), its OUTPUT FILTER, and to the ${panWord(num(v, `out${ch}.pan`))} of the stereo output.`;
const outCheck =
  (ch: number) =>
  (v: ControlValues): string | null =>
    num(v, `out${ch}.level`) <= 0
      ? `Output channel ${ch} LEVEL is at 0, so the channel is shut (unless a voltage is pinned into Output ch. level ${ch}). Turn it up.`
      : null;
const pitchHear =
  (n: number): Hear =>
  (_v, x) =>
    x.kind === 'lfo'
      ? `Vibrato: Oscillator ${n}’s pitch rises and falls with ${x.live}.`
      : x.kind === 'env'
        ? `Oscillator ${n}’s pitch now sweeps with each envelope.`
        : null;

col(
  0,
  'c.out1',
  'Ch1 Output',
  'out1In',
  1,
  'Output channel 1. Anything pinned here goes through its VCA and OUTPUT FILTER to the outputs. Every patch has to end in Ch1 Output or Ch2 Output to be heard.',
  { hear: outHear(1), check: outCheck(1) }
);
col(
  1,
  'c.scope',
  'Scope',
  'multIn',
  1,
  'The meter and the SCOPE OUTPUT jack. The meter is drawn for reference and does not move here. The SCOPE OUTPUT is normalled to both inputs, so whatever is pinned here comes back on rows 7, 8 and 9: Input 1, the envelope follower and Input 2.',
  {
    hear: (_v, x) =>
      `${cap(x.src)} is now on the meter and the SCOPE OUTPUT, so it also comes back on Input 1 (row 7), the envelope follower (row 8) and Input 2 (row 9), at their LEVEL knobs.`,
  }
);
col(
  2,
  'c.out2',
  'Ch2 Output',
  'out2In',
  1,
  'Output channel 2. Anything pinned here goes through its VCA and OUTPUT FILTER to the outputs.',
  { hear: outHear(2), check: outCheck(2) }
);
col(
  3,
  'c.env',
  'Envelope Signal',
  'vcaIn',
  1,
  'The input of the trapezoid’s VCA. What is pinned here comes out on row 12, made louder and quieter by the trapezoid.',
  {
    hear: (_v, x) =>
      slow(x)
        ? `${cap(x.src)} is a control voltage, not a sound; the VCA would only make it rise and fall.`
        : `${cap(x.src)} now goes through the trapezoid’s VCA: it rises and falls with each envelope. It comes out on row 12 at the SIGNAL knob, so pin row 12 to an output to hear it.`,
  }
);
col(
  4,
  'c.ringA',
  'Ringmod A',
  'ringA',
  1,
  'The ring modulator’s input A. Its output, on row 13, is A multiplied by the SOURCE B the rotary switch chooses: neither pitch survives, only their sum and difference.'
);
col(
  5,
  'c.fx',
  'Effects',
  'delayIn',
  1,
  'The effects input. The wet delay or reverb comes out on row 14.',
  {
    hear: (v, x) =>
      `${cap(x.src)} now feeds the ${v['fx.type'] === 'reverb' ? 'reverb' : 'delay'}. Only the wet sound comes out, on row 14: pin row 14 and the dry sound to the same output for a mix.`,
  }
);
col(
  6,
  'c.vcf',
  'Filter',
  'vcfIn',
  1,
  'The filter’s input. The filtered sound comes out on row 10.',
  {
    hear: (_v, x) =>
      slow(x)
        ? `${cap(x.src)} is a control voltage, not a sound. Fed into the filter it gives clicks at most.`
        : `The filter now takes ${x.src}. LPF darkens it, HPF thins it, RESONANCE makes it ring. The result is on row 10 at the filter LEVEL knob, so pin row 10 to an output (or to the Envelope Signal column first, to give it an envelope).`,
  }
);
col(
  7,
  'c.osc1',
  'Oscillator frequency 1',
  'pitch1',
  12,
  'Oscillator 1’s pitch. A voltage here adds to TUNE and OCTAVE at 1 V per octave.',
  { hear: pitchHear(1) }
);
col(
  8,
  'c.osc2',
  'Oscillator frequency 2',
  'inv1In',
  1,
  'Oscillator 2’s pitch. A voltage here adds to TUNE and OCTAVE at 1 V per octave, and moves its super saw with it.',
  { hear: pitchHear(2) }
);
col(
  9,
  'c.osc3',
  'Oscillator frequency 3',
  'pitch3',
  12,
  'Oscillator 3’s speed. A voltage here adds to its TUNE at 1 V per octave.',
  { hear: pitchHear(3) }
);
col(
  10,
  'c.shape',
  'Oscillator Shape',
  'sum2A',
  1,
  'The oscillators’ shape. A voltage here adds to the SHAPE knobs of Oscillators 1 and 2, as their OSC1 SHAPE and OSC2 SHAPE switches choose. In this app it moves the pulse widths only.',
  {
    hear: (v, x) => {
      const o1 = v['osc1.shapeCv'] !== 'sine';
      const o2 = v['osc2.shapeCv'] === 'pwm';
      if (!o1 && !o2)
        return 'The shape switches send this column to the sine and the saw, which this app does not move, so nothing changes. Set OSC1 SHAPE or OSC2 SHAPE to PWM.';
      const who = o1 && o2 ? 'Oscillators 1 and 2' : o1 ? 'Oscillator 1' : 'Oscillator 2';
      return x.kind === 'lfo'
        ? `Pulse-width modulation: ${who}’s pulse narrows and widens with ${x.live}, the moving, chorus-like sound of PWM.`
        : `${cap(x.src)} now moves ${who}’s pulse width.`;
    },
  }
);
col(
  11,
  'c.decay',
  'Decay',
  'decayCv',
  1,
  'The trapezoid’s DECAY. A rising voltage lengthens it, doubling it for each volt.',
  {
    hear: (_v, x) =>
      x.kind === 'lfo' || x.kind === 'env'
        ? `${cap(x.live)} now lengthens and shortens each DECAY as it moves, so the envelopes ring for different lengths.`
        : `${cap(x.src)} now moves the DECAY time.`,
  }
);
col(
  12,
  'c.sh',
  'S&H Input',
  'shIn',
  1,
  'What the sample and hold samples. Its stepped output is on row 5 when the OSC 3 / S&H switch is at S&H. Noise gives random steps, a slow wave a staircase, and an audio signal at a high S&H RATE a bit-crushed sound.',
  {
    hear: (v, x) =>
      `The sample and hold now samples ${x.src} ${fmtHz(shHz(num(v, 'snh.rate')))} times a second.${v['snh.select'] !== 'snh' ? ' Switch OSC 3 / S&H to S&H to put its steps on row 5.' : ''}`,
  }
);
col(
  13,
  'c.cutoff',
  'Filter Frequency',
  'invertIn',
  1,
  'The filter’s cut-off: the HPF, the LPF or both, as the HPF / LPF switch chooses. A voltage here adds to the knobs at an octave per volt.',
  {
    hear: (v, x) => {
      const t = v['vcf.cvTarget'];
      const what =
        t === 'hpf'
          ? 'the high-pass cut-off'
          : t === 'both'
            ? 'both cut-offs'
            : 'the low-pass cut-off';
      return x.kind === 'lfo'
        ? `A filter sweep: ${what} rises and falls with ${x.live}.`
        : x.kind === 'env'
          ? `${cap(what)} now opens with each envelope and closes as it falls.`
          : `${cap(x.src)} now moves ${what}.`;
    },
  }
);
col(
  14,
  'c.lvl1',
  'Output ch. level 1',
  'out1Lvl',
  0.2,
  'Output channel 1’s VCA. A voltage here adds to its LEVEL knob.'
);
col(
  15,
  'c.lvl2',
  'Output ch. level 2',
  'out2Lvl',
  0.2,
  'Output channel 2’s VCA. A voltage here adds to its LEVEL knob. Pin a voltage here and the same voltage inverted (Input 2 set to INVERT) into the other channel, and the sound pans between them.'
);

// ── Areas ─────────────────────────────────────────────────────────────────
const areas: Area[] = [
  {
    id: 'input1',
    label: 'Input 1 and envelope follower',
    module: 'util',
    keywords: 'external input envelope follower ducking gate threshold',
    rects: [rect(147, 408, 812, 565)],
    help: 'An external input with an envelope follower, which turns how loud Input 1 is into a voltage on row 8 (and, on the hardware, a gate). Nothing is plugged in here, so Input 1 carries the SCOPE OUTPUT: pin something into the Scope column to give it a signal.',
  },
  {
    id: 'input2',
    label: 'Input 2',
    module: 'util',
    keywords: 'external input mic line invert overdrive',
    rects: [rect(147, 565, 477, 722)],
    help: 'A DC-coupled external input with a mic or line gain, a level that overdrives near the top, and an INVERT switch. Here it carries the SCOPE OUTPUT, so it can turn a voltage upside down or distort a sound pinned into the Scope column. Its output is row 9.',
  },
  {
    id: 'noise',
    label: 'Noise',
    module: 'osc',
    keywords: 'white noise hiss colour tone',
    rects: [rect(477, 565, 812, 722)],
    help: 'A Zener-diode noise generator for wind, surf and percussion, darker or brighter by NOISE TONE. Its output is row 6.',
  },
  {
    id: 'osc12',
    label: 'Oscillators 1 and 2',
    module: 'osc',
    keywords: 'vco pulse sine sharkfin saw super saw sync pwm octave tune',
    rects: [rect(147, 722, 812, 1143)],
    help: 'Two audio oscillators that follow the keyboard. Oscillator 1 has a pulse (row 1) and a sine (row 2), each with its own LEVEL; Oscillator 2 mixes a pulse and a saw onto row 3, and can be synced to Oscillator 1. Each SHAPE knob changes both of its waves, and the switches in the middle say what the matrix Oscillator Shape column changes.',
  },
  {
    id: 'osc3',
    label: 'Oscillator 3',
    module: 'lfo',
    keywords: 'lfo slow modulation vibrato triangle ramp key follow',
    rects: [rect(147, 1143, 812, 1330)],
    help: 'A slow oscillator that reaches into the audio range, 0.05 to 500 Hz: the SYNTRX’s LFO. Its triangle is row 4 and its pulse shares row 5 with the S&H. With KEY FOL it follows the keyboard.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords: 'vcf highpass lowpass bandpass cutoff resonance',
    rects: [rect(147, 1330, 812, 1525)],
    help: 'A high-pass and a low-pass in series. HPF at 0 makes it a low-pass and LPF at 10 a high-pass; anything between is a band-pass. RESONANCE from 7 makes it a sine oscillator. It filters what is pinned into the Filter column, onto row 10.',
  },
  {
    id: 'scope',
    label: 'Scope',
    module: 'util',
    keywords: 'meter vu level scope output',
    rects: [rect(812, 408, 1240, 722)],
    help: 'A meter on the Scope column, for checking audio levels or control voltages. It is drawn for reference and does not move in this app. The Scope column also feeds the SCOPE OUTPUT, which is normalled to both inputs.',
  },
  {
    id: 'outputs',
    label: 'Output channels',
    module: 'out',
    keywords: 'volume level pan stereo vca output',
    rects: [rect(1240, 408, 1790, 565)],
    help: 'Two output channels, fed by the Ch1 Output and Ch2 Output columns. Each LEVEL is a VCA that the Output ch. level columns add to, and PAN places each channel between left and right.',
  },
  {
    id: 'ring',
    label: 'Ring modulator',
    module: 'util',
    keywords: 'ring mod bell metallic multiply source b',
    rects: [rect(1240, 565, 1515, 722)],
    help: 'Multiplies the signal pinned into the Ringmod A column by the one SOURCE B chooses inside the instrument. Neither pitch survives, only their sum and difference: bells, clangs and robot voices. Its output is row 13.',
  },
  {
    id: 'outfilter',
    label: 'Output filter',
    module: 'out',
    keywords: 'tone treble bass eq',
    rects: [rect(1515, 565, 1790, 722)],
    help: 'A tone control for each output channel: flat at 5, lows up to the left, highs up to the right.',
  },
  {
    id: 'random',
    label: 'Random',
    module: 'mod',
    keywords: 'sample and hold s&h random stepped bitcrush',
    rects: [rect(812, 722, 1310, 908)],
    help: 'A sample and hold. It samples whatever is pinned into the S&H Input column at S&H RATE and holds each value: noise gives random steps, a slow wave a staircase. It shares row 5 with Oscillator 3’s pulse; the OSC 3 / S&H switch chooses.',
  },
  {
    id: 'effects',
    label: 'Effects',
    module: 'fx',
    keywords: 'delay echo reverb room feedback',
    rects: [rect(1310, 722, 1790, 908)],
    help: 'A delay or a reverb, by the switch, on whatever is pinned into the Effects column. It gives the wet signal only, on row 14: pin it and the dry sound to the same output to mix them.',
  },
  {
    id: 'matrix',
    label: 'Patch matrix',
    module: 'patch',
    keywords: 'matrix patch points pins routing connection',
    rects: [rect(912, 1036, 1222, 1342)],
    help: 'Nothing on the SYNTRX is connected until you make a patch. A point joins a source row to a destination column; points in one column mix together, and one row can feed many columns. Click a point to set it or clear it, and point at one to read what it does. On the hardware each point can be set at three gains; here every point is gain 1.',
  },
  {
    id: 'sources',
    label: 'Matrix rows (sources)',
    module: 'patch',
    keywords: 'rows sources outputs',
    rects: [rect(828, 1036, 912, 1342)],
    help: 'Every source has a row of the matrix, set by its LEVEL knob. A row can feed any number of columns at once.',
  },
  {
    id: 'dests',
    label: 'Matrix columns (destinations)',
    module: 'patch',
    keywords: 'columns destinations inputs cv',
    rects: [rect(912, 908, 1222, 1036)],
    help: 'Every destination has a column. The seven signal inputs on the left take sounds: the two outputs, the scope, the trapezoid’s VCA, the ring modulator, the effects and the filter. The nine control inputs on the right take voltages and add to the knobs they move.',
  },
  {
    id: 'memory',
    label: 'Patch memory and encoders',
    module: 'patch',
    keywords: 'save recall patch memory sequencer encoder shift',
    rects: [rect(870, 1360, 1290, 1525)],
    help: 'On the hardware the encoders set matrix points and the buttons save and recall 256 patches, and with SHIFT open a 16-step sequencer that plays on the matrix. None of that is modelled in this app: click the matrix to patch, and use the app’s sounds and saving.',
  },
  {
    id: 'trapezoid',
    label: 'Trapezoid',
    module: 'env',
    keywords: 'envelope trapezoid attack decay loop vca',
    rects: [rect(1310, 908, 1790, 1262)],
    help: 'A looping envelope with four stages, ATTACK, ON, DECAY and OFF, and its own VCA. It loops on its own until OFF is above 9; then a key or the GATE button fires it. Its voltage is row 11; what is pinned into the Envelope Signal column comes out shaped on row 12. The lamp follows it.',
  },
  {
    id: 'joystick',
    label: 'Joystick',
    module: 'mod',
    keywords: 'joystick xy controller performance gate record',
    rects: [rect(1310, 1262, 1790, 1525)],
    help: 'Two voltages from one stick, up-down on row 15 and left-right on row 16, each up to ±5 V by its LEVEL knob. GATE fires the trapezoid by hand.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
const semiOf = (v: ControlValues, n: number): number =>
  12 * Number(v[`osc${n}.octave`]) + tuneSemi(num(v, `osc${n}.tune`));
/** VCS3-style lean: 0.5 (triangle, square) at 5, towards a ramp and a narrow pulse either way. */
const skew = (s: number): number => clamp(0.5 + (s - 5) / 10, 0.005, 0.995);
/** The super saw partner's detune, semitones, and its level, by Oscillator 2's SHAPE. */
const superSaw = (s: number): { detune: number; mix: number } => ({
  detune: 0.35 * (s / 10),
  mix: s / 10,
});

function toEngine(v: ControlValues): EngineParams {
  const sync = v['osc2.sync'] === 'sync' ? 0 : -1;
  const s1 = num(v, 'osc1.shape'),
    s2 = num(v, 'osc2.shape');
  const ss = superSaw(s2);
  const o3hz = osc3Hz(num(v, 'osc3.tune'));
  const o3key = v['osc3.keyFol'] === 'key';
  const osc: OscParams[] = [
    {
      level: 1,
      mix: {},
      semi: semiOf(v, 1),
      kbd: true,
      syncTo: -1,
      pw: clamp(0.5 + (s1 / 5) * 0.45, 0.05, 0.95),
      sineShape: s1 / 5,
    },
    {
      level: 1,
      mix: {},
      semi: semiOf(v, 2),
      kbd: true,
      syncTo: sync,
      pw: clamp(0.5 - (s2 / 10) * 0.45, 0.05, 0.95),
    },
    {
      level: 1,
      mix: {},
      semi: o3key ? noteOf(o3hz) - 60 : 0,
      kbd: o3key,
      fixedNote: noteOf(o3hz),
      syncTo: -1,
      skew: skew(num(v, 'osc3.shape')),
      pw: clamp(skew(num(v, 'osc3.shape')), 0.03, 0.97),
    },
    // The super saw partner: a saw a little out of tune against Oscillator 2, brought in by its SHAPE
    {
      level: ss.mix > 0 ? 1 : 0,
      mix: { saw: 1 },
      semi: semiOf(v, 2) + ss.detune,
      kbd: true,
      syncTo: sync,
    },
  ];
  const o2pulse = lvl(num(v, 'osc2.pulse'), 1),
    o2saw = lvl(num(v, 'osc2.saw'), 1);
  const reverb = v['fx.type'] === 'reverb';
  const t = v['vcf.cvTarget'];
  const routes: EngineRoute[] = [
    // column I: Oscillator 2 and its partner, through `inv1` (which turns it over, so the routes turn it back)
    { src: 'inv1', dst: 'pitch2', amt: -12 },
    { src: 'inv1', dst: 'pitch4', amt: -12 },
    // the mod wheel opens the low-pass (MIDI CC 1); the depth is this app's estimate
    { src: 'wheel', dst: 'cutoff', amt: 3 },
  ];
  if (ss.mix > 0) routes.push({ src: 'osc4', dst: 'sum1B', amt: o2saw * ss.mix });
  // column K: the shape CV to the pulse widths the switches choose
  if (v['osc1.shapeCv'] !== 'sine') routes.push({ src: 'sum2', dst: 'pw1', amt: 0.09 });
  if (v['osc2.shapeCv'] === 'pwm') routes.push({ src: 'sum2', dst: 'pw2', amt: 0.09 });
  // column N: the filter frequency CV, through `invert`, to the HPF, the LPF or both
  if (t !== 'hpf') routes.push({ src: 'invert', dst: 'cutoff', amt: -1 });
  if (t !== 'lpf') routes.push({ src: 'invert', dst: 'cutoffHp', amt: -1 });
  const res = pwl(num(v, 'vcf.res'), RES_PTS);
  const fb = num(v, 'fx.feedback') / 10;
  const in1 = lvl(num(v, 'in1.level'), 1.5);
  const off = num(v, 'trap.off');
  const amp = (ch: number): OutAmpParams => ({
    level: num(v, `out${ch}.level`) / 10,
    tone: (num(v, `out${ch}.filter`) - 5) / 5,
    pan: (num(v, `out${ch}.pan`) + 5) / 10,
  });
  const sourceB = SOURCE_B.find(([id]) => id === v['ring.sourceB']);
  return {
    osc,
    oscOuts: true,
    pwSplit: true,
    noise: { level: 0, color: 'white', tilt: num(v, 'noise.tone') / 5 },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: lpfHz(num(v, 'vcf.lpf')),
      res,
      envAmt: 0,
      envSrc: 'env2',
      kbd: 0,
    },
    hpf: { cutoff: hpfHz(num(v, 'vcf.hpf')), res: 0, envAmt: 0, envSrc: 'env2', kbd: 0 },
    env1: { a: 0.01, d: 0.1, s: 0, r: 0.1 },
    env2: { a: 0.001, d: 0.1, s: 1, r: 0.01 },
    trap: {
      a: attackS(num(v, 'trap.attack')),
      on: onS(num(v, 'trap.on')),
      d: decayS(num(v, 'trap.decay')),
      off: off <= OFF_MANUAL ? offS(off) : 0,
      auto: off <= OFF_MANUAL,
      hold: !!v['trap.gate'],
    },
    vca: { envSrc: 'env1', bias: 0 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    routes,
    // Nothing is wired inside a SYNTRX: every module hears only what is pinned to it, except the rows the switches pick.
    normals: {
      vcfIn: null,
      vcaIn: null,
      delayIn: null,
      shIn: null,
      sum1A: ['o2pulse', o2pulse],
      sum1B: ['o2saw', o2saw],
      att1In: v['snh.select'] === 'snh' ? 'sh' : 'o3pulse',
      att2In: reverb ? 'rev' : 'out',
      revIn: 'out',
      preampIn: 'mult',
      envfIn: ['mult', in1],
      ringB: sourceB ? sourceB[3] : null,
    },
    ring: { ac: false, acB: false },
    preamp: {
      gain: lvl(num(v, 'in2.level'), v['in2.gain'] === 'mic' ? 12 : 2),
    },
    envf: { sens: 1 },
    rev: reverb
      ? {
          on: true,
          unit: false,
          mix: 0,
          // FEEDBACK at the top makes the reverb loop (the manual): it no longer dies away
          decay: fb >= 0.98 ? 0.995 : 0.5 + 0.2 * (num(v, 'fx.time') / 10) + 0.25 * fb,
          damp: 0.5 - 0.3 * (num(v, 'fx.time') / 10),
        }
      : { on: false, mix: 0 },
    delay: reverb
      ? { on: false }
      : { on: true, time: delayS(num(v, 'fx.time')), fb: fb * 1.02, mix: 1 },
    sh: { rate: shHz(num(v, 'snh.rate')), glide: 0 },
    joy: [num(v, 'joy.x'), num(v, 'joy.y')],
    outAmps: [amp(1), amp(2)],
    od: { on: false },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 0,
    volume: 1,
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const syntrxII: SynthDef & { version: number } = {
  id: 'syntrx-ii',
  version: 1,
  name: 'SYNTRX II',
  maker: 'Erica Synths',
  year: 2022,
  heritage:
    'Successor to the Erica Synths SYNTRX, a re-imagining of the EMS Synthi AKS approved by Peter Zinovieff',
  summary:
    'A matrix-patched analogue monosynth: three oscillators (the third an LFO), noise, two external inputs with an envelope follower, a high-pass and low-pass filter in series, a ring modulator, a sample and hold, a looping trapezoid envelope with its own VCA, a delay or reverb and a joystick, all connected through a 16 × 16 matrix and heard through two output channels.',
  view: { w: 1783, h: 1234 },
  theme: {
    panel: PANEL,
    panel2: PANEL2,
    ink: INK,
    font: 'helv',
    cheeks: 'wood',
    cheekW: 47,
    tabs: true,
  },
  matrix: {
    x: X(MX0),
    y: Y(MY0),
    pitch: MP,
    rows: rowIds,
    cols: colIds,
    legend: { row: [80, MP - 2], col: [MP - 2, 100] },
    look: 'led',
  },
  silentInit:
    'Nothing on the SYNTRX II is connected until a matrix point is set, so with no points it is silent.',
  signalNames: {
    o1pulse: 'Oscillator 1’s pulse',
    o1sine: 'Oscillator 1’s sine',
    sum1: 'Oscillator 2',
    o3tri: 'Oscillator 3’s triangle',
    att1: 'row 5 (Oscillator 3’s pulse or the S&H)',
    o3pulse: 'Oscillator 3’s pulse',
    sh: 'the sample and hold',
    noise: 'the noise generator',
    mult: 'Input 1 (the SCOPE OUTPUT)',
    envf: 'the envelope follower',
    preamp: 'Input 2',
    vcf1: 'the filter',
    env1: 'the trapezoid',
    vca: 'the trapezoid’s VCA',
    ring: 'the ring modulator',
    att2: 'the effects',
    joyX: 'the joystick (left-right)',
    joyY: 'the joystick (up-down)',
  },
  destNames: {
    pitch1: 'Oscillator 1 frequency',
    inv1In: 'Oscillator 2 frequency',
    pitch2: 'Oscillator 2 frequency',
    pitch3: 'Oscillator 3 frequency',
    sum2A: 'the oscillator shape',
    invertIn: 'the filter frequency',
    cutoff: 'the low-pass cut-off',
    cutoffHp: 'the high-pass cut-off',
    multIn: 'the scope',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default syntrxII;
