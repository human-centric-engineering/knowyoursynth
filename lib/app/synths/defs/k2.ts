/**
 * Behringer K-2: the definition (D1). A 2400 × 762 faceplate laid out from the product photo: the
 * left two thirds are the fixed voice (two VCOs, mixer, the high-pass/low-pass pair, two envelopes
 * and the modulation generator), the right third is the patch panel, with the external signal
 * processor along the bottom of it.
 *
 * Transliterated from the prototype file `src/synths/k2.js` (D3), the way `defs/model-d.ts` was:
 * no content (sounds, lineage, unusual notes), a `version`, the maker's mark tagged `brand`, and
 * panel values read through `num()`.
 */
import type {
  Area,
  Control,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  EngineRoute,
  InputJack,
  Jack,
  KnobControl,
  KnobScale,
  LfoMix,
  OscMix,
  OutputJack,
  SynthDef,
  SynthModule,
  WaveShape,
} from '@/lib/app/synths/contract';
import { type OmitEach, num } from '@/lib/app/synths/lib/def-kit';
import {
  clamp,
  type CurvePoint,
  expMap,
  fmtHz,
  fmtSemi,
  fmtTime,
  level10,
  pwl,
} from '@/lib/app/synths/lib/maps';

type KnobRest = OmitEach<KnobControl, 'id' | 'type' | 'x' | 'y' | 'r' | 'style'>;
type JackRest<J extends Jack> = Omit<
  J,
  'id' | 'x' | 'y' | 'r' | 'label' | 'labelPos' | 'labelSize' | 'dir'
>;

// ── Scales ────────────────────────────────────────────────────────────────
const S10: KnobScale = { nums: [0, 2, 4, 6, 8, 10], ticks: 11, size: 12 };
const S5: KnobScale = { nums: [-4, -2, 0, 2, 4], ticks: 11, size: 12 };
// Tighter ring for the crowded columns (modulation depths, the two envelopes), so labels clear the frame line.
const S10T: KnobScale = {
  nums: [0, 2, 4, 6, 8, 10],
  ticks: 11,
  numR: 1.58,
  tickR: 1.28,
  size: 10,
};
/** Panel 0–10 → Hz. The manual gives 10 Hz–20 kHz for both filters but no taper, so both are exponential. */
const hpHz = (v: number): number => expMap(v / 10, 12, 12000);
const lpHz = (v: number): number => expMap(v / 10, 20, 18000);
const peak = (v: number): number => (v / 10) * 1.08;
const mgHz = (v: number): number => expMap(v / 10, 0.1, 22); // specifications: 0.1 Hz – 22 Hz
// Envelope times straight off the specifications table.
const eg1Dly = (v: number): number => (v <= 0 ? 0 : expMap(v / 10, 0.01, 5.5));
const eg1Att = (v: number): number => expMap(v / 10, 0.003, 16);
const eg1Rel = (v: number): number => expMap(v / 10, 0.03, 16);
const eg2Hold = (v: number): number => (v <= 0 ? 0 : expMap(v / 10, 0.01, 14));
const eg2Att = (v: number): number => expMap(v / 10, 0.0054, 9);
// The specifications give 0.5 ms to 15 s for the decay. Straight exponential over that range makes the bottom
// half of the knob unusable, so it is bent through the middle: both ends still match the spec.
const EG2_DEC: CurvePoint[] = [
  [0, 0.0005],
  [1, 0.01],
  [3, 0.06],
  [5, 0.3],
  [7, 1.6],
  [10, 15],
];
const eg2Dec = (v: number): number => pwl(v, EG2_DEC, true);
const eg2Rel = (v: number): number => expMap(v / 10, 0.04, 18);
const portaS = (v: number): number => Math.pow(v / 10, 2) * 5;
/** Modulation depth knobs are square-law, so the bottom of the range gives musical amounts. */
const dep = (v: number, range: number): number => Math.pow(v / 10, 2) * range;

const SCALE1: Record<string, number> = { 32: -24, 16: -12, 8: 0, 4: 12 };
const SCALE2: Record<string, number> = { 16: -12, 8: 0, 4: 12, 2: 24 };
const FOUR = [-105, -35, 35, 105];
// VCO1 waveform → engine mix. `noise` is not a wave: it swaps the oscillator for the noise generator.
const WAVE1: Record<string, OscMix> = {
  tri: { tri: 1 },
  rsaw: { rsaw: 1 },
  pulse: { pulse: 1 },
  noise: {},
};
// VCO2 waveform → engine mix. `ring` is not a wave either: VCO2's output becomes the ring modulation of the two.
const WAVE2: Record<string, OscMix> = {
  rsaw: { rsaw: 1 },
  sq: { pulse: 1 },
  npulse: { pulse: 1 },
  ring: {},
};
const PW2: Record<string, number> = { rsaw: 0.5, sq: 0.5, npulse: 0.12, ring: 0.5 };
const RING_A: Record<string, string> = {
  tri: 'o1tri',
  rsaw: 'o1saw',
  pulse: 'o1pulse',
  noise: 'o1saw',
};

/** MG WAVE FORM: one knob takes output 1 from reverse saw through triangle to saw. */
function mgMix(v: number): LfoMix {
  const p = clamp(v, 0, 10) / 5; // 0 = rsaw, 1 = tri, 2 = saw
  if (p <= 1) return { rsaw: 1 - p, tri: p };
  return { tri: 2 - p, saw: p - 1 };
}
const mgWaveName = (v: number): string =>
  v < 1.7
    ? 'reverse saw'
    : v < 4.2
      ? 'reverse saw → triangle'
      : v < 5.9
        ? 'triangle'
        : v < 8.4
          ? 'triangle → saw'
          : 'saw';

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const text = (x: number, y: number, t: string, size = 13): void => {
  decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle' });
};
const knob = (id: string, x: number, y: number, r: number, rest: KnobRest): void => {
  controls.push({ id, type: 'knob', x, y, r, style: 'pro1', ...rest });
};
/** A 0–10 knob: the panel prints the numbers round every one of them. */
const k10 = (
  id: string,
  x: number,
  y: number,
  r: number,
  label: string,
  module: SynthModule,
  def: number,
  help: string,
  rest: { fmt?: (v: number) => string; labelSize?: number } = {}
): void => {
  knob(id, x, y, r, {
    kind: 'cont',
    min: 0,
    max: 10,
    def,
    label,
    labelPos: 'bottom',
    module,
    scale: r <= 24 ? S10T : S10,
    help,
    ...rest,
  });
};
const jackIn = (
  id: string,
  x: number,
  y: number,
  label: string,
  rest: JackRest<InputJack>
): void => {
  jacks.push({ id, x, y, r: 17, label, labelPos: 'top', labelSize: 11, dir: 'in', ...rest });
};
const jackOut = (
  id: string,
  x: number,
  y: number,
  label: string,
  rest: JackRest<OutputJack>
): void => {
  jacks.push({ id, x, y, r: 17, label, labelPos: 'top', labelSize: 11, dir: 'out', ...rest });
};
/** A block in the patch-panel signal diagram. */
const blk = (x: number, y: number, w: number, h: number, t: string, size = 8.5): void => {
  const lines = t.split('\n').length;
  decor.push({ t: 'rect', x, y, w, h, r: 3, stroke: '#e8c34a', sw: 1.4, fill: 'none' });
  text(x + w / 2, y + h / 2 + size * 0.36 - (lines - 1) * size * 0.58, t, size);
};
const wire = (d: string, w = 1.5): void => {
  decor.push({ t: 'path', d, w });
};
/** The source on a cable, capitalised to open a sentence. */
const cap = (src: string): string => `${src.charAt(0).toUpperCase()}${src.slice(1)}`;

