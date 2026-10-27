/**
 * GS Music e7: the definition (D1). Positions are measured on the owner's 2400 × 2400 straight-on product photo
 * (`.context/app/synth-data/e7/raw/GS E7.jpg`, local only); X() and Y() take photo pixels and move them to the left
 * cheek's outer edge and the top of the cheeks, at the same scale. The owner's spec is
 * `.context/app/synth-data/e7/e7.synth.json` (the e7 User Manual, 2022, also in `raw/`, and GS Music's MIDI
 * implementation of September 2022).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), following `defs/take-5.ts`, the nearest
 * instrument: a modern analogue desktop poly with knob-per-function voice controls and digital effects. The e7's seven
 * voices are each two VCOs (triangle, tri-saw or sawtooth, plus a pulse generator mixed in at the same level, and a
 * square sub an octave down), noise → a 24 dB low-pass → the VCA, with two ADSRs and three LFOs. The voices pass a
 * chorus and a delay.
 *
 * The LFOs map onto the engine's three, swapped: the e7's LFO 2 is the engine's `lfo`, because its EG1 MOD moves its
 * rate and `lfoRate` is the only rate destination; LFO 1 is `lfo2`, and LFO 3 is `lfo3`, one wave for every voice
 * (`common`) brought in by the mod wheel. The MODE of LFO 1 and 2 picks how they run across the voices: Monophonic and
 * Clock Sync are `common`, the keyboard modes restart each voice's LFO at its key, and the clock modes run at a note
 * value of the e7's own 120 BPM (the app sends no MIDI clock). KB Tracking follows the key on LFO 2 only.
 *
 * SHIFT shows the second functions printed on the white plates under the controls. Each has its own control at the
 * same spot. The printed pairs are followed where the spec guesses a pairing differently (its `modelling_gaps`): DEPTH,
 * FEEDBACK and the filter's LFO2 MOD are first functions on the panel. Aftertouch, pitch bend, stereo spread and
 * motion, velocity on the envelope times, the voice options, multitimbral parts, presets and the menus are drawn and
 * explained but not modelled; the effects run on the DeepMind's effects engine (`audio/dm-fx.ts`): Basic is one stereo
 * chorus, Ensemble two in a row, then the stereo delay.
 *
 * Ranges the manual gives: VCOs ±½ semitone TUNE and ±24 TRANSPOSE, pulse width 10–50 %, cutoff 10 Hz–25 kHz, LFOs
 * 0.1–100 Hz with fifteen clock divisions, delay 50 ms–1.35 s. Envelope times, chorus speeds and the modulation
 * depths are this app's estimates (`not_in_source`).
 */
import type {
  ButtonControl,
  Control,
  ControlOption,
  ControlValue,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  EnvParams,
  FxSlot,
  KnobControl,
  KnobScale,
  Lfo2Params,
  LfoMix,
  OscMix,
  OscParams,
  ShowCondition,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
  Area,
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
type ButtonRest = Pick<ButtonControl, 'name' | 'help'> &
  Partial<Pick<ButtonControl, 'ui' | 'module' | 'show' | 'label'>> &
  ({ kind?: 'bool'; def?: boolean } | { kind: 'enum'; options: ControlOption[]; def: string });
type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'spacing' | 'brand' | 'anchor'>>;

const X = (x: number): number => x - 90;
const Y = (y: number): number => y - 740;
const PANEL = '#2471c2';
const PANEL2 = '#1d63ad';
const INK = '#eef4fb';
const PLATE = '#e4eef9';
const BTN = '#efeae1';

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The manual gives no envelope times (`not_in_source`): these are the app's estimates, in the range of the other
// modern analogue polys here.
const ENV_PTS: CurvePoint[] = [
  [0, 0.001],
  [2.5, 0.03],
  [5, 0.3],
  [7.5, 2.5],
  [10, 15],
];
const envTime = (v: number): number => pwl(v, ENV_PTS, true);
/** LFOs 0.1–100 Hz (the product page). */
const lfoHz = (v: number): number => expMap(v / 10, 0.1, 100);
const vcfHz = (v: number): number => expMap(v / 10, 10, 25000);
const portaTime = (v: number): number => 5 * Math.pow(v / 10, 3);
const delayMs = (v: number): number => expMap(v / 10, 50, 1350);
const chorusHz = (v: number): number => expMap(v / 10, 0.1, 5);
/** The e7 runs its clock modes at 120 BPM when no MIDI clock arrives, and the app sends none. */
const BPM = 120;
const pct = (v: number): string => `${Math.round(v * 10)} %`;
const u = (v: ControlValues, id: string): number => clamp(num(v, id) / 10, 0, 1);

/** The fifteen note values of the clock modes, longest first; `beats` in quarter notes. */
const DIVS: { v: string; label: string; beats: number }[] = [
  { v: '1', label: 'Whole note', beats: 4 },
  { v: '1/2.', label: 'Dotted 1/2', beats: 3 },
  { v: '1T', label: 'Whole triplet', beats: 8 / 3 },
  { v: '1/2', label: '1/2 note', beats: 2 },
  { v: '1/4.', label: 'Dotted 1/4', beats: 1.5 },
  { v: '1/2T', label: '1/2 triplet', beats: 4 / 3 },
  { v: '1/4', label: '1/4 note', beats: 1 },
  { v: '1/8.', label: 'Dotted 1/8', beats: 0.75 },
  { v: '1/4T', label: '1/4 triplet', beats: 2 / 3 },
  { v: '1/8', label: '1/8 note', beats: 0.5 },
  { v: '1/16.', label: 'Dotted 1/16', beats: 0.375 },
  { v: '1/8T', label: '1/8 triplet', beats: 1 / 3 },
  { v: '1/16', label: '1/16 note', beats: 0.25 },
  { v: '1/16T', label: '1/16 triplet', beats: 1 / 6 },
  { v: '1/32', label: '1/32 note', beats: 0.125 },
];
const beatsOf = (v: ControlValue): number => (DIVS.find((d) => d.v === v) ?? DIVS[6]).beats;
const divName = (v: ControlValue): string => DIVS.find((d) => d.v === v)?.label ?? String(v);

const controls: Control[] = [];
const decor: Decor[] = [];
const NOT_HERE = 'Not modelled here.';
const shiftOff: ShowCondition = { id: 'ui.shift', eq: false };
const shiftOn: ShowCondition = { id: 'ui.shift', eq: true };

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y) (the renderer places text by its baseline). */
const label = (x: number, y: number, t: string, size = 15, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y + size * 0.36),
    text: t,
    size,
    anchor: 'middle',
    weight: 500,
    ...rest,
  });
};
const line = (x1: number, y1: number, x2: number, y2: number, w = 2): void => {
  decor.push({ t: 'line', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), w });
};
const dashed = (d: string): void => {
  decor.push({ t: 'path', d, w: 1.6, dash: '4 5' });
};
/** A section box, its name in a band across the top. */
const box = (x0: number, y0: number, x1: number, y1: number, name?: string, size = 25): void => {
  decor.push({
    t: 'rect',
    x: X(x0),
    y: Y(y0),
    w: x1 - x0,
    h: y1 - y0,
    r: 12,
    fill: 'none',
    stroke: INK,
    sw: 2,
  });
  if (name) {
    label((x0 + x1) / 2, y0 + 19, name, size, { weight: 400, spacing: 0.5 });
    line(x0, y0 + 37, x1, y0 + 37);
  }
};
/** A second (SHIFT) function's name: blue lettering on a white plate. */
const plate = (x: number, y: number, t: string, w = t.length * 8 + 10): void => {
  decor.push({ t: 'rect', x: X(x - w / 2), y: Y(y - 8), w, h: 16, r: 2, fill: PLATE });
  label(x, y, t, 13, { fill: PANEL, weight: 700 });
};
const led = (x: number, y: number, litWhen?: Extract<Decor, { t: 'led' }>['litWhen']): void => {
  decor.push(
    litWhen
      ? { t: 'led', x: X(x), y: Y(y), r: 7, color: 'white', litWhen }
      : { t: 'led', x: X(x), y: Y(y), r: 7, color: 'white' }
  );
};
const wave = (x: number, y: number, shape: WaveShape): void => {
  decor.push({ t: 'wave', x: X(x), y: Y(y), size: 13, shape, w: 1.8 });
};

