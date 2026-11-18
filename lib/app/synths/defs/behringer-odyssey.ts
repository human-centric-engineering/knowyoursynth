/**
 * Behringer ODYSSEY: the definition (D1). Positions are measured on the owner's 1500 × 1073 photo from above
 * (`.context/app/synth-data/behringer-odyssey/raw/Behringer Odyssey.jpg`, local only), and written in view units of
 * 1.4 photo pixels from the faceplate's top-left corner at photo (14, 14): view x = (photo x − 14) × 1.4, y = (photo
 * y − 14) × 1.4. The keys and the strip above them are left out: the app's keyboard plays the synth. The owner's spec is
 * `.context/app/synth-data/behringer-odyssey/behringer-odyssey.synth.json` (the Quick Start Guide, whose PDF is in
 * `raw/`).
 *
 * Written straight into the app, with no prototype version (`f-next-synths`), starting from `defs/b2600.ts`, the other
 * copy of an ARP: two VCOs (sawtooth and pulse) with sync, a ring modulator, white or pink noise and a sample and hold
 * fed by its own two-channel mixer → a ladder low-pass at 2 or 4 poles (the 4023, 4035 and 4075 switch) → a one-pole
 * high-pass → drive → the VCA. An ADSR and an AR, either gated by the keys or repeated by the LFO square. A `version`,
 * the maker's marks tagged `brand` (the behringer logo and KLARK TEKNIK), and panel values read through `num()`.
 *
 * Duophonic on the engine's `duo` keyboard: VCO-1 plays the lowest key held, VCO-2 the highest (`paraphonic`,
 * `note2Osc: 1`), both the same key when one is held. The S/H mixer is the engine's `sum1`, sampled by the S/H on each
 * rise of the LFO square. LFO REPEAT moves an envelope's trigger to `envClk`, fed the LFO square (gated by the key on
 * KYBD REPEAT). The filter's keyboard tracking follows the highest key, as the spec infers.
 *
 * The guide gives the envelope times; the panel prints the VCO, LFO, VCF and HPF ranges. The fine tuning, the
 * modulation depths, the pulse width's narrowest, the glide, the drive and the difference between the 4035 and the
 * 4075 are this app's estimates. Not modelled: the effects (the guide records their count, not their algorithms), the
 * pedal, the PITCH pads but the LFO one (the mod wheel), the portamento MODE, accent, and the S/H's KYBD TRIG, which
 * the engine cannot clock from a key. The sequencer's buttons drive the app's sequencer, as the B1's do.
 */
