/**
 * Roland Jupiter-4 Compuphonic (1978): the definition (D1). The data model is the Jupiter-4 synth.json (the 1982
 * owner's manual, with Roland's 2022 PLUG-OUT manual and Wikipedia as secondary sources).
 *
 * The panel is laid out after Roland's JUPITER-4 PLUG-OUT software (1680×826 screenshot; positions are its pixels, the
 * keyboard taken out), not after a photo of the hardware: black faceplate, orange section tabs, silver knobs, wood ends
 * and the coloured memory strip. Only the original instrument's controls are put on it. The PLUG-OUT's own additions
 * (CONDITION, the effects, velocity, CIRCUIT MOD, tempo sync and the rest) are left off, and where the original uses a
 * different control (SUB and NOISE switches, rotary KEY ASSIGNMENT and ARPEGGIO selectors, the PW MANUAL/MOD switch)
 * the original's is drawn. The MODIFIER section sits where the PLUG-OUT has its effects, and the CONTROLLER section
 * along the second row.
 *
 * Engine notes: four voices (`poly`), each one VCO with a sub-octave square and noise → a gentle 6 dB HPF
 * (`hpf.poles: 1`) → a resonant low-pass → VCA, with an ADSR each for the filter and the VCA. The noise
 * sample-and-hold on the filter is the engine's `sh`, clocked at the trigger rate; the ensemble is the poly wrapper's
 * `chorus`. The app's mod wheel stands in for the BEND/MODULATION lever pushed to one side.
 *
 * Transliterated from the prototype file `src/synths/jupiter-4.js` (D3), the way `defs/model-d.ts` was: no content
 * (sounds, lineage, unusual notes), a `version`, the maker's marks tagged `brand` (the Roland wordmark and its R, and
 * the JUPITER-4 COMPUPHONIC badge), and panel values read through `num()`. The modular layout's `brand` is the series
 * name printed on blank panels; the neutral design leaves it out.
 */
import type {
  ArpMode,
  Area,
  Control,
  ControlCommon,
  ControlOption,
  ControlValues,
  ContinuousValue,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  EnvParams,
  FaderControl,
  LfoMix,
  ModularLayout,
  OscMix,
  PolyParams,
  SynthDef,
  TextDecor,
  ToggleControl,
  ViewRect,
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

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  (
    | ({ kind?: 'cont'; def: number } & Partial<Omit<ContinuousValue, 'kind' | 'def'>>)
    | { kind: 'enum'; options: ControlOption[]; def: string }
  );
type FaderRest = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  Partial<Omit<ContinuousValue, 'kind'>> &
  Partial<Pick<FaderControl, 'ticks'>>;
type ToggleRest = OmitEach<ToggleControl, 'id' | 'type' | 'x' | 'y' | 'w' | 'labelPos'>;
type TextRest = Partial<Pick<TextDecor, 'anchor' | 'weight' | 'fill' | 'spacing' | 'brand'>>;

// ── Ranges and tapers ─────────────────────────────────────────────────────
// From the manual's specifications: LFO 0.1–80 Hz, attack 0.6 ms–3 s, decay and release 14 ms–10 s, HPF 40 Hz–5 kHz,
// LFO delay up to 10 s, trigger up to 25 Hz, portamento up to about 1 s per octave. The low-pass cutoff range, the
// depth of each modulation route and the trigger generator's lowest rate are this app's estimates.
const ATT_PTS: CurvePoint[] = [
  [0, 0.0006],
  [2, 0.01],
  [4, 0.06],
  [6, 0.3],
  [8, 1.1],
  [10, 3],
];
const DR_PTS: CurvePoint[] = [
  [0, 0.014],
  [2, 0.05],
  [4, 0.2],
  [6, 0.8],
  [8, 3],
  [10, 10],
];
const attTime = (v: number): number => pwl(v, ATT_PTS, true);
const drTime = (v: number): number => pwl(v, DR_PTS, true);
const lfoHz = (v: number): number => expMap(v / 10, 0.1, 80);
const lpfHz = (v: number): number => expMap(v / 10, 16, 18000);
const hpfHz = (v: number): number => expMap(v / 10, 40, 5000);
const trigHz = (v: number): number => expMap(v / 10, 0.5, 25);
const delayTime = (v: number): number => 10 * Math.pow(v / 10, 2);
const portaTime = (v: number): number => 1.2 * Math.pow(v / 10, 2);
const pct = (v: number): string => `${Math.round(v * 10)} %`;
/** PW at MANUAL steps through four fixed widths. */
const pwStep = (v: number): number => (v < 2.5 ? 0.5 : v < 5 ? 0.4 : v < 7.5 ? 0.2 : 0.1);
/** LFO BEND: an offset to the memorised rate, in octaves, wider with WIDE. */
const bendOct = (v: number, wide: boolean): number => (v / 5) * (wide ? 3 : 1);

const KYBD: Record<string, number> = { 10: 0.1, 40: 0.4, 70: 0.7, 100: 1 };
const RANGE_SEMI: Record<string, number> = { 16: -12, 8: 0, 4: 12 };
const LFO_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  square: { sq: 1 },
  saw: { saw: 1 },
  rsaw: { rsaw: 1 },
};
const ARP_MODE: Record<string, ArpMode> = {
  up: 'up',
  down: 'down',
  updown: 'updown',
  random: 'random',
};

const controls: Control[] = [];
const decor: Decor[] = [];
const INK = '#ecebe6';
const ORANGE = '#e8862a';
const GREY = '#9a9a98';

// ── Drawing helpers ───────────────────────────────────────────────────────
/** Text centred on (x, y); the renderer places text by its baseline. */
const text = (x: number, y: number, t: string, size = 10, rest: TextRest = {}): void => {
  decor.push({
    t: 'text',
    x,
    y: Math.round((y + size * 0.35) * 10) / 10,
    text: t,
    size,
    anchor: 'middle',
    ...rest,
  });
};
/** A section box with the PLUG-OUT's tab: a grey bar with the name on an orange plate in its middle. */
const box = (x0: number, x1: number, y0: number, y1: number, name: string): void => {
  decor.push({
    t: 'rect',
    x: x0,
    y: y0,
    w: x1 - x0,
    h: y1 - y0,
    r: 3,
    fill: '#111112',
    stroke: '#3a3a3c',
    sw: 1.5,
    hw: true,
  });
  decor.push({
    t: 'rect',
    x: x0 + 3,
    y: y0 + 3,
    w: x1 - x0 - 6,
    h: 15,
    r: 1,
    fill: '#bdbdba',
    hw: true,
  });
  const w = name.length * 7.4 + 22;
  decor.push({
    t: 'rect',
    x: (x0 + x1) / 2 - w / 2,
    y: y0 + 3,
    w,
    h: 15,
    r: 1,
    fill: ORANGE,
    hw: true,
  });
  text((x0 + x1) / 2, y0 + 10.5, name, 11.5, { weight: 700, fill: '#141414' });
};

