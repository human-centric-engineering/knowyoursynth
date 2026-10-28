/**
 * Elta Music SOLAR 42N: the definition (D1). Positions are measured on the owner's 1280 × 1280 straight-on product
 * photo (`.context/app/synth-data/solar-42n/raw/Elta Music Solar White Cream.jpg`, local only); X() and Y() take photo
 * pixels, move them to the faceplate's top-left corner and double them. The manual is the SOLAR 42N Instructions of
 * 4 August (`raw/Solar 42 N Instructions Aug 04.pdf`). The owner's spec (`solar-42n.synth.json`) describes the original
 * SOLAR 42, which the 42N follows block for block; where the two differ the 42N manual and the photo decide, as the
 * spec's own `source_inconsistencies` anticipate:
 *
 * - The voices are renumbered: classic drones 1, 2, 4 and 5, Papa Srapa drones 3 and 6, and VCO A and B (the 42's
 *   voices 1, 2, 6, 7; 3, 8; and 4, 5).
 * - Each filter side has a BP / LP button and its own CV input and amount (MOD L, MOD R), CV L normalled to CV R, and
 *   a distortion sits after the filters (DIST balance, GAIN amount).
 * - The VCOs have a sub-oscillator (−1 SUB), an OCT +3 / LOW switch in place of the 42's eight-position octave switch,
 *   a lin / exp switch on their CV, an ADSR with HOLD and a looping (self-generating) mode, and a dry output on the
 *   envelope's row. VCO A has the SYNC input; VCO B has the oscillator output, and VCO A is normalled into VCO B's CV
 *   input, scaled by CV AMT.
 * - The effector has one 1-2-3 program switch per side; X, Y, Z, BLEND and MASTER are shared. The LFOs have a ×1 /
 *   ×6 / ×10 speed switch, the joystick two offset knobs and two position lamps, and the Papa Srapa voices push-buttons
 *   for FM, AM, the modulator's 1 / 10 range and the tone's HI / LOW range.
 *
 * Written straight into the app (`f-next-synths`), on the engine's own SOLAR sound path (`audio/solar-core.ts`): the
 * panel's eight voices are the path's eight in mixer order, Drone 1, 2, 3, VCO A, VCO B, Drone 4, 5, 6, so their
 * signals and destinations are `sol1`…`sol8`. VCO A is the path's first VCO, so its oscillator feeds VCO B's FM.
 *
 * Voltages: a cable's level is in volts (an output's `gain`), and each input's `amt` turns volts into its destination's
 * unit: 12 semitones per volt for pitch, a tenth of the travel per volt for the light, VOLT and the effector's X, Y, Z.
 * The manual gives no ranges for the knobs (`not_in_source`: LFO and pulser rates, filter cutoff, envelope times, the
 * Papa Srapa modulator, the VCO's tune and octave switch), so every taper here is this app's estimate.
 *
 * Not modelled, and said so in the help and the limits: the touch keyboard's arpeggiator, sequencer, quantiser,
 * vibrato, presets and pressure; the contact microphone (the PREAMP channel hears only EXT. SOURCE); the envelope
 * follower's ATTACK, RELEASE and gate; the VCA CV inputs; the S&H inputs (the noise is always sampled); the lin / exp
 * switches; the headphone volume; and seven of the twelve cartridges.
 */
import type {
  Area,
  Control,
  ControlOption,
  ControlValues,
  Decor,
  EngineParams,
  InputJack,
  Jack,
  KnobScale,
  LitWhen,
  OutputJack,
  PanelMark,
  SolarDrone,
  SolarFxKnob,
  SolarParams,
  SolarSrapa,
  SolarVco,
  SynthDef,
  SynthModule,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { FX_ALGOS } from '@/lib/app/synths/defs/deepmind-12d-fx';
import { num } from '@/lib/app/synths/lib/def-kit';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime } from '@/lib/app/synths/lib/maps';

type TextRest = Partial<
  Pick<TextDecor, 'anchor' | 'fill' | 'weight' | 'brand' | 'spacing' | 'rotate'>
>;
interface KnobOpts {
  module: SynthModule;
  name: string;
  help: string;
  def: number;
  label?: string;
  min?: number;
  max?: number;
  fmt?: (v: number) => string;
  scale?: KnobScale;
  ui?: boolean;
}
interface SwitchOpts {
  module: SynthModule;
  name: string;
  help: string;
  ui?: boolean;
}

/** Photo pixels to view units: the faceplate's top-left corner is (42, 262), and the view is twice the photo. */
const K = 2;
const X = (x: number): number => (x - 42) * K;
const Y = (y: number): number => (y - 262) * K;
const PANEL = '#ecebe5';
const PANEL2 = '#dfded7';
const INK = '#2b2c30';
const RED_INK = '#c8352a';
const BLUE = '#2f80c4';
const GREEN = '#116e52';
const RED = '#e4462f';
const CREAM = '#f2e7c6';
const PAN_CAP = '#cbd4dd';
const VOL_CAP = '#4b5661';
const BLACK = '#1d1e21';

// ── Ranges and tapers (this app's estimates; the manual gives none) ──────
/** Each classic generator's TUNE range, MIDI notes (the SOLAR 42 manual: C0–G2, B1–G3, D3–B4, E4–C6, G5–D7). */
const GEN_RANGE: [number, number][] = [
  [12, 43],
  [35, 55],
  [50, 71],
  [64, 84],
  [79, 98],
];
/** Semitones a classic drone's photosensor raises a MOD generator at full light. */
const PHOTO_SEMI = 12;
const droneEnvS = (v: number): number => expMap(v / 10, 0.005, 12);
/** The keyboard encoder's PORTAMENTO: the glide's time constant in seconds, 0 (off) at the bottom. */
const glideS = (v: number): number => (v <= 0 ? 0 : expMap(v / 10, 0.01, 2));
/** SPLIT's first right-hand note: the 7th plate, F♯4, so each half has six plates. */
const KEY_SPLIT = 66;
const vcoEnvS = (v: number): number => expMap(v / 10, 0.002, 10);
/** A Papa Srapa's modulator: 0.1–10 Hz, ten times that on 10. */
const srapaHz = (v: number, x10: boolean): number => expMap(v / 10, 0.1, 10) * (x10 ? 10 : 1);
/** Its tone (the manual: about C0–E7), split by HI / LOW. */
const srapaNote = (v: number, hi: boolean): number => (hi ? 48 : 12) + (v / 10) * 52;
/** Octaves of FM: MOD sets it, DIVIDER divides it down. */
const srapaDev = (mod: number, div: number): number => (4 * (mod / 10)) / (1 + (3 * div) / 10);
const cutoffHz = (v: number): number => expMap(v / 10, 40, 16000);
const lfoHz = (v: number, slow: boolean, speed: string): number =>
  (slow ? expMap(v / 10, 0.02, 2) : expMap(v / 10, 0.2, 20)) *
  (speed === 'x10' ? 10 : speed === 'x6' ? 6 : 1);
const pulserHz = (v: number): number => expMap(v / 10, 0.2, 20);
/** A mixer VOL: square law. */
const vol = (v: number): number => 0.8 * Math.pow(clamp(v, 0, 10) / 10, 2);
/** PREAMP GAIN: up to 40 dB, and off at its minimum (the manual: "to mute the preamp, set GAIN to minimum"). */
const preGain = (v: number): number => (v <= 0 ? 0 : Math.pow(100, v / 10));
/** The Polivoks's own saturation in its band path: no knob on the 42N, so a fixed touch. */
const DRIVE = 0.25;
const pct = (v: number): string => `${Math.round(v * 10)} %`;
const fmtPan = (v: number): string =>
  Math.abs(v) < 0.05 ? 'centre' : `${Math.round(Math.abs(v) * 20)} % ${v < 0 ? 'L' : 'R'}`;