import type {
  Area,
  Control,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  EnvTrigSource,
  FaderControl,
  FaderLed,
  SeqButton,
  SlideControl,
  SynthDef,
  SynthModule,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import {
  clamp,
  expMap,
  fmtHz,
  fmtSemi,
  fmtTime,
  level10,
  noteName,
  noteOf,
} from '@/lib/app/synths/lib/maps';

// ── Photo → view ──────────────────────────────────────────────────────────
const X = (px: number): number => Math.round((px - 14) * 14) / 10;
const Y = (py: number): number => Math.round((py - 14) * 14) / 10;
const S = (p: number): number => Math.round(p * 14) / 10;

// ── Scales ────────────────────────────────────────────────────────────────
/** The VCO FREQUENCY marks: 20 Hz, 200 Hz and 2 kHz, two decades over the travel; the frequency key C4 plays. */
export const vcoHz = (v: number): number => 20 * Math.pow(100, clamp(v, 0, 10) / 10);
/** VCO-1 on LF KYBD OFF: the same slider reads .2 to 20 Hz. */
export const LF_DIV = 100;
/** FINE: a whole tone either way (the app's estimate). */
export const FINE_SEMI = 2;
/** LFO FREQ: .2 to 20 Hz, as printed. */
export const lfoHz = (v: number): number => expMap(v / 10, 0.2, 20);
/** VCF FREQ and HPF CUTOFF FREQ: 16 Hz to 16 kHz, as printed. */
export const filterHz = (v: number): number => 16 * Math.pow(1000, clamp(v, 0, 10) / 10);
/** RESONANCE: SELF OSC at the top. */
export const RES_MAX = 1.1;
/** The envelope ranges the guide gives. */
export const attackS = (v: number): number => expMap(v / 10, 0.005, 5);
export const decayS = (v: number): number => expMap(v / 10, 0.01, 10);
export const adsrReleaseS = (v: number): number => expMap(v / 10, 0.015, 10);
export const arReleaseS = (v: number): number => expMap(v / 10, 0.01, 10);
/** PORTAMENTO: up to three seconds, square law (the app's estimate). */
export const glideS = (v: number): number => Math.pow(clamp(v, 0, 10) / 10, 2) * 3;
/** OUTPUT LAG: none at the bottom, up to a second and a half. */
export const lagS = (v: number): number => (v <= 0 ? 0 : expMap(v / 10, 0.002, 1.5));
/** Full-scale depth of each FM source, in semitones, on a square-law slider (the app's estimates). */
export const FM_SEMI = { lfo: 12, sh: 24, adsr: 48, mixer: 24 } as const;
export const fmDepth = (v: number, range: number): number =>
  range * Math.pow(clamp(v, 0, 10) / 10, 2);
/** PULSE WIDTH: 50 % at the bottom, the narrowest at MIN; PWM swings the width up to this much. */
export const PW_SWING = 0.45;
/** Octaves of cutoff at the top of each VCF modulation slider (`kbd`: 1, full keyboard tracking). */
export const VCF_OCT = { kbd: 1, mixer: 3, sh: 3, lfo: 3, env: 8 } as const;
/** The proportional pitch pad's vibrato (the mod wheel here), semitones at full. */
export const PAD_VIB_SEMI = 1;

const pct = (v: number): string => `${Math.round(v * 10)}%`;
/** C4 on the FREQUENCY sliders. */
const C4 = Math.round(5 * Math.log10(261.6256 / 20) * 1000) / 1000;

// ── Colours of the print ──────────────────────────────────────────────────
const INK = '#ecebe6';
const RED = '#c5421d';
const LINE = '#b8401e';

const controls: Control[] = [];
const decor: Decor[] = [];
const seqButtons: Record<string, SeqButton> = {};

type TextRest = Partial<Pick<TextDecor, 'fill' | 'weight' | 'anchor' | 'brand' | 'spacing'>>;
/** Text centred on (px, py) in photo pixels; `\n` stacks lines. */
const text = (px: number, py: number, t: string, size = 12, rest: TextRest = {}): void => {
  const lines = t.split('\n');
  lines.forEach((l, i) => {
    decor.push({
      t: 'text',
      x: X(px),
      y: Y(py) + size * 0.36 + (i - (lines.length - 1) / 2) * size * 1.05,
      text: l,
      size,
      anchor: 'middle',
      weight: 600,
      ...rest,
    });
  });
};
const line = (x1: number, y1: number, x2: number, y2: number, w = 2, stroke = LINE): void => {
  decor.push({ t: 'line', x1: X(x1), y1: Y(y1), x2: X(x2), y2: Y(y2), w, stroke });
};
const wave = (px: number, py: number, shape: WaveShape, size = 15): void => {
  decor.push({ t: 'wave', x: X(px), y: Y(py), shape, size, w: 2 });
};
/** An orange-red section plate with white lettering, by its photo corners. */
const plate = (x0: number, y0: number, x1: number, y1: number, t: string, size = 13): void => {
  decor.push({ t: 'rect', x: X(x0), y: Y(y0), w: S(x1 - x0), h: S(y1 - y0), fill: RED });
  text((x0 + x1) / 2, (y0 + y1) / 2, t, size, { weight: 700 });
};

type FaderRest = Omit<
  FaderControl,
  'id' | 'type' | 'orient' | 'x' | 'y' | 'len' | 'kind' | 'min' | 'max' | 'def' | 'led'
> &
  Partial<Pick<FaderControl, 'min' | 'max' | 'def' | 'step'>>;
/** Top row of sliders (VCOs, LFO, VCF, HPF, VCA, AR): the marks run from photo y 78 to 194. */
const TOP = 137;
/** Bottom row (modulation, mixers, ADSR): marks from 288 to 404. */
const BOT = 346;
const LEN = S(116);
const fader = (id: string, px: number, py: number, led: FaderLed, rest: FaderRest): void => {
  controls.push({
    id,
    type: 'fader',
    orient: 'v',
    x: X(px),
    y: Y(py),
    len: LEN,
    pad: 14,
    led,
    ticks: 5,
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    ...rest,
  });
};

type SlideRest = OmitEach<SlideControl, 'id' | 'type' | 'orient' | 'x' | 'y' | 'w' | 'h'>;
/** A small vertical slide switch, `true` / the first option at the top. */
const slide = (id: string, px: number, py: number, rest: SlideRest, h = 40): void => {
  controls.push({
    id,
    type: 'slide',
    orient: 'v',
    x: X(px),
    y: Y(py),
    w: 15,
    h,
    labelPos: 'none',
    ...rest,
  });
};

/** The labels round a switch under a slider: `top` above it, `bottom` below, each with an optional glyph. */
const switchLabels = (
  px: number,
  top: string,
  topWave: WaveShape | null,
  bottom: string,
  bottomWave: WaveShape | null,
  y = 465
): void => {
  const tl = top.split('\n').length;
  text(px, y - 30 - (topWave ? 8 : 0) - (tl - 1) * 5, top, 10.5);
  if (topWave) wave(px, y - 24, topWave, 9);
  const bl = bottom.split('\n').length;
  text(px, y + 24 + (bl - 1) * 5.5, bottom, 10.5);
  if (bottomWave) wave(px, y + 27 + bl * 8, bottomWave, 9);
};

// ── Frames and section plates ─────────────────────────────────────────────
decor.push({
  t: 'rect',
  x: X(24),
  y: Y(26),
  w: S(1451),
  h: S(590),
  fill: 'none',
  stroke: LINE,
  sw: 2,
});
line(244, 26, 244, 616);
line(452, 26, 452, 616);
line(659, 26, 659, 616);
line(866, 26, 866, 520);
line(1270, 26, 1270, 616);

plate(257, 214, 341, 254, 'VOLTAGE\nCONTROLLED\nOSCILLATOR 1', 11);
plate(464, 214, 548, 254, 'VOLTAGE\nCONTROLLED\nOSCILLATOR 2', 11);
plate(672, 118, 756, 156, 'LOW\nFREQUENCY\nOSCILLATOR', 11);
plate(672, 214, 756, 254, 'S / H\nMIXER', 12);
plate(769, 214, 854, 254, 'SAMPLE /\nHOLD', 12);
plate(881, 214, 1013, 254, 'AUDIO\nMIXER', 12);
plate(1026, 214, 1108, 254, 'VOLTAGE\nCONTROLLED\nFILTER', 11);
plate(1120, 214, 1163, 254, 'HIGH\nPASS\nFILTER', 11);
plate(1175, 214, 1256, 254, 'VOLTAGE\nCONTROLLED\nAMPLIFIER', 11);
// the waves each oscillator offers, beside its plate
for (const x of [341, 548]) {
  line(x, 224, x + 10, 224, 1.5);
  line(x, 244, x + 10, 244, 1.5);
  wave(x + 24, 224, 'saw', 10);
  wave(x + 24, 244, 'pulse', 10);
}
line(756, 129, 766, 129, 1.5);
line(756, 147, 766, 147, 1.5);
wave(780, 129, 'sine', 10);
wave(780, 147, 'pulse', 10);
line(756, 234, 769, 234, 1.5);
line(1013, 234, 1026, 234, 1.5);
line(1108, 234, 1120, 234, 1.5);
line(1163, 234, 1175, 234, 1.5);

// ── FX and the left-hand controller ───────────────────────────────────────
text(110, 76, 'POWERED BY', 7, { anchor: 'end', brand: true });
text(158, 76, 'KLARK TEKNIK', 14, { weight: 700, brand: true, spacing: '0.04em' });
decor.push({
  t: 'rect',
  x: X(80),
  y: Y(91),
  w: S(114),
  h: S(47),
  r: 3,
  fill: '#e9a01f',
  stroke: '#111',
  sw: 3,
});
text(72, 160, 'PARAMETER\n1/2', 8.5);
text(134, 160, 'PARAMETER\n3 (TAP)', 8.5);
text(187, 160, 'PROGRAM\n/VALUE', 8.5);
const NO_FX =
  'The effects are not modelled here: the guide gives how many there are, not what each program does.';
controls.push(
  {
    id: 'fx.param12',
    type: 'button',
    x: X(72),
    y: Y(179),
    w: S(28),
    h: S(13),
    kind: 'bool',
    def: false,
    ui: true,
    label: 'PARAMETER 1/2',
    labelPos: 'none',
    module: 'fx',
    help: `Shows the effect’s first parameter on the display, then its second, for PROGRAM/VALUE to change. ${NO_FX}`,
  },
  {
    id: 'fx.param3',
    type: 'button',
    x: X(134),
    y: Y(179),
    w: S(28),
    h: S(13),
    kind: 'bool',
    def: false,
    ui: true,
    label: 'PARAMETER 3 (TAP)',
    labelPos: 'none',
    module: 'fx',
    help: `Shows the effect’s third parameter, and taps the tempo of a time-based effect. ${NO_FX}`,
  },
  {
    id: 'fx.program',
    type: 'knob',
    x: X(187),
    y: Y(181),
    r: S(10),
    style: 'd-silver',
    kind: 'cont',
    min: 1,
    max: 32,
    def: 1,
    step: 1,
    label: 'PROGRAM/VALUE',
    labelPos: 'none',
    module: 'fx',
    scale: { ticks: 11, tickR: 1.45 },
    fmt: (v) => `program ${Math.round(v)}`,
    help: `Chooses one of the 32 Klark Teknik effects (pressed, it loads it), and sets the value of the parameter on show. ${NO_FX}`,
  },
  {
    id: 'fx.on',
    type: 'slide',
    orient: 'v',
    x: X(74),
    y: Y(254),
    w: 15,
    h: 40,
    kind: 'bool',
    def: false,
    label: 'FX',
    labelPos: 'none',
    module: 'fx',
    help: `Puts the effects after the VCA, or takes them out. ${NO_FX}`,
  },
  {
    id: 'fx.send',
    type: 'knob',
    x: X(188),
    y: Y(249),
    r: S(10),
    style: 'd-silver',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    label: 'FX SEND',
    labelPos: 'none',
    module: 'fx',
    scale: { ticks: 11, tickR: 1.45 },
    help: `How much of the sound goes through the effect, with the dry sound kept. ${NO_FX}`,
  }
);
text(74, 225, 'FX', 10.5);
text(74, 237, 'ON', 8.5);
text(74, 280, 'OFF', 8.5);
text(188, 228, 'FX SEND', 8.5);

text(66, 338, 'TEMPO/GATE\nLENGTH', 9.5);
text(132, 343, 'PORTAMENTO', 9.5);
text(196, 343, 'TRANSPOSE', 9.5);
controls.push({
  id: 'seq.tempo',
  type: 'fader',
  orient: 'v',
  x: X(71),
  y: Y(413),
  len: LEN,
  pad: 14,
  led: 'white',
  ticks: 5,
  kind: 'cont',
  min: 40,
  max: 300,
  def: 120,
  step: 1,
  ui: true,
  label: 'TEMPO/GATE LENGTH',
  name: 'TEMPO',
  labelPos: 'none',
  module: 'mode',
  fmt: (v) => `${Math.round(v)} BPM`,
  help: 'The tempo of the sequencer and the arpeggiator; while editing steps, the gate length, and with SHIFT the swing. Here it sets the speed of the riff and of the sequencer’s pattern, from 40 to 300 beats a minute (the guide gives no range), and each sound starts at its own riff’s tempo.',
});
text(90, 356, 'MAX', 7, { anchor: 'start' });
text(90, 471, 'MIN', 7, { anchor: 'start' });
text(71, 489, 'SWING', 7.5, { fill: '#e2543a' });
fader('kbd.portamento', 132, 413, 'white', {
  label: 'PORTAMENTO',
  module: 'glide',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideS(v))),
  help: 'Glide: how long the pitch takes to slide from one key to the next, from none to about three seconds (the app’s estimate; the guide gives no range). With SHIFT while editing steps it splits a step into ratchets.',
});
[
  [0, 471],
  [5, 413],
  [10, 356],
].forEach(([n, y]) => text(151, y, String(n), 7, { anchor: 'start' }));
text(194, 368, '2 OCTAVES\nUP', 8.5);
text(194, 460, '2 OCTAVES\nDOWN', 8.5);
controls.push({
  id: 'kbd.transpose',
  type: 'slide',
  orient: 'v',
  x: X(194),
  y: Y(414),
  w: 22,
  h: 64,
  kind: 'enum',
  def: 'normal',
  options: [
    { v: 'up_2', label: '2 OCTAVES UP' },
    { v: 'normal', label: 'NORMAL' },
    { v: 'down_2', label: '2 OCTAVES DOWN' },
  ],
  label: 'TRANSPOSE',
  labelPos: 'none',
  module: 'osc',
  help: 'Moves the whole keyboard up or down two octaves, or leaves it where it is in the middle.',
});
text(194, 480, 'MODE', 7.5);
controls.push({
  id: 'kbd.porta_mode',
  type: 'button',
  x: X(194),
  y: Y(491),
  w: 7,
  h: 7,
  kind: 'bool',
  def: false,
  label: 'MODE',
  name: 'Portamento MODE',
  labelPos: 'none',
  module: 'glide',
  help: 'A recessed button: pressed in, a change of TRANSPOSE glides too, at the PORTAMENTO time. Not modelled here: TRANSPOSE jumps.',
});