const knob = (id: string, x: number, y: number, r: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r,
    style: 'd-silver',
    labelPos: 'none',
    labelSize: 9,
    kind: 'cont',
    min: 0,
    max: 10,
    ...rest,
  });
};
// Faders: the travel is 84 units long, centred on FY in the top row.
const FY = 332;
const fader = (
  id: string,
  x: number,
  rest: FaderRest & { def: number },
  y = FY,
  len = 84
): void => {
  controls.push({
    id,
    type: 'fader',
    orient: 'v',
    x,
    y,
    len,
    pad: 10,
    ticks: 0,
    kind: 'cont',
    min: 0,
    max: 10,
    labelPos: 'none',
    ...rest,
  });
};
const toggle = (id: string, x: number, y: number, rest: ToggleRest): void => {
  controls.push({ id, type: 'toggle', x, y, w: 20, labelPos: 'none', ...rest });
};
/** Two-line fader caption above the slot. */
const cap = (x: number, a: string, b?: string): void => {
  text(x, b ? 247 : 259, a, 9.5);
  if (b) text(x, 259, b, 9.5);
};
const WAVE_GLYPHS: readonly string[] = ['tri', 'saw', 'rsaw', 'sq', 'pulse', 'sine', 'npulse'];
const isWaveGlyph = (g: string): g is WaveShape => g.length <= 6 && WAVE_GLYPHS.includes(g);
/** The names of an enum knob's positions, round it at their angles (in place of the renderer's own labels). */
const glyphs = (x: number, y: number, R: number, list: [a: number, g: string][]): void =>
  list.forEach(([a, g]) => {
    const gx = x + R * Math.sin((a * Math.PI) / 180),
      gy = y - R * Math.cos((a * Math.PI) / 180);
    if (isWaveGlyph(g)) decor.push({ t: 'wave', x: gx, y: gy, size: 7, shape: g, w: 1.6 });
    else text(gx, gy, g, 8.5);
  });

/** Position names round a selector knob, set clear of the knob: left-hand ones end at it, right-hand ones start at it. */
const posNames = (
  x: number,
  y: number,
  R: number,
  list: [a: number, t: string][],
  size = 8.5
): void =>
  list.forEach(([a, t]) => {
    const r = (a * Math.PI) / 180;
    const gx = x + R * Math.sin(r),
      gy = y - R * Math.cos(r);
    text(gx, gy, t, size, { anchor: a < -20 ? 'end' : a > 20 ? 'start' : 'middle' });
  });

// ── Faceplate furniture ───────────────────────────────────────────────────
text(204, 150, 'Roland', 38, { weight: 700, fill: ORANGE, anchor: 'start', brand: true });
decor.push({
  t: 'rect',
  x: 158,
  y: 131,
  w: 38,
  h: 36,
  r: 6,
  fill: 'none',
  stroke: ORANGE,
  sw: 3.5,
  brand: true,
});
text(177, 149, 'R', 26, { weight: 700, fill: ORANGE, brand: true });
text(1528, 112, 'JUPITER-4', 66, { weight: 700, anchor: 'end', spacing: '-0.01em', brand: true });
text(1528, 150, 'COMPUPHONIC', 27, { weight: 700, anchor: 'end', spacing: '0.06em', brand: true });
// the orange edge round the programmable panel, as on the PLUG-OUT
decor.push({
  t: 'rect',
  x: 91,
  y: 181,
  w: 1498,
  h: 345,
  r: 4,
  fill: 'none',
  stroke: ORANGE,
  sw: 2,
  hw: true,
});
decor.push({
  t: 'rect',
  x: 91,
  y: 530,
  w: 1498,
  h: 82,
  r: 4,
  fill: '#0b0b0c',
  stroke: '#2c2c2e',
  sw: 1.5,
  hw: true,
});