const TICKS: KnobScale = { ticks: 11, tickR: 1.32, size: 11 };
/** A knob: `lab` is its printed name under it and `sub` the second function's plate, as printed. */
const knob = (id: string, x: number, y: number, rest: KnobRest, r = 36): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r,
    style: 'e7',
    labelPos: 'none',
    scale: TICKS,
    ...rest,
  });
};
/** Printed names under a knob: the first function, then its SHIFT plate. */
const names = (x: number, y: number, first: string, second?: string): void => {
  label(x, y + 62, first);
  if (second) plate(x, y + 77, second);
};
/** A square cream push button. */
const btn = (id: string, x: number, y: number, rest: ButtonRest, w = 52, h = 52): void => {
  const { kind, ...more } = rest;
  const value =
    kind === 'enum'
      ? { kind: 'enum' as const, options: rest.options, def: rest.def }
      : { kind: 'bool' as const, def: rest.def ?? false };
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w,
    h,
    labelPos: 'none',
    capColor: BTN,
    module: 'mode',
    label: rest.label ?? rest.name,
    ...more,
    ...value,
  });
};
/** A 0–10 depth knob reading out in percent; `name` is `'<section>|<printed name>'`. */
const depth = (
  id: string,
  x: number,
  y: number,
  name: string,
  module: KnobControl['module'],
  help: string,
  show?: ShowCondition,
  def = 0,
  ui = false
): void =>
  knob(id, x, y, {
    kind: 'cont',
    min: 0,
    max: 10,
    def,
    module,
    label: name.slice(name.indexOf('|') + 1),
    name: name.replace('|', ' '),
    fmt: pct,
    help,
    ...(show ? { show } : {}),
    ...(ui ? { ui } : {}),
  });

// ── Cheeks, logo ──────────────────────────────────────────────────────────
label(2120, 1440, 'e', 92, { weight: 300, brand: true });
label(2160, 1405, '7', 34, { weight: 300, brand: true });
label(2116, 1540, 'GS|MUSIC', 26, { weight: 800, spacing: 1, brand: true });

// ── LFO 1 and LFO 2 ───────────────────────────────────────────────────────
box(210, 785, 355, 1395, 'LFO');
const LFO_SHAPES: ControlOption[] = [
  { v: 'tri', label: 'Triangle' },
  { v: 'saw', label: 'Ascending ramp' },
  { v: 'rsaw', label: 'Descending ramp' },
  { v: 'sq', label: 'Pulse' },
  { v: 'sh', label: 'Sample and hold' },
];
const SHAPE_GLYPH: (WaveShape | null)[] = ['tri', 'saw', 'rsaw', 'sq', null];
const LFO_MODES: ControlOption[] = [
  { v: 'mono', label: 'Monophonic' },
  { v: 'poly', label: 'Polyphonic' },
  { v: 'kbtrack', label: 'KB Tracking' },
  { v: 'kbsync', label: 'KB Sync' },
  { v: 'clock', label: 'Clock Sync' },
  { v: 'kbclock', label: 'KB + Clock Sync' },
];
const CLOCKED = ['clock', 'kbclock'];
const FREE = ['mono', 'poly', 'kbtrack', 'kbsync'];
const MODE_HELP =
  'How it runs across the voices. Monophonic: one wave in step for every voice. Polyphonic: each voice its own wave, at its own phase. KB Tracking: faster for higher notes. KB Sync: each voice’s wave restarts when its key goes down. Clock Sync: one wave for every voice at a note value of the clock. KB + Clock Sync: a note value, restarted by each key.';
const DIV_OPTIONS: ControlOption[] = DIVS.map((d) => ({ v: d.v, label: '' }));
/** LFO 1 (`n` 1, top) or LFO 2 (`n` 2): the wave-shape button and its lamps, MODE under SHIFT, RATE or a note value. */
function lfoColumn(n: 1 | 2, y0: number, rateY: number): void {
  const lfo = `LFO ${n}`;
  label(220, y0 + 5, lfo, 19, { anchor: 'start', weight: 400 });
  btn(`lfo${n}.shape`, 260, y0 + 41, {
    kind: 'enum',
    def: 'tri',
    options: LFO_SHAPES,
    module: 'lfo',
    label: 'Wave shape',
    name: `${lfo} WAVE SHAPE`,
    show: shiftOff,
    help: `Steps ${lfo} through its waves: triangle, ascending and descending ramps, pulse, and sample and hold (a new random level each cycle). The lamps show which.`,
  });
  btn(`lfo${n}.mode`, 260, y0 + 41, {
    kind: 'enum',
    def: 'poly',
    options: LFO_MODES,
    module: 'lfo',
    label: 'Mode',
    name: `${lfo} MODE`,
    show: shiftOn,
    help: `${lfo}’s MODE (SHIFT + the wave-shape button; the display shows it). ${MODE_HELP}${n === 1 ? ' Here KB Tracking runs LFO 1 at its RATE on every key.' : ''} The clock modes run at a note value of 120 BPM, as the e7 does when no MIDI clock arrives.`,
  });
  SHAPE_GLYPH.forEach((g, i) => {
    const y = y0 + i * 21.5;
    led(301, y, { id: `lfo${n}.shape`, eq: LFO_SHAPES[i].v });
    if (g) wave(330, y, g);
    else label(332, y, 'S&H', 10, { weight: 700 });
  });
  label(260, y0 + 88, 'Wave shape', 13);
  plate(260, y0 + 102, 'Mode');
  knob(`lfo${n}.rate`, 265, rateY, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 5,
    module: 'lfo',
    label: 'Rate',
    name: `${lfo} RATE`,
    fmt: (v) => fmtHz(lfoHz(v)),
    show: n === 2 ? [shiftOff, { id: `lfo${n}.mode`, in: FREE }] : { id: `lfo${n}.mode`, in: FREE },
    help: `How fast ${lfo} cycles, from 0.1 Hz (one cycle every ten seconds) to 100 Hz, fast enough to buzz. In the clock modes this knob picks a note value instead.`,
  });
  knob(`lfo${n}.div`, 265, rateY, {
    kind: 'enum',
    def: '1/4',
    options: DIV_OPTIONS,
    fmt: divName,
    module: 'lfo',
    label: 'Rate',
    name: `${lfo} RATE (clock)`,
    show:
      n === 2
        ? [shiftOff, { id: `lfo${n}.mode`, in: CLOCKED }]
        : { id: `lfo${n}.mode`, in: CLOCKED },
    help: `In the clock modes, ${lfo}’s cycle as a note value of the clock, from a whole note to a 1/32, with dotted notes and triplets. Here the clock is the e7’s own 120 BPM.`,
  });
  names(265, rateY, 'Rate', n === 2 ? 'EG1 Mod' : undefined);
}
lfoColumn(1, 847, 1022);
lfoColumn(2, 1123, 1302);
depth(
  'lfo2.eg1',
  265,
  1302,
  'LFO 2|EG1 MOD',
  'lfo',
  'How far EG 1 speeds LFO 2 up while it runs: a vibrato that quickens as the note starts, or slows as it fades. It works in every MODE but Monophonic and Clock Sync.',
  shiftOn
);