// ── Faceplate furniture ───────────────────────────────────────────────────
[
  [70, 14],
  [70, 748],
  [1200, 14],
  [1200, 748],
  [2330, 14],
  [2330, 748],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 8 }));

// ── VCO 1 ─────────────────────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 46,
  y: 26,
  w: 196,
  h: 508,
  r: 10,
  label: 'VOLTAGE CONTROLLED\nOSCILLATOR 1',
  labelAt: 'top',
  labelSize: 15,
  gapW: 200,
});
knob('vco1.wave', 149, 152, 42, {
  kind: 'enum',
  module: 'osc',
  label: 'WAVE FORM',
  labelPos: 'bottom',
  labelSize: 14,
  options: [
    { v: 'tri', label: '', a: FOUR[0] },
    { v: 'rsaw', label: '', a: FOUR[1] },
    { v: 'pulse', label: '', a: FOUR[2] },
    { v: 'noise', label: '', a: FOUR[3] },
  ],
  def: 'rsaw',
  help: 'Raw tone of Oscillator 1. Triangle is soft and hollow, reverse sawtooth is bright and buzzy, pulse is thin and nasal, and the fourth position is not a wave at all — it swaps the oscillator for the noise generator.',
});
(
  [
    ['tri', FOUR[0]],
    ['rsaw', FOUR[1]],
    ['pulse', FOUR[2]],
    ['noise', FOUR[3]],
  ] as [WaveShape, number][]
).forEach(([shape, a]) => {
  const r = (a * Math.PI) / 180;
  decor.push({ t: 'wave', x: 149 + Math.sin(r) * 66, y: 152 - Math.cos(r) * 62, size: 11, shape });
});
decor.push({
  t: 'path',
  d: 'M198 128 H214 M200 124 L196 128 L200 132 M212 124 L216 128 L212 132',
  w: 1.4,
});
k10(
  'vco1.pw',
  149,
  300,
  30,
  'PW',
  'osc',
  5,
  'Pulse width of Oscillator 1, from a hollow square at one end to a thin, nasal pulse at the other. It only does anything with the pulse waveform selected.'
);
knob('vco1.scale', 149, 452, 40, {
  kind: 'enum',
  module: 'osc',
  label: 'SCALE',
  labelPos: 'bottom',
  labelSize: 14,
  options: [
    { v: '32', label: '32′', a: FOUR[0] },
    { v: '16', label: '16′', a: FOUR[1] },
    { v: '8', label: '8′', a: FOUR[2] },
    { v: '4', label: '4′', a: FOUR[3] },
  ],
  def: '8',
  help: 'Octave of Oscillator 1 in organ-pipe feet: 32′ is the lowest, 4′ the highest. Each step is an octave.',
});

// ── Portamento ────────────────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 46,
  y: 552,
  w: 196,
  h: 178,
  r: 10,
  label: 'PORTAMENTO',
  labelAt: 'top',
  labelSize: 15,
  gapW: 130,
});
k10(
  'porta.time',
  149,
  640,
  28,
  'TIME',
  'glide',
  0,
  'Glide. At 0 the pitch jumps straight to each new note; turn it up and the pitch slides from the note before.'
);

// ── VCO 2 ─────────────────────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 250,
  y: 26,
  w: 188,
  h: 508,
  r: 10,
  label: 'VOLTAGE CONTROLLED\nOSCILLATOR 2',
  labelAt: 'top',
  labelSize: 15,
  gapW: 200,
});
knob('vco2.wave', 344, 152, 42, {
  kind: 'enum',
  module: 'osc',
  label: 'WAVE FORM',
  labelPos: 'bottom',
  labelSize: 14,
  options: [
    { v: 'rsaw', label: '', a: FOUR[0] },
    { v: 'sq', label: '', a: FOUR[1] },
    { v: 'npulse', label: '', a: FOUR[2] },
    { v: 'ring', label: 'RING', a: FOUR[3] },
  ],
  def: 'rsaw',
  help: 'Raw tone of Oscillator 2. Reverse sawtooth is bright, square is hollow, narrow pulse is thin and reedy. RING is not a waveform: it replaces Oscillator 2 with the two oscillators multiplied together, which sounds clangy and bell-like.',
});
(
  [
    ['rsaw', FOUR[0]],
    ['sq', FOUR[1]],
    ['npulse', FOUR[2]],
  ] as [WaveShape, number][]
).forEach(([shape, a]) => {
  const r = (a * Math.PI) / 180;
  decor.push({ t: 'wave', x: 344 + Math.sin(r) * 66, y: 152 - Math.cos(r) * 62, size: 11, shape });
});
knob('vco2.pitch', 344, 300, 30, {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  label: 'PITCH',
  labelPos: 'bottom',
  module: 'osc',
  scale: S5,
  fmt: (v) => fmtSemi((v / 5) * 12),
  help: 'Tunes Oscillator 2 against Oscillator 1, about an octave either way. A tiny offset makes the two beat against each other, which the ear hears as thickness.',
});
knob('vco2.scale', 344, 452, 40, {
  kind: 'enum',
  module: 'osc',
  label: 'SCALE',
  labelPos: 'bottom',
  labelSize: 14,
  options: [
    { v: '16', label: '16′', a: FOUR[0] },
    { v: '8', label: '8′', a: FOUR[1] },
    { v: '4', label: '4′', a: FOUR[2] },
    { v: '2', label: '2′', a: FOUR[3] },
  ],
  def: '8',
  help: 'Octave of Oscillator 2. The whole range sits an octave above Oscillator 1’s, so 8′ on both means the same octave.',
});

// ── Master tune ───────────────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 250,
  y: 552,
  w: 188,
  h: 178,
  r: 10,
  label: 'MASTER TUNE',
  labelAt: 'top',
  labelSize: 15,
  gapW: 140,
});
knob('tune.master', 344, 640, 28, {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  label: '',
  labelPos: 'none',
  module: 'osc',
  scale: S5,
  fmt: (v) => fmtSemi((v / 5) * 2.5),
  help: 'Tunes the whole instrument, about two and a half semitones either way. Use it to tune to another instrument.',
});