// the proportional pitch pads
text(133, 604, 'PROPORTIONAL PITCH CONTROL', 9.5);
text(71, 528, 'b', 13);
wave(133, 528, 'sine', 9);
text(194, 528, '#', 13);
for (const x of [71, 133, 194]) {
  decor.push({
    t: 'rect',
    x: X(x - 21),
    y: Y(541),
    w: S(42),
    h: S(43),
    r: 3,
    fill: '#f1f0ec',
    stroke: '#9a9a96',
    sw: 1.5,
  });
}

// ── VCO-1 and VCO-2 ───────────────────────────────────────────────────────
const fmtVco1 = (v: number, values?: ControlValues): string => {
  const hz = vcoHz(v);
  if (values?.['vco1.kybd'] === 'lf_kybd_off') return `${fmtHz(hz / LF_DIV)} (LF)`;
  return `${fmtHz(hz)} (${noteName(hz)} at C4)`;
};
const fmtVco2 = (v: number): string => {
  const hz = vcoHz(v);
  return `${fmtHz(hz)} (${noteName(hz)} at C4)`;
};
const fmtFine = (v: number): string => fmtSemi(((v - 5) / 5) * FINE_SEMI);
const fmtPw = (v: number): string => `${Math.round((0.5 - (PW_SWING * v) / 10) * 100)}%`;

for (const n of [1, 2] as const) {
  const x0 = n === 1 ? 273 : 482; // COARSE
  const x1 = x0 + 49; // FINE
  const xs = n === 1 ? [274, 323, 371, 419] : [482, 530, 578, 627];
  const name = `VCO-${n}`;
  text((x0 + x1) / 2, 48, 'FREQUENCY', 10.5);
  text(x0, 60, 'COARSE', 10.5);
  text(x1, 60, 'FINE', 10.5);
  fader(`vco${n}.coarse`, x0, TOP, 'green', {
    label: 'FREQUENCY COARSE',
    name: `${name} COARSE`,
    def: C4,
    fmt: n === 1 ? fmtVco1 : fmtVco2,
    module: 'osc',
    help:
      n === 1
        ? 'Sets VCO-1’s pitch over a wide range: the marks are the frequency middle C plays, 20 Hz to 2 kHz. On LF KYBD OFF the same slider reads .2 to 20 Hz.'
        : 'Sets VCO-2’s pitch over a wide range: the marks are the frequency middle C plays, 20 Hz to 2 kHz.',
  });
  fader(`vco${n}.fine`, x1, TOP, 'green', {
    label: 'FREQUENCY FINE',
    name: `${name} FINE`,
    def: 5,
    fmt: fmtFine,
    module: 'osc',
    help: `Tunes ${name} finely, up to a tone either way from the middle (the app’s estimate), for tuning it against the other VCO or detuning it for a thicker sound.`,
  });
  // the scale between the two sliders
  const scale: [number, string][] =
    n === 1
      ? [
          [78, '2 KHz\n20Hz'],
          [137, '200 Hz\n2'],
          [194, '20 Hz\n.2'],
        ]
      : [
          [78, '2\nKHz'],
          [137, '200\nHz'],
          [194, '20\nHz'],
        ];
  scale.forEach(([y, t]) => text(x0 + 25, y, t, 7.5));
  line(x1 + 15, 80, x1 + 15, 110, 1.4);
  line(x1 + 15, 165, x1 + 15, 194, 1.4);

  // pulse width bracket
  text((xs[2] + xs[3]) / 2, 258, 'PULSE WIDTH', 11);
  line(xs[2] - 8, 258, xs[2] - 8, 265, 1.4);
  line(xs[3] + 8, 258, xs[3] + 8, 265, 1.4);
  text(xs[2], 270, 'WIDTH', 9.5);
  text(xs[3], 270, 'MOD', 9.5);
  text(xs[2] + 19, 288, 'MIN', 6.5, { anchor: 'start' });
  text(xs[2] + 19, 404, '50%', 6.5, { anchor: 'start' });
  // FM bracket
  line(xs[0] - 6, 414, xs[0] - 6, 422, 1.4);
  line(xs[0] - 6, 422, xs[1] + 6, 422, 1.4);
  line(xs[1] + 6, 414, xs[1] + 6, 422, 1.4);
  text((xs[0] + xs[1]) / 2, 422, 'FM', 11);
  line(xs[3], 414, xs[3], 422, 1.4);
  // plate to sliders
  line(xs[0], 254, xs[0], 280, 1.4);
  line(xs[1], 254, xs[1], 280, 1.4);

  fader(`vco${n}.fm1`, xs[0], BOT, 'green', {
    label: 'FM',
    name: `${name} FM (${n === 1 ? 'LFO' : 'LFO or S/H mixer'})`,
    module: 'osc',
    fmt: (v, values) => {
      const src = values?.[`vco${n}.fm1_src`];
      const r = n === 2 && src === 'snh_mixer' ? FM_SEMI.mixer : FM_SEMI.lfo;
      return `±${Math.round(fmDepth(v, r) * 10) / 10} st`;
    },
    help:
      n === 1
        ? 'How far the LFO swings VCO-1’s pitch: vibrato with the sine, a trill between two pitches with the square. Square law, so the bottom of the slider gives gentle amounts.'
        : 'How far the LFO sine, or the S/H mixer, moves VCO-2’s pitch, chosen by the switch below. Square law, so the bottom of the slider gives gentle amounts.',
  });
  fader(`vco${n}.fm2`, xs[1], BOT, 'green', {
    label: 'FM',
    name: `${name} FM (S/H or ADSR)`,
    module: 'osc',
    fmt: (v, values) => {
      const r = values?.[`vco${n}.fm2_src`] === 'adsr' ? FM_SEMI.adsr : FM_SEMI.sh;
      return `${Math.round(fmDepth(v, r) * 10) / 10} st`;
    },
    help: `How far the sample and hold (random steps) or the ADSR (a sweep on each note) moves ${name}’s pitch, chosen by the switch below.`,
  });
  fader(`vco${n}.pw`, xs[2], BOT, 'green', {
    label: 'WIDTH',
    name: `${name} PULSE WIDTH`,
    module: 'osc',
    fmt: fmtPw,
    help: `Narrows ${name}’s pulse wave from a square (50%) at the bottom towards a thin pulse at MIN, from hollow to nasal and reedy. Only the pulse hears it.`,
  });
  fader(`vco${n}.pwm`, xs[3], BOT, 'green', {
    label: 'MOD',
    name: `${name} PULSE WIDTH MOD`,
    module: 'osc',
    fmt: pct,
    help: `How far the LFO sine or the ADSR moves ${name}’s pulse width: a slow sine gives the moving, chorus-like pulse sound.`,
  });
  slide(`vco${n}.fm1_src`, xs[0], 465, {
    kind: 'enum',
    def: 'lfo_sine',
    options:
      n === 1
        ? [
            { v: 'lfo_sine', label: 'LFO sine' },
            { v: 'lfo_square', label: 'LFO square' },
          ]
        : [
            { v: 'lfo_sine', label: 'LFO sine' },
            { v: 'snh_mixer', label: 'S/H MIXER OR PEDAL' },
          ],
    label: 'FM source',
    name: `${name} FM source (${n === 1 ? 'LFO sine or square' : 'LFO or S/H mixer'})`,
    module: 'osc',
    help:
      n === 1
        ? 'Which LFO wave the first FM slider uses: the sine for vibrato, the square for a trill.'
        : 'The source of the first FM slider: the LFO sine, or the S/H mixer (with a pedal plugged in at the back, the pedal). There is no pedal here, so the lower position is always the S/H mixer.',
  });
  slide(`vco${n}.fm2_src`, xs[1], 465, {
    kind: 'enum',
    def: 'snh',
    options: [
      { v: 'snh', label: 'S/H' },
      { v: 'adsr', label: 'ADSR' },
    ],
    label: 'FM source',
    name: `${name} FM source (S/H or ADSR)`,
    module: 'osc',
    help: 'The source of the second FM slider: the sample and hold, or the ADSR.',
  });
  slide(`vco${n}.pwm_src`, xs[3], 465, {
    kind: 'enum',
    def: 'lfo_sine',
    options: [
      { v: 'lfo_sine', label: 'LFO sine' },
      { v: 'adsr', label: 'ADSR' },
    ],
    label: 'PWM source',
    name: `${name} PWM source`,
    module: 'osc',
    help: 'The source of the pulse width modulation: the LFO sine, or the ADSR.',
  });
  switchLabels(
    xs[0],
    'LFO',
    'sine',
    n === 1 ? 'LFO' : 'S/H\nMIXER OR\nPEDAL',
    n === 1 ? 'pulse' : null
  );
  switchLabels(xs[1], 'S/H', null, 'ADSR', 'adsr');
  switchLabels(xs[3], 'LFO', 'sine', 'ADSR', 'adsr');
}