// ── Oscillators ───────────────────────────────────────────────────────────
box(373, 785, 865, 1388, 'OSCILLATORS');
const OSC_WAVES: ControlOption[] = [
  { v: 'tri', label: 'Triangle' },
  { v: 'shark', label: 'Tri-saw' },
  { v: 'saw', label: 'Sawtooth' },
  { v: 'off', label: 'None' },
];
const OSC_GLYPH: WaveShape[] = ['tri', 'shark', 'saw'];
const COL = [552, 671, 790];
line(373, 1098, 865, 1098);
dashed(`M${X(380)} ${Y(965)} H${X(858)} M${X(380)} ${Y(1243)} H${X(858)}`);
function oscBlock(n: 1 | 2, y1: number, y2: number): void {
  const o = `VCO ${n}`;
  label(382, y1 - 50, `OSC ${n}`, 19, { anchor: 'start', weight: 400 });
  btn(`osc${n}.wave`, 418, y1 + 4, {
    kind: 'enum',
    def: 'saw',
    options: OSC_WAVES,
    module: 'osc',
    label: 'Waveform',
    name: `${o} WAVEFORM`,
    help: `Steps ${o}’s main wave: triangle (soft, hollow), tri-saw (a triangle with a sawtooth’s edge), sawtooth (bright and buzzy), or none, with no lamp lit, which leaves the pulse alone.`,
  });
  OSC_GLYPH.forEach((g, i) => {
    led(461, y1 - 20 + i * 24, { id: `osc${n}.wave`, eq: OSC_WAVES[i].v });
    wave(488, y1 - 20 + i * 24, g);
  });
  knob(`osc${n}.tune`, COL[0], y1, {
    kind: 'cont',
    min: -5,
    max: 5,
    def: 0,
    module: 'osc',
    label: 'Tune',
    name: `${o} TUNE`,
    fmt: (v) => `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 10)} cents`,
    show: shiftOff,
    help: `Fine-tunes ${o} up to half a semitone either way. A few cents between the two oscillators makes them beat slowly against each other, which thickens the sound.`,
  });
  knob(`osc${n}.transpose`, COL[0], y1, {
    kind: 'cont',
    min: -24,
    max: 24,
    def: 0,
    step: 1,
    module: 'osc',
    label: 'Transpose',
    name: `${o} TRANSPOSE`,
    fmt: fmtSemi,
    show: shiftOn,
    help: `Moves ${o} up to two octaves either way from the note played, in semitones: an octave (12) or a fifth (7) against the other oscillator.`,
  });
  depth(
    `osc${n}.lfo1`,
    COL[1],
    y1,
    `${o}|LFO1 MOD`,
    'osc',
    `How far LFO 1 moves ${o}’s pitch: a little is vibrato, a lot a siren or a trill.`,
    shiftOff
  );
  depth(
    `osc${n}.eg1`,
    COL[1],
    y1,
    `${o}|EG1 MOD`,
    'osc',
    `How far EG 1 raises ${o}’s pitch: a quick blip at the start of each note, or a slow rise, up to two octaves.`,
    shiftOn
  );
  depth(
    `osc${n}.lfo2`,
    COL[2],
    y1,
    `${o}|LFO2 MOD`,
    'osc',
    `How far LFO 2 moves ${o}’s pitch.`,
    shiftOff
  );
  depth(
    `osc${n}.lfo3`,
    COL[2],
    y1,
    `${o}|LFO3 MOD`,
    'osc',
    `How far LFO 3 moves ${o}’s pitch once the mod wheel brings LFO 3 in (by LFO 3’s MOD WHEEL knob): vibrato on the wheel.`,
    shiftOn
  );
  names(COL[0], y1, 'Tune', 'Transpose');
  names(COL[1], y1, 'LFO1 Mod', 'EG1 Mod');
  names(COL[2], y1, 'LFO2 Mod', 'LFO3 Mod');

  // second row: the pulse generator and its width
  btn(`osc${n}.pulse`, 416, y2 + 5, {
    module: 'osc',
    label: 'Pulse',
    name: `${o} PULSE`,
    show: shiftOff,
    help: `Switches ${o}’s pulse generator on, mixed in at the same level as the main wave; with no main wave lit, the pulse sounds alone. PULSE WIDTH sets its shape.`,
  });
  led(457, y2 + 3, { id: `osc${n}.pulse`, eq: true });
  wave(482, y2 + 3, 'pulse');
  if (n === 1) {
    btn('osc.autotune', 416, y2 + 5, {
      module: 'osc',
      label: 'Autotuning',
      name: 'AUTOTUNING',
      ui: true,
      show: shiftOn,
      help: `Runs the e7’s tuning calibration, which takes about two seconds and takes the voltage at the PITCH CV input as its reference. ${NOT_HERE} The oscillators here are always in tune.`,
    });
    plate(416, y2 + 53, 'Autotuning');
  } else {
    btn('osc2.sync', 416, y2 + 5, {
      module: 'osc',
      label: 'Sync',
      name: 'SYNC',
      show: shiftOn,
      help: 'Hard sync: VCO 2 restarts its wave every time VCO 1 starts a cycle. VCO 1 then sets the note, and VCO 2’s TRANSPOSE and EG1 MOD change only its tone, which turns hard and tearing.',
    });
    plate(416, y2 + 50, 'Sync');
  }
  knob(`osc${n}.pw`, COL[0], y2, {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 10,
    module: 'osc',
    label: 'Pulse width',
    name: `${o} PULSE WIDTH`,
    fmt: (v) => `${Math.round(100 * (0.1 + 0.04 * v))} %`,
    help: `The pulse’s width, from a thin, nasal 10 % at the left to a hollow square (50 %) at the right.`,
  });
  wave(COL[0] - 36, y2 + 63, 'npulse');
  wave(COL[0] + 36, y2 + 63, 'sq');
  depth(
    `osc${n}.eg1pwm`,
    COL[1],
    y2,
    `${o}|EG1 PWM`,
    'osc',
    `How far EG 1 widens ${o}’s pulse as each note plays.`
  );
  depth(
    `osc${n}.lfo1pwm`,
    COL[2],
    y2,
    `${o}|LFO1 PWM`,
    'osc',
    `How far LFO 1 sweeps ${o}’s pulse width: a slow sweep is the classic chorus-like shimmer of pulse-width modulation.`
  );
  label(COL[1], y2 + 63, 'EG1 PWM');
  label(COL[2], y2 + 63, 'LFO1 PWM');
}
oscBlock(1, 880, 1020);
oscBlock(2, 1163, 1305);

// ── Mixer and display ─────────────────────────────────────────────────────
decor.push({
  t: 'path',
  d: `M${X(897)} ${Y(785)} H${X(1126)} Q${X(1138)} ${Y(785)} ${X(1138)} ${Y(797)} V${Y(1093)} Q${X(1138)} ${Y(1105)} ${X(1126)} ${Y(1105)} H${X(1027)} Q${X(1015)} ${Y(1105)} ${X(1015)} ${Y(1117)} V${Y(1216)} Q${X(1015)} ${Y(1228)} ${X(1003)} ${Y(1228)} H${X(897)} Q${X(885)} ${Y(1228)} ${X(885)} ${Y(1216)} V${Y(797)} Q${X(885)} ${Y(785)} ${X(897)} ${Y(785)} Z`,
  w: 2,
  fill: 'none',
});
label(1012, 804, 'MIXER', 25, { weight: 400, spacing: 0.5 });
line(885, 822, 1138, 822);
const MIX: [string, number, number, string, number, string][] = [
  ['mix.osc1', 950, 880, 'OSC1', 7, 'The level of VCO 1 into the filter.'],
  [
    'mix.sub1',
    1068,
    880,
    'Sub1',
    0,
    'The level of Sub 1, a square wave an octave below VCO 1, which adds weight underneath.',
  ],
  ['mix.osc2', 950, 1015, 'OSC2', 0, 'The level of VCO 2 into the filter.'],
  ['mix.sub2', 1068, 1015, 'Sub2', 0, 'The level of Sub 2, a square an octave below VCO 2.'],
  [
    'mix.noise',
    948,
    1155,
    'Noise/Ext',
    0,
    'The level of white noise into the filter: hiss for breath, wind and percussion. On the hardware a plug in EXTERNAL INPUT replaces the noise with that signal; here it is always the noise.',
  ],
];
MIX.forEach(([id, x, y, lab, def, help]) => {
  depth(id, x, y, `Mixer|${lab.toUpperCase()}`, 'mixer', help, undefined, def);
  label(x, y + 62, lab);
});
// the display: the e7 draws EG 1 while it is edited
decor.push({
  t: 'rect',
  x: X(1030),
  y: Y(1140),
  w: 103,
  h: 53,
  r: 2,
  fill: '#050608',
  stroke: '#c9d6e6',
  sw: 1.5,
});
decor.push({ t: 'rect', x: X(1033), y: Y(1143), w: 97, h: 13, fill: '#f2f2f2' });
label(1081, 1149, 'EG1', 11, { fill: '#050608', weight: 800 });
decor.push({
  t: 'path',
  d: `M${X(1036)} ${Y(1182)} L${X(1046)} ${Y(1160)} L${X(1062)} ${Y(1170)} H${X(1104)} L${X(1126)} ${Y(1182)}`,
  w: 1.4,
  stroke: '#f2f2f2',
});