// ── VCO mixer ─────────────────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 446,
  y: 26,
  w: 144,
  h: 432,
  r: 10,
  label: 'VCO MIXER',
  labelAt: 'top',
  labelSize: 15,
  gapW: 120,
});
k10(
  'mix.vco1',
  518,
  150,
  32,
  'VCO1 LEVEL',
  'mixer',
  7,
  'How much of Oscillator 1 goes into the filters. With the waveform switch on its noise position this is the noise level instead.'
);
k10(
  'mix.vco2',
  518,
  330,
  32,
  'VCO2 LEVEL',
  'mixer',
  0,
  'How much of Oscillator 2 goes into the filters — or, with RING selected, how much ring modulation.'
);

// ── Frequency modulation ──────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 446,
  y: 470,
  w: 144,
  h: 265,
  r: 10,
  label: 'FREQUENCY\nMODULATION',
  labelAt: 'top',
  labelSize: 13,
  gapW: 130,
});
k10(
  'fmod.mg',
  518,
  545,
  24,
  'MG/T.EXT',
  'mod',
  0,
  'How far the modulation generator moves the pitch of both oscillators. Slow rates give vibrato; fast ones give a growl. The mod wheel beside the keyboard turns this knob further, so vibrato can be brought in part-way through a note.'
);
k10(
  'fmod.eg1',
  518,
  652,
  24,
  'EG1/EXT',
  'mod',
  0,
  'How far envelope 1 moves the pitch of both oscillators on each note. Small amounts give a blip at the start of a note; large amounts give whistles and sirens.'
);

// ── High-pass filter ──────────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 596,
  y: 26,
  w: 168,
  h: 432,
  r: 10,
  label: 'VOLTAGE CONTROLLED\nHIGHPASS FILTER',
  labelAt: 'top',
  labelSize: 13,
  gapW: 180,
});
k10(
  'hpf.cutoff',
  680,
  150,
  32,
  'CUTOFF\nFREQUENCY',
  'filter',
  0,
  'Removes everything below this frequency. At 0 the bass is untouched; turn it up and the sound gets thinner and more nasal as the fundamental is stripped away.',
  { fmt: (v) => fmtHz(hpHz(v)) }
);
k10(
  'hpf.peak',
  680,
  330,
  32,
  'PEAK',
  'filter',
  0,
  'Resonance for the high-pass filter: a boost right at the cutoff. Near maximum the filter whistles on its own.'
);

decor.push({
  t: 'frame',
  x: 596,
  y: 470,
  w: 168,
  h: 265,
  r: 10,
  label: 'CUTOFF FREQUENCY\nMODULATION',
  labelAt: 'top',
  labelSize: 12,
  gapW: 170,
});
k10(
  'hpmod.mg',
  680,
  545,
  24,
  'MG/T.EXT',
  'mod',
  0,
  'How far the modulation generator sweeps the high-pass cutoff.'
);
k10(
  'hpmod.eg2',
  680,
  652,
  24,
  'EG2/EXT',
  'mod',
  0,
  'How far envelope 2 sweeps the high-pass cutoff on each note.'
);

// ── Low-pass filter ───────────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 770,
  y: 26,
  w: 210,
  h: 432,
  r: 10,
  label: 'VOLTAGE CONTROLLED\nLOWPASS FILTER',
  labelAt: 'top',
  labelSize: 13,
  gapW: 180,
});
k10(
  'lpf.cutoff',
  890,
  150,
  32,
  'CUTOFF\nFREQUENCY',
  'filter',
  7,
  'Removes everything above this frequency. Turn it down and the sound gets darker and duller; turn it up and the full buzz of the oscillators comes through.',
  { fmt: (v) => fmtHz(lpHz(v)) }
);
k10(
  'lpf.peak',
  890,
  330,
  32,
  'PEAK',
  'filter',
  0,
  'Resonance for the low-pass filter. Past about 7 the filter starts to scream, which is what this instrument is known for.'
);
controls.push({
  id: 'lpf.type',
  type: 'slide',
  orient: 'v',
  x: 794,
  y: 300,
  w: 22,
  h: 58,
  kind: 'enum',
  module: 'filter',
  options: [
    { v: '1', label: 'FILTER 1' },
    { v: '2', label: 'FILTER 2' },
  ],
  def: '1',
  label: 'Filter type',
  labelPos: 'none',
  help: 'Picks between two filter circuits. FILTER 2 is the more aggressive of the two: it distorts sooner and screams harder when PEAK is up. The switch governs both filters, not just the low-pass.',
});
text(794, 258, 'FILTER 1', 10);
text(794, 378, 'FILTER 2', 10);

decor.push({
  t: 'frame',
  x: 770,
  y: 470,
  w: 210,
  h: 265,
  r: 10,
  label: 'CUTOFF FREQUENCY\nMODULATION',
  labelAt: 'top',
  labelSize: 12,
  gapW: 170,
});
k10(
  'lpmod.mg',
  875,
  545,
  24,
  'MG/T.EXT',
  'mod',
  0,
  'How far the modulation generator sweeps the low-pass cutoff. This is the wah and the wobble.'
);
k10(
  'lpmod.eg2',
  875,
  652,
  24,
  'EG2/EXT',
  'mod',
  0,
  'How far envelope 2 sweeps the low-pass cutoff on each note. This is the usual filter pluck or swell.'
);

// ── MIDI and the amplifier block ──────────────────────────────────────────
text(1062, 52, 'MIDI IN', 15);
decor.push({ t: 'din', x: 1062, y: 118, r: 46 });
decor.push({
  t: 'logo',
  x: 1232,
  y: 120,
  size: 22,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
decor.push({
  t: 'frame',
  x: 986,
  y: 198,
  w: 338,
  h: 110,
  r: 10,
  label: 'VOLTAGE CONTROLLED AMPLIFIER',
  labelAt: 'top',
  labelSize: 13,
  gapW: 250,
});
decor.push({ t: 'path', d: 'M1120 244 L1176 268 L1120 292 Z', w: 1.6 });
wire('M1040 268 H1118 M1178 268 H1270');
text(1155, 232, 'EG 2 & EXT', 11);

// ── Modulation generator ──────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 986,
  y: 320,
  w: 152,
  h: 410,
  r: 10,
  label: 'MODULATION\nGENERATOR',
  labelAt: 'top',
  labelSize: 13,
  gapW: 140,
});
decor.push({ t: 'led', x: 1062, y: 392, r: 6, color: 'red', litWhen: 'lfo' });
knob('mg.wave', 1062, 476, 28, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  label: 'WAVE FORM',
  labelPos: 'bottom',
  labelSize: 12,
  module: 'lfo',
  scale: S10,
  fmt: mgWaveName,
  help: 'One knob shapes both modulation generator outputs at once. Sweeping it takes the first output from reverse sawtooth through triangle to sawtooth, and the second from a wide pulse through square to a narrow one.',
});
k10(
  'mg.freq',
  1062,
  636,
  28,
  'FREQUENCY',
  'lfo',
  4,
  'Speed of the modulation generator, from about one cycle every ten seconds up to 22 Hz.',
  { fmt: (v) => fmtHz(mgHz(v)), labelSize: 12 }
);