text(372, 60, 'AUDIO', 10.5);
text(372, 69, 'KYBD ON', 8);
text(372, 104, 'LF', 10.5);
text(372, 113, 'KYBD OFF', 8);
slide('vco1.kybd', 372, 86, {
  kind: 'enum',
  def: 'audio_kybd_on',
  options: [
    { v: 'audio_kybd_on', label: 'AUDIO KYBD ON' },
    { v: 'lf_kybd_off', label: 'LF KYBD OFF' },
  ],
  label: 'AUDIO KYBD ON / LF KYBD OFF',
  name: 'VCO-1 AUDIO / LF',
  module: 'osc',
  help: 'AUDIO KYBD ON: VCO-1 plays the keys. LF KYBD OFF: it drops a hundredfold to .2–20 Hz and ignores the keys, a second LFO you can hear as clicks or feed to the S/H mixer.',
});
text(578, 60, 'SYNC', 10.5);
text(578, 69, 'OFF', 8);
text(578, 113, 'ON', 8);
slide('vco2.sync', 578, 89, {
  kind: 'bool',
  def: false,
  onAt: 'bottom',
  label: 'SYNC',
  name: 'VCO-2 SYNC',
  module: 'osc',
  help: 'Hard sync: VCO-2 restarts its wave each time VCO-1 starts one, so it sounds at VCO-1’s pitch and its own FREQUENCY sliders change the tone instead. Turn it off for the ring modulator.',
});
// two round lenses on the hardware, unlabelled
for (const [x, y] of [
  [419, 84],
  [629, 82],
  [629, 142],
]) {
  decor.push({
    t: 'circle',
    x: X(x),
    y: Y(y),
    r: S(6),
    fill: '#0d0d0e',
    stroke: '#2b2b2d',
    sw: 1.5,
  });
}

// ── LFO, S/H mixer and sample and hold ───────────────────────────────────
text(835, 48, 'LFO', 10.5);
text(835, 60, 'FREQ', 10.5);
text(786, 72, 'RATE', 8);
decor.push({ t: 'led', x: X(786), y: Y(84), r: 6, color: 'red', litWhen: 'lfo' });
fader('lfo.freq', 835, TOP, 'white', {
  label: 'LFO FREQ',
  def: 5,
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'The LFO’s speed, .2 to 20 Hz. It also clocks the sample and hold and the envelopes’ LFO REPEAT; the RATE light flashes with it.',
});
[
  [78, '20\nHz'],
  [137, '2\nHz'],
  [194, '.2\nHz'],
].forEach(([y, t]) => text(818, Number(y), String(t), 7.5));

fader('snh.mix1', 689, BOT, 'green', {
  label: 'S/H MIXER',
  name: 'S/H MIXER (VCO-1)',
  module: 'mod',
  fmt: pct,
  help: 'How much of VCO-1 (its sawtooth or pulse) goes into the S/H mixer. The mix is a modulation source of its own, and what the sample and hold samples.',
});
fader('snh.mix2', 738, BOT, 'green', {
  label: 'S/H MIXER',
  name: 'S/H MIXER (noise or VCO-2)',
  def: 10,
  module: 'mod',
  fmt: pct,
  help: 'How much of the noise, or of VCO-2’s pulse, goes into the S/H mixer. Noise alone gives the sample and hold its random steps.',
});
fader('snh.lag', 836, BOT, 'white', {
  label: 'OUTPUT LAG',
  module: 'mod',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(lagS(v))),
  help: 'Smooths the sample and hold’s steps into glides, from sharp steps at MIN to slow slurs at MAX.',
});
text(836, 270, 'OUTPUT LAG', 10.5);
text(822, 288, 'MAX', 7, { anchor: 'end' });
text(822, 404, 'MIN', 7, { anchor: 'end' });
line(689, 254, 689, 280, 1.4);
line(738, 254, 738, 280, 1.4);
line(787, 254, 787, 440, 1.4);
line(836, 254, 836, 262, 1.4);
slide('snh.mix1_src', 689, 465, {
  kind: 'enum',
  def: 'vco1_saw',
  options: [
    { v: 'vco1_saw', label: 'VCO-1 sawtooth' },
    { v: 'vco1_pulse', label: 'VCO-1 pulse' },
  ],
  label: 'S/H source 1',
  name: 'S/H MIXER source (VCO-1)',
  module: 'mod',
  help: 'Which VCO-1 wave the first S/H mixer slider takes: the sawtooth or the pulse.',
});
slide('snh.mix2_src', 738, 465, {
  kind: 'enum',
  def: 'noise',
  options: [
    { v: 'noise', label: 'NOISE GEN' },
    { v: 'vco2_pulse', label: 'VCO-2 pulse' },
  ],
  label: 'S/H source 2',
  name: 'S/H MIXER source (noise or VCO-2)',
  module: 'mod',
  help: 'What the second S/H mixer slider takes: the noise generator, or VCO-2’s pulse.',
});
slide('snh.trigger', 787, 465, {
  kind: 'enum',
  def: 'lfo',
  options: [
    { v: 'lfo', label: 'LFO TRIG' },
    { v: 'kybd', label: 'KYBD TRIG' },
  ],
  label: 'S/H TRIGGER',
  module: 'mod',
  help: 'When the sample and hold takes a new reading: on every LFO cycle, or on every key. Here KYBD TRIG is not modelled: the sample and hold keeps to the LFO.',
});
slide('noise.colour', 836, 465, {
  kind: 'enum',
  def: 'white',
  options: [
    { v: 'white', label: 'WHITE' },
    { v: 'pink', label: 'PINK' },
  ],
  label: 'NOISE GEN',
  module: 'mixer',
  help: 'White noise, bright and hissing, or pink, darker and fuller, for the audio mixer and the S/H mixer alike.',
});
switchLabels(689, 'VCO-1', 'saw', 'VCO-1', 'pulse');
switchLabels(738, 'NOISE\nGEN', null, 'VCO-2', 'pulse');
switchLabels(787, 'LFO\nTRIG', null, 'KYBD\nTRIG', null);
switchLabels(836, 'NOISE GEN\nWHITE', null, 'PINK', null);

// ── VCF, HPF, drive and VCA ───────────────────────────────────────────────
text(898, 48, 'VCF', 10.5);
text(898, 60, 'FREQ', 10.5);
text(946, 48, 'VCF', 10.5);
text(946, 60, 'RESONANCE', 10.5);
text(995, 48, 'VCF', 10.5);
text(995, 60, 'MODE', 10.5);
fader('vcf.freq', 898, TOP, 'white', {
  label: 'VCF FREQ',
  def: 10,
  module: 'filter',
  fmt: (v) => fmtHz(filterHz(v)),
  help: 'The low-pass filter’s cutoff, 16 Hz to 16 kHz: down for a darker, duller sound, up to let the brightness through.',
});
fader('vcf.resonance', 946, TOP, 'white', {
  label: 'VCF RESONANCE',
  module: 'filter',
  fmt: pct,
  help: 'Boosts the frequencies at the cutoff for a sharper, more vocal sweep. At the top (SELF OSC) the filter rings on its own as a sine wave.',
});
text(922, 78, '16\nKHz', 7.5);
text(922, 194, '16\nHz', 7.5);
text(965, 78, 'SELF\nOSC', 7, { anchor: 'start' });
text(965, 194, 'MIN', 7, { anchor: 'start' });
slide(
  'vcf.mode',
  995,
  93,
  {
    kind: 'enum',
    def: '4075',
    options: [
      { v: '4023', label: '2-POLE (4023)' },
      { v: '4035', label: '4-POLE (4035)' },
      { v: '4075', label: '4-POLE (4075)' },
    ],
    label: 'VCF MODE',
    module: 'filter',
    help: 'The three filters of the ARP Odyssey’s revisions: the 4023 at 2 poles (12 dB an octave), brighter and gentler, and the 4035 and 4075 at 4 poles (24 dB), rounder and stronger. Here the 4075 drives the filter a little harder than the 4035 (the app’s estimate of the difference).',
  },
  56
);
text(1007, 76, '2-POLE', 8, { anchor: 'start' });
text(1007, 83, '(4023)', 5.5, { anchor: 'start' });
text(1007, 93, '4-POLE', 8, { anchor: 'start' });
text(1007, 100, '(4035)', 5.5, { anchor: 'start' });
text(1007, 110, '4-POLE', 8, { anchor: 'start' });
text(1007, 117, '(4075)', 5.5, { anchor: 'start' });