// ── Portamento and polyphony ──────────────────────────────────────────────
box(880, 1240, 1150, 1388);
const POLY_MODES: ControlOption[] = [
  { v: 'poly', label: 'Poly' },
  { v: 'mono-st', label: 'Mono, single trigger' },
  { v: 'mono-mt', label: 'Mono, multi trigger' },
  { v: 'uni-st', label: 'Unison, single trigger' },
  { v: 'uni-mt', label: 'Unison, multi trigger' },
];
btn('kbd.mode', 925, 1305, {
  kind: 'enum',
  def: 'poly',
  options: POLY_MODES,
  module: 'mode',
  label: 'Mode',
  name: 'MODE',
  help: 'Steps through the ways the seven voices play. Poly: up to seven notes. ST and MT: one note at a time, the last played; ST lets legato notes glide on without restarting the envelopes, MT restarts them on every note. Unison (with ST or MT lit): all seven voices on the one note, slightly detuned, for a huge sound. On the hardware it is also ENTER in the menus.',
});
(
  [
    [1269, 'Poly', ['poly']],
    [1293, 'ST', ['mono-st', 'uni-st']],
    [1318, 'MT', ['mono-mt', 'uni-mt']],
    [1345, 'Unison', ['uni-st', 'uni-mt']],
  ] as const
).forEach(([y, lab, on]) => {
  led(967, y, { id: 'kbd.mode', in: [...on] });
  label(983, y, lab, 13, { anchor: 'start' });
});
label(925, 1348, 'Mode', 14);
plate(925, 1362, 'Enter');
knob('kbd.porta', 1065, 1302, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'glide',
  label: 'Portamento Time',
  name: 'PORTAMENTO TIME',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaTime(v))),
  show: shiftOff,
  help: 'How long each note takes to slide from the last note that voice played: off at the left, up to a slow five-second swoop.',
});
knob('kbd.bend', 1065, 1302, {
  kind: 'cont',
  min: 0,
  max: 12,
  def: 2,
  step: 1,
  module: 'glide',
  label: 'Bend range',
  name: 'BEND RANGE',
  fmt: (v) => `±${Math.round(v)} semitones`,
  ui: true,
  show: shiftOn,
  help: `How far the pitch bend wheel of the keyboard playing the e7 bends the note; in the menus it is the VALUE knob. ${NOT_HERE} The app has no bend wheel.`,
});
label(1065, 1360, 'Portamento Time', 13);
plate(1040, 1375, 'Bend range', 76);
plate(1112, 1375, 'Value', 46);
decor.push({
  t: 'rect',
  x: X(1152),
  y: Y(1368),
  w: 62,
  h: 19,
  r: 4,
  fill: 'none',
  stroke: INK,
  sw: 1.5,
});
label(1174, 1377, 'MIDI', 11, { weight: 700 });
led(1202, 1377, 'gate');

// ── Filter ────────────────────────────────────────────────────────────────
box(1158, 780, 1710, 1105, 'FILTER');
dashed(`M${X(1337)} ${Y(822)} V${Y(957)} M${X(1405)} ${Y(968)} V${Y(1100)}`);
knob(
  'vcf.cutoff',
  1248,
  895,
  {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 7,
    module: 'filter',
    label: 'Cutoff',
    name: 'CUTOFF',
    scale: { ticks: 13, tickR: 1.3, size: 11 },
    fmt: (v) => fmtHz(vcfHz(v)),
    help: 'The low-pass filter’s cutoff, from 10 Hz to 25 kHz: everything above it is taken away. Down, the sound is dark and muffled; up, bright and open.',
  },
  50
);
label(1248, 990, 'Cutoff');
knob('vcf.res', 1346, 1018, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'filter',
  label: 'Resonance',
  name: 'RESONANCE',
  fmt: pct,
  help: 'Emphasis at the cutoff: a peak that makes the filter sing and whistle. At the top the filter oscillates on its own, a pure sine-like tone, and the bass thins as it rises.',
});
depth(
  'vcf.eg1',
  1406,
  878,
  'Filter|EG1 MOD',
  'filter',
  'How far EG 1 opens the filter on each note: the shape of a pluck, a wah or a slow swell.',
  shiftOff
);
depth(
  'vcf.vel',
  1406,
  878,
  'Filter|VELOCITY EG1 MOD',
  'filter',
  'How much of EG 1’s depth depends on how hard each key is played: at the right, soft notes barely open the filter and hard ones open it fully.',
  shiftOn
);
depth(
  'vcf.lfo1',
  1526,
  878,
  'Filter|LFO1 MOD',
  'filter',
  'How far LFO 1 moves the cutoff: a wah or a wobble.'
);
depth(
  'vcf.lfo2',
  1646,
  878,
  'Filter|LFO2 MOD',
  'filter',
  'How far LFO 2 moves the cutoff.',
  shiftOff
);
depth(
  'vcf.lfo3',
  1646,
  878,
  'Filter|LFO3 MOD',
  'filter',
  'How far LFO 3 moves the cutoff once the mod wheel brings LFO 3 in.',
  shiftOn
);
depth(
  'vcf.kbd',
  1467,
  1018,
  'Filter|KEYBOARD TRACKING',
  'filter',
  'How far the cutoff follows the key played: at the right it follows one for one, so high notes are as bright as low ones; at the left it stays put and high notes sound duller.'
);
depth(
  'vcf.wheel',
  1588,
  1018,
  'Filter|MOD WHEEL',
  'filter',
  'How far the mod wheel opens the filter, up to four octaves.',
  shiftOff
);
depth(
  'vcf.at',
  1588,
  1018,
  'Filter|AFTERTOUCH',
  'filter',
  `How far pressing harder on a held key opens the filter. ${NOT_HERE} The app’s keyboard sends no aftertouch.`,
  shiftOn,
  0,
  true
);
names(1406, 878, 'EG1 Mod', 'Velocity EG1 Mod');
names(1526, 878, 'LFO1 Mod');
names(1646, 878, 'LFO2 Mod', 'LFO3 Mod');
names(1346, 1018, 'Resonance');
names(1467, 1018, 'Keyboard tracking');
names(1588, 1018, 'Mod Wheel', 'Aftertouch');