// ── Envelope generator 1 ──────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 1144,
  y: 320,
  w: 180,
  h: 410,
  r: 10,
  label: 'ENVELOPE\nGENERATOR 1',
  labelAt: 'top',
  labelSize: 13,
  gapW: 140,
});
decor.push({ t: 'led', x: 1296, y: 350, r: 6, color: 'red', litWhen: 'gate' });
k10(
  'eg1.delay',
  1234,
  412,
  24,
  'DELAY TIME',
  'env',
  0,
  'How long envelope 1 waits after a note is played before it starts to rise. Use it to make a pitch sweep arrive part way through a held note.',
  { fmt: (v) => (v <= 0 ? 'none' : fmtTime(eg1Dly(v))), labelSize: 11 }
);
k10(
  'eg1.attack',
  1234,
  535,
  24,
  'ATTACK TIME',
  'env',
  0,
  'How long envelope 1 takes to reach full once it starts.',
  { fmt: (v) => fmtTime(eg1Att(v)), labelSize: 11 }
);
k10(
  'eg1.release',
  1234,
  658,
  24,
  'RELEASE TIME',
  'env',
  3,
  'How long envelope 1 takes to fall back to zero after you let go.',
  { fmt: (v) => fmtTime(eg1Rel(v)), labelSize: 11 }
);

// ── Envelope generator 2 ──────────────────────────────────────────────────
decor.push({
  t: 'frame',
  x: 1330,
  y: 26,
  w: 164,
  h: 704,
  r: 10,
  label: 'ENVELOPE\nGENERATOR 2',
  labelAt: 'top',
  labelSize: 13,
  gapW: 140,
});
decor.push({ t: 'led', x: 1468, y: 56, r: 6, color: 'red', litWhen: 'gate' });
k10(
  'eg2.hold',
  1410,
  105,
  24,
  'HOLD TIME',
  'env',
  0,
  'How long envelope 2 stays at full after the attack before the decay begins.',
  { fmt: (v) => (v <= 0 ? 'none' : fmtTime(eg2Hold(v))), labelSize: 11 }
);
k10(
  'eg2.attack',
  1410,
  243,
  24,
  'ATTACK TIME',
  'env',
  0,
  'How long the note takes to reach full loudness and brightness. Near zero it starts instantly; higher values fade it in.',
  { fmt: (v) => fmtTime(eg2Att(v)), labelSize: 11 }
);
k10(
  'eg2.decay',
  1410,
  381,
  24,
  'DECAY TIME',
  'env',
  4,
  'How long it takes to fall from the peak to the sustain level.',
  { fmt: (v) => fmtTime(eg2Dec(v)), labelSize: 11 }
);
k10(
  'eg2.sustain',
  1410,
  519,
  24,
  'SUSTAIN LEVEL',
  'env',
  8,
  'The level held for as long as the key is down. At 0 every note dies away by itself.',
  { labelSize: 11 }
);
k10(
  'eg2.release',
  1410,
  657,
  24,
  'RELEASE TIME',
  'env',
  3,
  'How long the note takes to fade after you let go.',
  { fmt: (v) => fmtTime(eg2Rel(v)), labelSize: 11 }
);

// ══ PATCH PANEL ═══════════════════════════════════════════════════════════
// Band A — the signal path, its six modulation inputs, and the output.
const CHAIN: [x: number, t: string][] = [
  [1506, 'VOLTAGE\nCONTROLLED\nOSCILLATOR 1'],
  [1610, 'VOLTAGE\nCONTROLLED\nOSCILLATOR 2'],
  [1714, 'VCO\nMIXER'],
  [1818, 'VOLTAGE\nCONTROLLED\nHP FILTER'],
  [1922, 'VOLTAGE\nCONTROLLED\nLP FILTER'],
  [2026, 'VOLTAGE\nCONTROLLED\nAMPLIFIER'],
];
CHAIN.forEach(([x, t], i) => {
  blk(x, 34, 96, 58, t);
  if (i) wire(`M${x - 8} 63 H${x} M${x - 5} 60 L${x} 63 L${x - 5} 66`);
});
wire('M2122 63 H2160');
(
  [
    [1554, '−5 V ~ +5 V'],
    [1658, '−5 V ~ +5 V'],
    [1762, '3 VPP MAX'],
    [1866, '−5 V ~ +5 V'],
    [1970, '−5 V ~ +5 V'],
    [2074, '0 V ~ +5 V'],
  ] as [x: number, volts: string][]
).forEach(([x, volts]) => {
  wire(`M${x} 92 V128`);
  text(x, 182, volts, 9);
});
decor.push({ t: 'led', x: 2160, y: 150, r: 6, color: 'amber', litWhen: 'power' });
text(2160, 176, 'ON', 10);

knob('out.volume', 2225, 100, 38, {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  label: 'VOLUME',
  labelPos: 'top',
  labelSize: 15,
  module: 'out',
  scale: S10,
  help: 'Overall output level of the synthesizer.',
});

// Band B — the modulation sources, the pitch CV column and the triggers.
blk(1560, 233, 132, 46, 'MODULATION\nGENERATOR');
blk(1830, 233, 122, 46, 'ENVELOPE\nGENERATOR 1');
blk(1830, 308, 122, 46, 'ENVELOPE\nGENERATOR 2');
wire('M1530 279 V262 H1560 M1692 262 H1720 V279');
wire('M1800 279 V262 H1830 M1952 262 H1980 V279');
wire('M1952 331 H1985');
decor.push({ t: 'wave', x: 1522, y: 330, size: 9, shape: 'sq' });
text(1720, 297, '+5 V / 0 V', 9);

// Band C — sample and hold, the spare VCA, noise and the manual trigger.
blk(1560, 418, 130, 44, 'SAMPLE\n& HOLD');
blk(1830, 418, 72, 44, 'VCA');
blk(2040, 418, 128, 44, 'NOISE\nGENERATOR');
wire('M1530 462 V440 H1560 M1690 440 H1720 V462');
wire('M1800 462 V440 H1830 M1902 440 H1930 V462');
wire('M2010 462 V440 H2040 M2168 440 H2185 V462');
wire('M1866 418 V372 H1790 V348');
controls.push({
  id: 'trig.sw',
  type: 'button',
  x: 2320,
  y: 440,
  w: 36,
  h: 36,
  kind: 'bool',
  def: false,
  module: 'util',
  label: 'TRIG SW',
  labelPos: 'top',
  labelSize: 11,
  help: 'Fires a trigger by hand, which appears at TRIG SW OUT. On the hardware, pressing it four times quickly at power-up toggles poly chain mode.',
});