const fmtV = (v: number): string => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 10) / 10)} V`;
const fmtNote = (n: number): string => {
  const names = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
  const r = Math.round(n);
  return `${names[((r % 12) + 12) % 12]}${Math.floor(r / 12) - 1}`;
};

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const NOT_HERE = 'Not modelled in this app.';

// ── Drawing helpers (photo pixels) ───────────────────────────────────────
/** Text centred on (x, y). */
const label = (x: number, y: number, t: string, size = 15, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x: X(x),
    y: Y(y) + size * 0.36,
    text: t,
    size,
    anchor: 'middle',
    weight: 500,
    ...rest,
  });
};
/** A section frame. */
const frame = (x0: number, y0: number, x1: number, y1: number): void => {
  decor.push({
    t: 'rect',
    x: X(x0),
    y: Y(y0),
    w: (x1 - x0) * K,
    h: (y1 - y0) * K,
    r: 8,
    fill: 'none',
    stroke: '#8d8e93',
    sw: 2,
  });
};
/** A section name on a black plate. */
const plate = (x: number, y: number, t: string, w: number, size = 15): void => {
  decor.push({ t: 'rect', x: X(x - w / 2), y: Y(y - 6), w: w * K, h: 12 * K, r: 3, fill: BLACK });
  label(x, y, t, size, { fill: PANEL, weight: 700, spacing: 0.5 });
};
/** A vertical tab down a block's left edge (MUTE, TUNE, MOD, HOLD, GATE). */
const tab = (x: number, y: number, t: string, h: number): void => {
  decor.push({ t: 'rect', x: X(x - 6), y: Y(y - h / 2), w: 12 * K, h: h * K, r: 2, fill: BLACK });
  decor.push({
    t: 'text',
    x: X(x) + 5,
    y: Y(y),
    text: t,
    size: 13,
    anchor: 'middle',
    weight: 700,
    fill: PANEL,
    rotate: -90,
  });
};
const led = (
  x: number,
  y: number,
  color: 'red' | 'amber' | 'blue' | 'green',
  litWhen?: LitWhen,
  r = 4
): void => {
  decor.push(
    litWhen
      ? { t: 'led', x: X(x), y: Y(y), r: r * K, color, litWhen }
      : { t: 'led', x: X(x), y: Y(y), r: r * K, color }
  );
};
const circle = (x: number, y: number, r: number, fill: string, stroke?: string): void => {
  decor.push(
    stroke
      ? { t: 'circle', x: X(x), y: Y(y), r: r * K, fill, stroke, sw: 2 }
      : { t: 'circle', x: X(x), y: Y(y), r: r * K, fill }
  );
};

const knob = (id: string, x: number, y: number, r: number, cap: string, o: KnobOpts): void => {
  controls.push({
    id,
    type: 'knob',
    x: X(x),
    y: Y(y),
    r: r * K,
    style: 'solar',
    cap,
    kind: 'cont',
    min: o.min ?? 0,
    max: o.max ?? 10,
    def: o.def,
    module: o.module,
    name: o.name,
    label: o.label ?? o.name,
    labelPos: o.label ? 'bottom' : 'none',
    labelSize: 14,
    help: o.help,
    ...(o.fmt ? { fmt: o.fmt } : {}),
    ...(o.scale ? { scale: o.scale } : {}),
    ...(o.ui ? { ui: true } : {}),
  });
};
/** A round black push-button (drawn square), on or off. */
const button = (
  id: string,
  x: number,
  y: number,
  size: number,
  o: SwitchOpts & { def?: boolean; lamp?: 'white' | 'red' }
): void => {
  controls.push({
    id,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: size * K,
    h: size * K,
    cap: 'black',
    kind: 'bool',
    def: o.def ?? false,
    module: o.module,
    name: o.name,
    label: o.name,
    labelPos: 'none',
    help: o.help,
    ...(o.lamp ? { lamp: o.lamp } : {}),
    ...(o.ui ? { ui: true } : {}),
  });
};
/** A bat-handle toggle: two positions (first option up) or three (up, centre, down). */
const toggle = (
  id: string,
  x: number,
  y: number,
  o: SwitchOpts & { options: ControlOption[]; def: string }
): void => {
  controls.push({
    id,
    type: 'toggle',
    x: X(x),
    y: Y(y),
    w: 11 * K,
    kind: 'enum',
    options: o.options,
    def: o.def,
    module: o.module,
    name: o.name,
    label: o.name,
    labelPos: 'none',
    help: o.help,
    ...(o.ui ? { ui: true } : {}),
  });
};
const jackIn = (
  id: string,
  x: number,
  y: number,
  dest: string | null,
  name: string,
  help: string,
  rest: Partial<Pick<InputJack, 'amt' | 'does' | 'label' | 'labelPos'>> = {}
): void => {
  jacks.push({
    id,
    dir: 'in',
    x: X(x),
    y: Y(y),
    r: 7 * K,
    label: rest.label ?? '',
    labelPos: rest.labelPos ?? 'none',
    name,
    dest,
    help,
    ...(rest.amt !== undefined ? { amt: rest.amt } : {}),
    ...(rest.does !== undefined ? { does: rest.does } : {}),
  });
};
const jackOut = (
  id: string,
  x: number,
  y: number,
  signal: string | null,
  name: string,
  help: string,
  gain?: OutputJack['gain']
): void => {
  jacks.push({
    id,
    dir: 'out',
    x: X(x),
    y: Y(y),
    r: 7 * K,
    label: '',
    labelPos: 'none',
    name,
    signal,
    help,
    ...(gain !== undefined ? { gain } : {}),
  });
};

// ── Faceplate print ───────────────────────────────────────────────────────
label(160, 349, 'SOLAR', 112, { weight: 400, spacing: 4, brand: true });
label(292, 349, '42', 112, { weight: 500, fill: RED_INK, brand: true });
label(338, 322, 'N', 44, { weight: 600, brand: true });
label(1010, 331, 'AMBIENT', 46, { weight: 400, spacing: 4, brand: true });
label(1010, 356, 'MACHINE', 46, { weight: 400, spacing: 4, brand: true });
label(330, 793, 'MICROTONAL DRONE SYNTHESIZER', 14, { brand: true });
label(1022, 793, '42N', 22, { weight: 500, fill: RED_INK, brand: true });
label(643, 655, 'ELTA', 24, { weight: 700, brand: true });
label(643, 670, 'MUSIC', 24, { weight: 700, brand: true });
label(1155, 287, 'POWER   12V DC', 11);

// ── Drone voices 1, 2, 4, 5 «classic SOLAR 50» ───────────────────────────
const GEN_DX = [0, 30.5, 61, 91.5, 122];
const GEN_HELP =
  'switches the generator in or out of the voice: with some off, the rest make a chord, a triad, two notes or one. Its lamp in the OSC STATUS bar shows it is in.';
/** A classic drone voice `n`, its first MUTE button at (mx, my). */
function classicDrone(n: number, mx: number, my: number): void {
  const d = `d${n}`;
  const at = (dx: number, dy: number): [number, number] => [mx + dx, my + dy];
  frame(mx - 27, my - 21, mx + 172, my + 134);
  tab(mx - 20, my, 'MUTE', 22);
  tab(mx - 20, my + 25, 'TUNE', 22);
  tab(mx - 20, my + 55, 'MOD', 22);
  tab(mx - 20, my + 80, 'HOLD', 22);
  tab(mx - 20, my + 113, 'GATE', 22);
  // the OSC STATUS bar: a lamp per generator that is in
  decor.push({ t: 'rect', x: X(mx + 141), y: Y(my - 12), w: 30 * K, h: 22 * K, r: 2, fill: BLACK });
  for (let k = 0; k < 5; k++) {
    label(mx + GEN_DX[k], my - 15, String(k + 1), 12);
    led(mx + 146 + k * 5, my - 1, 'amber', { id: `${d}.on${k + 1}`, eq: true }, 2);
    label(mx + 146 + k * 5, my + 17, String(k + 1), 11);
    const [x, y] = at(GEN_DX[k], 0);
    button(`${d}.on${k + 1}`, x, y, 14, {
      module: 'osc',
      def: true,
      name: `Drone ${n} generator ${k + 1} MUTE`,
      help: `MUTE ${k + 1} ${GEN_HELP}`,
    });
    knob(`${d}.tune${k + 1}`, x, my + 25, 11, BLACK, {
      module: 'osc',
      def: 5,
      name: `Drone ${n} generator ${k + 1} TUNE`,
      fmt: (v) => fmtNote(GEN_RANGE[k][0] + ((GEN_RANGE[k][1] - GEN_RANGE[k][0]) * v) / 10),
      help: `The pitch of generator ${k + 1}, a sawtooth with no volt-per-octave input, tuned by ear from ${fmtNote(GEN_RANGE[k][0])} to ${fmtNote(GEN_RANGE[k][1])}. Tune the five into a chord, a cluster or a beating unison.`,
    });
    button(`${d}.mod${k + 1}`, x, my + 55, 14, {
      module: 'mod',
      name: `Drone ${n} generator ${k + 1} MOD`,
      help: `Lets the photosensor (the eye) and the CV input bend generator ${k + 1}'s pitch. With every MOD off the generators run steady.`,
    });
  }
  knob(`${d}.volt`, mx + 150, my + 43, 13, BLUE, {
    module: 'osc',
    def: 0,
    name: `Drone ${n} VOLT`,
    label: 'VOLT',
    fmt: pct,
    help: 'Lowers all five generators together, each by its own amount, so a tuned chord drifts as it falls. Past the middle they start to frequency-modulate each other and the drone turns rough and metallic.',
  });
  button(`${d}.hold`, mx, my + 79, 14, {
    module: 'env',
    name: `Drone ${n} HOLD`,
    help: 'Keeps the voice open without a gate, so it drones on until you press it again.',
  });
  led(mx, my + 94, 'amber', { id: `${d}.hold`, eq: true }, 3);
  knob(`${d}.att`, mx + 27, my + 80, 12, BLACK, {
    module: 'env',
    def: 3,
    name: `Drone ${n} ATT`,
    label: 'ATT',
    fmt: (v) => fmtTime(droneEnvS(v)),
    help: 'Attack: how slowly the voice fades in when its button or gate opens it.',
  });
  knob(`${d}.rls`, mx + 58, my + 80, 12, BLACK, {
    module: 'env',
    def: 4,
    name: `Drone ${n} RLS`,
    label: 'RLS',
    fmt: (v) => fmtTime(droneEnvS(v)),
    help: 'Release: how slowly the voice fades out after its gate closes.',
  });
  knob(`${d}.cv`, mx + 90, my + 80, 12, BLACK, {
    module: 'mod',
    def: 5,
    name: `Drone ${n} CV`,
    label: 'CV',
    fmt: pct,
    help: 'How far a cable in the CV jack below bends the generators whose MOD is on. On the hardware it lights the red LED the photosensor watches.',
  });
  circle(mx + 26, my + 116, 4, 'none', INK);
  circle(mx + 26, my + 116, 1.5, INK);
  label(mx + 50, my + 128, 'env', 12, { fill: RED_INK });
  // the photosensor in its bezel: its dome is the LIGHT control, drawn (and lit) by the panel's `solar-eye` knob
  circle(mx + 138, my + 101, 27, '#b9c7d3', '#8a99a6');
  controls.push({
    id: `${d}.light`,
    type: 'knob',
    x: X(mx + 138),
    y: Y(my + 101),
    r: 21 * K,
    style: 'solar-eye',
    eye: voiceOf(n) - 1,
    ring: false,
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    module: 'mod',
    name: `Drone ${n} photosensor`,
    label: `Drone ${n} photosensor`,
    labelPos: 'none',
    fmt: pct,
    help: `The photosensor, the voice’s eye: a light sensor under a lens. The more light falls on it, the higher it bends the generators whose MOD is on, up to an octave. On the hardware you shade it with a hand or shine a torch on it; here drag it to set the light. Its CV jack adds light from a voltage, and the dome glows with the light it sees.`,
  });
  decor.push({
    t: 'rect',
    x: X(mx + 158),
    y: Y(my + 119),
    w: 15 * K,
    h: 14 * K,
    r: 2,
    fill: BLACK,
  });
  label(mx + 165.5, my + 126, String(n), 18, { fill: PANEL, weight: 700 });
  jackIn(
    `${d}.gate`,
    mx,
    my + 116,
    `solG${voiceOf(n)}`,
    `Drone ${n} GATE`,
    'Opens the voice while the voltage is high, as its DRONE VOICES button does: patch a sequencer gate, an LFO or another voice’s envelope here.'
  );
  jackOut(
    `${d}.env`,
    mx + 60,
    my + 116,
    `solEnv${voiceOf(n)}`,
    `Drone ${n} env out`,
    'The voice’s envelope, to open another voice or move the filter or the effector.',
    8
  );
  jackIn(
    `${d}.cvin`,
    mx + 90,
    my + 116,
    `solPh${voiceOf(n)}`,
    `Drone ${n} CV`,
    'Bends the generators whose MOD is on, as light on the photosensor does. The LFOs are made for it: they swing positive only.',
    {
      amt: (v) => (num(v, `${d}.cv`) / 10) * 0.1,
    }
  );
}

/** The path's voice number (1–8, mixer order) of drone `n`. */
function voiceOf(n: number): number {
  return [1, 2, 3, 6, 7, 8][n - 1];
}

classicDrone(1, 72, 407);
classicDrone(2, 269, 407);
classicDrone(4, 858, 407);
classicDrone(5, 1055, 407);