// ── Amplifier ─────────────────────────────────────────────────────────────
box(1730, 780, 1990, 1105, 'AMPLIFIER');
depth(
  'vca.lfo1',
  1804,
  878,
  'Amplifier|LFO1 MOD',
  'amp',
  'How far LFO 1 swells the volume up and down: tremolo.',
  shiftOff
);
knob('vca.level', 1804, 878, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 10,
  module: 'amp',
  label: 'Level',
  name: 'LEVEL',
  fmt: pct,
  show: shiftOn,
  help: 'The level of the sound before the effects (in multitimbral mode, of the part being edited).',
});
depth(
  'vca.lfo2',
  1929,
  878,
  'Amplifier|LFO2 MOD',
  'amp',
  'How far LFO 2 swells the volume: tremolo.',
  shiftOff
);
depth(
  'vca.lfo3',
  1929,
  878,
  'Amplifier|LFO3 MOD',
  'amp',
  'How far LFO 3 swells the volume once the mod wheel brings it in.',
  shiftOn
);
depth(
  'vca.kbd',
  1804,
  1020,
  'Amplifier|KEYBOARD TRACKING',
  'amp',
  'How far the volume follows the key played: louder going up, quieter going down.',
  shiftOff
);
knob('stereo.spread', 1804, 1020, {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  module: 'amp',
  label: 'Stereo spread',
  name: 'STEREO SPREAD',
  fmt: (v) => (Math.abs(v) < 0.05 ? 'centre' : pct(Math.abs(v) * 2)),
  ui: true,
  show: shiftOn,
  help: `Spreads the seven voices across the stereo field: at the centre they are all in the middle; turned either way voices 1–3 and 5–7 move to opposite sides. ${NOT_HERE} The voices play in the centre.`,
});
depth(
  'vca.vel',
  1929,
  1020,
  'Amplifier|VELOCITY EG2 MOD',
  'amp',
  'How much the volume depends on how hard each key is played: at the left every note is equally loud.',
  shiftOff
);
knob('stereo.motion', 1929, 1020, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  module: 'amp',
  label: 'Stereo motion',
  name: 'STEREO MOTION',
  fmt: pct,
  ui: true,
  show: shiftOn,
  help: `Moves the voices from side to side at a fixed rate, most with STEREO SPREAD at the centre. ${NOT_HERE}`,
});
names(1804, 878, 'LFO1 Mod', 'Level');
names(1929, 878, 'LFO2 Mod', 'LFO3 Mod');
names(1804, 1020, 'Keyboard tracking', 'Stereo spread');
names(1929, 1020, 'Velocity EG2 mod', 'Stereo motion');

// ── Output and voices ─────────────────────────────────────────────────────
box(2005, 780, 2180, 1012, 'OUTPUT');
knob(
  'out.volume',
  2093,
  895,
  {
    kind: 'cont',
    min: 0,
    max: 10,
    def: 7,
    module: 'out',
    label: 'Master Volume',
    name: 'MASTER VOLUME',
    scale: { ticks: 13, tickR: 1.3, size: 11 },
    fmt: pct,
    help: 'The level at the outputs and the headphone socket.',
  },
  50
);
label(2093, 990, 'Master Volume');
box(2005, 1028, 2180, 1105);
label(2093, 1046, 'VOICES', 24, { weight: 400 });
line(2005, 1063, 2180, 1063);
for (let i = 0; i < 7; i++) led(2031 + i * 21.7, 1083, { voice: i });

// ── Envelopes ─────────────────────────────────────────────────────────────
const EG_COLS: [string, string, string | undefined][] = [
  ['attack', 'Attack', 'Velocity mod'],
  ['decay', 'Decay', 'Keyboard tracking'],
  ['sustain', 'Sustain', undefined],
  ['release', 'Release', 'Velocity mod'],
];
const EG_DEF: Record<string, [number, number]> = {
  attack: [0, 0],
  decay: [5, 5],
  sustain: [5, 10],
  release: [4, 4],
};
function egBlock(n: 1 | 2, x0: number, x1: number, xs: number[]): void {
  const eg = `EG ${n}`;
  box(x0, 1115, x1, 1350, `ENVELOPE GENERATOR ${n}`, 24);
  const job = n === 1 ? 'the filter (and wherever its MOD knobs send it)' : 'the volume';
  EG_COLS.forEach(([stage, lab, second], i) => {
    const x = xs[i];
    const sustain = stage === 'sustain';
    knob(`env${n}.${stage}`, x, 1220, {
      kind: 'cont',
      min: 0,
      max: 10,
      def: EG_DEF[stage][n - 1],
      module: 'env',
      label: lab,
      name: `${eg} ${lab.toUpperCase()}`,
      fmt: sustain ? pct : (v) => fmtTime(envTime(v)),
      ...(sustain ? {} : { show: shiftOff }),
      help:
        stage === 'attack'
          ? `How long ${eg} takes to rise when a key goes down: short for a sharp start, long for a swell. ${eg} moves ${job}.`
          : stage === 'decay'
            ? `How long ${eg} takes to fall from its peak to the SUSTAIN level.`
            : sustain
              ? `The level ${eg} holds while the key stays down.`
              : `How long ${eg} takes to die away after the key is let go.`,
    });
    if (stage === 'decay')
      depth(
        `env${n}.kbd`,
        x,
        1220,
        `${eg}|KEYBOARD TRACKING`,
        'env',
        `How far ${eg}’s attack, decay and release shorten for higher notes, the way a high piano note dies sooner than a low one.`,
        shiftOn
      );
    else if (!sustain)
      depth(
        `env${n}.vel${stage === 'attack' ? 'A' : 'R'}`,
        x,
        1220,
        `${eg}|${stage.toUpperCase()} VELOCITY MOD`,
        'env',
        `How far playing harder shortens ${eg}’s ${stage}. ${NOT_HERE} The ${stage} keeps its time.`,
        shiftOn,
        0,
        true
      );
    names(x, 1220, lab, second);
  });
  // the printed ADSR under the knobs
  const [a, d, s] = xs;
  dashed(
    `M${X(a + 60)} ${Y(1305)} V${Y(1340)} M${X(d + 60)} ${Y(1305)} V${Y(1340)} M${X(s + 60)} ${Y(1305)} V${Y(1340)} M${X(x1 - 8)} ${Y(1305)} V${Y(1340)}`
  );
  decor.push({
    t: 'path',
    d: `M${X(x0 + 12)} ${Y(1338)} L${X(a + 60)} ${Y(1312)} L${X(d + 60)} ${Y(1325)} H${X(s + 60)} L${X(x1 - 8)} ${Y(1338)}`,
    w: 1.6,
    fill: 'none',
  });
}
egBlock(1, 1158, 1658, [1225, 1347, 1470, 1590]);
egBlock(2, 1680, 2185, [1757, 1880, 2007, 2127]);

// ── LFO 3 ─────────────────────────────────────────────────────────────────
box(200, 1410, 582, 1560);
label(208, 1424, 'LFO3', 19, { anchor: 'start', weight: 400 });
const LFO3_SHAPES = LFO_SHAPES.slice(0, 4);
btn('lfo3.shape', 250, 1478, {
  kind: 'enum',
  def: 'tri',
  options: LFO3_SHAPES,
  module: 'lfo',
  label: 'Wave shape',
  name: 'LFO 3 WAVE SHAPE',
  help: 'Steps LFO 3 through its waves: triangle, ascending and descending ramps, and pulse. The lamps show which.',
});
LFO3_SHAPES.forEach((o, i) => {
  const y = 1441 + i * 25;
  led(292, y, { id: 'lfo3.shape', eq: o.v });
  const g = SHAPE_GLYPH[i];
  if (g) wave(318, y, g);
});
label(250, 1540, 'Wave shape', 13);
knob('lfo3.rate', 381, 1478, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'lfo',
  label: 'Rate',
  name: 'LFO 3 RATE',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'How fast LFO 3 cycles, 0.1–100 Hz. It is one wave for every voice, silent until the mod wheel brings it in.',
});
label(381, 1540, 'Rate');
depth(
  'lfo3.wheel',
  500,
  1478,
  'LFO 3|MOD WHEEL',
  'lfo',
  'How far the mod wheel brings LFO 3 in. LFO 3 is silent until it does: its LFO3 MOD knobs (under SHIFT on the oscillators, filter and amplifier) set where it goes, and the wheel how much. At the left the wheel does nothing to it.',
  shiftOff
);
depth(
  'lfo3.at',
  500,
  1478,
  'LFO 3|AFTERTOUCH',
  'lfo',
  `How far pressing harder on a held key brings LFO 3 in. ${NOT_HERE} The app’s keyboard sends no aftertouch.`,
  shiftOn,
  0,
  true
);
names(500, 1478, 'Mod Wheel', 'Aftertouch');