text(1141, 36, 'HPF', 10.5);
text(1141, 47, 'CUTOFF', 10.5);
text(1141, 58, 'FREQ', 10.5);
fader('hpf.cutoff', 1141, TOP, 'white', {
  label: 'HPF CUTOFF FREQ',
  module: 'filter',
  fmt: (v) => fmtHz(filterHz(v)),
  help: 'A high-pass filter on the filtered sound: up to thin the bass away for a lighter, brighter tone. At the bottom (16 Hz) it lets everything through.',
});
text(1124, 78, '16\nKHz', 7.5);
text(1124, 194, '16\nHz', 7.5);
text(1188, 60, 'DRIVE', 10.5);
text(1188, 71, 'OFF', 8);
text(1188, 118, 'ON', 8);
slide('drive.on', 1188, 95, {
  kind: 'bool',
  def: false,
  onAt: 'bottom',
  label: 'DRIVE',
  module: 'amp',
  help: 'Overdrives the sound before the VCA, for a thicker, grittier, louder tone. The amount is fixed (here the app’s estimate).',
});
text(1236, 48, 'VCA', 10.5);
text(1236, 60, 'GAIN', 10.5);
fader('vca.gain', 1236, TOP, 'red', {
  label: 'VCA GAIN',
  module: 'amp',
  fmt: pct,
  help: 'Opens the VCA by a fixed amount, so the sound plays with no key held: a drone. Keep it down to have the envelopes alone shape the loudness.',
});
text(1188, 202, 'OUTPUT', 9.5);
line(1214, 202, 1236, 202, 1.4);
line(1236, 202, 1236, 214, 1.4);

// the audio mixer, VCF modulation and VCA envelope sliders
const mixerFaders: [string, number, FaderLed, string, string, string, number][] = [
  [
    'mixer.noise_ring',
    898,
    'green',
    'NOISE/RING MOD',
    'NOISE or RING MOD',
    'Level of the noise, or of the ring modulator, into the filter, chosen by the switch below.',
    0,
  ],
  [
    'mixer.vco1',
    946,
    'green',
    'VCO-1',
    'Mixer VCO-1',
    'Level of VCO-1 (its sawtooth or pulse) into the filter.',
    10,
  ],
  [
    'mixer.vco2',
    995,
    'green',
    'VCO-2',
    'Mixer VCO-2',
    'Level of VCO-2 (its sawtooth or pulse) into the filter.',
    0,
  ],
];
mixerFaders.forEach(([id, x, led, label, name, help, def]) => {
  fader(id, x, BOT, led, { label, name, def, module: 'mixer', fmt: pct, help });
  line(x, 254, x, 280, 1.4);
});
fader('vcf.mod1', 1043, BOT, 'white', {
  label: 'KYBD CV / S/H MIXER',
  name: 'VCF KYBD CV or S/H MIXER',
  module: 'filter',
  fmt: pct,
  help: 'With KYBD CV, how closely the cutoff follows the keys, one to one at the top, so high notes stay as bright as low ones. With S/H MIXER, how far the S/H mixer moves the cutoff.',
});
fader('vcf.mod2', 1091, BOT, 'white', {
  label: 'S/H / LFO',
  name: 'VCF S/H or LFO',
  module: 'filter',
  fmt: pct,
  help: 'How far the sample and hold (random steps) or the LFO sine (a wah that comes and goes) moves the cutoff.',
});
fader('vcf.env', 1141, BOT, 'red', {
  label: 'ADSR / AR',
  name: 'VCF ADSR or AR',
  module: 'filter',
  fmt: pct,
  help: 'How far the ADSR or the AR envelope opens the filter on each note: the classic sweep from bright to dark.',
});
fader('vca.env', 1237, BOT, 'red', {
  label: 'AR / ADSR',
  name: 'VCA AR or ADSR',
  def: 10,
  module: 'amp',
  fmt: pct,
  help: 'How far the AR or the ADSR envelope opens the VCA on each note: the loudness of the note’s shape.',
});
line(1043, 254, 1043, 280, 1.4);
line(1066, 254, 1066, 262, 1.4);
line(1066, 262, 1091, 268, 1.4);
line(1091, 268, 1091, 280, 1.4);
line(1080, 254, 1080, 258, 1.4);
line(1080, 258, 1141, 266, 1.4);
line(1141, 266, 1141, 280, 1.4);
line(1214, 254, 1214, 262, 1.4);
line(1214, 262, 1237, 262, 1.4);
line(1237, 262, 1237, 280, 1.4);

const ms = (
  id: string,
  x: number,
  def: string,
  options: { v: string; label: string }[],
  label: string,
  name: string,
  module: SynthModule,
  help: string
): void => slide(id, x, 466, { kind: 'enum', def, options, label, name, module, help });
ms(
  'mixer.noise_ring_src',
  898,
  'noise',
  [
    { v: 'noise', label: 'NOISE' },
    { v: 'ring_mod', label: 'RING MOD' },
  ],
  'NOISE / RING MOD',
  'Mixer NOISE or RING MOD',
  'mixer',
  'Whether the first mixer slider brings in the noise generator or the ring modulator: VCO-1’s and VCO-2’s pulses multiplied, a clangorous, bell-like tone that does not follow one pitch.'
);
ms(
  'mixer.vco1_src',
  946,
  'saw',
  [
    { v: 'saw', label: 'VCO-1 sawtooth' },
    { v: 'pulse', label: 'VCO-1 pulse' },
  ],
  'VCO-1 wave',
  'Mixer VCO-1 wave',
  'mixer',
  'VCO-1’s sawtooth, bright and buzzy, or its pulse, hollow at 50% and thinner as PULSE WIDTH narrows it.'
);
ms(
  'mixer.vco2_src',
  995,
  'saw',
  [
    { v: 'saw', label: 'VCO-2 sawtooth' },
    { v: 'pulse', label: 'VCO-2 pulse' },
  ],
  'VCO-2 wave',
  'Mixer VCO-2 wave',
  'mixer',
  'VCO-2’s sawtooth or its pulse into the mixer.'
);
ms(
  'vcf.mod1_src',
  1043,
  'kybd_cv',
  [
    { v: 'kybd_cv', label: 'KYBD CV' },
    { v: 'snh_mixer', label: 'S/H MIXER OR PEDAL' },
  ],
  'VCF source 1',
  'VCF source (KYBD CV or S/H MIXER)',
  'filter',
  'The source of the first filter slider: the keyboard, for tracking, or the S/H mixer (with a pedal plugged in at the back, the pedal). There is no pedal here, so the lower position is always the S/H mixer.'
);
ms(
  'vcf.mod2_src',
  1091,
  'snh',
  [
    { v: 'snh', label: 'S/H' },
    { v: 'lfo_sine', label: 'LFO sine' },
  ],
  'VCF source 2',
  'VCF source (S/H or LFO)',
  'filter',
  'The source of the second filter slider: the sample and hold, or the LFO sine.'
);
ms(
  'vcf.env_src',
  1141,
  'adsr',
  [
    { v: 'adsr', label: 'ADSR' },
    { v: 'ar', label: 'AR' },
  ],
  'VCF envelope',
  'VCF envelope (ADSR or AR)',
  'filter',
  'Which envelope opens the filter: the ADSR or the AR. The VCA can take the other, so the filter and the loudness move differently.'
);
ms(
  'vca.env_src',
  1237,
  'ar',
  [
    { v: 'ar', label: 'AR' },
    { v: 'adsr', label: 'ADSR' },
  ],
  'VCA envelope',
  'VCA envelope (AR or ADSR)',
  'amp',
  'Which envelope shapes the loudness: the AR, a simple rise and fall, or the ADSR.'
);
switchLabels(898, 'NOISE', null, 'RING\nMOD', null, 466);
switchLabels(946, 'VCO-1', 'saw', 'VCO-1', 'pulse', 466);
switchLabels(995, 'VCO-2', 'saw', 'VCO-2', 'pulse', 466);
switchLabels(1043, 'KYBD\nCV', null, 'S/H\nMIXER OR\nPEDAL', null, 466);
switchLabels(1091, 'S/H', null, 'LFO', 'sine', 466);
switchLabels(1141, 'ADSR', 'adsr', 'AR', 'ar', 466);
switchLabels(1237, 'AR', 'ar', 'ADSR', 'adsr', 466);