// Band D — external signal processor.
decor.push({
  t: 'frame',
  x: 1500,
  y: 512,
  w: 876,
  h: 226,
  r: 10,
  label: 'EXTERNAL SIGNAL PROCESSOR',
  labelAt: 'top',
  labelSize: 14,
  gapW: 250,
});
decor.push({ t: 'path', d: 'M1588 568 L1640 585 L1588 602 Z', w: 1.4 });
text(1614, 618, 'AMP', 9);
blk(1715, 565, 124, 40, 'BAND PASS\nFILTER');
blk(1910, 565, 108, 40, 'F–V\nCONVERTER');
blk(2085, 565, 124, 40, 'ENVELOPE\nFOLLOWER');
wire(
  'M1562 585 H1588 M1640 585 H1680 M1698 585 H1715 M1839 585 H1858 M1876 585 H1910 M2018 585 H2032 M2050 602 V620 H2067 M2067 585 H2085 M2209 585 H2228 M2246 585 H2298'
);
wire('M1858 585 V620 H2067 V602');

// ── Jacks ─────────────────────────────────────────────────────────────────
jackIn('j.total', 1554, 145, 'TOTAL', {
  dest: 'multIn',
  amt: 1,
  hear: (_v, x) =>
    `${cap(x.src)} takes the place of the modulation generator in all four MG/T.EXT knobs at once — pitch, high-pass cutoff and low-pass cutoff. How much of it reaches each one is still set by that section’s own MG/T.EXT knob.`,
  check: (v) =>
    num(v, 'fmod.mg') <= 0 && num(v, 'hpmod.mg') <= 0 && num(v, 'lpmod.mg') <= 0
      ? 'Every MG/T.EXT knob is at 0, so nothing reaches the oscillators or the filters. Turn one of them up.'
      : null,
  help: 'Replaces the modulation generator as the source for all four MG/T.EXT depth knobs at once. One cable here re-sources both oscillators and both filters.',
});
jackIn('j.freq', 1658, 145, 'FREQ', {
  dest: 'sum1A',
  amt: 1,
  hear: (_v, x) =>
    `${cap(x.src)} takes the place of envelope 1 at the EG1/EXT knob under the VCO mixer, so it moves the pitch of both oscillators. The EG1/EXT knob sets how far.`,
  check: (v) =>
    num(v, 'fmod.eg1') <= 0
      ? 'The EG1/EXT frequency knob is at 0. Turn it up to hear this cable.'
      : null,
  help: 'Replaces envelope 1 in the EG1/EXT frequency depth knob, so something else sweeps the pitch of both oscillators.',
});
jackIn('j.extIn', 1762, 145, 'EXT SIGNAL IN', {
  dest: 'vcfIn',
  amt: 1,
  add: true,
  help: 'Audio straight into the filter chain, joining the oscillator mix at the high-pass input. Use it to filter the noise generator, the external signal processor, or the synth’s own output.',
});
jackIn('j.cutoffHp', 1866, 145, 'CUTOFF FREQ', {
  name: 'CUTOFF FREQ (high-pass)',
  dest: 'sum2A',
  amt: 1,
  hear: (_v, x) =>
    `${cap(x.src)} takes the place of envelope 2 at the high-pass EG2/EXT knob, so it sweeps the high-pass cutoff. That knob sets how far.`,
  check: (v) =>
    num(v, 'hpmod.eg2') <= 0
      ? 'The high-pass EG2/EXT knob is at 0. Turn it up to hear this cable.'
      : null,
  help: 'Replaces envelope 2 in the high-pass EG2/EXT depth knob.',
});
jackIn('j.cutoffLp', 1970, 145, 'CUTOFF FREQ', {
  name: 'CUTOFF FREQ (low-pass)',
  dest: 'att1In',
  amt: 1,
  hear: (_v, x) =>
    `${cap(x.src)} takes the place of envelope 2 at the low-pass EG2/EXT knob, so it sweeps the low-pass cutoff. That knob sets how far.`,
  check: (v) =>
    num(v, 'lpmod.eg2') <= 0
      ? 'The low-pass EG2/EXT knob is at 0. Turn it up to hear this cable.'
      : null,
  help: 'Replaces envelope 2 in the low-pass EG2/EXT depth knob. This is the socket for a sequencer, a second envelope or a slow sweep on the main filter.',
});
jackIn('j.initialGain', 2074, 145, 'INITIAL GAIN', {
  dest: 'amp',
  amt: 1,
  add: true,
  help: 'Voltage control of loudness, added to envelope 2. Patch the modulation generator here for tremolo, or a steady voltage to hold the amplifier open as a drone.',
});
jackOut('j.signalOut', 2330, 55, 'SIGNAL OUT', {
  signal: 'out',
  help: 'The main output. Patch it back into EXT SIGNAL IN or the external signal processor for feedback tricks.',
});
jackOut('j.phones', 2330, 160, 'PHONES', {
  signal: 'out',
  help: 'Headphone output, carrying the same signal as SIGNAL OUT.',
});

jackOut('j.mgTri', 1530, 262, 'OUT', {
  name: 'MG OUT (reverse saw / triangle / saw)',
  signal: 'lfo',
  help: 'The modulation generator’s first output, shaped by the WAVE FORM knob. It swings both ways around zero, so it is the one to use for vibrato and filter sweeps.',
});
jackOut('j.mgPulse', 1720, 262, 'OUT', {
  name: 'MG OUT (pulse)',
  signal: 'lfoSq',
  help: 'The modulation generator’s second output, a pulse that never goes below zero. Use it as a clock for the sample and hold, or as a trigger.',
});
jackOut('j.eg1Out', 1800, 262, 'OUT', {
  name: 'EG 1 OUT',
  signal: 'env1',
  help: 'Envelope 1 as a voltage: it rises after the DELAY time, holds while the key is down and falls on release.',
});
jackOut('j.eg1Rev', 1980, 262, 'REV OUT', {
  name: 'EG 1 REV OUT',
  signal: null,
  help: 'Envelope 1 upside down: it falls where the normal output rises. This app does not model the inverted output, so the cable can be drawn but does nothing.',
});
jackOut('j.kbdCv', 2065, 262, 'KBD CV OUT', {
  signal: 'kbd',
  help: 'The pitch voltage of the note being played, for driving other gear or patching back in.',
});
jackIn('j.vco12Cv', 2170, 262, 'VCO 1+2 CV IN', {
  dest: 'pitchAll',
  amt: 24,
  add: true,
  help: 'Pitch control voltage for both oscillators. On the hardware it substitutes for the keyboard; here it adds to whatever note you play.',
});
jackIn('j.vco2Cv', 2275, 262, 'VCO 2 CV IN', {
  dest: 'pitch2',
  amt: 24,
  add: true,
  help: 'Pitch control voltage for Oscillator 2 alone, which is how the second oscillator is sequenced or detuned independently.',
});