// ── Drone voices 3, 6 «Papa Srapa» ─────────────────────────────────────
function srapaDrone(n: number, dx: number): void {
  const d = `d${n}`;
  const x = (px: number): number => px + dx;
  frame(x(45), 543, x(245), 697);
  plate(x(222), 548, `DRONE ${n}`, 46);
  label(x(60), 551, 'LFO', 13);
  label(x(85), 553, '1 | 10', 10);
  label(x(170), 553, 'fm', 13);
  label(x(222), 557, 'am', 13);
  knob(`${d}.rate`, x(64), 586, 13, BLUE, {
    module: 'lfo',
    def: 4,
    name: `Drone ${n} rate`,
    label: 'rate',
    // a readout sees only its own knob: both rates, with 1 / 10 off and on
    fmt: (v) => `${fmtHz(srapaHz(v, false))}, ${fmtHz(srapaHz(v, true))} with 1 / 10`,
    help: 'The speed of the voice’s low square modulator, the one that warbles the tone (FM) or chops it (AM). Its own output is the jack below.',
  });
  button(`${d}.x10`, x(98), 565, 14, {
    module: 'lfo',
    name: `Drone ${n} 1 / 10`,
    help: 'Multiplies the modulator’s rate by ten: from a slow warble to a buzz of sidebands.',
  });
  button(`${d}.fm`, x(149), 565, 14, {
    module: 'mod',
    name: `Drone ${n} FM`,
    help: 'Lets the modulator move the tone’s pitch: a siren or a trill, as deep as MOD and DIVIDER set it.',
  });
  button(`${d}.am`, x(200), 565, 14, {
    module: 'mod',
    name: `Drone ${n} AM`,
    help: 'Lets the modulator switch the tone on and off at its rate: a stutter, a bird call, gunfire.',
  });
  knob(`${d}.mod`, x(114), 587, 13, BLUE, {
    module: 'mod',
    def: 3,
    name: `Drone ${n} mod`,
    label: 'mod',
    fmt: pct,
    help: 'How far FM moves the tone: the depth of the siren.',
  });
  knob(`${d}.div`, x(167), 587, 13, BLUE, {
    module: 'mod',
    def: 0,
    name: `Drone ${n} divider`,
    label: 'divider',
    fmt: pct,
    help: 'Divides the FM depth down, for a finer setting of how far the tone moves.',
  });
  knob(`${d}.pitch`, x(216), 587, 13, BLUE, {
    module: 'osc',
    def: 5,
    name: `Drone ${n} PITCH`,
    label: 'PITCH',
    // a readout sees only its own knob: both ranges, LOW and HI
    fmt: (v) => `${fmtNote(srapaNote(v, false))}, ${fmtNote(srapaNote(v, true))} with HI`,
    help: 'The pitch of the voice’s square tone, about C0 to E7 across both ranges.',
  });
  button(`${d}.hi`, x(190), 603, 14, {
    module: 'osc',
    name: `Drone ${n} hi / low`,
    help: 'Moves PITCH’s range up three octaves, from rumbles to whistles.',
  });
  label(x(190), 620, 'hi/low', 13);
  knob(`${d}.noise`, x(174), 639, 14, BLUE, {
    module: 'osc',
    def: 0,
    name: `Drone ${n} NOISE`,
    label: 'NOISE',
    fmt: pct,
    help: 'Blends white noise in with the tone, up to noise alone: surf, wind, static.',
  });
  button(`${d}.hold`, x(72), 638, 14, {
    module: 'env',
    name: `Drone ${n} HOLD`,
    help: 'Keeps the voice open without a gate.',
  });
  led(x(72), 654, 'amber', { id: `${d}.hold`, eq: true }, 3);
  tab(x(52), 640, 'HOLD', 22);
  tab(x(52), 674, 'GATE', 26);
  knob(`${d}.att`, x(99), 639, 12, BLACK, {
    module: 'env',
    def: 2,
    name: `Drone ${n} ATT`,
    label: 'ATT',
    fmt: (v) => fmtTime(droneEnvS(v)),
    help: 'Attack: how slowly the voice fades in.',
  });
  knob(`${d}.rls`, x(130), 639, 12, BLACK, {
    module: 'env',
    def: 3,
    name: `Drone ${n} RLS`,
    label: 'RLS',
    fmt: (v) => fmtTime(droneEnvS(v)),
    help: 'Release: how slowly the voice fades out after its gate closes.',
  });
  // Papa Srapa's mark and the S&H block
  decor.push({
    t: 'rect',
    x: X(x(92)),
    y: Y(666),
    w: 22 * K,
    h: 24 * K,
    r: 3,
    fill: 'none',
    stroke: INK,
    sw: 2,
  });
  label(x(103), 678, 'Y', 26, { weight: 700 });
  plate(x(224), 660, 'S&H', 22, 13);
  label(x(132), 692, 'env out', 12, { fill: RED_INK });
  label(x(194), 692, 'clock', 12);
  label(x(148), 626, 'cv', 12);
  for (const [px, py] of [
    [214, 621],
    [224, 627],
    [236, 627],
    [210, 636],
    [236, 640],
    [224, 646],
  ])
    circle(x(px), py, 2.5, BLACK);
  led(x(226), 638, 'green', undefined, 3);
  const v = voiceOf(n);
  jackOut(
    `${d}.modout`,
    x(98),
    613,
    `solMod${v}`,
    `Drone ${n} modulator out`,
    'The voice’s square modulator, 0 to +12 V: a clock, a gate or a stepping LFO for anything else.',
    12
  );
  jackIn(`${d}.cvin`, x(148), 613, `solP${v}`, `Drone ${n} cv`, 'Moves the tone’s pitch.', {
    amt: 12,
  });
  jackIn(
    `${d}.gate`,
    x(72),
    676,
    `solG${v}`,
    `Drone ${n} GATE`,
    'Opens the voice while the voltage is high, as its DRONE VOICES button does.'
  );
  jackOut(`${d}.env`, x(132), 675, `solEnv${v}`, `Drone ${n} env out`, 'The voice’s envelope.', 8);
  jackIn(
    `${d}.shin`,
    x(164),
    675,
    null,
    `Drone ${n} S&H in`,
    `What the sample and hold samples; with nothing in it, the voice’s white noise. ${NOT_HERE} The S&H always samples the noise.`
  );
  jackIn(
    `${d}.shclk`,
    x(194),
    675,
    `solShClk${v}`,
    `Drone ${n} S&H clock`,
    'Takes a new sample on each rising edge: patch an LFO or a pulse. With nothing in it, the voice’s modulator clocks it.'
  );
  jackOut(
    `${d}.shout`,
    x(224),
    675,
    `solSh${v}`,
    `Drone ${n} S&H out`,
    'Random steps, −5 to +5 V: a new one on each clock.',
    5
  );
}
srapaDrone(3, 0);
srapaDrone(6, 985);

// ── VCO A and VCO B ───────────────────────────────────────────────────────
const VCO_WAVES: ControlOption[] = [
  { v: 'sine', label: '', a: -110 },
  { v: 'tri', label: '', a: -70 },
  { v: 'saw', label: '', a: -30 },
  { v: 'square', label: '', a: 10 },
  { v: 'sawInv', label: '', a: 55 },
  { v: 'sineTri', label: '', a: 95 },
];
const isWave = (w: unknown): w is SolarVco['wave'] => VCO_WAVES.some((o) => o.v === w);
const WAVE_NAMES: Record<string, string> = {
  sine: 'sine',
  tri: 'triangle',
  saw: 'sawtooth',
  square: 'square',
  sawInv: 'saw to inverted saw',
  sineTri: 'sine to triangle',
};
function vco(s: 'a' | 'b', dx: number, frameX: [number, number]): void {
  const id = `v${s}`;
  const S = s.toUpperCase();
  const x = (px: number): number => px + dx;
  frame(frameX[0], 543, frameX[1], 697);
  plate(frameX[1] - 25, 548, `VCO ${S}`, 40);
  label(x(355), 548, 'MORPHING', 12);
  label(x(355), 556, 'WAVEFORM', 12);
  knob(`${id}.cvamt`, x(281), 583, 15, GREEN, {
    module: 'mod',
    def: 0,
    name: `VCO ${S} cv amt`,
    fmt: pct,
    help:
      s === 'b'
        ? 'How far the cv jack moves the pitch. With nothing in the jack it hears VCO A, so turning it up frequency-modulates VCO B with VCO A: bells, clangs, growls.'
        : 'How far the cv jack moves the pitch: frequency modulation from whatever is patched there.',
  });
  label(x(281), 563, 'cv amt', 13);
  toggle(`${id}.oct`, x(326), 583, {
    module: 'osc',
    name: `VCO ${S} oct +3 / low`,
    options: [
      { v: 'hi', label: 'oct+3' },
      { v: 'low', label: 'low' },
    ],
    def: 'hi',
    help: 'The range: at OCT +3 the keyboard plays the VCO at its pitch; LOW drops it three octaves, for bass and slow sub-audio wobbles.',
  });
  label(x(326), 571, 'oct+3', 12);
  label(x(326), 597, 'low', 12);
  toggle(`${id}.sub`, x(364), 583, {
    module: 'osc',
    name: `VCO ${S} −1 sub`,
    options: [
      { v: 'off', label: 'off' },
      { v: 'on', label: 'sub' },
    ],
    def: 'off',
    help: 'Adds a square an octave below the oscillator: weight under any wave.',
  });
  label(x(364), 571, '−1', 12);
  label(x(364), 597, 'sub', 12);
  knob(`${id}.tune`, x(402), 585, 15, GREEN, {
    module: 'osc',
    def: 5,
    name: `VCO ${S} tune`,
    label: 'tune',
    fmt: (v) => fmtSemi((v - 5) * 1.2),
    help: 'Fine-tunes the VCO over about an octave: detune it against the other VCO for beating, or tune it to an interval.',
  });
  toggle(`${id}.lin`, x(262), 610, {
    module: 'mod',
    name: `VCO ${S} lin / exp`,
    options: [
      { v: 'lin', label: 'lin' },
      { v: 'exp', label: 'exp' },
    ],
    def: 'exp',
    ui: true,
    help: `Whether the cv input moves the pitch linearly or by octaves. ${NOT_HERE} The cv input always moves it by octaves here.`,
  });
  label(x(262), 600, 'lin', 10);
  label(x(262), 621, 'exp', 10);
  controls.push({
    id: `${id}.wave`,
    type: 'knob',
    x: X(x(344)),
    y: Y(636),
    r: 21 * K,
    style: 'solar',
    cap: GREEN,
    kind: 'enum',
    options: VCO_WAVES,
    def: 'saw',
    module: 'osc',
    name: `VCO ${S} waveform`,
    label: 'waveform',
    labelPos: 'none',
    fmt: (w) => WAVE_NAMES[String(w)] ?? String(w),
    help: 'Six waves: sine, triangle, sawtooth and square, and two that morph with PW: saw to inverted saw, and sine to triangle.',
  });
  const glyphs: [WaveShape, number][] = [
    ['sine', -110],
    ['tri', -70],
    ['saw', -30],
    ['sq', 10],
    ['rsaw', 55],
    ['tri', 95],
  ];
  for (const [shape, a] of glyphs) {
    const rad = (a * Math.PI) / 180;
    decor.push({
      t: 'wave',
      x: X(x(344) + Math.sin(rad) * 32),
      y: Y(636 - Math.cos(rad) * 32),
      size: 12,
      shape,
      w: 1.6,
    });
  }
  knob(`${id}.pwm`, x(281), 637, 15, GREEN, {
    module: 'mod',
    def: 0,
    name: `VCO ${S} pwm`,
    label: 'pwm',
    fmt: pct,
    help: 'How far the pwm jack moves PW: a slow LFO there makes the square and the morphs shimmer.',
  });
  knob(`${id}.pw`, x(403), 638, 15, GREEN, {
    module: 'osc',
    def: 5,
    name: `VCO ${S} pw`,
    label: 'pw',
    fmt: pct,
    help: 'The square’s width, from a thin pulse to a full square, or how far a morphing wave has gone.',
  });
  label(x(268), 692, '1v/oct', 13);
  label(x(324), 692, 'cv', 13);
  label(x(366), 692, 'pwm', 13);
  const v = s === 'a' ? 4 : 5;
  jackIn(
    `${id}.voct`,
    x(268),
    676,
    `solP${v}`,
    `VCO ${S} 1v/oct`,
    'Pitch, one volt per octave, added to the keyboard’s.',
    { amt: 12 }
  );
  jackIn(
    `${id}.cv`,
    x(324),
    676,
    `solFm${v}`,
    `VCO ${S} cv`,
    s === 'b'
      ? 'Frequency modulation, as deep as CV AMT. With nothing patched it hears VCO A.'
      : 'Frequency modulation, as deep as CV AMT.',
    { amt: 0.2 }
  );
  jackIn(
    `${id}.pwmin`,
    x(366),
    676,
    `solPw${v}`,
    `VCO ${S} pwm`,
    'Moves PW, as far as the pwm knob sets.',
    {
      amt: (vals) => (num(vals, `${id}.pwm`) / 10) * 0.1,
    }
  );
  if (s === 'a') {
    label(x(422), 692, 'sync', 13);
    jackIn(
      'va.sync',
      x(420),
      676,
      'solSync4',
      'VCO A sync',
      'Restarts VCO A’s wave on each rising edge: patch VCO B’s osc output here for the tearing sync sweep.'
    );
  } else {
    label(x(420), 692, 'osc', 13, { fill: RED_INK });
    jackOut(
      'vb.osc',
      x(420),
      675,
      'solOsc5',
      'VCO B osc',
      'VCO B’s oscillator itself, before its envelope: −5 to +5 V, to modulate anything at audio rate.',
      5
    );
  }
}
vco('a', 0, [247, 443]);
vco('b', 594, [834, 1028]);