// ── Envelopes ─────────────────────────────────────────────────────────────
text(1322, 36, 'AR', 10.5);
wave(1340, 36, 'ar', 8);
text(1322, 46, 'ENV GENERATOR', 10.5);
line(1284, 41, 1284, 50, 1.4);
line(1284, 41, 1300, 41, 1.4);
line(1344, 41, 1360, 41, 1.4);
line(1360, 41, 1360, 50, 1.4);
text(1298, 58, 'ATTACK', 9.5);
text(1346, 58, 'RELEASE', 9.5);
fader('ar.attack', 1298, 139, 'red', {
  label: 'A-ATTACK',
  name: 'AR ATTACK',
  module: 'env',
  fmt: (v) => fmtTime(attackS(v)),
  help: 'How long the AR envelope takes to rise when a key goes down, 5 ms to 5 s.',
});
fader('ar.release', 1346, 139, 'red', {
  label: 'R-RELEASE',
  name: 'AR RELEASE',
  def: 1,
  module: 'env',
  fmt: (v) => fmtTime(arReleaseS(v)),
  help: 'How long the AR envelope takes to fall away after the key is let go, 10 ms to 10 s. It holds at full while the key is down.',
});
decor.push({
  t: 'logo',
  x: X(1416),
  y: Y(149),
  size: 15,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});

text(1370, 245, 'ADSR', 10.5);
wave(1394, 245, 'adsr', 8);
text(1370, 256, 'ENVELOPE GENERATOR', 10.5);
line(1284, 252, 1284, 262, 1.4);
line(1284, 252, 1318, 252, 1.4);
line(1422, 252, 1460, 252, 1.4);
line(1460, 252, 1460, 262, 1.4);
const ADSR: [string, number, string, string, (v: number) => string, number][] = [
  [
    'adsr.attack',
    1298,
    'ATTACK',
    'How long the ADSR takes to rise to full when a key goes down, 5 ms to 5 s.',
    (v) => fmtTime(attackS(v)),
    0,
  ],
  [
    'adsr.decay',
    1347,
    'DECAY',
    'How long the ADSR then takes to fall to the sustain level, 10 ms to 10 s.',
    (v) => fmtTime(decayS(v)),
    4,
  ],
  [
    'adsr.sustain',
    1396,
    'SUSTAIN',
    'The level the ADSR holds while the key stays down, 0 to 100%.',
    pct,
    7,
  ],
  [
    'adsr.release',
    1443,
    'RELEASE',
    'How long the ADSR takes to fall away after the key is let go, 15 ms to 10 s.',
    (v) => fmtTime(adsrReleaseS(v)),
    2,
  ],
];
ADSR.forEach(([id, x, lab, help, fmt, def]) => {
  text(x, 274, lab, 9.5);
  fader(id, x, BOT, 'red', {
    label: `${lab.charAt(0)}-${lab}`,
    name: `ADSR ${lab}`,
    def,
    module: 'env',
    fmt,
    help,
  });
});
const repeatOpts = [
  { v: 'kybd_gate', label: 'KYBD GATE' },
  { v: 'lfo_repeat', label: 'LFO REPEAT' },
];
slide('repeat.adsr', 1298, 470, {
  kind: 'enum',
  def: 'kybd_gate',
  options: repeatOpts,
  label: 'ADSR KYBD GATE / LFO REPEAT',
  name: 'ADSR KYBD GATE or LFO REPEAT',
  module: 'env',
  help: 'KYBD GATE: the ADSR runs once for each key. LFO REPEAT: the LFO square fires it again and again, at LFO FREQ, for rhythmic pulsing.',
});
slide('repeat.mode', 1347, 470, {
  kind: 'enum',
  def: 'kybd_repeat',
  options: [
    { v: 'kybd_repeat', label: 'KYBD REPEAT' },
    { v: 'auto_repeat', label: 'AUTO REPEAT' },
  ],
  label: 'KYBD REPEAT / AUTO REPEAT',
  module: 'env',
  help: 'For an envelope on LFO REPEAT: KYBD REPEAT repeats it only while a key is held; AUTO REPEAT repeats it all the time, keys or not.',
});
slide('repeat.ar', 1443, 470, {
  kind: 'enum',
  def: 'kybd_gate',
  options: repeatOpts,
  label: 'AR KYBD GATE / LFO REPEAT',
  name: 'AR KYBD GATE or LFO REPEAT',
  module: 'env',
  help: 'KYBD GATE: the AR runs once for each key. LFO REPEAT: the LFO square fires it again and again, at LFO FREQ.',
});
text(1298, 429, 'ADSR\nKYBD\nGATE', 9.5);
text(1347, 432, 'KYBD\nREPEAT', 9.5);
text(1443, 429, 'AR\nKYBD\nGATE', 9.5);
text(1298, 500, 'LFO\nREPEAT', 9.5);
wave(1298, 516, 'pulse', 9);
text(1347, 500, 'AUTO\nREPEAT', 9.5);
text(1443, 500, 'LFO\nREPEAT', 9.5);
wave(1443, 516, 'pulse', 9);
line(1310, 488, 1328, 488, 1.4);
line(1328, 488, 1328, 478, 1.4);
line(1366, 478, 1366, 488, 1.4);
line(1366, 488, 1430, 488, 1.4);

// ── Sequencer ─────────────────────────────────────────────────────────────
const SEQ_HERE = 'Here it drives the app’s sequencer, under the panel.';
const seqBtn = (
  id: string,
  px: number,
  py: number,
  lab: string,
  help: string,
  sb: SeqButton | null,
  name?: string
): void => {
  controls.push({
    id,
    type: 'button',
    x: X(px),
    y: Y(py),
    w: S(28),
    h: S(14),
    kind: 'bool',
    def: false,
    ui: true,
    lamp: 'red',
    label: lab,
    name: name ?? lab,
    labelPos: 'none',
    module: 'mode',
    help,
  });
  if (sb) seqButtons[id] = sb;
};
const SEQ: [string, number, number, string, string, string, SeqButton | null][] = [
  [
    'seq.hold_rest',
    694,
    543,
    'HOLD/REST',
    'HOLD/\nREST',
    `Holds the notes played; with ARP, latches the arpeggio; while editing steps, enters a rest. ${SEQ_HERE} It holds the keys.`,
    'hold',
  ],
  [
    'seq.reset_accent',
    729,
    543,
    'RESET/ACCENT',
    'RESET/\nACCENT',
    `Sends the sequence back to step 1; while editing steps, accents the step; held while playing, accents the keys. ${SEQ_HERE} It accents the chosen step.`,
    'accent',
  ],
  [
    'seq.arp',
    764,
    543,
    'ARP/SET END',
    'ARP\nSET END',
    'Arpeggiator on: held keys play one after another in one of eight orders, chosen with <KYBD and STEP>, at the tempo; pressed twice it latches. With SHIFT and a step, it sets where the pattern ends. Here it turns the sequencer’s arp on or off: the keys you hold play through the pattern’s steps, in the order and octaves set in the sequencer.',
    'arp',
  ],
  [
    'seq.pattern_bank',
    800,
    543,
    'PATTERN/BANK',
    'PATTERN\nBANK',
    'Shows or picks one of eight patterns with the step buttons, and with SHIFT one of eight banks: 64 in all. Not modelled here: the app’s library holds the patterns.',
    null,
  ],
  [
    'seq.shift',
    694,
    582,
    'SHIFT',
    'SHIFT',
    'Gives the buttons and the TEMPO and PORTAMENTO sliders their second jobs. Not modelled here: each job the app has is on a button of its own.',
    null,
  ],
  [
    'seq.page',
    729,
    582,
    'PAGE',
    'PAGE',
    'Steps through the four pages of eight steps, for a pattern of up to 32. Not modelled here.',
    null,
  ],
  [
    'seq.play_stop',
    764,
    582,
    'PLAY/STOP',
    'PLAY/\nSTOP',
    `Starts and stops the pattern; with SHIFT held for two seconds, starts saving it. ${SEQ_HERE}`,
    'run',
  ],
  [
    'seq.rec',
    800,
    582,
    'REC',
    'REC',
    `Records a new pattern from the keys, a step at a time; with SHIFT, saves it. ${SEQ_HERE} It turns on step record.`,
    'record',
  ],
];
SEQ.forEach(([id, x, y, lab, printed, help, sb]) => {
  seqBtn(id, x, y, lab, help, sb);
  text(x, y + 16, printed, 7.5);
});
text(893, 528, 'LOCATION', 9.5);
for (let i = 0; i < 8; i++) {
  const x = 848 + i * 13;
  decor.push({ t: 'led', x: X(x), y: Y(543), r: 4.5, color: 'yellow', litWhen: { seq: i } });
  text(x, 553, String(i + 1), 7);
}
seqBtn(
  'seq.kybd',
  875,
  582,
  '<KYBD',
  'Lowers whatever is being set (a value, or the arpeggio’s order); with SHIFT, keyboard mode, where the keys record the pattern. Here it chooses the sequencer’s step before.',
  'back',
  'KYBD'
);
seqBtn(
  'seq.step',
  910,
  582,
  'STEP>',
  'Raises whatever is being set (a value, or the arpeggio’s order); with SHIFT, step mode, where each step is edited on its own. Here it chooses the sequencer’s step after.',
  'next',
  'STEP'
);
decor.push({
  t: 'path',
  d: `M${X(852)} ${Y(576)} L${X(844)} ${Y(582)} L${X(852)} ${Y(588)} Z`,
  w: 0,
  fill: INK,
});
decor.push({
  t: 'path',
  d: `M${X(933)} ${Y(576)} L${X(941)} ${Y(582)} L${X(933)} ${Y(588)} Z`,
  w: 0,
  fill: INK,
});
text(875, 598, 'KYBD', 7.5, { fill: '#e2543a' });
text(910, 598, 'STEP', 7.5, { fill: '#e2543a' });
for (let i = 0; i < 8; i++) {
  const x = 985 + i * 35.5;
  controls.push({
    id: `seq.step${i + 1}`,
    type: 'button',
    x: X(x),
    y: Y(563),
    w: S(30),
    h: S(30),
    kind: 'bool',
    def: false,
    ui: true,
    lamp: 'red',
    label: String(i + 1),
    name: `STEP ${i + 1}`,
    labelPos: 'none',
    module: 'mode',
    help: `Step ${i + 1} of the page on show; also picks pattern, bank and setting values. Here it chooses step ${i + 1} of the app’s sequencer.`,
  });
  seqButtons[`seq.step${i + 1}`] = { step: i };
  text(x, 590, String(i + 1), 8.5);
}