// ── Presets ───────────────────────────────────────────────────────────────
box(602, 1407, 1222, 1560, 'PRESETS', 22);
btn('ui.shift', 648, 1497, {
  module: 'mode',
  label: 'Shift',
  name: 'SHIFT',
  ui: true,
  help: 'Shows the second functions printed on the white plates under the controls; press again to go back. On the hardware it also opens the menus with the buttons 1–8 (MENU, MULTI, PANEL, CONFIG).',
});
led(648, 1452, { id: 'ui.shift', eq: true });
plate(648, 1538, 'Shift');
btn('ui.bank', 703, 1497, {
  module: 'mode',
  label: 'Bank',
  name: 'BANK / SAVE',
  ui: true,
  help: `With three of the buttons 1–8, chooses any of the 512 presets by its address (bank, then position); with SHIFT it saves. ${NOT_HERE} The sounds are in the sound list.`,
});
led(703, 1452);
label(703, 1537, 'Bank', 13);
plate(676, 1552, 'Save', 60);
const PRESET_SUB = ['P1', 'P2', 'P3', 'P4', 'Menu', 'Multi', 'Panel', 'Config'];
PRESET_SUB.forEach((sub, i) => {
  const x = 785 + i * 55.4;
  decor.push({
    t: 'rect',
    x: X(x - 26),
    y: Y(1471),
    w: 52,
    h: 52,
    r: 3,
    fill: BTN,
    stroke: '#9aa9ba',
    sw: 1,
    hw: true,
  });
  led(x, 1452);
  label(x - 16, 1452, String(i + 1), 14);
  plate(x, 1538, sub, 44);
});

// ── Effects ───────────────────────────────────────────────────────────────
const CHORUS_TYPES: ControlOption[] = [
  { v: 'basic', label: 'Basic' },
  { v: 'ensemble', label: 'Ensemble' },
];
const DELAY_TYPES: ControlOption[] = [
  { v: 'stereo', label: 'Stereo' },
  { v: 'pingpong', label: 'Ping-Pong' },
  { v: 'stereo-sync', label: 'Stereo Sync' },
  { v: 'pingpong-sync', label: 'Ping-Pong Sync' },
];
const SYNCED = ['stereo-sync', 'pingpong-sync'];
function fxBox(x0: number, x1: number, name: string, mixId: string): void {
  box(x0, 1370, x1, 1560);
  label((x0 + x1) / 2 - 15, 1388, name, 25, { weight: 400, spacing: 0.5 });
  line(x0, 1407, x1, 1407);
  led(x1 - 70, 1388, { id: mixId, eq: 0, not: true });
}
fxBox(1240, 1620, 'CHORUS', 'chorus.mix');
knob('chorus.rate', 1310, 1478, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4,
  module: 'fx',
  label: 'Rate',
  name: 'CHORUS RATE',
  fmt: (v) => fmtHz(chorusHz(v)),
  show: shiftOff,
  help: 'How fast the chorus’s copies of the sound drift in and out of tune: slow is a gentle shimmer, fast a warble.',
});
knob('chorus.type', 1310, 1478, {
  kind: 'enum',
  def: 'basic',
  options: CHORUS_TYPES.map((o) => ({ v: o.v, label: '' })),
  fmt: (v) => CHORUS_TYPES.find((o) => o.v === v)?.label ?? String(v),
  module: 'fx',
  label: 'Type',
  name: 'CHORUS TYPE',
  show: shiftOn,
  help: 'Basic: two copies of the sound, a subtle widening. Ensemble: four, a richer sound like a string or vocal ensemble.',
});
depth(
  'chorus.depth',
  1430,
  1478,
  'Chorus|DEPTH',
  'fx',
  'How far the copies drift out of tune: how strongly you hear the chorus.',
  undefined,
  5
);
depth(
  'chorus.mix',
  1552,
  1478,
  'Chorus|MIX',
  'fx',
  'The balance of the dry sound and the chorus. At the left the chorus is off and its lamp is out.'
);
names(1310, 1478, 'Rate', 'Type');
names(1430, 1478, 'Depth');
names(1552, 1478, 'Mix');