// ── Envelopes A and B ────────────────────────────────────────────────────
function envelope(
  s: 'a' | 'b',
  knobX: number[],
  holdX: number,
  jackX: number[],
  outFirst: boolean
): void {
  const id = `e${s}`;
  const S = s.toUpperCase();
  const v = s === 'a' ? 4 : 5;
  label(holdX - 20, 626, 'hold', 13);
  label(knobX[3] - 5, 621, `envelope ${S}`, 14);
  button(`${id}.hold`, holdX, 628, 14, {
    module: 'env',
    name: `Envelope ${S} hold`,
    help: `Keeps VCO ${S}’s VCA open, so it sounds with no key held.`,
  });
  decor.push({ t: 'wave', x: X(holdX + 19), y: Y(624), size: 12, shape: 'tri', w: 1.6 });
  button(`${id}.loop`, holdX + 38, 628, 14, {
    module: 'env',
    name: `Envelope ${S} loop`,
    help: 'Makes the envelope cycle attack and decay over and over while it is open, like an LFO (self-generation). ATTACK and DECAY set its speed, short ones fastest; SUSTAIN does nothing while it loops, and RELEASE only fades it once the gate closes.',
  });
  decor.push({ t: 'wave', x: X(holdX + 58), y: Y(624), size: 12, shape: 'adsr', w: 1.6 });
  led(holdX + 79, 628, 'amber', { id: `${id}.loop`, eq: true }, 3);
  const stage = (k: number, key: 'a' | 'd' | 's' | 'r', name: string, def: number, help: string) =>
    knob(`${id}.${key}`, knobX[k], 652, 14, GREEN, {
      module: 'env',
      def,
      name: `Envelope ${S} ${name}`,
      label: key.toUpperCase(),
      fmt: key === 's' ? pct : (t) => fmtTime(vcoEnvS(t)),
      help,
    });
  stage(0, 'a', 'attack', 1, 'Attack: how fast VCO ' + S + ' rises when a key goes down.');
  stage(1, 'd', 'decay', 4, 'Decay: how fast it then falls to SUSTAIN.');
  stage(2, 's', 'sustain', 7, 'Sustain: the level it holds while the key is held.');
  stage(3, 'r', 'release', 4, 'Release: how slowly it dies away after the key is let go.');
  const [g, e, c, o] = outFirst ? [jackX[1], jackX[2], jackX[3], jackX[0]] : jackX;
  label(g, 694, 'gate', 12);
  label(e, 694, 'env', 12, { fill: RED_INK });
  label(c, 694, 'vca cv', 12);
  label(o, 694, `VCO ${S}`, 12, { fill: RED_INK });
  jackIn(
    `${id}.gate`,
    g,
    682,
    `solG${v}`,
    `Envelope ${S} gate`,
    `Opens VCO ${S}’s envelope while the voltage is high, alongside the keyboard: patch the sequencer’s gate to play it from there.`
  );
  jackOut(
    `${id}.env`,
    e,
    682,
    `solEnv${v}`,
    `Envelope ${S} env out`,
    'The envelope, 0 to +8 V, to move the filter or the effector with each note.',
    8
  );
  jackIn(
    `${id}.vca`,
    c,
    682,
    null,
    `Envelope ${S} vca cv`,
    `Opens VCO ${S}’s VCA from a voltage. ${NOT_HERE}`
  );
  jackOut(
    `v${s}.out`,
    o,
    682,
    `sol${v}`,
    `VCO ${S} dry out`,
    `VCO ${S} after its VCA, before the mixer: the voice on its own.`,
    1
  );
}
envelope('a', [462, 500, 540, 580], 482, [478, 523, 558, 601], false);
envelope('b', [698, 738, 778, 818], 718, [678, 718, 758, 797], true);
frame(447, 612, 636, 697);
frame(650, 612, 832, 697);
plate(643, 626, 'VOICE', 30, 13);
plate(643, 639, 'MIXER', 30, 13);

// ── Voice mixer ───────────────────────────────────────────────────────────
const CHANNELS: [string, string, string][] = [
  ['d1', 'DRONE 1', 'Drone 1'],
  ['d2', 'DRONE 2', 'Drone 2'],
  ['d3', 'DRONE 3', 'Drone 3'],
  ['ext', 'EXT.AUDIO', 'EXT.AUDIO'],
  ['va', 'VCO A', 'VCO A'],
  ['vb', 'VCO B', 'VCO B'],
  ['pre', 'PREAMP', 'PREAMP'],
  ['d4', 'DRONE 4', 'Drone 4'],
  ['d5', 'DRONE 5', 'Drone 5'],
  ['d6', 'DRONE 6', 'Drone 6'],
];
const MIX_X = [462, 502, 542, 580, 619, 658, 697, 737, 777, 817];
const MIX_DEF: Record<string, number> = { va: 7, vb: 0, ext: 0, pre: 0 };
const PAN_DEF: Record<string, number> = { d1: -2, d2: 2, d3: -3, d4: -2, d5: 2, d6: 3 };
frame(447, 535, 832, 612);
CHANNELS.forEach(([ch, printed, name], i) => {
  const x = MIX_X[i];
  // PAN is printed over its knob, between it and the frame above
  label(x, 542, 'PAN', 7);
  knob(`mix.${ch}.pan`, x, 553, 9, PAN_CAP, {
    module: 'mixer',
    def: PAN_DEF[ch] ?? 0,
    min: -5,
    max: 5,
    name: `${name} PAN`,
    fmt: fmtPan,
    help: `Where ${name} sits between the left and right outputs, and so which side’s filter and cartridge it goes through.`,
  });
  plate(x, 568, printed, 38, 12);
  label(x, 576, 'VOL', 9);
  knob(`mix.${ch}.vol`, x, 595, 13, VOL_CAP, {
    module: 'mixer',
    def: MIX_DEF[ch] ?? 6,
    name: `${name} VOL`,
    fmt: pct,
    help: `How loud ${name} is in the mix.`,
  });
});

// ── Dual effector ─────────────────────────────────────────────────────────
interface Prog {
  name: string;
  alg: string;
  p: Record<string, number | string>;
  /** X, Y, Z: the parameter each turns and its range, or null where the cartridge’s knob is not modelled. */
  xyz: ([string, number, number] | null)[];
}
const CARTRIDGES: { v: string; label: string; progs: Prog[] }[] = [
  {
    v: 'cathedral',
    label: 'CATHEDRAL',
    progs: [
      {
        name: 'Shimmer',
        alg: 'hallrev',
        p: { MIX: 100, SIZ: 140, MOD: 60, PD: 40 },
        xyz: [null, null, ['DCY', 0.6, 4.9]],
      },
      {
        name: 'Oct up delay',
        alg: 'delayverb',
        p: { MIX: 100, BAL: -30 },
        xyz: [
          ['FBK', 0, 90],
          ['TIM', 60, 1200],
          ['DCY', 0.3, 5],
        ],
      },
      {
        name: 'Space reverb',
        alg: 'delayverb',
        p: { MIX: 100, BAL: 40, SIZ: 160 },
        xyz: [
          ['FBK', 0, 90],
          ['TIM', 60, 1200],
          ['DCY', 0.3, 5],
        ],
      },
    ],
  },
  {
    v: 'magic',
    label: 'MAGIC',
    progs: [
      {
        name: 'Pitch delay',
        alg: 'vintage-pitch',
        p: { MIX: 100, SM2: 0, FB2: 20 },
        xyz: [
          ['FB1', 0, 90],
          ['DL1', 20, 500],
          ['SM1', -12, 12],
        ],
      },
      {
        name: 'Reverse pitch delay',
        alg: 'vintage-pitch',
        p: { MIX: 100, SM2: -12, FB2: 30 },
        xyz: [
          ['FB1', 0, 90],
          ['DL1', 20, 500],
          ['SM1', -12, 12],
        ],
      },
      {
        name: 'Bell pitch delay',
        alg: 'vintage-pitch',
        p: { MIX: 100, SM2: 12, FB2: 40 },
        xyz: [
          ['FB1', 0, 90],
          ['DL1', 20, 500],
          ['SM1', -12, 12],
        ],
      },
    ],
  },
  {
    v: 'time',
    label: 'TIME',
    progs: [
      {
        name: 'Delay reverb',
        alg: 'delayverb',
        p: { MIX: 100, BAL: -40 },
        xyz: [
          ['FBK', 0, 90],
          ['TIM', 30, 1500],
          ['DCY', 0.3, 5],
        ],
      },
      {
        name: 'Delay chorus',
        alg: 'moddlyrev',
        p: { MIX: 100, SPD: 0.8, BAL: -80 },
        xyz: [
          ['FBK', 0, 90],
          ['TIM', 30, 1500],
          ['DEP', 0, 100],
        ],
      },
      {
        name: 'Delay vibrato',
        alg: 'moddlyrev',
        p: { MIX: 100, SPD: 4, BAL: -80 },
        xyz: [
          ['FBK', 0, 90],
          ['TIM', 30, 1500],
          ['DEP', 0, 100],
        ],
      },
    ],
  },
  {
    v: 'vibe',
    label: 'VIBE',
    progs: [
      {
        name: 'Phaser',
        alg: 'phaser',
        p: { MIX: 100 },
        xyz: [['DEP', 0, 100], ['SPD', 0.05, 5], null],
      },
      {
        name: 'Flanger',
        alg: 'flangeverb',
        p: { MIX: 100, BAL: -40 },
        xyz: [
          ['DEP', 0, 100],
          ['SPD', 0.05, 4],
          ['DCY', 0.1, 5],
        ],
      },
      {
        name: 'Resonance flanger',
        alg: 'flangeverb',
        p: { MIX: 100, BAL: -100 },
        xyz: [
          ['FBK', 0, 90],
          ['SPD', 0.05, 4],
          ['DEP', 0, 100],
        ],
      },
    ],
  },
  {
    v: 'infinity',
    label: 'INFINITY',
    progs: [
      {
        name: 'Resonance reverb',
        alg: 'ambverb',
        p: { MIX: 100, SIZ: 100, TGN: 100 },
        xyz: [
          ['PD', 0, 200],
          ['MOD', 0, 100],
          ['DCY', 0.5, 7.3],
        ],
      },
      {
        name: 'O.D.D.',
        alg: 'vintage-pitch',
        p: { MIX: 100, FB2: 60, SM2: 0 },
        xyz: [
          ['FB1', 20, 98],
          ['DL1', 20, 500],
          ['SM1', -12, 12],
        ],
      },
      {
        name: 'Resonance delay',
        alg: 'vintage-pitch',
        p: { MIX: 100, FB2: 80, SM2: 7 },
        xyz: [
          ['FB1', 20, 98],
          ['DL1', 5, 120],
          ['SM1', -12, 12],
        ],
      },
    ],
  },
];
const CART_OPTIONS: ControlOption[] = [
  { v: 'none', label: 'EMPTY' },
  ...CARTRIDGES.map((c) => ({ v: c.v, label: c.label })),
];
const PROG_OPTIONS: ControlOption[] = [
  { v: '1', label: '1' },
  { v: '2', label: '2' },
  { v: '3', label: '3' },
];
const progOf = (v: ControlValues, side: 'l' | 'r'): Prog | null => {
  const cart = CARTRIDGES.find((c) => c.v === v[`fx.cart${side.toUpperCase()}`]);
  return cart ? cart.progs[clamp(Number(v[`fx.prog${side.toUpperCase()}`]) - 1, 0, 2)] : null;
};
frame(447, 350, 832, 535);
plate(637, 355, 'DUAL EFFECTOR', 70, 13);
(['X', 'Y', 'Z'] as const).forEach((n, k) => {
  const x = [462, 520, 578][k];
  const jx = [462, 517, 580][k];
  label(jx, 383, `cv ${n.toLowerCase()}`, 12);
  knob(`fx.${n.toLowerCase()}`, x, 437, 12, RED, {
    module: 'fx',
    def: 5,
    name: `Effector ${n}`,
    label: n,
    fmt: pct,
    help: `Each loaded program’s ${['first', 'second', 'third'][k]} parameter, on both sides at once: what it is depends on each side’s cartridge (a reverb’s decay, a delay’s time, a pitch shift), so with two programs loaded one knob can turn two different things.`,
  });
  jackIn(
    `fx.cv${n.toLowerCase()}`,
    jx,
    398,
    `solFx${n}`,
    `Effector CV ${n}`,
    `Moves ${n}, −10 to +10 V across its whole travel: an envelope here makes the effect breathe with the notes.`,
    { amt: 0.1 }
  );
});
label(639, 369, 'cartridge slot', 13);
decor.push({ t: 'rect', x: X(610), y: Y(377), w: 58 * K, h: 26 * K, r: 2, fill: BLACK });
decor.push({ t: 'rect', x: X(613), y: Y(388), w: 52 * K, h: 4 * K, fill: '#d4d6d9' });
for (const [side, x, name] of [
  ['L', 624, 'left'],
  ['R', 654, 'right'],
] as const) {
  controls.push({
    id: `fx.cart${side}`,
    type: 'button',
    x: X(x),
    y: Y(396),
    w: 24 * K,
    h: 10 * K,
    kind: 'enum',
    options: CART_OPTIONS,
    def: 'none',
    lit: 'always',
    module: 'fx',
    name: `Cartridge (${name})`,
    label: `Cartridge (${name})`,
    labelPos: 'none',
    help: `Which cartridge the ${name} channel loaded its program from: on the hardware, the one in the slot when its 1-2-3 switch was flipped. Each press steps to the next; EMPTY passes the ${name} side through dry.`,
  });
  toggle(`fx.prog${side}`, side === 'L' ? 617 : 660, 420, {
    module: 'fx',
    name: `Program ${side} (1-2-3)`,
    options: PROG_OPTIONS,
    def: '1',
    help: `Loads one of the cartridge’s three programs into the ${name} channel. Each cartridge has three: a reverb, a delay and a shimmer, say.`,
  });
  label(side === 'L' ? 606 : 671, 420, '1\n2\n3', 9);
}
label(700, 395, 'BLEND', 14);
knob('fx.blend', 698, 437, 12, RED, {
  module: 'fx',
  def: 5,
  name: 'BLEND',
  fmt: pct,
  help: 'How much of the cartridges you hear against the filtered sound: dry at one end, the effect alone at the other.',
});
label(755, 391, 'MASTER', 14);
label(755, 401, 'VOLUME', 14);
knob('fx.master', 755, 437, 20, CREAM, {
  module: 'out',
  def: 7,
  name: 'MASTER VOLUME',
  fmt: pct,
  help: 'The level at the WET OUT jacks and so of everything you hear. There is no VCA after the effector, so turn the mixer up and keep this below full, as the manual says.',
});
label(815, 380, 'phones', 11);
circle(815, 400, 7, '#9fa2a6', '#55585c');
circle(815, 400, 3.5, BLACK);
knob('ui.phones', 815, 437, 12, RED, {
  module: 'out',
  def: 7,
  name: 'Headphone volume',
  fmt: pct,
  ui: true,
  help: `The headphone level. ${NOT_HERE} Use MASTER VOLUME.`,
});