// ── Areas (photo pixels, converted) ───────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: X(x0),
  y: Y(y0),
  w: S(x1 - x0),
  h: Y(y1) - Y(y0),
});
const areas: Area[] = [
  {
    id: 'fx',
    label: 'Effects',
    module: 'fx',
    keywords: 'klark teknik reverb delay echo chorus flanger phaser display program send',
    rects: [R(26, 60, 244, 300)],
    help: 'Thirty-two Klark Teknik effects (reverbs, delays, chorus, flanger, phaser and more), each with three parameters on the display, and FX SEND for how much of the sound goes through. They are not modelled here: the guide gives their number, not what each one does.',
  },
  {
    id: 'controller',
    label: 'Tempo, portamento and pitch pads',
    module: 'glide',
    keywords: 'glide portamento transpose octave tempo pitch bend vibrato pads proportional',
    rects: [R(26, 300, 244, 616)],
    help: 'TEMPO sets the speed of the sequencer and arpeggiator, PORTAMENTO the glide between keys, and TRANSPOSE moves the keyboard two octaves either way. The three pads bend the pitch down or up, or add the LFO’s vibrato, the harder they are pressed. Here the app’s mod wheel is the vibrato pad; the bend pads are not modelled.',
  },
  {
    id: 'vco1',
    label: 'VCO-1',
    module: 'osc',
    keywords:
      'oscillator vco pitch frequency tune sawtooth pulse width pwm fm vibrato lfo low frequency',
    rects: [R(244, 26, 452, 520)],
    help: 'The first oscillator: a sawtooth and a pulse at once, COARSE and FINE tuning, and two FM sliders and a pulse width modulation slider, each with a switch for its source. With two keys held it plays the lower one. On LF KYBD OFF it becomes a slow oscillator that ignores the keys.',
  },
  {
    id: 'vco2',
    label: 'VCO-2',
    module: 'osc',
    keywords: 'oscillator vco pitch frequency tune sawtooth pulse width pwm fm sync',
    rects: [R(452, 26, 659, 520)],
    help: 'The second oscillator: the same as VCO-1, with SYNC to lock it to VCO-1’s cycle for the tearing sync sound. With two keys held it plays the higher one; with one, both VCOs play it.',
  },
  {
    id: 'lfo_sh',
    label: 'LFO and sample and hold',
    module: 'mod',
    keywords: 'lfo low frequency oscillator rate sample hold random s&h lag noise white pink',
    rects: [R(659, 26, 866, 520)],
    help: 'The LFO, with a sine and a square, and the sample and hold, fed by its own two-slider S/H mixer (VCO-1, and the noise or VCO-2) and read on each LFO cycle. OUTPUT LAG smooths its steps. The noise generator is white or pink.',
  },
  {
    id: 'mixer',
    label: 'Audio mixer',
    module: 'mixer',
    keywords: 'mixer level noise ring modulator ring mod sawtooth pulse',
    rects: [R(866, 214, 1020, 520)],
    help: 'Three sliders into the filter: the noise or the ring modulator, VCO-1 and VCO-2, each switch choosing what its slider takes.',
  },
  {
    id: 'vcf',
    label: 'Filters',
    module: 'filter',
    keywords:
      'vcf low-pass lowpass high-pass highpass hpf cutoff resonance self oscillation 4023 4035 4075 tracking',
    rects: [R(866, 26, 1165, 214), R(1020, 214, 1165, 520)],
    help: 'A resonant low-pass filter at 2 poles (4023) or 4 (4035 and 4075), then a high-pass. Below, three sliders move the cutoff: keyboard tracking or the S/H mixer, the sample and hold or the LFO, and the ADSR or the AR.',
  },
  {
    id: 'vca',
    label: 'Drive and VCA',
    module: 'amp',
    keywords: 'vca amplifier loudness gain drone drive overdrive distortion',
    rects: [R(1165, 26, 1270, 520)],
    help: 'DRIVE overdrives the sound before the VCA. The VCA’s envelope slider sets how far the AR or the ADSR opens it on each note; GAIN opens it by a fixed amount, for a drone with no key held.',
  },
  {
    id: 'env',
    label: 'Envelopes and repeat',
    module: 'env',
    keywords: 'envelope ar adsr attack decay sustain release repeat lfo trigger gate',
    rects: [R(1270, 26, 1475, 616)],
    help: 'Two envelopes: the AR (attack and release, full while held) and the ADSR. Either can run once per key or be fired over and over by the LFO (LFO REPEAT), only while a key is held or all the time.',
  },
  {
    id: 'sequencer',
    label: 'Sequencer and arpeggiator',
    module: 'mode',
    keywords: 'sequencer step pattern bank arpeggio arp record play stop accent rest hold location',
    rects: [R(659, 520, 1270, 616)],
    help: 'A 32-step sequencer with 64 patterns in eight banks, and an arpeggiator with eight orders. The LOCATION lights show the page, pattern and values. Here the buttons drive the app’s sequencer under the panel: PLAY/STOP, REC, ARP, HOLD, ACCENT, the arrows and the eight steps.',
  },
];

// ── toEngine ──────────────────────────────────────────────────────────────
/** TRANSPOSE in semitones. */
const TRANSPOSE_SEMI: Record<string, number> = { up_2: 24, normal: 0, down_2: -24 };