// ── Output (top band) ─────────────────────────────────────────────────────
text(1110, 108, 'VOLUME', 10);
knob('out.volume', 1110, 138, 17, {
  def: 7,
  module: 'out',
  fmt: pct,
  help: 'Master volume for the whole synth. On the hardware it is not stored with a sound.',
});
text(1180, 108, 'TUNING', 10);
knob('kbd.tuning', 1180, 138, 17, {
  min: -5,
  max: 5,
  def: 0,
  module: 'out',
  fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(v * 10)} cents`,
  help: 'Tunes the whole synth up or down by up to half a semitone.',
});

// ── LFO ───────────────────────────────────────────────────────────────────
box(98, 282, 186, 404, 'LFO');
cap(138, 'RATE');
fader('lfo.rate', 138, {
  def: 5,
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every ten seconds up to 80 Hz. Up near the top it reaches audio rate, where it roughens the tone instead of wobbling it. The lamp flashes at the rate.',
});
decor.push({ t: 'led', x: 138, y: 228, r: 4.5, color: 'red', litWhen: 'lfo' });
text(225, 240, 'WAVE FORM', 9.5);
knob('lfo.waveform', 225, 300, 21, {
  kind: 'enum',
  def: 'sine',
  module: 'lfo',
  label: 'LFO WAVE FORM',
  name: 'LFO waveform',
  options: [
    { v: 'sine', label: '', a: -105 },
    { v: 'square', label: '', a: -35 },
    { v: 'saw', label: '', a: 35 },
    { v: 'rsaw', label: '', a: 105 },
  ],
  help: 'Shape of the LFO. Sine is a smooth wobble, square jumps between two values (a trill), and the two sawtooths rise or fall and snap back.',
});
glyphs(225, 300, 36, [
  [-105, 'sine'],
  [-35, 'sq'],
  [35, 'saw'],
  [105, 'rsaw'],
]);

// ── VCO ───────────────────────────────────────────────────────────────────
box(288, 672, 186, 404, 'VCO');
text(345, 240, 'WAVE FORM', 9.5);
knob('vco.waveform', 345, 300, 21, {
  kind: 'enum',
  def: 'saw',
  module: 'osc',
  label: 'VCO WAVE FORM',
  name: 'VCO waveform',
  options: [
    { v: 'off', label: '', a: -105 },
    { v: 'saw', label: '', a: -35 },
    { v: 'square', label: '', a: 35 },
    { v: 'pulse', label: '', a: 105 },
  ],
  help: 'The VCO’s waveform: sawtooth (bright and buzzy), square (hollow) or pulse (thinner and nasal, its width set by PW). OFF silences the VCO, leaving only the sub-oscillator and noise if they are on.',
});
glyphs(345, 300, 36, [
  [-105, 'OFF'],
  [-35, 'saw'],
  [35, 'sq'],
  [105, 'pulse'],
]);
text(445, 240, 'RANGE', 9.5);
knob('vco.range', 445, 300, 21, {
  kind: 'enum',
  def: '8',
  module: 'osc',
  label: 'VCO RANGE',
  name: 'VCO range',
  options: [
    { v: '16', label: "16'", a: -60 },
    { v: '8', label: "8'", a: 0 },
    { v: '4', label: "4'", a: 60 },
  ],
  help: 'The VCO’s octave. 8′ plays at the pitch of the key, 16′ an octave lower and 4′ an octave higher.',
});
cap(530, 'PW');
fader('vco.pw', 530, {
  def: 0,
  module: 'osc',
  fmt: (v) => `${Math.round(pwStep(v) * 100)} % / ${pct(v)}`,
  help: 'Pulse width, for the PULSE waveform. With the switch beside it at MAN it steps through four fixed widths, 50, 40, 20 and 10 %: narrower is thinner and more nasal. At MOD it sets how far the LFO sweeps the width instead.',
});
text(578, 278, 'MAN', 8.5);
toggle('vco.pwMode', 578, 302, {
  kind: 'enum',
  def: 'manual',
  module: 'osc',
  label: 'PW MANUAL/MOD',
  name: 'PW switch',
  options: [
    { v: 'manual', label: 'MANUAL' },
    { v: 'mod', label: 'MOD' },
  ],
  help: 'MAN: the PW slider picks one of four fixed pulse widths. MOD: the LFO sweeps the pulse width to and fro, and the PW slider sets how far (pulse-width modulation, the chorus-like shimmer of string sounds).',
});
text(578, 326, 'MOD', 8.5);
cap(635, 'MOD');
fader('vco.lfoMod', 635, {
  def: 0,
  module: 'mod',
  name: 'VCO LFO mod',
  fmt: (v) => (v <= 0 ? 'off' : fmtSemi(12 * Math.pow(v / 10, 2))),
  help: 'How far the LFO moves the VCO’s pitch: a little is vibrato, a lot a siren or trill. DELAY TIME in the MODIFIER section can fade it in after each new key.',
});

// ── Sub and noise ─────────────────────────────────────────────────────────
box(678, 780, 186, 404, 'SUB · NOISE');
text(708, 252, 'SUB', 10);
text(752, 252, 'NOISE', 10);
text(730, 282, 'ON', 8.5);
toggle('vco.sub', 708, 302, {
  kind: 'bool',
  def: false,
  module: 'mixer',
  label: 'SUB',
  name: 'Sub-oscillator',
  help: 'Adds a square wave one octave below the VCO. It thickens the bottom of the sound and works even with the VCO’s waveform at OFF.',
});
toggle('noise.on', 752, 302, {
  kind: 'bool',
  def: false,
  module: 'mixer',
  label: 'NOISE',
  name: 'Noise',
  help: 'Adds white noise to the voice: a hiss for breath, wind, surf and percussion. On its own (VCO OFF, SUB off) the voice is pure noise for the filter to shape.',
});
text(730, 324, 'OFF', 8.5);

// ── VCF ───────────────────────────────────────────────────────────────────
box(787, 1175, 186, 404, 'VCF');
cap(814, 'HPF', 'CUTOFF');
fader('hpf.cutoff', 814, {
  def: 0,
  module: 'filter',
  name: 'HPF cutoff',
  fmt: (v) => (v <= 0 ? 'flat' : fmtHz(hpfHz(v))),
  help: 'High-pass filter in front of the low-pass one: it thins out the bass. At 0 everything passes; turned up it leaves a thinner, brighter sound with less body.',
});
cap(850, 'LPF', 'CUTOFF');
fader('vcf.cutoff', 850, {
  def: 10,
  module: 'filter',
  name: 'LPF cutoff',
  fmt: (v) => fmtHz(lpfHz(v)),
  help: 'Cutoff of the low-pass filter. Down makes the sound darker and duller; up lets all the brightness through.',
});
cap(886, 'RES');
fader('vcf.res', 886, {
  def: 0,
  module: 'filter',
  name: 'Resonance',
  fmt: pct,
  help: 'A boost at the cutoff that makes the filter sound vocal and squelchy. At the top the filter whistles on its own. Turning it up lowers the volume a little.',
});
cap(922, 'LFO', 'MOD');
fader('vcf.lfoMod', 922, {
  def: 0,
  module: 'mod',
  name: 'VCF LFO mod',
  fmt: pct,
  help: 'How far the LFO sweeps the filter cutoff: a wah or a growl.',
});
cap(958, 'ENV', 'MOD');
fader('vcf.envMod', 958, {
  def: 0,
  module: 'filter',
  name: 'VCF envelope amount',
  fmt: pct,
  help: 'How far the filter’s own envelope (the four sliders on the right) opens the filter on each note. The POLARITY switch can turn it upside down.',
});
text(1005, 238, 'KYBD', 9.5);
text(1005, 249, 'FOLLOW', 9.5);
knob('vcf.kybd', 1005, 290, 15, {
  kind: 'enum',
  def: '40',
  module: 'filter',
  label: 'KYBD FOLLOW',
  name: 'Keyboard follow',
  labelSize: 8.5,
  options: [
    { v: '10', label: '10', a: -100 },
    { v: '40', label: '40', a: -35 },
    { v: '70', label: '70', a: 35 },
    { v: '100', label: '100', a: 100 },
  ],
  help: 'How much the cutoff follows the keyboard, in four steps from 10 to 100 %. At 100 % high notes are as bright as low ones; at 10 % the top of the keyboard goes dull.',
});
text(1005, 335, 'POLARITY', 7.5);
text(990, 350, '+', 11);
toggle('vcf.polarity', 1005, 360, {
  kind: 'enum',
  def: 'normal',
  module: 'filter',
  label: 'POLARITY',
  name: 'Filter envelope polarity',
  options: [
    { v: 'normal', label: 'NORMAL' },
    { v: 'inverted', label: 'INVERTED' },
  ],
  help: 'Turns the filter envelope upside down: up it opens the filter on each note, down it closes it, so the note starts dark and brightens as it dies.',
});
text(990, 371, '−', 11);
text(1104, 225, 'ENVELOPE', 8.5, { fill: GREY });
decor.push({ t: 'line', x1: 1036, y1: 225, x2: 1066, y2: 225, w: 1, stroke: GREY });
decor.push({ t: 'line', x1: 1142, y1: 225, x2: 1170, y2: 225, w: 1, stroke: GREY });

// ── The two ADSRs ─────────────────────────────────────────────────────────
const STAGES: [stage: string, letter: string, help: string][] = [
  ['attack', 'A', 'How long it takes to rise to full after a key is pressed.'],
  ['decay', 'D', 'How long it takes to fall from the peak to the sustain level.'],
  [
    'sustain',
    'S',
    'The level it holds while the key is held down. With S high, D has little to do.',
  ],
  ['release', 'R', 'How long it takes to fade to nothing after the key is let go.'],
];
const adsr = (e: string, x0: number, full: string, what: string, defs: number[]): void =>
  STAGES.forEach(([stage, letter, help], i) => {
    const x = x0 + 36 * i;
    cap(x, letter);
    const isTime = stage !== 'sustain';
    fader(`${e}.${stage}`, x, {
      def: defs[i],
      module: e === 'env_f' ? 'env' : 'amp',
      name: `${full} ${stage}`,
      fmt: isTime ? (v) => fmtTime(stage === 'attack' ? attTime(v) : drTime(v)) : pct,
      help: `${full}: ${help.charAt(0).toLowerCase()}${help.slice(1)} It shapes ${what}.`,
    });
  });
adsr(
  'env_f',
  1051,
  'Filter envelope',
  'the filter cutoff, by the amount set with ENV MOD',
  [0, 5, 5, 3]
);

// ── VCA ───────────────────────────────────────────────────────────────────
box(1182, 1375, 186, 404, 'VCA');
text(1262, 225, 'ENVELOPE', 8.5, { fill: GREY });
adsr('env_a', 1208, 'Loudness envelope', 'the volume of each note', [0, 5, 10, 3]);
cap(1355, 'LEVEL');
fader('vca.level', 1355, {
  def: 7,
  module: 'amp',
  name: 'VCA level',
  fmt: pct,
  help: 'The sound’s own output level, stored with it. Past about 7 the voices start to distort and the OVERLOAD lamp lights.',
});
decor.push({ t: 'led', x: 1355, y: 228, r: 4.5, color: 'red', litWhen: 'overload' });
text(1355, 214, 'OVERLOAD', 7);

// ── MODIFIER ──────────────────────────────────────────────────────────────
// Always live, and never stored with a sound on the hardware.
box(1382, 1582, 186, 404, 'MODIFIER');
const MY = 350;
const ML = 66;
(
  [
    [1405, 'ARP'],
    [1450, 'VCF'],
  ] as const
).forEach(([x, t]) => {
  text(x, 214, t, 8.5, { fill: GREY });
  text(x, 228, 'INT', 8);
  text(x, 268, 'EXT', 8);
});
toggle('trig.arpClock', 1405, 248, {
  kind: 'enum',
  def: 'int',
  module: 'mode',
  label: 'ARPEGGIO INT/EXT',
  name: 'Arpeggio clock',
  options: [
    { v: 'int', label: 'INT' },
    { v: 'ext', label: 'EXT' },
  ],
  help: 'Where the arpeggio takes its steps from. INT: the trigger generator, at its RATE. EXT: a clock plugged into EXT CLOCK IN on the back. This app has nothing to plug in, so at EXT the arpeggio does not run.',
});
toggle('trig.vcfClock', 1450, 248, {
  kind: 'enum',
  def: 'int',
  module: 'mod',
  label: 'VCF INT/EXT',
  name: 'Sample-and-hold clock',
  options: [
    { v: 'int', label: 'INT' },
    { v: 'ext', label: 'EXT' },
  ],
  help: 'Where the filter sample-and-hold takes its steps from: the trigger generator (INT) or EXT CLOCK IN (EXT). With no clock plugged in here, EXT leaves the cutoff still.',
});
text(1505, 214, 'LFO', 8.5, { fill: GREY });
text(1505, 228, 'NORM', 8);
toggle('lfo.bendWide', 1505, 248, {
  kind: 'enum',
  def: 'normal',
  module: 'lfo',
  label: 'NORMAL/WIDE',
  name: 'LFO BEND range',
  options: [
    { v: 'normal', label: 'NORMAL' },
    { v: 'wide', label: 'WIDE' },
  ],
  help: 'The range of LFO BEND: NORMAL moves the LFO rate by up to an octave either way, WIDE by up to three.',
});
text(1505, 268, 'WIDE', 8);
(
  [
    [1405, 'TRIG', 'RATE'],
    [1450, 'VCF', 'MOD'],
    [1505, 'LFO', 'BEND'],
    [1555, 'DELAY', 'TIME'],
  ] as const
).forEach(([x, a, b]) => {
  text(x, 287, a, 9);
  text(x, 298, b, 9);
});
fader(
  'trig.rate',
  1405,
  {
    def: 5,
    module: 'mode',
    name: 'Trigger rate',
    fmt: (v) => `${fmtHz(trigHz(v))} · ${Math.round(trigHz(v) * 15)} BPM`,
    help: 'Speed of the trigger generator, up to 25 steps a second. It clocks the arpeggio and the filter sample-and-hold.',
  },
  MY,
  ML
);
fader(
  'trig.vcfMod',
  1450,
  {
    def: 0,
    module: 'mod',
    name: 'Sample-and-hold depth',
    fmt: pct,
    help: 'How far the noise sample-and-hold moves the filter cutoff. At each trigger the cutoff jumps to a new random value: the classic burbling, random-filter computer sound.',
  },
  MY,
  ML
);
fader(
  'lfo.bend',
  1505,
  {
    min: -5,
    max: 5,
    def: 0,
    module: 'lfo',
    name: 'LFO BEND',
    fmt: (v) =>
      Math.abs(v) < 0.1 ? 'centre' : `×${Math.pow(2, bendOct(v, false)).toFixed(2)} (normal)`,
    help: 'Bends the LFO rate up or down from the rate stored with the sound. Leave it in the middle for the stored rate.',
  },
  MY,
  ML
);
fader(
  'lfo.delay',
  1555,
  {
    def: 0,
    module: 'lfo',
    name: 'LFO delay time',
    fmt: (v) => (v <= 0 ? 'off' : fmtTime(delayTime(v))),
    help: 'How long the LFO waits after a new key before it fades in, up to 10 seconds: vibrato that arrives once the note has settled. Notes played legato do not start it again.',
  },
  MY,
  ML
);

// ── Second row ────────────────────────────────────────────────────────────
const RY = 478;
box(98, 300, 412, 524, 'ARPEGGIO');
knob('kbd.arpMode', 158, RY, 16, {
  kind: 'enum',
  def: 'off',
  module: 'mode',
  label: 'ARPEGGIO',
  name: 'Arpeggio',
  labelSize: 8,
  options: [
    { v: 'off', label: '', a: -120 },
    { v: 'up', label: '', a: -60 },
    { v: 'down', label: '', a: 0 },
    { v: 'updown', label: '', a: 60 },
    { v: 'random', label: '', a: 120 },
  ],
  help: 'Turns the held keys into a pattern of single notes, stepped by the trigger generator: UP, DOWN, UP and DOWN, or RANDOM. OFF plays the keys as chords.',
});
posNames(158, RY, 25, [
  [-120, 'OFF'],
  [-60, 'UP'],
  [0, 'DOWN'],
  [60, 'U+D'],
  [120, 'RND'],
]);
decor.push({
  t: 'led',
  x: 252,
  y: 452,
  r: 4.5,
  color: 'red',
  litWhen: { id: 'kbd.hold', eq: true },
});
controls.push({
  id: 'kbd.hold',
  type: 'button',
  x: 252,
  y: RY,
  w: 30,
  h: 18,
  capColor: '#e6e3da',
  kind: 'bool',
  def: false,
  module: 'mode',
  label: 'HOLD',
  labelPos: 'none',
  help: 'Keeps the arpeggio going after you let go of the keys. Play a new chord and it replaces the held one.',
});
text(252, 510, 'HOLD', 9);

box(306, 520, 412, 524, 'KEY ASSIGNMENT');
knob('kbd.assign', 413, RY + 2, 16, {
  kind: 'enum',
  def: 'poly1',
  module: 'mode',
  label: 'KEY ASSIGNMENT MODE',
  name: 'Key assignment',
  labelSize: 8,
  options: [
    { v: 'uni1', label: '', a: -120 },
    { v: 'uni2', label: '', a: -50 },
    { v: 'poly1', label: '', a: 50 },
    { v: 'poly2', label: '', a: 120 },
  ],
  help: 'How keys are given to the four voices. UNISON 1: all four on one key, one note at a time, for a huge lead or bass. UNISON 2: the voices are shared between the keys held. POLY 1 and POLY 2: one voice per key, for chords.',
});

posNames(413, RY + 2, 25, [
  [-120, 'UNISON 1'],
  [-50, 'UNISON 2'],
  [50, 'POLY 1'],
  [120, 'POLY 2'],
]);

box(526, 658, 412, 524, 'PORTAMENTO');
knob('kbd.portamento', 572, RY, 16, {
  def: 0,
  module: 'glide',
  label: 'PORTAMENTO',
  name: 'Portamento time',
  fmt: (v) => (v <= 0 ? 'off' : `${fmtTime(portaTime(v))} / oct`),
  help: 'How long the pitch takes to slide from one note to the next, up to about a second per octave. Every voice slides from its own last note.',
});
text(622, 452, 'ON', 8.5);
toggle('kbd.portaOn', 622, RY, {
  kind: 'bool',
  def: false,
  module: 'glide',
  label: 'PORTAMENTO',
  name: 'Portamento switch',
  help: 'Switches portamento on or off. The knob beside it sets the time.',
});
text(622, 506, 'OFF', 8.5);

box(664, 762, 412, 524, 'TRANSPOSE');
text(713, 452, 'NORM', 8.5);
toggle('kbd.transpose', 713, RY, {
  kind: 'enum',
  def: 'normal',
  module: 'util',
  label: 'TRANSPOSE',
  name: 'Transpose',
  options: [
    { v: 'normal', label: 'NORMAL' },
    { v: 'down', label: '1 OCT DOWN' },
  ],
  help: 'Drops the whole keyboard by an octave, to reach lower notes on the 49 keys.',
});
text(713, 506, '−1 OCT', 8.5);

box(768, 1250, 412, 524, 'BEND / MODULATION');
text(800, 444, 'BEND SENS', 8.5);
knob('bend.sens', 800, RY + 6, 15, {
  def: 5,
  module: 'mod',
  label: 'BEND SENS',
  name: 'Bend sensitivity',
  fmt: pct,
  help: 'How far the lever bends the destinations switched to BEND: up to an octave on the VCO, two octaves on the filter, +12 dB on the VCA. In this app the mod wheel beside the keyboard stands in for the lever.',
});
text(868, 444, 'LFO MOD', 8.5);
knob('bend.lfoMod', 868, RY + 6, 15, {
  def: 5,
  module: 'mod',
  label: 'LFO MOD',
  name: 'Lever LFO depth',
  fmt: pct,
  help: 'The most LFO the lever can bring in on the destinations switched to LFO. In this app the mod wheel beside the keyboard stands in for the lever: push it up and the LFO comes in, up to this depth.',
});
const LEVER_OPTS: ControlOption[] = [
  { v: 'bend', label: 'BEND' },
  { v: 'off', label: 'OFF' },
  { v: 'lfo', label: 'LFO' },
];
(
  [
    ['vco', 942, 'VCO', 'the VCO’s pitch'],
    ['vcf', 987, 'VCF', 'the filter cutoff'],
    ['vca', 1032, 'VCA', 'the volume'],
  ] as const
).forEach(([k, x, t, what]) => {
  text(x, 444, t, 9);
  toggle(`bend.${k}`, x, RY + 6, {
    kind: 'enum',
    def: 'off',
    options: LEVER_OPTS,
    module: 'mod',
    label: `BEND/LFO ${t}`,
    name: `Lever to ${t}`,
    help: `What the lever does to ${what}. BEND: pushing it bends ${what} by up to BEND SENS. LFO: pushing it brings in the LFO on ${what}, up to LFO MOD. OFF: nothing. The mod wheel beside the keyboard stands in for the lever.`,
  });
});
text(1062, RY - 5, 'BEND', 7.5, { anchor: 'start' });
text(1062, RY + 6, 'OFF', 7.5, { anchor: 'start' });
text(1062, RY + 17, 'LFO', 7.5, { anchor: 'start' });
// the lever itself, for reference
decor.push({
  t: 'rect',
  x: 1130,
  y: 462,
  w: 90,
  h: 30,
  r: 4,
  fill: '#050506',
  stroke: '#3a3a3c',
  sw: 1.5,
  hw: true,
});
decor.push({
  t: 'rect',
  x: 1170,
  y: 456,
  w: 10,
  h: 42,
  r: 3,
  fill: '#2a2a2c',
  stroke: '#555',
  sw: 1,
  hw: true,
});
text(1175, 444, 'LEVER', 8, { fill: GREY });

box(1256, 1582, 412, 524, 'MEMORY');
(
  [
    [1300, 'MANUAL', '#e6e3da'],
    [1390, 'MEMORY WRITE', '#c8302c'],
    [1490, 'PROTECTION', '#8d8d8a'],
  ] as const
).forEach(([x, t, c]) => {
  decor.push({
    t: 'rect',
    x: x - 16,
    y: RY - 9,
    w: 32,
    h: 18,
    r: 2,
    fill: c,
    stroke: '#000',
    sw: 1,
    hw: true,
  });
  text(x, 510, t, 8.5);
});
decor.push({ t: 'led', x: 1300, y: 452, r: 4, color: 'red', litWhen: 'power' });

// ── Bottom strip: ensemble and COMPU-MEMORY ───────────────────────────────
text(150, 546, 'ENSEMBLE', 10);
text(186, 560, 'ON', 8);
toggle('ens.on', 160, 574, {
  kind: 'bool',
  def: false,
  module: 'fx',
  label: 'ENSEMBLE',
  name: 'Ensemble',
  help: 'A stereo chorus on all the voices together. It widens and thickens the sound, and makes chords shimmer gently.',
});
text(186, 588, 'OFF', 8);
text(480, 545, 'COMPU-MEMORY', 9);
decor.push(
  { t: 'line', x1: 340, y1: 545, x2: 425, y2: 545, w: 1 },
  { t: 'line', x1: 535, y1: 545, x2: 620, y2: 545, w: 1 }
);
const MEM_COL = [
  '#d63a2c',
  '#e6e3da',
  '#e6e3da',
  '#e6e3da',
  '#8d8d8a',
  '#8d8d8a',
  '#8d8d8a',
  '#8d8d8a',
];
MEM_COL.forEach((c, i) => {
  const x = 340 + 40 * i;
  decor.push({
    t: 'rect',
    x: x - 15,
    y: 563,
    w: 30,
    h: 18,
    r: 2,
    fill: c,
    stroke: '#000',
    sw: 1,
    hw: true,
  });
  text(x, 593, String(i + 1), 8.5);
});
text(950, 545, 'PRE-SET', 9);
decor.push(
  { t: 'line', x1: 720, y1: 545, x2: 915, y2: 545, w: 1 },
  { t: 'line', x1: 985, y1: 545, x2: 1170, y2: 545, w: 1 }
);
const PRESETS = [
  'BASS',
  'STRINGS',
  'CLAV',
  'PIANO',
  'VOICE',
  'TROMB',
  'SAX',
  'TRUMP',
  'SYNTH',
  'FORCE',
];
const PRE_COL = [
  '#3f6fc9',
  '#3f6fc9',
  '#3a9a55',
  '#3a9a55',
  '#e6e3da',
  '#e6e3da',
  '#e8c63a',
  '#e8c63a',
  '#8d8d8a',
  '#8d8d8a',
];
PRESETS.forEach((t, i) => {
  const x = 720 + 50 * i;
  decor.push({
    t: 'rect',
    x: x - 15,
    y: 563,
    w: 30,
    h: 18,
    r: 2,
    fill: PRE_COL[i],
    stroke: '#000',
    sw: 1,
    hw: true,
  });
  text(x, 593, t, 7.5);
});

// ── Areas ─────────────────────────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'output',
    label: 'Volume and tuning',
    module: 'out',
    keywords: 'master volume level tune pitch 442',
    rects: [R(1060, 90, 1240, 176)],
    help: 'Master VOLUME and TUNING for the whole synth. Neither is stored with a sound.',
  },
  {
    id: 'lfo',
    label: 'LFO',
    module: 'lfo',
    keywords: 'vibrato wobble modulation rate waveform low frequency oscillator',
    rects: [R(92, 182, 285, 408)],
    help: 'One LFO shared by all four voices. RATE sets its speed, from very slow up to 80 Hz, and WAVE FORM its shape: sine, square, or a rising or falling sawtooth. Where it goes is set by the MOD sliders in the VCO and VCF sections and by the lever.',
  },
  {
    id: 'vco',
    label: 'VCO',
    module: 'osc',
    keywords: 'oscillator sawtooth square pulse width pwm vibrato octave range',
    rects: [R(285, 182, 675, 408)],
    help: 'One oscillator per voice. WAVE FORM picks sawtooth, square or pulse (or OFF), RANGE the octave. PW sets the pulse width, stepped by hand or swept by the LFO with the switch at MOD, and MOD sets how far the LFO moves the pitch.',
  },
  {
    id: 'source',
    label: 'Sub and noise',
    module: 'mixer',
    keywords: 'sub oscillator octave down noise hiss mixer',
    rects: [R(675, 182, 783, 408)],
    help: 'Two switches that add to the VCO: SUB, a square an octave below, and NOISE. There are no level controls; each is on or off.',
  },
  {
    id: 'vcf',
    label: 'Filters (HPF and VCF)',
    module: 'filter',
    keywords: 'cutoff resonance low-pass high-pass keyboard tracking brightness emphasis',
    rects: [R(783, 182, 1028, 408)],
    help: 'A high-pass filter (HPF CUTOFF) that thins the bass, then a resonant low-pass filter (LPF CUTOFF, RES) that sets the brightness. LFO MOD and ENV MOD set how far the LFO and the filter envelope move the cutoff, KYBD FOLLOW how much it follows the keys, and POLARITY can turn the envelope upside down.',
  },
  {
    id: 'env_f',
    label: 'Filter envelope',
    module: 'env',
    keywords: 'adsr attack decay sustain release contour eg',
    rects: [R(1028, 182, 1178, 408)],
    help: 'The filter’s own ADSR envelope: A, D, S and R. ENV MOD sets how far it moves the cutoff on each note.',
  },
  {
    id: 'vca',
    label: 'VCA',
    module: 'amp',
    keywords: 'adsr volume amplifier loudness level overload attack release',
    rects: [R(1178, 182, 1378, 408)],
    help: 'The ADSR envelope that shapes the volume of each note, and LEVEL, the sound’s own output level. The OVERLOAD lamp lights when LEVEL is high enough to distort.',
  },
  {
    id: 'modifier',
    label: 'Modifier',
    module: 'mod',
    keywords: 'trigger clock sample and hold random filter lfo bend delay vibrato fade',
    rects: [R(1378, 182, 1588, 408)],
    help: 'Live controls that are never stored with a sound. The trigger generator (TRIG RATE) clocks the arpeggio and a noise sample-and-hold whose depth on the filter is VCF MOD. LFO BEND bends the stored LFO rate, and DELAY TIME fades the LFO in after each new key.',
  },
  {
    id: 'arp',
    label: 'Arpeggio',
    module: 'mode',
    keywords: 'arpeggiator pattern hold latch up down random',
    rects: [R(92, 408, 303, 527)],
    help: 'Plays the held keys one note at a time, UP, DOWN, UP and DOWN or at RANDOM, at the trigger generator’s RATE. HOLD keeps it going after you let go.',
  },
  {
    id: 'assign',
    label: 'Key assignment',
    module: 'mode',
    keywords: 'unison poly voice allocation mono stack',
    rects: [R(303, 408, 523, 527)],
    help: 'How keys are shared out among the four voices: both UNISON modes stack voices on fewer notes for a thicker sound, both POLY modes play chords.',
  },
  {
    id: 'porta',
    label: 'Portamento',
    module: 'glide',
    keywords: 'glide slide legato',
    rects: [R(523, 408, 661, 527)],
    help: 'Glide between notes: the knob sets the time and the switch turns it on and off. Not stored with a sound on the hardware.',
  },
  {
    id: 'transpose',
    label: 'Transpose',
    module: 'util',
    keywords: 'octave down keyboard range',
    rects: [R(661, 408, 765, 527)],
    help: 'Drops the keyboard by an octave.',
  },
  {
    id: 'lever',
    label: 'Bend and modulation',
    module: 'mod',
    keywords: 'pitch bend lever wheel vibrato wah tremolo performance',
    rects: [R(765, 408, 1253, 527)],
    help: 'The settings for the spring-loaded lever. Each of VCO, VCF and VCA is switched to BEND, OFF or LFO: BEND moves it as far as BEND SENS allows, LFO brings in the LFO on it up to LFO MOD. In this app the mod wheel beside the keyboard stands in for the lever pushed to one side.',
  },
  {
    id: 'memory',
    label: 'Memory',
    module: 'util',
    keywords: 'compu-memory preset patch write protect store recall',
    rects: [R(1253, 408, 1588, 527), R(300, 527, 1588, 620)],
    help: 'MANUAL plays the panel as set; COMPU-MEMORY 1 to 8 recall stored sounds and the ten PRE-SET buttons Roland’s fixed ones. Writing needs MEMORY WRITE and PROTECTION pressed together. Printed only: this app keeps its sounds in the library.',
  },
  {
    id: 'ensemble',
    label: 'Ensemble',
    module: 'fx',
    keywords: 'chorus stereo width shimmer',
    rects: [R(92, 527, 300, 620)],
    help: 'A stereo chorus after the voices, which widens and thickens the sound.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues, ctx?: Partial<EngineContext>): EngineParams {
  const routes: EngineRoute[] = [];
  const route = (src: string, dst: string, amt: number): void => {
    if (amt !== 0) routes.push({ src, dst, amt });
  };
  const w = clamp(ctx?.wheel || 0, 0, 1); // the lever, pushed to one side
  const sens = num(v, 'bend.sens') / 10;
  const lm = num(v, 'bend.lfoMod') / 10;
  const vib = num(v, 'vco.lfoMod') / 10;
  route('lfo', 'pitch1', 12 * vib * vib);
  route('lfo', 'cutoff', 4 * (num(v, 'vcf.lfoMod') / 10));
  const pwMod = v['vco.pwMode'] === 'mod';
  if (pwMod) route('lfo', 'pw1', 0.4 * (num(v, 'vco.pw') / 10));
  if (v['trig.vcfClock'] === 'int') route('sh', 'cutoff', 3 * (num(v, 'trig.vcfMod') / 10));
  // the lever: BEND sends a fixed push, LFO brings the LFO in
  let bendSemi = 0,
    vcaDb = 0;
  if (v['bend.vco'] === 'bend') bendSemi = 12 * sens * w;
  if (v['bend.vco'] === 'lfo') route('lfo', 'pitch1', 12 * lm * lm * w);
  if (v['bend.vcf'] === 'bend') route('one', 'cutoff', 2 * sens * w);
  if (v['bend.vcf'] === 'lfo') route('lfo', 'cutoff', 3 * lm * w);
  if (v['bend.vca'] === 'bend') vcaDb = 12 * sens * w;
  if (v['bend.vca'] === 'lfo') route('lfoUni', 'amp', -0.9 * lm * w);

  const wave = v['vco.waveform'];
  const mix: OscMix =
    wave === 'saw' ? { saw: 1 } : wave === 'square' || wave === 'pulse' ? { pulse: 1 } : {};
  if (v['vco.sub']) mix.sub = 0.8;
  const sounding = wave !== 'off' || v['vco.sub'];
  const pw = wave === 'square' ? 0.5 : pwMod ? 0.5 : pwStep(num(v, 'vco.pw'));
  const assign = v['kbd.assign'];
  const poly: PolyParams =
    assign === 'uni1'
      ? { voices: 4, stack: 4, mono: true, detune: 0.08 }
      : assign === 'uni2'
        ? { voices: 4, stack: 2, mono: false, detune: 0.06 }
        : { voices: 4, stack: 1, mono: false, detune: 0 };
  const arpMode = String(v['kbd.arpMode']);
  const rateOct = bendOct(num(v, 'lfo.bend'), v['lfo.bendWide'] === 'wide');
  const env = (e: string): EnvParams => ({
    a: attTime(num(v, `${e}.attack`)),
    d: drTime(num(v, `${e}.decay`)),
    s: num(v, `${e}.sustain`) / 10,
    r: drTime(num(v, `${e}.release`)),
  });
  const lvl = num(v, 'vca.level');
  return {
    osc: [
      {
        level: sounding ? 0.45 : 0,
        mix,
        pw,
        semi: RANGE_SEMI[String(v['vco.range'])] + (v['kbd.transpose'] === 'down' ? -12 : 0),
        kbd: true,
        syncTo: -1,
      },
    ],
    noise: { level: v['noise.on'] ? 0.5 : 0, color: 'white' },
    ext: { level: 0 },
    hpf: {
      poles: 1,
      cutoff: num(v, 'hpf.cutoff') <= 0 ? 10 : hpfHz(num(v, 'hpf.cutoff')),
      res: 0,
      envAmt: 0,
      envSrc: 'env1',
      kbd: 0,
    },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: lpfHz(num(v, 'vcf.cutoff')),
      res: (num(v, 'vcf.res') / 10) * 1.08,
      envAmt: (v['vcf.polarity'] === 'inverted' ? -1 : 1) * 8 * (num(v, 'vcf.envMod') / 10),
      envSrc: 'env1',
      kbd: KYBD[String(v['vcf.kybd'])],
    },
    env1: env('env_f'),
    env2: env('env_a'),
    vca: { envSrc: 'env2', bias: 0, gain: Math.pow(lvl / 7, 1.4) * Math.pow(10, vcaDb / 20) },
    lfo: {
      rate: lfoHz(num(v, 'lfo.rate')) * Math.pow(2, rateOct),
      mix: LFO_MIX[String(v['lfo.waveform'])],
      keySync: false,
      delay: delayTime(num(v, 'lfo.delay')),
    },
    glide: { time: v['kbd.portaOn'] ? portaTime(num(v, 'kbd.portamento')) : 0, legato: false },
    trig: { retrig: true, drone: false, repeat: false },
    paraphonic: false,
    poly,
    arp: {
      on: arpMode !== 'off' && v['trig.arpClock'] === 'int',
      bpm: trigHz(num(v, 'trig.rate')) * 15,
      gate: 0.5,
      mode: ARP_MODE[arpMode] || 'up',
      octaves: 1,
      hold: !!v['kbd.hold'],
    },
    sh: { rate: trigHz(num(v, 'trig.rate')), glide: 0 },
    chorus: { on: !!v['ens.on'], mode: 1 },
    routes,
    normals: {},
    od: { on: false },
    delay: { on: false },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: num(v, 'kbd.tuning') / 10 + bendSemi,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = Object.fromEntries(controls.map((c) => [c.id, c.def]));

// The modular layout: each printed section cut out as a module (cuts are [x0, y0, x1, y1] on the long panel), five
// rows.
const CUTS: [number, number, number, number][][] = [
  [
    [92, 182, 285, 408],
    [285, 182, 675, 408],
    [675, 182, 783, 408],
    [783, 182, 1178, 408],
  ],
  [
    [1178, 182, 1378, 408],
    [1378, 182, 1588, 408],
    [1040, 60, 1588, 182],
  ],
  [
    [92, 408, 303, 527],
    [303, 408, 523, 527],
    [523, 408, 661, 527],
    [661, 408, 765, 527],
    [1253, 408, 1588, 527],
  ],
  [
    [765, 408, 1253, 527],
    [92, 527, 300, 620],
    [300, 527, 680, 620],
  ],
  [[680, 527, 1588, 620]],
];
const modular: ModularLayout = {
  brand: 'JUPITER-4',
  rows: CUTS.map((row) => row.map((cut) => ({ cut }))),
};

const jupiter4: SynthDef & { version: number } = {
  id: 'jupiter-4',
  version: 1,
  name: 'Jupiter-4',
  maker: 'Roland',
  year: 1978,
  heritage: 'Roland’s first self-contained polyphonic synthesizer, with microprocessor memory',
  summary:
    'Four voices, each one VCO with a sub-octave square and noise → a high-pass filter → a resonant low-pass VCF → VCA, with an ADSR each for the filter and the VCA. One LFO with delay, a trigger generator that clocks the arpeggio and a random filter sample-and-hold, four key-assignment modes, portamento and a stereo ensemble.',
  view: { w: 1680, h: 620 },
  theme: {
    panel: '#1b1b1c',
    panel2: '#121213',
    ink: INK,
    font: 'helv',
    cheeks: 'wood',
    cheekW: 78,
  },
  decor,
  areas,
  controls,
  jacks: [],
  init,
  toEngine,
  modular,
  signalNames: {
    env1: 'the filter envelope',
    env2: 'the VCA envelope',
    lfo: 'the LFO',
    sh: 'the noise sample-and-hold',
  },
};

export default jupiter4;