// ── Dual Polivoks filter and distortion ──────────────────────────────────
tab(450, 497, 'FILTER L', 46);
tab(825, 497, 'FILTER R', 46);
for (const [side, fx, bx, rx, name] of [
  ['l', 480, 512, 540, 'left'],
  ['r', 738, 767, 798, 'right'],
] as const) {
  const S = side.toUpperCase();
  knob(`vcf.${side}freq`, fx, 500, 13, RED, {
    module: 'filter',
    def: 7,
    name: `Filter ${S} FREQ`,
    label: 'FREQ',
    fmt: (v) => fmtHz(cutoffHz(v)),
    help: `The ${name} filter’s cutoff: how bright the ${name} side is.`,
  });
  controls.push({
    id: `vcf.${side}mode`,
    type: 'button',
    x: X(bx),
    y: Y(483),
    w: 14 * K,
    h: 14 * K,
    cap: 'black',
    kind: 'enum',
    options: [
      { v: 'lp', label: 'LP' },
      { v: 'bp', label: 'BP' },
    ],
    def: 'lp',
    module: 'filter',
    name: `Filter ${S} BP / LP`,
    label: `Filter ${S} BP / LP`,
    labelPos: 'none',
    help: `Low-pass (the full body under the cutoff) or band-pass (only a band round it, thin and vocal) on the ${name} side. The hardware clicks as it switches.`,
  });
  label(bx - 14, 476, 'BP', 9);
  label(bx + 14, 476, 'LP', 9);
  decor.push({ t: 'wave', x: X(bx - 10), y: Y(483), size: 9, shape: 'tri', w: 1.4 });
  knob(`vcf.${side}res`, rx, 500, 13, RED, {
    module: 'filter',
    def: 2,
    name: `Filter ${S} RES`,
    label: 'RES',
    fmt: pct,
    help: `A peak at the ${name} cutoff, up to a whistle. The Polivoks keeps its bass as it rises.`,
  });
  knob(`vcf.${side}mod`, side === 'l' ? 617 : 662, 448, 12, RED, {
    module: 'filter',
    def: 5,
    name: `MOD ${S}`,
    label: `MOD ${S}`,
    fmt: pct,
    help: `How far CV ${S} moves the ${name} cutoff.`,
  });
}
knob('vcf.dist', 597, 500, 13, RED, {
  module: 'filter',
  def: 0,
  name: 'DIST',
  label: 'DIST',
  fmt: pct,
  help: 'The balance between the clean and the distorted filter, after the filters on both sides: at 0 no distortion, at full only the distorted sound. GAIN sets how hard it distorts. The resonant peak is what clips first.',
});
knob('vcf.gain', 680, 500, 13, RED, {
  module: 'filter',
  def: 5,
  name: 'GAIN',
  label: 'GAIN',
  fmt: pct,
  help: 'How hard the distortion after the filters drives each side: a little warms it, all of it squares it off. It is louder; bring MASTER VOLUME down to match.',
});
button('vcf.link', 640, 498, 14, {
  module: 'filter',
  name: 'link',
  help: 'Makes the right filter follow the left: its cutoff and CV L move both sides together.',
});
label(640, 515, 'link', 13);
label(570, 516, 'CV L', 13);
label(710, 516, 'CV R', 13);
decor.push({
  t: 'line',
  x1: X(640),
  y1: Y(440),
  x2: X(640),
  y2: Y(485),
  w: 1.5,
  stroke: '#8d8e93',
});
jackIn(
  'vcf.cvl',
  570,
  498,
  'solCutL',
  'CV L',
  'Moves the left cutoff, as far as MOD L, an octave a volt at full. It is normalled to CV R, so with nothing in CV R it moves the right cutoff too, as far as MOD R.',
  {
    // the depth is the engine's (MOD L here, MOD R through the normal), so the jack names the knobs itself
    does: (v) =>
      `A signal here moves the left cutoff as far as MOD L (${pct(num(v, 'vcf.lmod'))}) and, while CV R is empty, the right cutoff as far as MOD R (${pct(num(v, 'vcf.rmod'))}).`,
  }
);
jackIn(
  'vcf.cvr',
  710,
  498,
  'solCutR',
  'CV R',
  'Moves the right cutoff on its own, as far as MOD R, and breaks the normal from CV L.',
  {
    does: (v) =>
      `A signal here moves the right cutoff as far as MOD R (${pct(num(v, 'vcf.rmod'))}), and CV L no longer reaches it.`,
  }
);

// ── LFO A and LFO B ──────────────────────────────────────────────────────
const SPEEDS: ControlOption[] = [
  { v: 'x6', label: '×6' },
  { v: 'x1', label: '×1' },
  { v: 'x10', label: '×10' },
];
function lfoBlock(s: 'a' | 'b', dx: number): void {
  const id = `lfo${s}`;
  const S = s.toUpperCase();
  const x = (px: number): number => px + dx;
  frame(x(48), 700, x(188), 772);
  plate(x(118), 765, `LFO ${S}`, 136, 15);
  knob(`${id}.wave`, x(73), 725, 15, RED, {
    module: 'lfo',
    def: 0,
    name: `LFO ${S} wave`,
    label: 'wave',
    fmt: (v) => (v < 0.5 ? 'triangle' : v > 9.5 ? 'square' : `${Math.round(v * 10)} % square`),
    help: 'From a triangle through a blend of the two to a square.',
  });
  toggle(`${id}.speed`, x(138), 728, {
    module: 'lfo',
    name: `LFO ${S} speed`,
    options: SPEEDS,
    def: 'x1',
    help: 'Multiplies the rate by 6 or 10, from slow drifts to fast trills.',
  });
  label(x(130), 718, '×6', 9);
  label(x(130), 728, '×1', 9);
  label(x(130), 738, '×10', 9);
  knob(`${id}.rate`, x(165), 725, 15, RED, {
    module: 'lfo',
    def: 4,
    name: `LFO ${S} rate`,
    label: 'rate',
    // a readout sees only its own knob, so it gives the rate at ×1 and says so: the SPEED switch multiplies it
    fmt: (v) => `${fmtHz(lfoHz(v, s === 'a', 'x1'))} at ×1`,
    help: s === 'a' ? 'The speed of LFO A, the slow one.' : 'The speed of LFO B, the fast one.',
  });
  led(x(110), 744, 'blue', undefined, 3);
  jackOut(
    `${id}.out`,
    x(108),
    722,
    s === 'a' ? 'solLfoA' : 'solLfoB',
    `LFO ${S} out`,
    'The LFO, 0 to +10 V and positive only, so it can light a classic drone’s photosensor through its CV jack.',
    10
  );
}
lfoBlock('a', 0);
lfoBlock('b', 1040);