fxBox(1640, 2023, 'DELAY', 'delay.mix');
knob('delay.time', 1717, 1478, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  module: 'fx',
  label: 'Delay Time',
  name: 'DELAY TIME',
  fmt: (v) => `${Math.round(delayMs(v))} ms`,
  show: [shiftOff, { id: 'delay.type', in: ['stereo', 'pingpong'] }],
  help: 'The time between the echoes, from a 50 ms slapback to 1.35 s. In the synced types it picks a note value instead.',
});
knob('delay.div', 1717, 1478, {
  kind: 'enum',
  def: '1/8.',
  options: DIV_OPTIONS,
  fmt: divName,
  module: 'fx',
  label: 'Delay Time',
  name: 'DELAY TIME (clock)',
  show: [shiftOff, { id: 'delay.type', in: SYNCED }],
  help: 'In the synced types, the time between the echoes as a note value of the clock. Here the clock is the e7’s own 120 BPM, and echoes longer than 1.5 s are held at 1.5 s.',
});
knob('delay.type', 1717, 1478, {
  kind: 'enum',
  def: 'stereo',
  options: DELAY_TYPES.map((o) => ({ v: o.v, label: '' })),
  fmt: (v) => DELAY_TYPES.find((o) => o.v === v)?.label ?? String(v),
  module: 'fx',
  label: 'Type',
  name: 'DELAY TYPE',
  show: shiftOn,
  help: 'Stereo: the echoes sound on both sides at once. Ping-Pong: they bounce from left to right. The Sync types set the time as a note value of the clock.',
});
depth(
  'delay.fb',
  1838,
  1478,
  'Delay|FEEDBACK',
  'fx',
  'How much of each echo goes back into the delay: one echo at the left, a long trail of them turned up.',
  undefined,
  4
);
depth(
  'delay.mix',
  1960,
  1478,
  'Delay|MIX',
  'fx',
  'The balance of the dry sound and the echoes. At the left the delay is off and its lamp is out.'
);
names(1717, 1478, 'Delay Time', 'Type');
names(1838, 1478, 'Feedback');
names(1960, 1478, 'Mix');

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'lfo',
    label: 'LFO 1 and LFO 2',
    module: 'lfo',
    keywords: 'lfo vibrato wobble tremolo wah modulation rate shape mode sync clock',
    rects: [R(210, 785, 355, 1395)],
    help: 'Two LFOs, each a wave-shape button with its lamps and a RATE knob. SHIFT and the wave-shape button set its MODE: one wave for every voice, one per voice, restarted by each key, or locked to the clock. Their depths are the LFO1 MOD and LFO2 MOD knobs in the other sections.',
  },
  {
    id: 'osc',
    label: 'Oscillators',
    module: 'osc',
    keywords: 'oscillator vco waveform triangle saw tri-saw pulse width pwm tune transpose sync',
    rects: [R(373, 785, 865, 1388)],
    help: 'Two VCOs per voice. The button steps the main wave (triangle, tri-saw, sawtooth or none), the second button adds the pulse, and PULSE WIDTH shapes it. TUNE and, under SHIFT, TRANSPOSE set the pitch; the MOD knobs let EG 1 and the LFOs move the pitch and the pulse width. SHIFT turns VCO 2’s pulse button into SYNC.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'mixer level sub oscillator noise external input',
    rects: [R(885, 785, 1138, 1228)],
    help: 'The levels into the filter: each VCO, its sub (a square an octave below), and the noise, or on the hardware the external input in its place.',
  },
  {
    id: 'display',
    label: 'Display',
    module: 'mode',
    keywords: 'display screen menu',
    rects: [R(1025, 1135, 1138, 1198)],
    help: 'Shows the preset, the menus and the value being changed, with pictures of the filter, the envelopes and the oscillators. Here it shows EG 1, as in the photo.',
  },
  {
    id: 'kbd',
    label: 'Portamento and polyphony',
    module: 'mode',
    keywords: 'portamento glide mono unison poly voices trigger legato bend',
    rects: [R(880, 1240, 1150, 1388)],
    help: 'MODE steps through Poly, mono with single or multi trigger, and unison, its lamps showing which. PORTAMENTO TIME sets the slide between notes, and under SHIFT BEND RANGE the pitch bend’s reach.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords:
      'vcf cutoff resonance low-pass lowpass 4-pole ladder envelope keyboard tracking mod wheel',
    rects: [R(1158, 780, 1710, 1105)],
    help: 'A resonant 24 dB low-pass filter in each voice. CUTOFF sets how bright the sound is and RESONANCE adds a peak that can sing on its own. EG 1, the three LFOs, the key played and the mod wheel can all move the cutoff.',
  },
  {
    id: 'amp',
    label: 'Amplifier',
    module: 'amp',
    keywords: 'vca amplifier tremolo velocity level stereo spread motion',
    rects: [R(1730, 780, 1990, 1105)],
    help: 'The VCA, opened by EG 2. The LFO MOD knobs add tremolo, KEYBOARD TRACKING and VELOCITY EG2 MOD let the key and how hard it is played set the volume, and under SHIFT LEVEL sets the level and STEREO SPREAD and MOTION place the voices.',
  },
  {
    id: 'out',
    label: 'Output and voices',
    module: 'out',
    keywords: 'volume master output voices lamps',
    rects: [R(2005, 780, 2180, 1105)],
    help: 'MASTER VOLUME sets the level at the outputs. The seven VOICES lamps light as each voice plays.',
  },
  {
    id: 'env1',
    label: 'Envelope Generator 1',
    module: 'env',
    keywords: 'envelope eg1 adsr attack decay sustain release filter contour keyboard tracking',
    rects: [R(1158, 1115, 1658, 1350)],
    help: 'An ADSR aimed at the filter, which its EG1 MOD knobs also send to the pitch, the pulse width and LFO 2’s speed. Under SHIFT, KEYBOARD TRACKING shortens it for higher notes.',
  },
  {
    id: 'env2',
    label: 'Envelope Generator 2',
    module: 'env',
    keywords: 'envelope eg2 adsr attack decay sustain release volume vca amp',
    rects: [R(1680, 1115, 2185, 1350)],
    help: 'An ADSR that shapes the volume of every note. Under SHIFT, KEYBOARD TRACKING shortens it for higher notes.',
  },
  {
    id: 'lfo3',
    label: 'LFO 3',
    module: 'lfo',
    keywords: 'lfo3 mod wheel vibrato aftertouch performance',
    rects: [R(200, 1410, 582, 1560)],
    help: 'A third LFO, one wave for every voice and silent until the mod wheel brings it in (MOD WHEEL sets how far). Its LFO3 MOD knobs, under SHIFT in the other sections, set where it goes: vibrato, wah or tremolo on the wheel.',
  },
  {
    id: 'presets',
    label: 'Presets',
    module: 'mode',
    keywords: 'preset program bank save shift menu multi panel config',
    rects: [R(602, 1407, 1222, 1560)],
    help: 'SHIFT shows the second functions on the white plates. BANK and the buttons 1–8 choose one of 512 presets, and with SHIFT the buttons open the parts (P1–P4), MENU, MULTI (multitimbral), PANEL and CONFIG. Here only SHIFT works; the sounds are in the sound list.',
  },
  {
    id: 'chorus',
    label: 'Chorus',
    module: 'fx',
    keywords: 'chorus ensemble rate depth mix effect stereo',
    rects: [R(1240, 1370, 1620, 1560)],
    help: 'A digital chorus on the whole sound: RATE and DEPTH set its movement, MIX how much you hear, and under SHIFT TYPE picks Basic or Ensemble. Its lamp lights while it is on.',
  },
  {
    id: 'delay',
    label: 'Delay',
    module: 'fx',
    keywords: 'delay echo ping-pong feedback time sync effect',
    rects: [R(1640, 1370, 2023, 1560)],
    help: 'A digital delay after the chorus: DELAY TIME sets the gap between echoes, FEEDBACK how many there are and MIX how loud. Under SHIFT TYPE picks stereo or ping-pong echoes, free or synced to the clock.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
/** Engine signal of each LFO: the e7's LFO 2 is the engine's first, for its rate destination (see the docblock). */
const LFO_SIG = { 1: 'lfo2', 2: 'lfo', 3: 'lfo3' } as const;
const LFO_MIX: Record<string, LfoMix> = {
  tri: { tri: 1 },
  saw: { saw: 1 },
  rsaw: { rsaw: 1 },
  sq: { sq: 1 },
  sh: { sh: 1 },
};
const mixOf = (shape: ControlValue): LfoMix => LFO_MIX[String(shape)] ?? LFO_MIX.tri;
/** LFO 1 or 2 from its shape, MODE and RATE. */
function lfoOf(v: ControlValues, n: 1 | 2): Lfo2Params & { keySync: boolean } {
  const mode = String(v[`lfo${n}.mode`]);
  const clocked = CLOCKED.includes(mode);
  return {
    rate: clocked ? BPM / 60 / beatsOf(v[`lfo${n}.div`]) : lfoHz(num(v, `lfo${n}.rate`)),
    mix: mixOf(v[`lfo${n}.shape`]),
    keySync: mode === 'kbsync' || mode === 'kbclock',
    common: mode === 'mono' || mode === 'clock',
  };
}
const envOf = (v: ControlValues, n: number): EnvParams => ({
  a: envTime(num(v, `env${n}.attack`)),
  d: envTime(num(v, `env${n}.decay`)),
  s: u(v, `env${n}.sustain`),
  r: envTime(num(v, `env${n}.release`)),
  kf: u(v, `env${n}.kbd`),
});
const OSC_MIX: Record<string, OscMix> = {
  tri: { tri: 1 },
  shark: { shark: 1 },
  saw: { saw: 1 },
  off: {},
};
function oscOf(v: ControlValues, n: 1 | 2): OscParams {
  const mix: OscMix = { ...(OSC_MIX[String(v[`osc${n}.wave`])] ?? OSC_MIX.saw) };
  if (v[`osc${n}.pulse`]) mix.pulse = 1;
  return {
    level: 0.5 * u(v, `mix.osc${n}`),
    mix,
    pw: 0.1 + 0.04 * num(v, `osc${n}.pw`),
    semi: num(v, `osc${n}.transpose`) + num(v, `osc${n}.tune`) / 10,
    kbd: true,
    subLevel: 0.5 * u(v, `mix.sub${n}`),
    syncTo: n === 2 && v['osc2.sync'] ? 0 : -1,
  };
}

/** Each effects algorithm's parameter defaults, by id. */
const FX_DEFAULTS = new Map(
  FX_ALGOS.map((a) => [a.id, Object.fromEntries(a.params.map((q) => [q.ref, q.def]))])
);
function slot(alg: string, p: Record<string, number | string>): FxSlot {
  const base = FX_DEFAULTS.get(alg);
  // every id here is a literal below: a miss is an algorithm renamed in the effects table, not a value from a sound
  if (!base) throw new Error(`e7: no effects algorithm ${alg}`);
  return { alg, level: 1, p: { ...base, ...p } };
}
/** The chorus: one stereo chorus (Basic, two lines) or two in a row at different speeds (Ensemble, four). */
function chorusSlots(v: ControlValues): [FxSlot, FxSlot] {
  const mix = u(v, 'chorus.mix');
  if (mix <= 0) return [{ alg: null }, { alg: null }];
  const hz = chorusHz(num(v, 'chorus.rate'));
  const width = Math.round(u(v, 'chorus.depth') * 100);
  const first = slot('chorus', {
    SPD: Number(hz.toFixed(2)),
    WDL: width,
    WDR: width,
    MIX: Math.round(mix * 100),
  });
  if (v['chorus.type'] !== 'ensemble') return [first, { alg: null }];
  return [
    first,
    slot('chorus', {
      SPD: Number(Math.min(5, hz * 1.37).toFixed(2)),
      WDL: width,
      WDR: width,
      DLL: 21,
      DLR: 27,
      PHS: 180,
      MIX: Math.round(mix * 60),
    }),
  ];
}
function delaySlot(v: ControlValues): FxSlot {
  const mix = u(v, 'delay.mix');
  if (mix <= 0) return { alg: null };
  const type = String(v['delay.type']);
  const ms = SYNCED.includes(type)
    ? Math.min(1500, (60000 / BPM) * beatsOf(v['delay.div']))
    : delayMs(num(v, 'delay.time'));
  const fb = Math.round(u(v, 'delay.fb') * 95);
  return slot('delay', {
    TIM: Math.round(ms),
    MOD: type.startsWith('pingpong') ? 'P-P' : 'ST',
    FCL: '1',
    FCR: '1',
    FBL: fb,
    FBR: fb,
    MIX: Math.round(mix * 100),
  });
}

function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const routes: EngineRoute[] = [];
  const add = (src: string, dst: string, amt: number, by?: string): void => {
    if (amt !== 0) routes.push(by ? { src, dst, amt, by } : { src, dst, amt });
  };
  /** LFO 3 is silent until the wheel brings it in, by its MOD WHEEL knob. */
  const w3 = u(v, 'lfo3.wheel');
  const pitch = (x: number) => 12 * x * x;
  const cut = (x: number) => 4 * x * x;

  // the oscillators' pitch and pulse width
  ([1, 2] as const).forEach((n) => {
    const p = `pitch${n}`;
    add(LFO_SIG[1], p, pitch(u(v, `osc${n}.lfo1`)));
    add(LFO_SIG[2], p, pitch(u(v, `osc${n}.lfo2`)));
    add(LFO_SIG[3], p, pitch(u(v, `osc${n}.lfo3`)) * w3, 'wheel');
    add('env1', p, 24 * Math.pow(u(v, `osc${n}.eg1`), 2));
    add('env1', `pw${n}`, 0.4 * u(v, `osc${n}.eg1pwm`));
    add(LFO_SIG[1], `pw${n}`, 0.2 * u(v, `osc${n}.lfo1pwm`));
  });

  // the filter: EG 1, part of it scaled by velocity, the LFOs and the mod wheel
  const eg1 = 8 * u(v, 'vcf.eg1');
  const vel1 = u(v, 'vcf.vel');
  add('env1v', 'cutoff', eg1 * vel1);
  add(LFO_SIG[1], 'cutoff', cut(u(v, 'vcf.lfo1')));
  add(LFO_SIG[2], 'cutoff', cut(u(v, 'vcf.lfo2')));
  add(LFO_SIG[3], 'cutoff', cut(u(v, 'vcf.lfo3')) * w3, 'wheel');
  add('wheel', 'cutoff', 4 * u(v, 'vcf.wheel'));

  // the VCA: EG 2, part of it scaled by velocity; tremolo and key tracking ride on EG 2, so a released voice stays shut
  const vel2 = u(v, 'vca.vel');
  if (vel2 > 0) {
    add('env2', 'amp', 1 - vel2);
    add('env2v', 'amp', vel2);
  }
  add(LFO_SIG[1], 'amp', 0.5 * u(v, 'vca.lfo1'), 'env2');
  add(LFO_SIG[2], 'amp', 0.5 * u(v, 'vca.lfo2'), 'env2');
  // a route takes one `by`, and EG 2 is the one that keeps a released voice shut: the wheel's share is read here
  add(LFO_SIG[3], 'amp', 0.5 * u(v, 'vca.lfo3') * w3 * clamp(ctx.wheel || 0, 0, 1), 'env2');
  add('kbd', 'amp', 0.15 * u(v, 'vca.kbd'), 'env2');

  // LFO 2's rate: EG 1 (not in the modes that share one wave) and, in KB Tracking, the key
  const mode2 = String(v['lfo2.mode']);
  if (mode2 !== 'mono' && mode2 !== 'clock') add('env1', 'lfoRate', 4 * u(v, 'lfo2.eg1'));
  if (mode2 === 'kbtrack') add('kbd', 'lfoRate', 1);

  const mode = String(v['kbd.mode']);
  const unison = mode.startsWith('uni');
  const mono = mode !== 'poly';
  const [ch1, ch2] = chorusSlots(v);
  const dly = delaySlot(v);
  const anyFx = ch1.alg !== null || dly.alg !== null;
  const lfo2 = lfoOf(v, 2);
  return {
    osc: [oscOf(v, 1), oscOf(v, 2)],
    noise: { level: level10(num(v, 'mix.noise'), 0.8) },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: vcfHz(num(v, 'vcf.cutoff')),
      res: u(v, 'vcf.res') * 1.1,
      envAmt: eg1 * (1 - vel1),
      envSrc: 'env1',
      kbd: u(v, 'vcf.kbd'),
    },
    env1: envOf(v, 1),
    env2: envOf(v, 2),
    vca:
      vel2 > 0
        ? { envSrc: 'none', bias: 0, gain: level10(num(v, 'vca.level'), 1) }
        : { envSrc: 'env2', bias: 0, gain: level10(num(v, 'vca.level'), 1) },
    lfo: lfo2,
    lfo2: lfoOf(v, 1),
    lfo3: {
      rate: lfoHz(num(v, 'lfo3.rate')),
      mix: mixOf(v['lfo3.shape']),
      common: true,
    },
    glide: { time: portaTime(num(v, 'kbd.porta')), legato: false },
    trig: { retrig: !mode.endsWith('-st'), drone: false, repeat: false },
    poly: { voices: 7, stack: unison ? 7 : 1, mono, detune: unison ? 0.15 : 0 },
    routes,
    normals: {},
    delay: { on: false },
    fx: anyFx
      ? { mode: 'insert', routing: 1, slots: [ch1, ch2, dly, { alg: null }] }
      : { mode: 'bypass' },
    sh: { rate: 5, glide: 0 },
    tune: 0,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const e7: SynthDef & { version: number } = {
  id: 'e7',
  version: 1,
  name: 'e7',
  maker: 'GS Music',
  year: 2022,
  heritage: 'The first polyphonic, multitimbral analogue synthesizer made in Argentina',
  summary:
    'Seven analogue voices, each two VCOs (triangle, tri-saw or sawtooth with a mixable pulse, and a sub an octave down) and noise → a resonant 24 dB low-pass filter → the VCA, with two ADSRs and three LFOs, the third brought in by the mod wheel. The voices pass a chorus and a stereo or ping-pong delay.',
  view: { w: X(2310), h: Y(1635) },
  theme: {
    panel: PANEL,
    panel2: PANEL2,
    ink: INK,
    font: 'helv',
    weight: 500,
    cheeks: 'wood',
    cheekW: 70,
    knobRing: false,
  },
  signalNames: {
    env1: 'EG 1',
    env2: 'EG 2',
    env1v: 'EG 1',
    env2v: 'EG 2',
    lfo: 'LFO 2',
    lfo2: 'LFO 1',
    lfo3: 'LFO 3',
    osc1: 'VCO 1',
    osc2: 'VCO 2',
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
};

export default e7;