jackIn('j.shClock', 1560, 330, 'CLOCK', {
  dest: 'shClock',
  amt: 1,
  help: 'Tells the sample and hold when to take a reading. With nothing patched it runs from its own internal clock.',
});
jackIn('j.eg1Trig', 1660, 330, 'EG1 TRIG IN', {
  dest: 'gate1',
  amt: 1,
  help: 'Fires envelope 1 on its own, separately from the keyboard. Patch the modulation generator’s pulse output here and envelope 1 repeats in time while you hold a note.',
});
jackIn('j.vcaCtrl', 1790, 330, 'CONTROL INPUT', {
  dest: 'att1CV',
  amt: 1,
  help: 'Gain control for the spare VCA on the patch panel. Whatever reaches it decides how much of the VCA’s input gets through.',
});
jackOut('j.eg2Rev', 2015, 330, 'REV OUT', {
  name: 'EG 2 REV OUT',
  signal: null,
  help: 'Envelope 2 upside down. There is no jack for envelope 2 the right way up. This app does not model the inverted output, so the cable does nothing.',
});
jackIn('j.trigIn', 2170, 330, 'TRIG IN', {
  dest: 'gateIn',
  amt: 1,
  help: 'An external trigger, taking over from the keyboard’s own. Both envelopes follow it.',
});
jackOut('j.trigOut', 2275, 330, 'TRIG OUT', {
  signal: 'gate',
  help: 'The trigger that fires the envelopes, tapped for other gear.',
});

jackIn('j.shIn', 1530, 440, 'IN', {
  name: 'S&H IN',
  dest: 'shIn',
  amt: 1,
  help: 'The signal the sample and hold takes its readings from. With nothing patched it reads noise, which gives random steps.',
});
jackOut('j.shOut', 1720, 440, 'OUT', {
  name: 'S&H OUT',
  signal: 'sh',
  help: 'The stepped output of the sample and hold. Patch it to pitch for a random melody, or to a cutoff jack for burbling.',
});
jackIn('j.vcaIn', 1800, 440, 'IN', {
  name: 'VCA IN',
  dest: 'att1In',
  amt: 1,
  help: 'Input of the spare VCA on the patch panel. It takes audio or control voltages.',
});
jackOut('j.vcaOut', 1930, 440, 'OUT', {
  name: 'VCA OUT',
  signal: 'att1',
  help: 'Output of the spare VCA: its input, scaled by whatever reaches CONTROL INPUT.',
});
jackOut('j.noisePink', 2010, 440, 'PINK', {
  signal: 'noise',
  help: 'Pink noise: less hiss on top than white, closer to wind or surf.',
});
jackOut('j.noiseWhite', 2185, 440, 'WHITE', {
  signal: 'noise',
  help: 'White noise: every frequency at once, bright and hissy. Good for cymbals, snares and wind.',
});
jackOut('j.trigSwOut', 2255, 440, 'TRIG SW OUT', {
  signal: null,
  help: 'The output of the TRIG SW button beside it. This app fires notes from the keyboard rather than the button, so the cable does nothing.',
});

jackIn('j.espIn', 1545, 585, 'SIGNAL IN', {
  dest: 'preampIn',
  amt: 1,
  help: 'External audio into the signal processor. In this app the thing to patch here is the synth’s own SIGNAL OUT, which turns the envelope follower into a second envelope that tracks what you play.',
});
jackOut('j.espOutPre', 1689, 585, 'OUT', {
  name: 'ESP OUT (before the filter)',
  signal: 'preamp',
  help: 'The external signal after the preamp, before the band-pass filter.',
});
jackOut('j.espOutPost', 1867, 585, 'OUT', {
  name: 'ESP OUT (after the filter)',
  signal: 'preamp',
  help: 'The external signal after the band-pass filter. This app does not model the band-pass, so it carries the same signal as the OUT before it.',
});
jackOut('j.espFvOut', 2041, 585, 'F∝V CV OUT', {
  signal: null,
  help: 'A pitch voltage worked out from the external signal, for playing the oscillators from a voice or an instrument. Pitch extraction is not modelled here, so the cable does nothing.',
});
jackOut('j.espEnvOut', 2228, 585, 'ENV OUT', {
  signal: 'envf',
  help: 'The envelope follower: a voltage that rises and falls with the loudness of whatever is at SIGNAL IN. Patch it to a cutoff jack and one sound shapes another.',
});
jackOut('j.espTrigOut', 2315, 585, 'TRIG OUT', {
  name: 'TRIG OUT (ESP)',
  signal: null,
  help: 'A trigger produced whenever the external signal crosses the THRESHOLD LEVEL. Not modelled in this app.',
});

k10(
  'esp.level',
  1560,
  680,
  26,
  'SIGNAL LEVEL',
  'util',
  5,
  'Input gain for the external signal. Turn it up until the envelope follower reacts properly.',
  { labelSize: 11 }
);
k10(
  'esp.lowCut',
  1730,
  680,
  26,
  'LOW CUT FREQ',
  'util',
  2,
  'The lower edge of the band-pass filter inside the signal processor. This app does not model the band-pass, so the knob is here for reference only.',
  { labelSize: 11 }
);
k10(
  'esp.highCut',
  1900,
  680,
  26,
  'HIGH CUT FREQ',
  'util',
  8,
  'The upper edge of the band-pass filter. Not modelled in this app.',
  { labelSize: 11 }
);
k10(
  'esp.cvAdjust',
  2070,
  680,
  26,
  'CV ADJUST',
  'util',
  5,
  'Scales the pitch voltage the frequency-to-voltage converter produces, which is how an outside instrument is made to play the oscillators in tune. Not modelled in this app.',
  { labelSize: 11 }
);
k10(
  'esp.threshold',
  2230,
  680,
  26,
  'THRESHOLD LEVEL',
  'util',
  5,
  'How loud the external signal has to get before a trigger is produced. Not modelled in this app.',
  { labelSize: 11 }
);