function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const wheel = clamp(ctx.wheel || 0, 0, 1);
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number, by?: string): void => {
    if (Number.isFinite(amt) && Math.abs(amt) > 0.0005)
      routes.push(by ? { src, dst, amt, by } : { src, dst, amt });
  };
  const fine = (n: number): number => ((num(v, `vco${n}.fine`) - 5) / 5) * FINE_SEMI;
  const lf = v['vco1.kybd'] === 'lf_kybd_off';
  const hz1 = vcoHz(num(v, 'vco1.coarse')) / (lf ? LF_DIV : 1);
  const hz2 = vcoHz(num(v, 'vco2.coarse'));
  const pw = (n: number): number => clamp(0.5 - (PW_SWING * num(v, `vco${n}.pw`)) / 10, 0.03, 0.97);
  const osc = [
    {
      level: level10(num(v, 'mixer.vco1'), 0.9),
      mix: v['mixer.vco1_src'] === 'pulse' ? { pulse: 1 } : { saw: 1 },
      pw: pw(1),
      semi: lf ? fine(1) : noteOf(hz1) - 60 + fine(1),
      kbd: !lf,
      fixedNote: lf ? noteOf(hz1) : 60,
      syncTo: -1,
    },
    {
      level: level10(num(v, 'mixer.vco2'), 0.9),
      mix: v['mixer.vco2_src'] === 'pulse' ? { pulse: 1 } : { saw: 1 },
      pw: pw(2),
      semi: noteOf(hz2) - 60 + fine(2),
      kbd: true,
      fixedNote: 60,
      syncTo: v['vco2.sync'] ? 0 : -1,
    },
  ];

  // VCO modulation: each FM slider on the source its switch picks
  route(
    v['vco1.fm1_src'] === 'lfo_square' ? 'lfoSq' : 'lfoSine',
    'pitch1',
    fmDepth(num(v, 'vco1.fm1'), FM_SEMI.lfo)
  );
  const vco2Fm1Mixer = v['vco2.fm1_src'] === 'snh_mixer';
  route(
    vco2Fm1Mixer ? 'sum1' : 'lfoSine',
    'pitch2',
    fmDepth(num(v, 'vco2.fm1'), vco2Fm1Mixer ? FM_SEMI.mixer : FM_SEMI.lfo)
  );
  for (const n of [1, 2]) {
    const adsr = v[`vco${n}.fm2_src`] === 'adsr';
    route(
      adsr ? 'env1' : 'sh',
      `pitch${n}`,
      fmDepth(num(v, `vco${n}.fm2`), adsr ? FM_SEMI.adsr : FM_SEMI.sh)
    );
    route(
      v[`vco${n}.pwm_src`] === 'adsr' ? 'env1' : 'lfoSine',
      `pw${n}`,
      (PW_SWING * num(v, `vco${n}.pwm`)) / 10
    );
  }
  // the vibrato pad, here the mod wheel
  route('lfoSine', 'pitch1', wheel * PAD_VIB_SEMI);
  route('lfoSine', 'pitch2', wheel * PAD_VIB_SEMI);

  // the ring modulator into the mixer's first channel
  const ring = v['mixer.noise_ring_src'] === 'ring_mod';
  const ch1 = level10(num(v, 'mixer.noise_ring'), 0.9);
  if (ring) route('ring', 'vcfIn', ch1);

  // the filter's modulation sliders
  const mod1 = num(v, 'vcf.mod1') / 10;
  if (v['vcf.mod1_src'] === 'snh_mixer') route('sum1', 'cutoff', mod1 * VCF_OCT.mixer);
  else route('kbd2', 'cutoff', mod1 * VCF_OCT.kbd);
  const mod2 = num(v, 'vcf.mod2') / 10;
  if (v['vcf.mod2_src'] === 'lfo_sine') route('lfoSine', 'cutoff', mod2 * VCF_OCT.lfo);
  else route('sh', 'cutoff', mod2 * VCF_OCT.sh);

  // LFO REPEAT: an envelope on it fires from envClk, the LFO square (only with a key down on KYBD REPEAT)
  const adsrSrc: EnvTrigSource = v['repeat.adsr'] === 'lfo_repeat' ? 'sh' : 'gate';
  const arSrc: EnvTrigSource = v['repeat.ar'] === 'lfo_repeat' ? 'sh' : 'gate';
  if (adsrSrc === 'sh' || arSrc === 'sh')
    route('lfoSq', 'envClk', 1, v['repeat.mode'] === 'auto_repeat' ? undefined : 'gate');

  const mode = v['vcf.mode'] === '4023' ? '4023' : v['vcf.mode'] === '4035' ? '4035' : '4075';
  const vcaEnv = v['vca.env_src'] === 'adsr' ? 'env1' : 'env2';
  return {
    osc,
    oscOuts: true,
    noise: {
      level: ring ? 0 : ch1,
      color: v['noise.colour'] === 'pink' ? 'pink' : 'white',
    },
    ext: { level: 0 },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: clamp(filterHz(num(v, 'vcf.freq')), 10, 20000),
      res: (num(v, 'vcf.resonance') / 10) * RES_MAX,
      envAmt: (num(v, 'vcf.env') / 10) * VCF_OCT.env,
      envSrc: v['vcf.env_src'] === 'ar' ? 'env2' : 'env1',
      kbd: 0,
      poles: mode === '4023' ? 2 : 4,
      drive: mode === '4075' ? 1.1 : 0.8,
    },
    hpf: {
      cutoff: filterHz(num(v, 'hpf.cutoff')),
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
      poles: 1,
    },
    env1: {
      a: attackS(num(v, 'adsr.attack')),
      d: decayS(num(v, 'adsr.decay')),
      s: num(v, 'adsr.sustain') / 10,
      r: adsrReleaseS(num(v, 'adsr.release')),
    },
    env2: {
      a: attackS(num(v, 'ar.attack')),
      d: 0.01,
      s: 1,
      r: arReleaseS(num(v, 'ar.release')),
    },
    vca: { envSrc: 'none', bias: num(v, 'vca.gain') / 10 },
    lfo: { rate: lfoHz(num(v, 'lfo.freq')), mix: { sine: 1 }, keySync: false },
    glide: { time: glideS(num(v, 'kbd.portamento')), legato: false },
    trig: { retrig: true, drone: false, repeat: false, src: [adsrSrc, arSrc] },
    duo: true,
    paraphonic: true,
    note2Osc: 1,
    routes,
    normals: {
      amp: [vcaEnv, num(v, 'vca.env') / 10],
      gateIn: 'gate',
      trigIn: 'gate',
      // the S/H mixer: its two channels summed, and the sample and hold reading it
      sum1A: [v['snh.mix1_src'] === 'vco1_pulse' ? 'o1pulse' : 'o1saw', num(v, 'snh.mix1') / 10],
      sum1B: [v['snh.mix2_src'] === 'vco2_pulse' ? 'o2pulse' : 'noise', num(v, 'snh.mix2') / 10],
      shIn: 'sum1',
      ringA: 'o1pulse',
      ringB: 'o2pulse',
    },
    ring: {},
    od: v['drive.on'] ? { on: true, drive: 0.35, tone: 0.5, level: 0.8 } : { on: false },
    delay: { on: false },
    sh: { rate: lfoHz(num(v, 'lfo.freq')), glide: lagS(num(v, 'snh.lag')), clock: 'lfo' },
    slew: { time: 0.001 },
    att: [1, 1],
    tune: TRANSPOSE_SEMI[String(v['kbd.transpose'])] ?? 0,
    volume: 0.8,
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

const behringerOdyssey: SynthDef & { version: number } = {
  id: 'behringer-odyssey',
  version: 1,
  name: 'ODYSSEY',
  maker: 'Behringer',
  year: 2019,
  heritage: 'A copy of the 1972 ARP Odyssey, with all three of its filters',
  summary:
    'Two VCOs (sawtooth and pulse, with sync), noise or a ring modulator into a resonant low-pass switchable between the ARP Odyssey’s three filters, a high-pass, drive and the VCA. An ADSR and an AR, a sample and hold fed by its own mixer, and duophonic playing: VCO-1 takes the lowest key, VCO-2 the highest.',
  view: { w: X(1489), h: Y(626) },
  theme: {
    panel: '#202022',
    panel2: '#161617',
    ink: INK,
    font: 'din',
    weight: 600,
    cheeks: 'none',
    button: 'black',
  },
  signalNames: {
    osc1: 'VCO-1',
    osc2: 'VCO-2',
    o1saw: 'the VCO-1 sawtooth',
    o1pulse: 'the VCO-1 pulse',
    o2saw: 'the VCO-2 sawtooth',
    o2pulse: 'the VCO-2 pulse',
    env1: 'the ADSR',
    env2: 'the AR',
    vcf1: 'the filter',
    vca: 'the VCA',
    gate: 'the keyboard gate',
    kbd: 'the lower key',
    kbd2: 'the upper key',
    sh: 'the sample and hold',
    sum1: 'the S/H mixer',
    lfoSine: 'the LFO sine',
    lfoSq: 'the LFO square',
    noise: 'the noise generator',
    ring: 'the ring modulator',
  },
  destNames: {
    vcfIn: 'the audio mixer',
    cutoff: 'the filter cutoff',
    pitch1: 'VCO-1 pitch',
    pitch2: 'VCO-2 pitch',
    pw1: 'VCO-1 pulse width',
    pw2: 'VCO-2 pulse width',
    envClk: 'the LFO repeat',
  },
  tempo: 'seq.tempo',
  seqButtons,
  decor,
  areas,
  controls,
  jacks: [],
  init,
  // no Default patch: init is already VCO-1's sawtooth alone at middle C into the open 4-pole filter, with no
  // resonance or envelope on it, the loudness the AR at its shortest attack and a short release, and no modulation
  toEngine,
};

export default behringerOdyssey;