// ── Joystick ─────────────────────────────────────────────────────────────
frame(190, 700, 338, 772);
plate(264, 765, 'JOYSTICK', 146, 15);
knob('joy.ox', 215, 723, 15, RED, {
  module: 'mod',
  def: 0,
  min: -5,
  max: 5,
  name: 'Joystick offset X',
  label: 'X',
  fmt: fmtV,
  help: 'Shifts the X output’s range: −10 to 0 V at one end, −5 to +5 in the middle, 0 to +10 V at the other.',
});
knob('joy.oy', 308, 723, 15, RED, {
  module: 'mod',
  def: 0,
  min: -5,
  max: 5,
  name: 'Joystick offset Y',
  label: 'Y',
  fmt: fmtV,
  help: 'Shifts the Y output’s range, as offset X does.',
});
led(244, 722, 'red', undefined, 3);
led(287, 722, 'red', undefined, 3);
jackOut(
  'joy.outx',
  265,
  710,
  'joyX',
  'Joystick X out',
  'The stick’s left-right position plus offset X, −10 to +10 V.'
);
jackOut(
  'joy.outy',
  265,
  737,
  'joyY',
  'Joystick Y out',
  'The stick’s up-down position plus offset Y.'
);
controls.push(
  {
    id: 'joy.x',
    type: 'joystick',
    pair: 'joy.y',
    x: X(132),
    y: Y(902),
    r: 29 * K,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (left-right)',
    fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`,
    help: 'A locking joystick: its position is two voltages at the JOYSTICK block’s X and Y jacks, 5 V either side of its offset. Drag the stick; double-click to centre it.',
  },
  {
    id: 'joy.y',
    type: 'joystick',
    pairOf: 'joy.x',
    x: X(132),
    y: Y(902) + 1,
    r: 29 * K,
    kind: 'cont',
    min: -1,
    max: 1,
    def: 0,
    module: 'mod',
    labelPos: 'none',
    name: 'Joystick (up-down)',
    fmt: (v) => `${v >= 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}%`,
    help: 'The stick’s up-down position, at the Y jack. Drawn as part of the joystick.',
  }
);
for (const [px, py, d] of [
  [132, 850, 'M -6 4 L 6 4 L 0 -6 Z'],
  [132, 955, 'M -6 -4 L 6 -4 L 0 6 Z'],
  [82, 902, 'M 4 -6 L 4 6 L -6 0 Z'],
  [183, 902, 'M -4 -6 L -4 6 L 6 0 Z'],
] as const) {
  decor.push({ t: 'path', d: shiftPath(d, X(px), Y(py)), w: 0, fill: INK });
}
for (const [px, py] of [
  [100, 862],
  [163, 862],
  [100, 942],
  [163, 942],
])
  circle(px, py, 5, BLACK);
/** A small path drawn about the origin, moved to (x, y) and doubled. */
function shiftPath(d: string, x: number, y: number): string {
  return d.replace(
    /(-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)/g,
    (_, a: string, b: string) => `${x + Number(a) * K} ${y + Number(b) * K}`
  );
}

// ── 5-step sequential voltage ────────────────────────────────────────────
frame(340, 700, 785, 772);
plate(390, 765, '5 STEP SEQ.', 96, 15);
label(470, 766, 'VOLTAGE', 15, { weight: 700 });
knob('seq.pulser', 363, 723, 15, RED, {
  module: 'mod',
  def: 4,
  name: 'pulser',
  label: 'pulser',
  fmt: (v) => fmtHz(pulserHz(v)),
  help: 'The speed of the PULSER, the sequencer’s own clock, also a square at its jack.',
});
toggle('seq.stages', 443, 723, {
  module: 'mod',
  name: 'stages',
  options: [
    { v: '4', label: '4' },
    { v: '5', label: '5' },
    { v: '3', label: '3' },
  ],
  def: '5',
  help: 'How many steps the sequence runs before it starts again: 3, 4 or 5.',
});
label(443, 709, '4', 11);
label(452, 723, '5', 11);
label(443, 738, '3', 11);
label(443, 748, 'stages', 13);
label(410, 748, 'clock', 13);
const STEP_X = [478, 537, 597, 657, 715];
const GATE_X = [507, 567, 627, 685, 743];
// a minor figure at 1v/oct (a knob unit is half a volt, six semitones): root, ♭3, 5, 4, ♭7
const STEP_DEF = [0, 0.5, 1.17, 0.83, 1.67];
STEP_X.forEach((sx, k) => {
  knob(`seq.s${k + 1}`, sx, 725, 14, RED, {
    module: 'mod',
    def: STEP_DEF[k],
    name: `step ${k + 1}`,
    label: `step ${k + 1}`,
    fmt: (v) => `${Math.round(v * 5) / 10} V`,
    help: `Step ${k + 1}’s voltage, 0 to 5 V at the cv out jack while the sequence is on it.`,
  });
  controls.push({
    id: `seq.g${k + 1}`,
    type: 'toggle',
    x: X(GATE_X[k]),
    y: Y(730),
    w: 9 * K,
    kind: 'bool',
    def: true,
    module: 'mod',
    name: `step ${k + 1} gate`,
    label: `step ${k + 1} gate`,
    labelPos: 'none',
    help: `Whether step ${k + 1} sends a gate. Off, the step still sets its voltage but plays no new note.`,
  });
  label(GATE_X[k], 744, 'gate', 9);
  led(GATE_X[k], 711, 'red', { seq: k }, 3);
});
for (let k = 0; k < 33; k++)
  decor.push({ t: 'rect', x: X(503 + k * 8.5), y: Y(759), w: 3 * K, h: 9 * K, fill: BLACK });
label(762, 704, 'cv', 12, { fill: RED_INK });
label(764, 748, 'gate', 12, { fill: RED_INK });
jackOut(
  'seq.pulse',
  410,
  710,
  'solPulser',
  'pulser out',
  'The pulser, a square of −10 and +10 V at its speed: a clock for anything else.',
  10
);
jackIn(
  'seq.clk',
  410,
  735,
  'solSeqClk',
  'sequencer clock in',
  'Steps the sequence on each rising edge in place of the pulser: an LFO, a drone’s envelope, the keyboard’s gate.'
);
jackOut(
  'seq.cv',
  780,
  710,
  'solSeqCv',
  'sequencer cv out',
  'The current step’s voltage, 0 to 5 V: patch it to a VCO’s 1v/oct for a melody, or to the filter.',
  5
);
jackOut(
  'seq.gate',
  780,
  737,
  'solSeqGate',
  'sequencer gate out',
  'A gate on each step whose gate switch is on, to open an envelope or a drone.',
  10
);

// ── Preamp and envelope follower ─────────────────────────────────────────
frame(787, 700, 898, 772);
plate(842, 765, 'PREAMP', 108, 15);
label(828, 744, 'ext.', 12);
label(828, 752, 'source', 12);
knob('pre.gain', 862, 723, 15, RED, {
  module: 'mixer',
  def: 0,
  name: 'PREAMP gain',
  label: 'gain',
  fmt: (v) => (v <= 0 ? 'off' : `${Math.round(40 * (v / 10))} dB`),
  help: 'Up to 40 dB of gain for the contact microphone or EXT. SOURCE, into the PREAMP mixer channel and the envelope follower. At its minimum the preamp is off.',
});
led(892, 722, 'green', 'overload', 3);
jackIn(
  'pre.ext',
  823,
  722,
  'preampIn',
  'PREAMP ext. source',
  'An outside sound into the preamp in place of the built-in contact microphone: a guitar, a mic, a line. Here it is the only way into the preamp, as the contact microphone is not modelled.'
);
frame(900, 700, 1090, 772);
plate(995, 765, 'ENVELOPE FOLLOWER', 186, 15);
knob('ef.att', 922, 725, 15, RED, {
  module: 'env',
  def: 3,
  name: 'Envelope follower attack',
  label: 'attack',
  fmt: pct,
  ui: true,
  help: `How fast the follower rises with the sound. ${NOT_HERE} The follower’s times are fixed here: it rises in a few milliseconds and falls in about a tenth of a second.`,
});
knob('ef.rel', 982, 725, 15, RED, {
  module: 'env',
  def: 3,
  name: 'Envelope follower release',
  label: 'release',
  fmt: pct,
  ui: true,
  help: `How fast the follower falls when the sound stops. ${NOT_HERE}`,
});
led(1013, 722, 'red', undefined, 3);
led(1051, 722, 'amber', undefined, 3);
label(1032, 745, 'env', 13, { fill: RED_INK });
label(1070, 745, 'gate', 13, { fill: RED_INK });
jackOut(
  'ef.env',
  1032,
  722,
  'envf',
  'envelope follower env',
  'A voltage that follows the preamp’s loudness, 0 to +10 V: let a played or scratched sound open the filter.',
  10
);
jackOut(
  'ef.gate',
  1070,
  722,
  null,
  'envelope follower gate',
  `A +8 V gate while the preamp hears a sound. ${NOT_HERE}`
);

// ── Touch keyboard ───────────────────────────────────────────────────────
decor.push({ t: 'rect', x: X(241), y: Y(807), w: 796 * K, h: 190 * K, r: 3, fill: '#121315' });
const PLATES: [number, number, number][] = [
  [250, 850, 969],
  [309, 831, 951],
  [367, 814, 933],
  [426, 831, 951],
  [485, 850, 969],
  [544, 867, 986],
  [690, 867, 986],
  [748, 850, 969],
  [807, 832, 952],
  [866, 814, 933],
  [926, 832, 952],
  [984, 850, 969],
];
for (const [px, y0, y1] of PLATES) {
  decor.push({
    t: 'rect',
    x: X(px),
    y: Y(y0),
    w: 45 * K,
    h: (y1 - y0) * K,
    r: 2,
    fill: 'none',
    stroke: '#c9d5df',
    sw: 4,
  });
  for (let yy = y0 + 6; yy < y1 - 3; yy += 7)
    decor.push({ t: 'rect', x: X(px + 5), y: Y(yy), w: 35 * K, h: 2.5 * K, fill: '#9b8452' });
}
// each plate plays its note while it is held: C4 to B4 left to right, so SPLIT parts them at F♯4 (`KEY_SPLIT`)
PLATES.forEach(([px, y0, y1], k) => {
  controls.push({
    id: `kb.plate${k + 1}`,
    type: 'button',
    x: X(px + 22.5),
    y: Y((y0 + y1) / 2),
    w: 45 * K,
    h: (y1 - y0) * K,
    note: 60 + k,
    kind: 'bool',
    def: false,
    ui: true,
    module: 'mode',
    label: `Plate ${k + 1}`,
    labelPos: 'none',
    name: `Touch plate ${k + 1} (${fmtNote(60 + k).replace(/\d+$/, '')})`,
    help: `A touch plate: hold it to play ${fmtNote(60 + k)} on the VCOs, as a key does, through the octave buttons. ${k < 6 ? 'In SPLIT it plays VCO A, with the left half.' : 'In SPLIT it plays VCO B, with the right half.'} On the hardware each plate can be retuned with the encoder, and the pressure output follows how much finger is on it.`,
  });
});
for (const tx of [390, 890])
  decor.push({
    t: 'path',
    d: shiftPath('M 0 -22 L 24 18 L -24 18 Z', X(tx), Y(965)),
    w: 4,
    fill: 'none',
    stroke: '#c9d5df',
  });
// the sun
[34, 26, 18, 10].forEach((r, i) => circle(640, 950, r, 'none', i % 2 ? '#9b8452' : '#c9d5df'));
circle(640, 950, 3, '#c9d5df');
circle(640, 846, 22, 'none', '#9b8452');
knob('kb.glide', 640, 846, 15, '#d6342a', {
  module: 'mode',
  def: 0,
  name: 'Keyboard encoder (PORTAMENTO)',
  fmt: (v) => (glideS(v) ? fmtTime(glideS(v)) : 'off'),
  help: 'On the hardware the encoder scrolls through the keyboard’s menu and edits it: its behaviour, arpeggiator, sequencer, quantiser, vibrato, presets and portamento. Here it sets only PORTAMENTO: how slowly the keyboard’s pitch glides from one note to the next, off at the bottom. The display beside it shows the behaviour.',
});
// the triangles and the sun: parts with a card and nothing to turn
const marks: PanelMark[] = [
  ...[390, 890].map((tx, i) => ({
    id: `kb.triangle${i + 1}`,
    name: 'Triangle',
    module: 'mode' as const,
    help: 'A printed triangle on the keyboard’s faceplate. The manual does not say it does anything, and here it is decoration.',
    rect: { x: X(tx - 24), y: Y(943), w: 48 * K, h: 40 * K },
  })),
  {
    id: 'kb.sun',
    name: 'The sun (contact microphone)',
    module: 'mode',
    help: 'The built-in contact microphone, a piezo, sits under the keyboard beneath the sun and turns the whole case into a microphone: scratch or tap it and the PREAMP hears it. Here the preamp has no microphone to listen to, so the sun is a marker.',
    rect: { x: X(606), y: Y(916), w: 68 * K, h: 68 * K },
  },
];
for (const [px, py] of [
  [434, 798],
  [640, 798],
  [845, 798],
  [434, 1006],
  [640, 1006],
  [845, 1006],
])
  circle(px, py, 6, BLACK);
decor.push({ t: 'rect', x: X(612), y: Y(881), w: 56 * K, h: 18 * K, fill: '#050506' });
controls.push({
  id: 'keys.mode',
  type: 'menu',
  x: X(640),
  y: Y(890),
  w: 54 * K,
  h: 16 * K,
  size: 18,
  // the value fills the display, as the hardware shows only the value
  vw: 50 * K,
  kind: 'enum',
  options: [
    { v: 'single', label: 'SINGLE' },
    { v: 'split', label: 'SPLIT' },
  ],
  def: 'single',
  module: 'mode',
  label: 'MODE',
  name: 'Keyboard behaviour',
  help: 'How the touch keyboard plays the two VCOs. SINGLE: both together. SPLIT: the lower half plays VCO A and the upper half VCO B, each with its own gate. On the hardware it is a menu, chosen with the encoder; its arpeggiator, sequencer, quantiser, vibrato and presets are not modelled.',
});
button('keys.down', 586, 847, 18, {
  module: 'mode',
  lamp: 'red',
  name: 'Keyboard octave down',
  help: 'Transposes the keyboard down an octave while it is lit. On the hardware it adds an offset set with the encoder; here it is one octave.',
});
button('keys.up', 692, 847, 18, {
  module: 'mode',
  lamp: 'white',
  name: 'Keyboard octave up',
  help: 'Transposes the keyboard up an octave while it is lit.',
});
decor.push({
  t: 'path',
  d: shiftPath('M -5 -3 L 5 -3 L 0 5 Z', X(586), Y(829)),
  w: 0,
  fill: '#c9d5df',
});
decor.push({
  t: 'path',
  d: shiftPath('M -5 3 L 5 3 L 0 -5 Z', X(692), Y(829)),
  w: 0,
  fill: '#c9d5df',
});
jackIn(
  'kb.clock',
  486,
  824,
  null,
  'keyboard clock in',
  `Clocks the keyboard’s arpeggiator and sequencer. ${NOT_HERE}`
);
jackIn('kb.reset', 516, 831, null, 'keyboard reset', `Restarts the arpeggiator. ${NOT_HERE}`);
jackOut(
  'kb.gatel',
  547,
  839,
  'solKg1',
  'keyboard gate left (main)',
  'A 0 to +10 V gate while a plate is held (the left half in SPLIT). It opens both VCOs’ envelopes from inside.',
  10
);
jackOut(
  'kb.gater',
  730,
  839,
  'solKg2',
  'keyboard gate right',
  'The right half’s gate in SPLIT.',
  10
);
jackOut(
  'kb.press',
  761,
  831,
  null,
  'keyboard pressure',
  `How much finger is on the plate, 0 to +8 V. ${NOT_HERE}`
);
jackOut(
  'kb.voct',
  791,
  824,
  'solKbd1',
  'keyboard v/oct',
  'The held plate’s pitch, one volt per octave: it drives both VCOs from inside, and can play anything else.'
);
// the printed symbol beside each jack: clock, reset, the two gates, pressure, v/oct
const glyph = (x: number, y: number, d: string): void => {
  decor.push({ t: 'path', d: shiftPath(d, X(x), Y(y)), w: 1.6, fill: 'none', stroke: '#c9d5df' });
};
decor.push({
  t: 'circle',
  x: X(501),
  y: Y(826),
  r: 3.5 * K,
  fill: 'none',
  stroke: '#9fc3e6',
  sw: 1.6,
});
decor.push({
  t: 'path',
  d: shiftPath('M 0 -2 L 0 0 L 1.8 0', X(501), Y(826)),
  w: 1.6,
  fill: 'none',
  stroke: '#9fc3e6',
});
glyph(531, 835, 'M 1.5 -4 L -2 0.5 L 1 0.5 L -1.5 4');
for (const x of [564, 715]) glyph(x, 844, 'M -4 3 L -2 3 L -2 -3 L 2 -3 L 2 3 L 4 3');
glyph(746, 836, 'M 0 -4 L 0 3 M -3 3 L 3 3');
glyph(776, 827, 'M 2 -4 L 2 2 L -2 2 M -0.5 0.5 L -2 2 L -0.5 3.5');

// ── Drone voice buttons ──────────────────────────────────────────────────
label(1145, 793, 'DRONE VOICES', 14);
[1, 2, 3, 4, 5, 6].forEach((n, i) => {
  const x = i < 3 ? 1120 : 1169;
  const y = [837, 902, 967][i % 3];
  label(x, y - 27, String(n), 15);
  controls.push({
    id: `gate.d${n}`,
    type: 'button',
    x: X(x),
    y: Y(y),
    w: 40 * K,
    h: 40 * K,
    cap: 'black',
    lamp: 'white',
    kind: 'bool',
    def: false,
    module: 'mode',
    name: `DRONE VOICES ${n}`,
    label: String(n),
    labelPos: 'none',
    help: `Opens Drone ${n}. On the hardware it sounds while held; here a press latches it on and a second press lets it go, so the drone can play while you do something else.`,
  });
});
for (const [px, py] of [
  [1052, 799],
  [1088, 799],
  [1200, 799],
  [1088, 902],
  [1200, 902],
  [1052, 1006],
  [1088, 1006],
  [1200, 1006],
])
  circle(px, py, 5, BLACK);

// ── Rear sockets ─────────────────────────────────────────────────────────
label(92, 286, 'EXT.', 11);
label(92, 293, 'AUDIO', 11);
label(130, 286, 'R', 11);
label(160, 286, 'L', 11);
label(145, 296, 'WET OUT', 11);
jackIn(
  'ext.in',
  92,
  271,
  'solExt',
  'EXT. AUDIO in',
  'An outside sound into the mixer’s EXT.AUDIO channel, through the filters and the effector like a voice.',
  { amt: 0.5 }
);
jackOut(
  'out.r',
  130,
  271,
  'solR',
  'WET OUT R',
  'The right output: the right side after its filter, distortion and cartridge, at MASTER VOLUME.'
);
jackOut('out.l', 160, 271, 'solL', 'WET OUT L', 'The left output.');

// ── Areas (photo pixels, converted) ──────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: (x1 - x0) * K,
  h: (y1 - y0) * K,
});
const classicArea = (n: number, mx: number): Area => ({
  id: `drone${n}`,
  label: `Drone ${n}`,
  module: 'osc',
  keywords:
    'drone classic solar 50 saw sawtooth chord tune mute mod volt photosensor eye light hold attack release',
  rects: [R(mx - 25, 386, mx + 170, 541)],
  help: `A classic drone voice: five sawtooth generators, each with a TUNE knob, a MUTE button to switch it in and a MOD button to let the photosensor and the CV jack bend it. VOLT lowers all five and then makes them modulate each other. ATT and RLS fade the voice in and out when DRONE VOICES ${n}, HOLD or the GATE jack opens it. Its eye, the photosensor, bends the MOD generators with the light on it: drag the eye, or light it from the CV jack.`,
});
const areas: Area[] = [
  {
    id: 'io',
    label: 'Rear sockets',
    module: 'out',
    keywords: 'output input external audio wet out stereo left right',
    rects: [R(45, 262, 240, 302)],
    help: 'EXT. AUDIO brings an outside sound into the mixer; WET OUT L and R are the stereo outputs, after the filters, the distortion and the effector.',
  },
  classicArea(1, 72),
  classicArea(2, 269),
  classicArea(4, 858),
  classicArea(5, 1055),
  ...[3, 6].map((n, i): Area => ({
    id: `drone${n}`,
    label: `Drone ${n}`,
    module: 'osc',
    keywords: 'drone papa srapa square fm am modulator noise sample hold siren bird wind surf',
    rects: [i ? R(1030, 543, 1236, 697) : R(45, 543, 245, 697)],
    help: `A Papa Srapa voice: a square tone (PITCH, HI / LOW) under a slow square modulator (RATE, 1 / 10). FM lets the modulator warble the pitch, as deep as MOD and DIVIDER; AM lets it chop the tone. NOISE blends in white noise, and the S&H turns the noise into random steps. DRONE VOICES ${n}, HOLD or GATE open it.`,
  })),
  ...(['a', 'b'] as const).map((s, i): Area => ({
    id: `vco${s}`,
    label: `VCO ${s.toUpperCase()}`,
    module: 'osc',
    keywords:
      'vco oscillator as3340 waveform morph sine triangle saw square pulse width sub octave fm sync keyboard',
    rects: [i ? R(832, 543, 1030, 697) : R(247, 543, 445, 697)],
    help: `An AS3340 oscillator played from the touch keyboard: six waves, two of them morphing with PW, a sub-oscillator an octave down, an octave switch and TUNE. CV AMT sets how far the cv jack frequency-modulates it${s === 'b' ? ', and with nothing there it hears VCO A' : ''}.`,
  })),
  {
    id: 'enva',
    label: 'Envelope A',
    module: 'env',
    keywords: 'envelope adsr attack decay sustain release hold loop vca vco a',
    rects: [R(447, 612, 636, 697)],
    help: 'VCO A’s ADSR and VCA, opened by the keyboard or the gate jack. HOLD keeps it open; the loop button makes it cycle like an LFO. The red VCO A jack is the voice on its own.',
  },
  {
    id: 'envb',
    label: 'Envelope B',
    module: 'env',
    keywords: 'envelope adsr attack decay sustain release hold loop vca vco b',
    rects: [R(650, 612, 832, 697)],
    help: 'VCO B’s ADSR and VCA, as Envelope A is for VCO A.',
  },
  {
    id: 'mixer',
    label: 'Voice mixer',
    module: 'mixer',
    keywords: 'mixer volume pan stereo left right channel level',
    rects: [R(447, 535, 832, 612), R(636, 612, 650, 697)],
    help: 'Ten channels: the six drones, both VCOs, EXT.AUDIO and the PREAMP. VOL sets each one’s level and PAN where it sits, which also decides which filter and cartridge it goes through.',
  },
  {
    id: 'effector',
    label: 'Dual effector',
    module: 'fx',
    keywords: 'effect cartridge reverb delay shimmer pitch blend master volume headphones x y z',
    rects: [R(447, 350, 832, 432), R(447, 432, 600, 462), R(680, 432, 832, 462)],
    help: 'Two cartridge effects, one on each side, each loaded with one of a cartridge’s three programs by its 1-2-3 switch. X, Y and Z turn the program’s three parameters on both sides, under CV; BLEND mixes them with the dry sound and MASTER VOLUME sets the output.',
  },
  {
    id: 'filter',
    label: 'Dual Polivoks filter',
    module: 'filter',
    keywords:
      'filter vcf polivoks cutoff resonance low-pass band-pass distortion dist gain link cv',
    rects: [R(600, 432, 680, 462), R(447, 462, 832, 535)],
    help: 'A 12 dB Polivoks filter on each side, low-pass or band-pass, each with FREQ, RES and a CV input scaled by MOD L or MOD R. LINK makes the right follow the left. DIST and GAIN add a distortion after both filters.',
  },
  {
    id: 'lfoa',
    label: 'LFO A',
    module: 'lfo',
    keywords: 'lfo slow modulation triangle square photosensor',
    rects: [R(45, 698, 189, 776)],
    help: 'The slow LFO, triangle to square, positive only so it can drive a drone’s photosensor. The switch multiplies its rate by 6 or 10.',
  },
  {
    id: 'joystick',
    label: 'Joystick',
    module: 'mod',
    keywords: 'joystick x y offset cv performance',
    rects: [R(189, 698, 339, 776), R(45, 820, 230, 990)],
    help: 'A locking joystick with two outputs, X and Y, each shifted by its offset knob. Patch them where a hand should move the sound.',
  },
  {
    id: 'seq',
    label: '5-step sequencer',
    module: 'mod',
    keywords: 'sequencer step pulser clock gate stages buchla voltage',
    rects: [R(339, 698, 786, 776)],
    help: 'A Buchla-style five-step voltage source: each step a knob and a gate switch, 3 to 5 stages, run by the PULSER or a clock at its jack. Its cv and gate outputs can play a VCO or open a drone.',
  },
  {
    id: 'preamp',
    label: 'Preamp',
    module: 'mixer',
    keywords: 'preamp contact mic microphone piezo external source gain',
    rects: [R(786, 698, 899, 776)],
    help: 'A preamp for the built-in contact microphone or EXT. SOURCE, up to 40 dB, into the mixer’s PREAMP channel and the envelope follower.',
  },
  {
    id: 'envf',
    label: 'Envelope follower',
    module: 'env',
    keywords: 'envelope follower gate detector preamp attack release',
    rects: [R(899, 698, 1091, 776)],
    help: 'Turns the preamp’s loudness into a voltage at its env jack, and a gate while it hears something.',
  },
  {
    id: 'lfob',
    label: 'LFO B',
    module: 'lfo',
    keywords: 'lfo fast modulation triangle square',
    rects: [R(1091, 698, 1236, 776)],
    help: 'The fast LFO, as LFO A.',
  },
  {
    id: 'keys',
    label: 'Touch keyboard',
    module: 'mode',
    keywords: 'keyboard touch plates single split octave gate pitch encoder display arpeggiator',
    rects: [R(240, 805, 1040, 1000)],
    help: 'Twelve touch plates that play the two VCOs, SINGLE or SPLIT, with octave buttons, a display and outputs for its pitch and gates. Here the app’s own keyboard plays it.',
  },
  {
    id: 'drones',
    label: 'Drone voice buttons',
    module: 'mode',
    keywords: 'drone voices buttons gate play',
    rects: [R(1045, 780, 1236, 1000)],
    help: 'Six buttons that open the six drones. Press several and play chords of drones; here each press latches.',
  },
];

// ── Engine mapping ───────────────────────────────────────────────────────
/** Each effects algorithm's parameter defaults, by id. */
const FX_DEFAULTS = new Map(
  FX_ALGOS.map((a) => [a.id, Object.fromEntries(a.params.map((q) => [q.ref, q.def]))])
);
function cartridge(prog: Prog | null): SolarParams['fx']['l'] {
  if (!prog) return { alg: null, p: {} };
  const base = FX_DEFAULTS.get(prog.alg);
  // every id is a literal above: a miss is an algorithm renamed in the effects table, not a value from a sound
  if (!base) throw new Error(`solar-42n: no effects algorithm ${prog.alg}`);
  return { alg: prog.alg, p: { ...base, ...prog.p } };
}
const pan = (v: ControlValues, ch: string): number => clamp(num(v, `mix.${ch}.pan`) / 5, -1, 1);
const level = (v: ControlValues, ch: string): number => vol(num(v, `mix.${ch}.vol`));

/** What every drone voice, classic or Papa Srapa, has: its gate, its ASR envelope and its mixer channel. */
function droneCommon(
  v: ControlValues,
  d: string
): Pick<SolarDrone, 'gate' | 'env' | 'level' | 'pan'> {
  return {
    gate: !!v[`gate.${d}`],
    env: {
      mode: 'asr',
      a: droneEnvS(num(v, `${d}.att`)),
      d: 0.1,
      s: 1,
      r: droneEnvS(num(v, `${d}.rls`)),
      hold: !!v[`${d}.hold`],
    },
    level: level(v, d),
    pan: pan(v, d),
  };
}
function classicVoice(v: ControlValues, n: number): SolarDrone {
  const d = `d${n}`;
  return {
    kind: 'drone',
    ...droneCommon(v, d),
    gens: GEN_RANGE.map(([lo, hi], k) => ({
      note: lo + ((hi - lo) * num(v, `${d}.tune${k + 1}`)) / 10,
      on: !!v[`${d}.on${k + 1}`],
      mod: !!v[`${d}.mod${k + 1}`],
    })),
    volt: clamp(num(v, `${d}.volt`) / 10, 0, 1),
    photo: PHOTO_SEMI,
    light: clamp(num(v, `${d}.light`) / 10, 0, 1),
  };
}
function srapaVoice(v: ControlValues, n: number): SolarSrapa {
  const d = `d${n}`;
  return {
    kind: 'srapa',
    ...droneCommon(v, d),
    note: srapaNote(num(v, `${d}.pitch`), !!v[`${d}.hi`]),
    rate: srapaHz(num(v, `${d}.rate`), !!v[`${d}.x10`]),
    fm: !!v[`${d}.fm`],
    am: !!v[`${d}.am`],
    dev: srapaDev(num(v, `${d}.mod`), num(v, `${d}.div`)),
    noise: clamp(num(v, `${d}.noise`) / 10, 0, 1),
  };
}
function vcoVoice(v: ControlValues, s: 'a' | 'b'): SolarVco {
  const id = `v${s}`;
  const e = `e${s}`;
  const octave = (v['keys.up'] ? 12 : 0) - (v['keys.down'] ? 12 : 0);
  const wave = v[`${id}.wave`];
  return {
    kind: 'vco',
    gate: false,
    env: {
      mode: v[`${e}.loop`] ? 'loop' : 'adsr',
      a: vcoEnvS(num(v, `${e}.a`)),
      d: vcoEnvS(num(v, `${e}.d`)),
      s: clamp(num(v, `${e}.s`) / 10, 0, 1),
      r: vcoEnvS(num(v, `${e}.r`)),
      hold: !!v[`${e}.hold`],
    },
    level: level(v, id),
    pan: pan(v, id),
    semi: (v[`${id}.oct`] === 'low' ? -36 : 0) + (num(v, `${id}.tune`) - 5) * 1.2 + octave,
    wave: isWave(wave) ? wave : 'saw',
    shape: clamp(num(v, `${id}.pw`) / 10, 0, 1),
    sub: v[`${id}.sub`] === 'on',
    fm: clamp(num(v, `${id}.cvamt`) / 10, 0, 1),
  };
}
function xyzKnobs(v: ControlValues): SolarFxKnob[] {
  // the knobs are shared, but each side's program decides what they turn there; an unmodelled knob turns nothing
  return (['l', 'r'] as const).flatMap((side) => {
    const prog = progOf(v, side);
    if (!prog) return [];
    return (['x', 'y', 'z'] as const).flatMap((n, k) => {
      const t = prog.xyz[k];
      if (!t) return [];
      return [
        { side, k: k as 0 | 1 | 2, ref: t[0], lo: t[1], hi: t[2], v: num(v, `fx.${n}`) / 10 },
      ];
    });
  });
}

function toEngine(v: ControlValues): EngineParams {
  const side = (s: 'l' | 'r'): SolarParams['vcf']['l'] => ({
    mode: v[`vcf.${s}mode`] === 'bp' ? 'bp' : 'lp',
    cutoff: cutoffHz(num(v, `vcf.${s}freq`)),
    res: clamp(num(v, `vcf.${s}res`) / 10, 0, 1) * 0.98,
    drive: DRIVE,
    mod: clamp(num(v, `vcf.${s}mod`) / 10, 0, 1),
  });
  const solar: SolarParams = {
    voices: [
      classicVoice(v, 1),
      classicVoice(v, 2),
      srapaVoice(v, 3),
      vcoVoice(v, 'a'),
      vcoVoice(v, 'b'),
      classicVoice(v, 4),
      classicVoice(v, 5),
      srapaVoice(v, 6),
    ],
    keys: {
      mode: v['keys.mode'] === 'split' ? 'split' : 'single',
      split: KEY_SPLIT,
      glide: glideS(num(v, 'kb.glide')),
    },
    ext: { level: level(v, 'ext'), pan: pan(v, 'ext') },
    pre: { level: level(v, 'pre'), pan: pan(v, 'pre') },
    vcf: {
      l: side('l'),
      r: side('r'),
      link: !!v['vcf.link'],
      dist: {
        mix: clamp(num(v, 'vcf.dist') / 10, 0, 1),
        gain: clamp(num(v, 'vcf.gain') / 10, 0, 1),
      },
    },
    fx: {
      l: cartridge(progOf(v, 'l')),
      r: cartridge(progOf(v, 'r')),
      xyz: xyzKnobs(v),
      blend: clamp(num(v, 'fx.blend') / 10, 0, 1),
    },
    master: clamp(num(v, 'fx.master') / 10, 0, 1),
    lfo: {
      a: {
        hz: lfoHz(num(v, 'lfoa.rate'), true, String(v['lfoa.speed'])),
        wave: 1 - clamp(num(v, 'lfoa.wave') / 10, 0, 1),
      },
      b: {
        hz: lfoHz(num(v, 'lfob.rate'), false, String(v['lfob.speed'])),
        wave: 1 - clamp(num(v, 'lfob.wave') / 10, 0, 1),
      },
    },
    seq: {
      hz: pulserHz(num(v, 'seq.pulser')),
      levels: STEP_X.map((_, k) => clamp(num(v, `seq.s${k + 1}`) / 10, 0, 1)),
      gates: STEP_X.map((_, k) => !!v[`seq.g${k + 1}`]),
      stages: Number(v['seq.stages']) || 5,
    },
  };
  return {
    solar,
    osc: [],
    noise: { level: 0, color: 'white' },
    ext: { level: 0 },
    filter: { type: 'ladder', mode: 'lp', cutoff: 1000, res: 0, envAmt: 0, envSrc: 'env1', kbd: 0 },
    env1: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
    env2: { a: 0.01, d: 0.1, s: 1, r: 0.1 },
    vca: { envSrc: 'none', bias: 0 },
    lfo: { rate: 1, mix: {}, keySync: false },
    glide: { time: 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    normals: { envfIn: 'preamp' },
    preamp: { gain: preGain(num(v, 'pre.gain')) },
    envf: { sens: 1 },
    joy: [5 * num(v, 'joy.x') + num(v, 'joy.ox'), 5 * num(v, 'joy.y') + num(v, 'joy.oy')],
    volume: 1,
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const solar42n: SynthDef & { version: number } = {
  id: 'solar-42n',
  version: 1,
  name: 'SOLAR 42N',
  maker: 'Elta Music',
  year: 2025,
  heritage:
    'The third SOLAR 42, after the 2023 original and the 42F; successor to the Elta SOLAR 50',
  summary:
    'An analogue microtonal drone machine with eight voices: four classic drones of five tuned saws, two Papa Srapa noise-and-square voices and two AS3340 VCOs on a touch keyboard, through a ten-channel stereo mixer, a dual 12 dB Polivoks filter with distortion after it and two cartridge effects, with LFOs, a 5-step sequencer, a joystick and a contact-mic preamp to patch.',
  view: { w: 1196 * K, h: 768 * K },
  theme: {
    panel: PANEL,
    panel2: PANEL2,
    ink: INK,
    font: 'helv',
    cheeks: 'none',
    jack: 'black',
  },
  signalNames: {
    sol1: 'Drone 1',
    sol2: 'Drone 2',
    sol3: 'Drone 3',
    sol4: 'VCO A',
    sol5: 'VCO B',
    sol6: 'Drone 4',
    sol7: 'Drone 5',
    sol8: 'Drone 6',
    solOsc5: 'VCO B’s oscillator',
    solEnv1: 'Drone 1’s envelope',
    solEnv2: 'Drone 2’s envelope',
    solEnv3: 'Drone 3’s envelope',
    solEnv4: 'Envelope A',
    solEnv5: 'Envelope B',
    solEnv6: 'Drone 4’s envelope',
    solEnv7: 'Drone 5’s envelope',
    solEnv8: 'Drone 6’s envelope',
    solMod3: 'Drone 3’s modulator',
    solMod8: 'Drone 6’s modulator',
    solSh3: 'Drone 3’s sample and hold',
    solSh8: 'Drone 6’s sample and hold',
    solLfoA: 'LFO A',
    solLfoB: 'LFO B',
    solPulser: 'the pulser',
    solSeqCv: 'the sequencer',
    solSeqGate: 'the sequencer’s gate',
    solKbd1: 'the keyboard',
    solKg1: 'the keyboard’s gate',
    solKg2: 'the keyboard’s right gate',
    solL: 'the left output',
    solR: 'the right output',
    joyX: 'the joystick (X)',
    joyY: 'the joystick (Y)',
    envf: 'the envelope follower',
    preamp: 'the preamp',
  },
  destNames: {
    solCutL: 'the left filter’s cutoff',
    solCutR: 'the right filter’s cutoff',
    solFxX: 'the effector’s X',
    solFxY: 'the effector’s Y',
    solFxZ: 'the effector’s Z',
    solP4: 'VCO A’s pitch',
    solP5: 'VCO B’s pitch',
    solFm4: 'VCO A’s FM',
    solFm5: 'VCO B’s FM',
    solSeqClk: 'the sequencer’s clock',
  },
  decor,
  areas,
  marks,
  controls,
  jacks,
  init,
  toEngine,
};

export default solar42n;