// ── Areas ─────────────────────────────────────────────────────────────────
const areas: Area[] = [
  {
    id: 'vco1',
    label: 'Oscillator 1',
    module: 'osc',
    keywords: 'vco waveform triangle pulse noise octave feet scale pw width',
    rects: [{ x: 40, y: 20, w: 206, h: 520 }],
    help: 'The first oscillator. WAVE FORM picks the raw tone, and its fourth position swaps the oscillator for noise. PW thins out the pulse wave. SCALE sets the octave in organ-pipe feet.',
  },
  {
    id: 'porta',
    label: 'Portamento',
    module: 'glide',
    keywords: 'glide slide legato time',
    rects: [{ x: 40, y: 545, w: 206, h: 200 }],
    help: 'Makes the pitch slide from one note to the next instead of jumping. TIME sets how slow the slide is.',
  },
  {
    id: 'vco2',
    label: 'Oscillator 2',
    module: 'osc',
    keywords: 'vco waveform square narrow pulse ring modulation detune octave',
    rects: [{ x: 248, y: 20, w: 190, h: 520 }],
    help: 'The second oscillator, tuned against the first with PITCH. Its waveform switch has a RING position that replaces the oscillator with the two multiplied together, for clangy, bell-like tones. Its SCALE range sits an octave above Oscillator 1’s.',
  },
  {
    id: 'tune',
    label: 'Master tune',
    module: 'osc',
    keywords: 'tuning pitch reference concert',
    rects: [{ x: 248, y: 545, w: 190, h: 200 }],
    help: 'Tunes the whole instrument up or down by a couple of semitones, for playing with other instruments.',
  },
  {
    id: 'mixer',
    label: 'VCO mixer',
    module: 'mixer',
    keywords: 'level volume balance blend',
    rects: [{ x: 444, y: 20, w: 148, h: 440 }],
    help: 'Sets how loud each oscillator is going into the filters. Push both up and the filters start to distort, which thickens the tone.',
  },
  {
    id: 'fmod',
    label: 'Frequency modulation',
    module: 'mod',
    keywords: 'vibrato pitch sweep fm depth mg eg1 total freq',
    rects: [{ x: 444, y: 465, w: 148, h: 280 }],
    help: 'How much the two modulation sources move the pitch of both oscillators. MG/T.EXT is the modulation generator — vibrato at slow rates, growl at fast ones. EG1/EXT is envelope 1, for blips and sweeps at the start of a note. Patching TOTAL or FREQ on the patch panel puts something else in their place.',
  },
  {
    id: 'hpf',
    label: 'High-pass filter',
    module: 'filter',
    keywords: 'highpass cutoff peak resonance thin nasal bass cut',
    rects: [{ x: 596, y: 20, w: 168, h: 440 }],
    help: 'Removes the bass. CUTOFF FREQUENCY sets where it starts cutting, and PEAK adds a resonant boost right at that point. Two filters in series is what makes this instrument sound like it does: the pair can be closed in on each other to leave a narrow, vocal band.',
  },
  {
    id: 'hpmod',
    label: 'High-pass cutoff modulation',
    module: 'mod',
    keywords: 'sweep wah depth mg eg2',
    rects: [{ x: 596, y: 465, w: 168, h: 280 }],
    help: 'How far the modulation generator and envelope 2 sweep the high-pass cutoff. Patching the high-pass CUTOFF FREQ jack puts something else in envelope 2’s place.',
  },
  {
    id: 'lpf',
    label: 'Low-pass filter',
    module: 'filter',
    keywords: 'lowpass cutoff peak resonance brightness scream filter 1 2 korg 35',
    rects: [{ x: 768, y: 20, w: 214, h: 440 }],
    help: 'The main tone control. CUTOFF FREQUENCY sets how bright the sound is and PEAK adds resonance; past about 7 it screams. The FILTER 1 / FILTER 2 switch picks between two circuits, the second more aggressive than the first, and it governs the high-pass filter too.',
  },
  {
    id: 'lpmod',
    label: 'Low-pass cutoff modulation',
    module: 'mod',
    keywords: 'sweep wah wobble depth mg eg2 pluck',
    rects: [{ x: 768, y: 465, w: 214, h: 280 }],
    help: 'How far the modulation generator and envelope 2 sweep the low-pass cutoff. EG2/EXT is the usual filter pluck or swell; MG/T.EXT is the wobble.',
  },
  {
    id: 'midi',
    label: 'MIDI in',
    module: 'out',
    keywords: 'din connect keyboard sequencer computer channel',
    rects: [{ x: 986, y: 20, w: 338, h: 172 }],
    help: 'Where a keyboard, sequencer or computer connects on the hardware; the channel is set by switches on the back. In this app the on-screen keyboard plays the synth instead.',
  },
  {
    id: 'vca',
    label: 'Amplifier',
    module: 'amp',
    keywords: 'vca loudness gain volume envelope',
    rects: [{ x: 986, y: 195, w: 338, h: 120 }],
    help: 'The amplifier that turns each note on and off. It has no controls of its own: envelope 2 opens it, and the INITIAL GAIN jack on the patch panel adds to that.',
  },
  {
    id: 'mg',
    label: 'Modulation generator',
    module: 'lfo',
    keywords: 'lfo low frequency oscillator vibrato wobble rate shape morph',
    rects: [{ x: 986, y: 318, w: 152, h: 427 }],
    help: 'The LFO. FREQUENCY sets the speed. WAVE FORM shapes both of its outputs at once: the first sweeps from reverse sawtooth through triangle to sawtooth, and the second from a wide pulse through square to a narrow pulse. Both are live on the patch panel at all times.',
  },
  {
    id: 'eg1',
    label: 'Envelope generator 1',
    module: 'env',
    keywords: 'delay attack release pitch envelope contour',
    rects: [{ x: 1144, y: 318, w: 180, h: 427 }],
    help: 'The simpler of the two envelopes: DELAY, ATTACK and RELEASE only. It is wired to oscillator pitch through the EG1/EXT knob, which is what the delay is for — a sweep that arrives part way through a held note.',
  },
  {
    id: 'eg2',
    label: 'Envelope generator 2',
    module: 'env',
    keywords: 'hold attack decay sustain release adsr loudness filter contour',
    rects: [{ x: 1330, y: 20, w: 166, h: 725 }],
    help: 'The main envelope. It opens the amplifier on every note, and the two EG2/EXT knobs decide how far it also sweeps each filter. HOLD keeps it at full for a while before the decay begins.',
  },
  {
    id: 'patchsig',
    label: 'Patch panel — signal path',
    module: 'patch',
    keywords: 'jacks sockets total freq external cutoff initial gain block diagram',
    rects: [{ x: 1496, y: 18, w: 646, h: 195 }],
    help: 'The printed diagram of the voice, with a socket under each place you can interrupt it. TOTAL and FREQ re-source the pitch modulation, the two CUTOFF FREQ jacks re-source each filter’s envelope, EXT SIGNAL IN adds audio at the filters and INITIAL GAIN adds to the amplifier.',
  },
  {
    id: 'out',
    label: 'Volume and outputs',
    module: 'out',
    keywords: 'volume level headphones phones signal out power',
    rects: [{ x: 2146, y: 18, w: 220, h: 195 }],
    help: 'Overall VOLUME, the main SIGNAL OUT socket and a headphone socket. The lamp beside them shows the instrument is on.',
  },
  {
    id: 'patchmod',
    label: 'Patch panel — modulation and triggers',
    module: 'patch',
    keywords: 'mg out envelope out kbd cv trigger pitch voltage',
    rects: [{ x: 1496, y: 215, w: 880, h: 150 }],
    help: 'Outputs for the modulation generator and the envelopes, the keyboard’s own pitch and trigger voltages, and inputs that let something else play the oscillators or fire the envelopes.',
  },
  {
    id: 'patchutil',
    label: 'Patch panel — utilities',
    module: 'util',
    keywords: 'sample hold random vca noise pink white manual trigger switch',
    rects: [{ x: 1496, y: 367, w: 880, h: 140 }],
    help: 'The extras: a sample and hold for random stepped voltages, a spare VCA you can put anywhere, pink and white noise, and a button that fires a trigger by hand.',
  },
  {
    id: 'esp',
    label: 'External signal processor',
    module: 'util',
    keywords:
      'preamp band pass envelope follower frequency to voltage trigger threshold guitar microphone',
    rects: [{ x: 1496, y: 510, w: 880, h: 238 }],
    help: 'Turns an outside sound into things the synth can use: a preamp, a band-pass filter, a pitch voltage, an envelope follower and a trigger. In this app the sound to feed it is the synth’s own output, patched from SIGNAL OUT round to SIGNAL IN.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const P = ctx.patched;
  const wheel = clamp(ctx.wheel || 0, 0, 1);
  // TOTAL, FREQ and the two CUTOFF FREQ jacks substitute for the normalled source at a depth knob. Each is
  // parked on a spare utility input so the cable has somewhere to land, and read back here as its signal.
  const mgSrc = P['j.total'] ? 'mult' : 'lfo';
  const fmEg = P['j.freq'] ? 'sum1' : 'env1';
  const hpEg = P['j.cutoffHp'] ? 'sum2' : 'env2';
  const lpEg = P['j.cutoffLp'] ? 'att1' : 'env2';

  const w1 = String(v['vco1.wave']);
  const w2 = String(v['vco2.wave']);
  const tune = (num(v, 'tune.master') / 5) * 2.5;
  const lvl1 = level10(num(v, 'mix.vco1'), 0.9);
  const lvl2 = level10(num(v, 'mix.vco2'), 0.9);
  const osc = [
    {
      level: w1 === 'noise' ? 0 : lvl1,
      mix: WAVE1[w1],
      pw: clamp(0.5 - (num(v, 'vco1.pw') / 10) * 0.42, 0.06, 0.94),
      semi: SCALE1[String(v['vco1.scale'])] + tune,
      kbd: true,
      fixedNote: 60,
      syncTo: -1,
    },
    {
      level: w2 === 'ring' ? 0 : lvl2,
      mix: WAVE2[w2],
      pw: PW2[w2],
      semi: SCALE2[String(v['vco2.scale'])] + (num(v, 'vco2.pitch') / 5) * 12 + tune,
      kbd: true,
      fixedNote: 60,
      syncTo: -1,
    },
  ];

  const routes: EngineRoute[] = [];
  const add = (src: string, dst: string, amt: number): void => {
    if (Math.abs(amt) > 0.0002) routes.push({ src, dst, amt });
  };
  // The mod wheel turns the FREQUENCY MG/T.EXT knob on top of where you left it. The MS-20 keyboard has no
  // wheel, so this stands in for riding that knob by hand while a note sounds.
  add(mgSrc, 'pitchAll', dep(clamp(num(v, 'fmod.mg') + wheel * 10, 0, 10), 12));
  add(fmEg, 'pitchAll', dep(num(v, 'fmod.eg1'), 24));
  add(mgSrc, 'cutoffHp', dep(num(v, 'hpmod.mg'), 6));
  add(hpEg, 'cutoffHp', dep(num(v, 'hpmod.eg2'), 7));
  add(mgSrc, 'cutoff', dep(num(v, 'lpmod.mg'), 6));
  add(lpEg, 'cutoff', dep(num(v, 'lpmod.eg2'), 8));
  if (w2 === 'ring') add('ring', 'vcfIn', lvl2);

  const f2 = v['lpf.type'] === '2';
  return {
    osc,
    oscOuts: true,
    noise: {
      level: w1 === 'noise' ? level10(num(v, 'mix.vco1'), 0.8) : 0,
      color: 'white',
      tone: 0.9,
      gain: 1,
    },
    ext: { level: 0 },
    hpf: {
      cutoff: hpHz(num(v, 'hpf.cutoff')),
      res: peak(num(v, 'hpf.peak')),
      envAmt: 0,
      envSrc: 'env2',
      kbd: 0,
    },
    filter: {
      type: 'ladder',
      mode: 'lp',
      cutoff: lpHz(num(v, 'lpf.cutoff')),
      res: peak(num(v, 'lpf.peak')),
      envAmt: 0,
      envSrc: 'env2',
      kbd: 0,
      drive: f2 ? 1.3 : 0.85,
    },
    // EG1 is delay–attack–release: it climbs to full and stays there until the key is let go.
    env1: {
      a: eg1Att(num(v, 'eg1.attack')),
      d: 0.01,
      s: 1,
      r: eg1Rel(num(v, 'eg1.release')),
      dly: eg1Dly(num(v, 'eg1.delay')),
    },
    env2: {
      a: eg2Att(num(v, 'eg2.attack')),
      d: eg2Dec(num(v, 'eg2.decay')),
      s: num(v, 'eg2.sustain') / 10,
      r: eg2Rel(num(v, 'eg2.release')),
      hold: eg2Hold(num(v, 'eg2.hold')),
    },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: { rate: mgHz(num(v, 'mg.freq')), mix: mgMix(num(v, 'mg.wave')), keySync: false },
    glide: { time: portaS(num(v, 'porta.time')), legato: false },
    trig: { retrig: false, drone: false, repeat: false, src: ['gate', 'gate'] },
    paraphonic: false,
    routes,
    normals: {
      ringA: RING_A[w1],
      ringB: 'o2saw',
      gateIn: 'gate',
      envfIn: 'preamp',
      att1CV: 'one',
    },
    ring: { ac: true },
    preamp: { gain: level10(num(v, 'esp.level'), 6) },
    envf: { sens: 1.6 },
    od: { on: false },
    delay: { on: false },
    sh: { rate: 6, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 0,
    volume: level10(num(v, 'out.volume'), 1.1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const k2: SynthDef & { version: number } = {
  id: 'k2',
  version: 1,
  name: 'K-2',
  maker: 'Behringer',
  year: 2019,
  heritage: 'Modelled on the 1978 Korg MS-20',
  summary:
    'Two oscillators into a mixer, then a resonant high-pass and a resonant low-pass in series, then the amplifier. Two envelopes and one modulation generator are wired in already, and a 27-socket patch panel lets you take any of it apart.',
  view: { w: 2400, h: 762 },
  theme: {
    panel: '#121316',
    panel2: '#0a0b0d',
    ink: '#e8c34a',
    font: 'din',
    weight: 600,
    cheeks: 'wood',
    cheekW: 28,
    jack: 'black',
  },
  signalNames: {
    lfo: 'the modulation generator',
    lfoSq: 'the modulation generator’s pulse output',
    env1: 'envelope 1',
    env2: 'envelope 2',
    vcfHp: 'the high-pass filter output',
    vcf1: 'the low-pass filter output',
    mixer: 'the VCO mixer output',
    sh: 'the sample and hold',
    att1: 'the patch-panel VCA',
    mult: 'whatever is patched into TOTAL',
    sum1: 'whatever is patched into FREQ',
    sum2: 'whatever is patched into the high-pass CUTOFF FREQ jack',
    preamp: 'the external signal processor’s preamp',
    envf: 'the envelope follower',
    gate: 'the key trigger',
  },
  destNames: {
    multIn: 'the MG/T.EXT modulation bus',
    sum1A: 'the EG1/EXT frequency depth knob',
    sum2A: 'the high-pass EG2/EXT depth knob',
    att1In: 'the patch-panel VCA',
    cutoffHp: 'the high-pass cutoff',
    cutoff: 'the low-pass cutoff',
    vcfIn: 'the filter chain',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default k2;
