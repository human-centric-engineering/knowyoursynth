/**
 * Behringer Neutron: the definition (D1). Coordinates: faceplate crop of the 1200×1200 product
 * photo, ×2 (panel x = (photoX − 75) × 2, y = (photoY − 445) × 2).
 *
 * Transliterated from the prototype file `src/synths/neutron.js` (D3), the way `defs/model-d.ts`
 * was: no content (sounds, lineage, unusual notes), a `version`, the maker's marks tagged
 * `brand`, and panel values read through `num()`.
 */
import type {
  Area,
  ButtonControl,
  Control,
  ControlCommon,
  ControlValues,
  Decor,
  EngineContext,
  EngineParams,
  InputJack,
  Jack,
  KnobStyle,
  LedColor,
  LitWhen,
  OutputJack,
  SynthDef,
  WaveShape,
} from '@/lib/app/synths/contract';
import { clamp, expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

/** `Omit` over each member of a union, so a discriminated control keeps its variants. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> & {
  def: number;
  min?: number;
  max?: number;
  fmt?: (v: number) => string;
  ring?: boolean;
};
type ButtonRest = OmitEach<
  ButtonControl,
  'id' | 'type' | 'x' | 'y' | 'w' | 'h' | 'labelPos' | 'labelSize'
> &
  Partial<Pick<ButtonControl, 'labelPos' | 'labelSize'>>;

/** A panel value as a number. A continuous control always holds one. */
const num = (v: ControlValues, id: string): number => Number(v[id]);

const OSC_SHAPES: WaveShape[] = ['tmod', 'pulse', 'saw', 'tri', 'sine'];
const OSC_SHAPE_NAMES = ['tone mod', 'pulse', 'saw', 'triangle', 'sine'];
const LFO_SHAPES: WaveShape[] = ['sine', 'tri', 'saw', 'sq', 'rsaw'];
const LFO_SHAPE_NAMES = ['sine', 'triangle', 'saw', 'square', 'reverse saw'];

/** Position 0..4 → gains for the two neighbouring shapes (linear crossfade). */
function morph(p: number, names: string[]): Record<string, number> {
  const i = Math.min(Math.floor(clamp(p, 0, 4)), names.length - 2);
  const f = clamp(p, 0, 4) - i;
  const mix: Record<string, number> = {};
  if (1 - f > 0.001) mix[names[i]] = 1 - f;
  if (f > 0.001) mix[names[i + 1]] = f;
  return mix;
}
const morphFmt =
  (names: string[]) =>
  (v: number): string => {
    const n = Math.round(v);
    if (Math.abs(v - n) < 0.06) return names[n];
    const lo = Math.floor(v);
    return `${names[lo]} → ${names[lo + 1]} ${Math.round((v - lo) * 100)}%`;
  };

const cutoffHz = (v: number): number => expMap(v / 10, 10, 15000);
const lfoHz = (v: number): number => expMap(v / 10, 0.02, 2000);
const attackS = (v: number): number => expMap(v / 10, 0.0003, 5);
const decayS = (v: number): number => expMap(v / 10, 0.0024, 10);
const releaseS = (v: number): number => expMap(v / 10, 0.0015, 6);
const delayS = (v: number): number => expMap(v / 10, 0.025, 0.64);
const shHz = (v: number): number => expMap(v / 10, 0.26, 28);
const shGlideS = (v: number): number => (v <= 0 ? 0 : expMap(v / 10, 0.0005, 1));
const slewS = (v: number): number => expMap(v / 10, 0.001, 3);
const portaS = (v: number): number => Math.pow(v / 10, 2) * 10;
const pct = (v: number): string => `${Math.round(v * 10)}%`;
const RANGE_SEMI: Record<string, number> = { 32: -24, 16: -12, 8: 0, wide: 0 };
const MODE2 = { hp: 'bp', bp: 'lp', lp: 'hp' } as const;

const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const knob = (
  id: string,
  x: number,
  y: number,
  rest: KnobRest,
  r = 26,
  style: KnobStyle = 'neutron'
): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r,
    style,
    kind: 'cont',
    min: 0,
    max: 10,
    labelPos: 'bottom',
    labelSize: 13,
    ...rest,
  });
};
const button = (id: string, x: number, y: number, rest: ButtonRest): void => {
  controls.push({
    id,
    type: 'button',
    x,
    y,
    w: 26,
    h: 26,
    labelPos: 'bottom',
    labelSize: 11,
    ...rest,
  });
};
const text = (x: number, y: number, t: string, size = 12): void => {
  decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle' });
};
const led = (x: number, y: number, color: LedColor, litWhen: LitWhen | null, r = 5): void => {
  decor.push({ t: 'led', x, y, r, color, ...(litWhen ? { litWhen } : {}) });
};

// ── Faceplate artwork (hardware view only) ────────────────────────────────
// Each section is printed the way the real panel is: a band of grey pattern across the top, then a brighter red plate
// that starts on the knobs' centre line. These go down first so the frames, lamps and lettering sit on top.
const PLATE = { fill: '#e02a25', stroke: 'rgba(255,255,255,0.55)', sw: 1.5 };
const section = (x: number, y: number, w: number, h: number, splitY: number, pat: string): void => {
  decor.push(
    {
      t: 'rect',
      hw: true,
      x: x + 5,
      y: y + 5,
      w: w - 10,
      h: splitY - y + 4,
      r: 7,
      fill: `url(#${pat})`,
    },
    { t: 'rect', hw: true, x: x + 5, y: splitY, w: w - 10, h: y + h - 5 - splitY, r: 7, ...PLATE }
  );
};
// Oscillators: mesh behind the TUNE knobs, cut away on a chamfer around the logo.
decor.push(
  {
    t: 'path',
    hw: true,
    d: 'M41 92 H400 L461 31 H505 V246 H41 Z',
    fill: 'url(#kysPatMesh)',
    stroke: 'none',
    w: 0,
  },
  { t: 'path', hw: true, d: 'M41 92 H400 L461 31', w: 1.5, opacity: 0.7 },
  { t: 'rect', hw: true, x: 41, y: 236, w: 464, h: 365, r: 7, ...PLATE }
);
section(518, 26, 166, 580, 94, 'kysPatMesh');
section(692, 26, 230, 310, 94, 'kysPatStripes');
section(692, 346, 94, 124, 400, 'kysPatMesh');
section(692, 476, 94, 130, 534, 'kysPatMesh');
section(932, 26, 356, 150, 90, 'kysPatDots');
section(932, 186, 356, 150, 250, 'kysPatWaves');
section(794, 346, 494, 124, 392, 'kysPatScales');
section(794, 482, 494, 124, 528, 'kysPatScales');
section(1298, 26, 250, 150, 90, 'kysPatFine');
section(1298, 186, 250, 150, 250, 'kysPatStripes');
section(1298, 346, 250, 124, 392, 'kysPatStripes');
section(1298, 482, 250, 124, 528, 'kysPatStripes');

// ── Frames ────────────────────────────────────────────────────────────────
decor.push(
  { t: 'frame', x: 36, y: 26, w: 474, h: 580, r: 10, labelAt: 'none' },
  {
    t: 'frame',
    x: 518,
    y: 26,
    w: 166,
    h: 580,
    r: 10,
    label: 'VCF',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 60,
  },
  {
    t: 'frame',
    x: 692,
    y: 26,
    w: 230,
    h: 310,
    r: 10,
    label: 'LFO',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 60,
  },
  { t: 'frame', x: 692, y: 346, w: 94, h: 260, r: 10, labelAt: 'none' },
  {
    t: 'frame',
    x: 932,
    y: 26,
    w: 356,
    h: 150,
    r: 10,
    label: 'DELAY',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 86,
  },
  {
    t: 'frame',
    x: 932,
    y: 186,
    w: 356,
    h: 150,
    r: 10,
    label: 'OVERDRIVE',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 126,
  },
  {
    t: 'frame',
    x: 794,
    y: 346,
    w: 494,
    h: 124,
    r: 10,
    label: 'ENVELOPE 1',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 130,
  },
  {
    t: 'frame',
    x: 794,
    y: 482,
    w: 494,
    h: 124,
    r: 10,
    label: 'ENVELOPE 2',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 130,
  },
  {
    t: 'frame',
    x: 1298,
    y: 26,
    w: 250,
    h: 150,
    r: 10,
    label: 'OUTPUT',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 96,
  },
  {
    t: 'frame',
    x: 1298,
    y: 186,
    w: 250,
    h: 150,
    r: 10,
    label: 'SAMPLE & HOLD',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 160,
  },
  {
    t: 'frame',
    x: 1298,
    y: 346,
    w: 250,
    h: 124,
    r: 10,
    label: 'SLEW RATE LIMITER',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 190,
  },
  {
    t: 'frame',
    x: 1298,
    y: 482,
    w: 250,
    h: 124,
    r: 10,
    label: 'ATTENUATORS',
    labelAt: 'bottom',
    labelSize: 14,
    gapW: 144,
  },
  { t: 'frame', x: 1558, y: 26, w: 512, h: 580, r: 10, labelAt: 'none' },
  {
    t: 'rect',
    x: 1840,
    y: 34,
    w: 222,
    h: 564,
    r: 8,
    fill: 'rgba(214,205,203,0.42)',
    stroke: 'none',
  },
  { t: 'rect', hw: true, x: 1563, y: 31, w: 502, h: 570, r: 7, fill: 'url(#kysPatBay)' }
);
[
  [46, 12],
  [700, 12],
  [1290, 12],
  [2054, 12],
  [46, 610],
  [700, 610],
  [1290, 610],
  [2054, 610],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 7 }));
decor.push(
  { t: 'logo', x: 96, y: 58, size: 14, text: 'behringer', style: 'behringer', brand: true },
  {
    t: 'logo',
    x: 262,
    y: 60,
    size: 30,
    text: 'NEUTRON',
    sub: 'ANALOG SYNTHESIZER',
    style: 'neutron',
    brand: true,
  }
);

// ── Oscillators ───────────────────────────────────────────────────────────
const OSC_X: Record<number, number> = { 1: 166, 2: 394 };
[1, 2].forEach((n) => {
  const x = OSC_X[n];
  knob(
    `osc${n}.tune`,
    x,
    216,
    {
      min: -5,
      max: 5,
      def: 0,
      label: 'TUNE',
      module: 'osc',
      fmt: (v) => fmtSemi((v / 5) * 12),
      help: `Tunes Oscillator ${n} up or down by about an octave. With RANGE set to the wide (±10 octave) mode it sweeps the whole range, from clicks to above hearing.`,
    },
    50,
    'neutron-big'
  );
  knob(`osc${n}.shape`, x, 390, {
    min: 0,
    max: 4,
    def: 2,
    label: 'SHAPE',
    module: 'osc',
    fmt: morphFmt(OSC_SHAPE_NAMES),
    help: 'Morphs smoothly through five waveforms: tone mod, pulse, sawtooth, triangle, sine. Positions in between blend the two neighbours, so you can dial in tones no fixed waveform gives. The lamps show the blend: one bright lamp on a pure waveform, two dimmer lamps in between.',
  });
  knob(`osc${n}.width`, x, 534, {
    def: 5,
    label: 'WIDTH',
    module: 'osc',
    fmt: (v) => `${Math.round(5 + v * 9)}% duty`,
    help: 'Pulse width. It only changes the tone mod and pulse shapes: the centre is a hollow square, and either side gets thinner and more nasal.',
  });
  button(`osc${n}.range`, n === 1 ? 246 : 314, 410, {
    kind: 'enum',
    def: '8',
    label: 'RANGE',
    module: 'osc',
    options: [
      { v: '32', label: "32'" },
      { v: '16', label: "16'" },
      { v: '8', label: "8'" },
      { v: 'wide', label: '±10 OCT' },
    ],
    help: 'Octave of the oscillator: 32’ is lowest, 8’ highest. The fourth setting (all three lamps lit) puts the TUNE knob into a very wide mode for LFO-slow or ultrasonic pitches.',
  });
  // octave lamps either side of the 8 / 16 / 32 legend, stepped down to the RANGE button that sets them
  const m = (px: number): number => (n === 1 ? px : 560 - px); // oscillator 2 is the mirror image
  decor.push({
    t: 'path',
    hw: true,
    w: 2,
    d: `M${m(250)} 290 H${m(236)} V322 H${m(226)} V354 H${m(216)} V378 H${m(246)} V397 M${m(250)} 322 H${m(236)} M${m(250)} 354 H${m(226)}`,
  });
  ['8', '16', '32'].forEach((oct, i) =>
    led(n === 1 ? 250 : 310, 290 + i * 32, 'amber', {
      id: `osc${n}.range`,
      eq: oct,
      in: [oct, 'wide'],
    })
  );
  // shape lamps + glyphs, joined by the printed bus line
  decor.push({ t: 'line', hw: true, x1: m(112), y1: 316, x2: m(112), y2: 440, w: 2 });
  OSC_SHAPES.forEach((shape, i) => {
    const y = 316 + i * 31;
    decor.push({ t: 'line', hw: true, x1: m(91), y1: y, x2: m(112), y2: y, w: 2 });
    led(n === 1 ? 112 : 448, y, 'amber', { id: `osc${n}.shape`, morph: i }, 4);
    decor.push({ t: 'circle', hw: true, x: m(78), y, r: 13, sw: 1.6 });
    decor.push({ t: 'wave', x: n === 1 ? 78 : 482, y, size: 8, shape });
  });
  // the pulse-width "ripples" either side of WIDTH
  [
    [50, 5, 0.85],
    [61, 4, 0.55],
    [72, 3, 0.3],
  ].forEach(([r, w, opacity]) =>
    decor.push(
      { t: 'arc', hw: true, x, y: 534, r, a0: 58, a1: 122, w, opacity },
      { t: 'arc', hw: true, x, y: 534, r, a0: 238, a1: 302, w, opacity }
    )
  );
  decor.push({ t: 'tab', x, y: 463, text: '3340 VCO', size: 9, line: true, gap: false });
  decor.push({ t: 'tab', x, y: 606, text: `OSC ${n}`, size: 14 });
});
decor.push({ t: 'tab', x: 280, y: 236, text: 'OCTAVE', size: 12, gap: false });
['8', '16', '32'].forEach((oct, i) => text(280, 294 + i * 32, oct, 12));
knob('osc.mix', 280, 140, {
  min: -5,
  max: 5,
  def: -5,
  label: 'OSC MIX',
  module: 'mixer',
  fmt: (v) => `OSC 1 ${Math.round((5 - v) * 10)}% · OSC 2 ${Math.round((v + 5) * 10)}%`,
  help: 'Crossfades the two oscillators. Fully left is Oscillator 1 only, fully right is Oscillator 2 only, and the centre is an equal blend.',
});
button('osc.sync', 280, 486, {
  kind: 'bool',
  def: false,
  label: 'OSC SYNC',
  module: 'osc',
  help: 'Hard sync: Oscillator 1 forces Oscillator 2 to restart its wave on every cycle. Oscillator 2 then always plays Oscillator 1’s pitch, and its own TUNE knob changes the tone instead — a tearing, vocal sweep.',
});
button('osc.para', 280, 546, {
  kind: 'bool',
  def: false,
  label: 'PARAPHONIC',
  module: 'mode',
  help: 'Lets you play two notes at once: with two keys held, each oscillator takes its own note. They still share one filter and one amplifier.',
});
led(312, 486, 'amber', { id: 'osc.sync', eq: true }, 4);
led(312, 546, 'amber', { id: 'osc.para', eq: true }, 4);

// ── VCF ───────────────────────────────────────────────────────────────────
button('vcf.mode', 548, 96, {
  kind: 'enum',
  def: 'lp',
  label: 'MODE',
  module: 'filter',
  options: [
    { v: 'hp', label: 'High-pass' },
    { v: 'bp', label: 'Band-pass' },
    { v: 'lp', label: 'Low-pass' },
  ],
  help: 'Filter type. Low-pass removes brightness above the cutoff, high-pass removes bass below it, and band-pass keeps only a band around it. The VCF 2 jack always carries a different type at the same time.',
});
decor.push({ t: 'line', hw: true, x1: 564, y1: 158, x2: 564, y2: 210, w: 2 });
[
  ['hp', 'HP'],
  ['bp', 'BP'],
  ['lp', 'LP'],
].forEach(([m, t], i) => {
  led(564, 158 + i * 26, 'amber', { id: 'vcf.mode', eq: m }, 4);
  text(540, 162 + i * 26, t, 10);
});
knob('vcf.freq', 624, 94, {
  def: 8.5,
  label: 'FREQ',
  module: 'filter',
  fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Filter cutoff, from 10 Hz to 15 kHz. In low-pass mode, turning left makes the sound darker; turning right lets the full buzz of the oscillators through.',
});
knob('vcf.reso', 624, 246, {
  def: 0,
  label: 'RESO',
  module: 'filter',
  help: 'Resonance: boosts a narrow band right at the cutoff, so filter movement sounds vocal and squelchy. Near maximum the filter rings on its own as a sine wave.',
});
button('vcf.keyTrk', 624, 324, {
  kind: 'bool',
  def: false,
  label: 'KEY\nTRK',
  labelPos: 'right',
  module: 'filter',
  help: 'Key tracking: the cutoff follows the notes you play, so high notes stay as bright as low ones. It also lets you play a self-oscillating filter in tune.',
});
led(594, 324, 'amber', { id: 'vcf.keyTrk', eq: true }, 4);
knob('vcf.modDepth', 624, 400, {
  def: 0,
  label: 'MOD DEPTH',
  module: 'mod',
  fmt: pct,
  help: 'How much the FREQ MOD input moves the cutoff. With nothing patched, that input is the LFO, so this is LFO-to-filter depth. Patch something else into FREQ MOD and this knob scales that instead. The mod wheel beside the keyboard turns this knob further, so you can bring the LFO in while a note sounds; a cable into FREQ MOD ignores the wheel.',
});
knob('vcf.envDepth', 624, 534, {
  def: 0,
  label: 'ENV DEPTH',
  module: 'filter',
  fmt: pct,
  help: 'How far Envelope 2 pushes the cutoff upwards on each note. It only goes up; for a downward sweep, patch INVERT into FREQ MOD.',
});

// ── Noise / VCA bias ──────────────────────────────────────────────────────
knob('mix.noise', 739, 400, {
  def: 0,
  label: 'NOISE',
  module: 'mixer',
  fmt: pct,
  help: 'Amount of white noise added into the filter. A little gives breath and grit; on its own it is the raw material for wind, hats and snares.',
});
knob('vca.bias', 739, 534, {
  def: 0,
  label: 'VCA BIAS',
  module: 'amp',
  fmt: pct,
  help: 'Holds the amplifier open by a fixed amount, whatever the envelope is doing. Turn it up for drones that sound without a key held.',
});

// ── LFO ───────────────────────────────────────────────────────────────────
button('lfo.keySync', 742, 94, {
  kind: 'bool',
  def: false,
  label: 'KEY SYNC',
  module: 'lfo',
  help: 'Restarts the LFO every time you play a note, so the wobble begins at the same point on each note instead of running free.',
});
led(773, 94, 'amber', { id: 'lfo.keySync', eq: true }, 4);
knob('lfo.rate', 860, 94, {
  def: 5,
  label: 'RATE',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'LFO speed. It runs from one cycle every 50 seconds right up into the audio range, where it stops sounding like a wobble and starts adding harsh new overtones.',
});
led(806, 60, 'blue', 'lfo', 5);
knob(
  'lfo.shape',
  806,
  228,
  {
    min: 0,
    max: 4,
    def: 0,
    label: 'SHAPE',
    labelPos: 'none',
    ring: false,
    module: 'lfo',
    fmt: morphFmt(LFO_SHAPE_NAMES),
    help: 'Morphs the LFO through sine, triangle, sawtooth, square and reverse sawtooth. Smooth shapes give vibrato and sweeps, square gives trills, and the saws give repeating ramps. Between two shapes the LFO is a blend of both, and their two lamps share the light.',
  },
  38
);
LFO_SHAPES.forEach((shape, i) => {
  // the heavy printed arc that runs from lamp to lamp around the knob
  if (i < 4)
    decor.push({
      t: 'arc',
      hw: true,
      x: 806,
      y: 228,
      r: 53,
      a0: -150 + i * 75 + 9,
      a1: -75 + i * 75 - 9,
      w: 9,
      cap: 'butt',
    });
  const a = ((-150 + i * 75) * Math.PI) / 180;
  decor.push({
    t: 'circle',
    hw: true,
    x: 806 + Math.sin(a) * 78,
    y: 228 - Math.cos(a) * 76,
    r: 13,
    sw: 1.6,
  });
  led(806 + Math.sin(a) * 53, 228 - Math.cos(a) * 53, 'amber', { id: 'lfo.shape', morph: i }, 4);
  decor.push({
    t: 'wave',
    x: 806 + Math.sin(a) * 78,
    y: 228 - Math.cos(a) * 76,
    size: 8,
    shape,
  });
});
text(806, 318, 'SHAPE', 13);

// ── Delay / Overdrive ─────────────────────────────────────────────────────
knob('delay.time', 980, 90, {
  def: 5,
  label: 'TIME',
  module: 'fx',
  fmt: (v) => fmtTime(delayS(v)),
  help: 'Delay time, 25 to 640 ms. Short times thicken the sound; long times give distinct echoes. Moving it while sound is in the delay bends the pitch of the echoes, as on a tape machine.',
});
knob('delay.repeats', 1110, 90, {
  def: 3,
  label: 'REPEATS',
  module: 'fx',
  fmt: pct,
  help: 'How much of the echo is fed back in to echo again. Low gives one or two repeats; near maximum the echoes build instead of dying away.',
});
knob('delay.mix', 1240, 90, {
  def: 0,
  label: 'MIX',
  module: 'fx',
  fmt: pct,
  help: 'Balance between the dry synth and the echoes. Fully left is no delay at all.',
});
led(1045, 216, 'red', 'overload', 4);
knob('od.drive', 980, 250, {
  def: 1,
  label: 'DRIVE',
  module: 'fx',
  help: 'Overdrive amount, from gentle warmth to heavy distortion. It sits after the filter and before the amplifier, so the grit stays the same as a note fades.',
});
knob('od.tone', 1110, 250, {
  def: 5,
  label: 'TONE',
  module: 'fx',
  help: 'Tilts the overdrive’s tone. Left rolls off the top for a rounder sound; right thins the bass and adds bite.',
});
knob('od.level', 1240, 250, {
  def: 8,
  label: 'LEVEL',
  module: 'fx',
  help: 'Output level of the overdrive stage. Everything passes through here, so fully down silences the synth. It also sets how hard the delay is driven.',
});

// ── Envelopes ─────────────────────────────────────────────────────────────
const ENV_X = [860, 986, 1112, 1238];
(
  [
    [1, 392, 'Envelope 1 shapes loudness (it is wired to the amplifier).'],
    [2, 528, 'Envelope 2 shapes the filter, through ENV DEPTH.'],
  ] as const
).forEach(([n, y, role]) => {
  const d = n === 1 ? { a: 0, d: 5, s: 10, r: 4 } : { a: 0, d: 5, s: 5, r: 4 };
  knob(`env${n}.a`, ENV_X[0], y, {
    def: d.a,
    label: 'A',
    module: 'env',
    fmt: (v) => fmtTime(attackS(v)),
    help: `Attack: how long the envelope takes to rise after a key is pressed. ${role}`,
  });
  knob(`env${n}.d`, ENV_X[1], y, {
    def: d.d,
    label: 'D',
    module: 'env',
    fmt: (v) => fmtTime(decayS(v)),
    help: `Decay: how long the envelope takes to fall from its peak to the sustain level. ${role}`,
  });
  knob(`env${n}.s`, ENV_X[2], y, {
    def: d.s,
    label: 'S',
    module: 'env',
    fmt: pct,
    help: `Sustain: the level the envelope holds at while the key stays down. ${role}`,
  });
  knob(`env${n}.r`, ENV_X[3], y, {
    def: d.r,
    label: 'R',
    module: 'env',
    fmt: (v) => fmtTime(releaseS(v)),
    help: `Release: how long the envelope takes to fall to zero after the key is let go. ${role}`,
  });
});

// ── Output / S&H / Slew / Attenuators ─────────────────────────────────────
knob('out.volume', 1362, 90, {
  def: 7,
  label: 'VOLUME',
  module: 'out',
  help: 'Main output level.',
});
decor.push({ t: 'din', x: 1484, y: 92, r: 34 });
text(1484, 146, 'MIDI IN', 12);
led(1423, 56, 'amber', 'gate', 4);
led(1423, 214, 'blue', null, 4);
knob('sh.rate', 1362, 250, {
  def: 5,
  label: 'RATE',
  module: 'util',
  fmt: (v) => fmtHz(shHz(v)),
  help: 'How often the sample-and-hold takes a new reading of its input. With noise as the input (the default), each reading is a new random voltage.',
});
knob('sh.glide', 1486, 250, {
  def: 0,
  label: 'GLIDE',
  module: 'util',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(shGlideS(v))),
  help: 'Smooths the steps of the sample-and-hold output, so it slides from one random value to the next instead of jumping.',
});
knob('slew.time', 1362, 392, {
  def: 3,
  label: 'SLEW',
  module: 'util',
  fmt: (v) => fmtTime(slewS(v)),
  help: 'Slew limiter: slows down whatever is patched into SLEW IN, so sudden jumps become slides. Nothing is routed to it until you patch it.',
});
knob('porta.time', 1486, 392, {
  def: 0,
  label: 'PORTA TIME',
  module: 'glide',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(portaS(v))),
  help: 'Portamento: at zero the pitch jumps between notes; turn it up and the pitch slides from each note to the next.',
});
knob('att.1', 1362, 528, {
  def: 5,
  label: '1',
  module: 'util',
  help: 'Attenuator 1: a level control for whatever is patched into ATT1 IN. It is voltage controlled, so it can also act as a spare amplifier.',
});
knob('att.2', 1486, 528, {
  def: 0,
  label: '2',
  module: 'mod',
  help: 'Attenuator 2. With nothing patched, it carries the LFO and feeds both oscillators’ pulse-width inputs, so this knob is pulse-width modulation depth. Patch its jacks and it becomes a general-purpose level control.',
});

// ── Patch bay ─────────────────────────────────────────────────────────────
const IN_X = [1600, 1667, 1734, 1801];
const OUT_X = [1876, 1943, 2010];
const ROW_Y = [100, 162, 224, 286, 348, 410, 472, 534];
decor.push({ t: 'tab', x: 1700, y: 54, text: 'IN', size: 14, line: true, gap: false });
decor.push({ t: 'tab', x: 1943, y: 54, text: 'OUT', size: 14, gap: false });
const jin = (
  id: string,
  col: number,
  row: number,
  label: string,
  dest: string | null,
  amt: InputJack['amt'],
  help: string,
  add = false,
  rest: Partial<Pick<InputJack, 'check'>> = {}
): void => {
  jacks.push({
    id,
    x: IN_X[col],
    y: ROW_Y[row],
    r: 15,
    label,
    labelPos: 'bottom',
    labelSize: 10,
    dir: 'in',
    dest,
    amt,
    ...(add ? { add: true } : {}),
    help,
    ...rest,
  });
};
const jout = (
  id: string,
  col: number,
  row: number,
  label: string,
  signal: string,
  help: string,
  rest: Partial<Pick<OutputJack, 'check'>> = {}
): void => {
  jacks.push({
    id,
    x: OUT_X[col],
    y: ROW_Y[row],
    r: 15,
    label,
    labelPos: 'bottom',
    labelSize: 10,
    dir: 'out',
    signal,
    help,
    ...rest,
  });
};
// MOD DEPTH in octaves. The mod wheel turns the knob on top of where you left it, so the LFO can be
// ridden into the filter while a note sounds. The jack's own `amt` takes no wheel — a cable carries
// its own depth — so only the normalled LFO follows the wheel.
const freqModAmt = (v: ControlValues, wheel = 0): number =>
  (clamp(num(v, 'vcf.modDepth') + wheel * 10, 0, 10) / 10) * 5;

jin(
  'j.osc1In',
  0,
  0,
  'OSC 1',
  'pitch1',
  24,
  'Pitch control for Oscillator 1 only, added to the keyboard pitch.',
  true
);
jin(
  'j.osc2In',
  1,
  0,
  'OSC 2',
  'pitch2',
  24,
  'Pitch control for Oscillator 2 only. With OSC SYNC on, anything patched here changes the tone rather than the pitch.',
  true
);
jin(
  'j.osc12In',
  2,
  0,
  'OSC 1+2',
  'pitchAll',
  24,
  'Pitch control for both oscillators together. A full-strength signal moves the pitch a long way, so send it through an attenuator first.',
  true
);
jin(
  'j.invertIn',
  3,
  0,
  'INVERT IN',
  'invertIn',
  1,
  'Input of the inverter. With nothing patched it carries Envelope 2.'
);
jin(
  'j.shape1',
  0,
  1,
  'SHAPE 1',
  null,
  0,
  'Voltage control of Oscillator 1’s SHAPE. Not modelled in this app: a cable here has no audible effect.'
);
jin(
  'j.shape2',
  1,
  1,
  'SHAPE 2',
  null,
  0,
  'Voltage control of Oscillator 2’s SHAPE. Not modelled in this app: a cable here has no audible effect.'
);
jin(
  'j.pw1',
  2,
  1,
  'PW 1',
  'pw1',
  0.45,
  'Pulse-width control for Oscillator 1. Normally fed by Attenuator 2 (the LFO); a cable here replaces that.'
);
jin(
  'j.pw2',
  3,
  1,
  'PW 2',
  'pw2',
  0.45,
  'Pulse-width control for Oscillator 2. Normally fed by Attenuator 2 (the LFO); a cable here replaces that.'
);
jin(
  'j.vcfIn',
  0,
  2,
  'VCF IN',
  'vcfIn',
  1,
  'Audio input of the filter. Normally the oscillator mix and noise; a cable here replaces them.'
);
jin(
  'j.freqMod',
  1,
  2,
  'FREQ MOD',
  'cutoff',
  (v) => freqModAmt(v),
  'Cutoff modulation input, scaled by the MOD DEPTH knob. Normally the LFO; a cable here replaces it.',
  false,
  {
    check: (v) =>
      num(v, 'vcf.modDepth') <= 0
        ? 'MOD DEPTH is at 0, and that knob scales everything arriving at FREQ MOD. Turn MOD DEPTH up to hear this cable.'
        : null,
  }
);
jin(
  'j.res',
  2,
  2,
  'RES',
  'res',
  0.6,
  'Voltage control of resonance, added to the RESO knob.',
  true
);
jin(
  'j.odIn',
  3,
  2,
  'OD IN',
  'odIn',
  1,
  'Audio input of the overdrive. Normally the filter’s main output.'
);
jin(
  'j.vcaIn',
  0,
  3,
  'VCA IN',
  'vcaIn',
  1,
  'Audio input of the amplifier. Normally the overdrive output.'
);
jin(
  'j.vcaCv',
  1,
  3,
  'VCA CV',
  'amp',
  1,
  'Loudness control. Normally Envelope 1; patch the LFO here instead for tremolo, or Envelope 2 to free Envelope 1 for other jobs.'
);
jin(
  'j.delayIn',
  2,
  3,
  'DELAY IN',
  'delayIn',
  1,
  'Audio input of the delay. Normally the amplifier output.'
);
jin(
  'j.delayTime',
  3,
  3,
  'DELAY TIME',
  'delayTime',
  1.5,
  'Voltage control of delay time, added to the TIME knob. Slow, shallow movement gives chorus and tape wobble.',
  true
);
jin(
  'j.gate1',
  0,
  4,
  'E.GATE 1',
  'gate1',
  1,
  'Trigger input for Envelope 1. Normally the keyboard gate. Patch the square LFO here to re-trigger notes rhythmically.'
);
jin(
  'j.gate2',
  1,
  4,
  'E.GATE 2',
  'gate2',
  1,
  'Trigger input for Envelope 2. Normally follows Envelope 1’s gate.'
);
jin(
  'j.shIn',
  2,
  4,
  'S&H IN',
  'shIn',
  1,
  'The signal the sample-and-hold takes readings of. Normally white noise, which gives random steps.'
);
jin(
  'j.shClock',
  3,
  4,
  'S&H CLOCK',
  'shClock',
  1,
  'External clock for the sample-and-hold, replacing its RATE knob. Patch MIDI GATE here for one new random value per note.'
);
jin(
  'j.lfoRate',
  0,
  5,
  'LFO RATE',
  'lfoRate',
  4,
  'Voltage control of LFO speed, added to the RATE knob.',
  true
);
jin(
  'j.lfoShape',
  1,
  5,
  'LFO SHAPE',
  null,
  0,
  'Voltage control of the LFO SHAPE morph. Not modelled in this app: a cable here has no audible effect.'
);
jin(
  'j.lfoTrig',
  2,
  5,
  'LFO TRIG',
  'lfoTrig',
  1,
  'Restarts the LFO cycle each time the input goes high.'
);
jin(
  'j.multIn',
  3,
  5,
  'MULT',
  'multIn',
  1,
  'Input of the multiple, which copies one signal to the MULT 1 and MULT 2 outputs. Normally carries the LFO.'
);
jin(
  'j.att1In',
  0,
  6,
  'ATT1 IN',
  'att1In',
  1,
  'Input of Attenuator 1. Normally fed from Attenuator 2’s output.'
);
jin(
  'j.att1Cv',
  1,
  6,
  'ATT1 CV',
  'att1CV',
  1,
  'Voltage control of Attenuator 1’s level. Normally fed from the ASSIGN output.'
);
jin(
  'j.att2In',
  2,
  6,
  'ATT2 IN',
  'att2In',
  1,
  'Input of Attenuator 2. Normally the LFO. Patch an envelope here and the ATT 2 knob sets how much of it you send on.'
);
jin(
  'j.slewIn',
  3,
  6,
  'SLEW IN',
  'slewIn',
  1,
  'Input of the slew limiter. Nothing is connected until you patch it.'
);
jin(
  'j.sum1A',
  0,
  7,
  'SUM 1(A)',
  'sum1A',
  1,
  'First input of summer 1. The SUM 1 output is A plus B.'
);
jin('j.sum1B', 1, 7, 'SUM 1(B)', 'sum1B', 1, 'Second input of summer 1.');
jin(
  'j.sum2A',
  2,
  7,
  'SUM 2(A)',
  'sum2A',
  1,
  'First input of summer 2. The SUM 2 output is A plus B.'
);
jin('j.sum2B', 3, 7, 'SUM 2(B)', 'sum2B', 1, 'Second input of summer 2.');

jout(
  'j.osc1',
  0,
  0,
  'OSC 1',
  'osc1',
  'Oscillator 1 on its own, before the mix. At audio rate it makes a strong modulation source.'
);
jout(
  'j.osc2',
  1,
  0,
  'OSC 2',
  'osc2',
  'Oscillator 2 on its own. Set OSC MIX fully left and you can use Oscillator 2 purely as a modulator.'
);
jout(
  'j.oscMix',
  2,
  0,
  'OSC MIX',
  'oscMix',
  'The oscillator crossfade, before noise is added and before the filter.'
);
jout('j.vcf1', 0, 1, 'VCF 1', 'vcf1', 'The filter’s main output, in the type chosen by MODE.');
jout(
  'j.vcf2',
  1,
  1,
  'VCF 2',
  'vcf2',
  'The filter’s second output, always a different type from VCF 1: band-pass when MODE is high-pass, low-pass when band-pass, high-pass when low-pass.'
);
jout('j.od', 2, 1, 'OVERDRIVE', 'od', 'Output of the overdrive stage.');
jout('j.vca', 0, 2, 'VCA', 'vca', 'Output of the amplifier, before the delay.');
jout('j.out', 1, 2, 'OUTPUT', 'out', 'The main output, after the delay.');
jout(
  'j.noise',
  2,
  2,
  'NOISE',
  'noise',
  'White noise. Useful as a random modulation source as well as a sound.'
);
jout('j.env1', 0, 3, 'ENV 1', 'env1', 'Envelope 1 as a voltage.');
jout(
  'j.env2',
  1,
  3,
  'ENV 2',
  'env2',
  'Envelope 2 as a voltage. Patch it to pitch for drum sweeps and sync leads.'
);
jout(
  'j.invert',
  2,
  3,
  'INVERT',
  'invert',
  'The inverter’s output: Envelope 2 turned upside down unless something else is patched into INVERT IN.'
);
jout('j.lfo', 0, 4, 'LFO', 'lfo', 'The LFO, swinging both above and below zero.');
jout(
  'j.lfoUni',
  1,
  4,
  'LFO UNI',
  'lfoUni',
  'The LFO shifted so it only goes upwards from zero. Use it where a control should be pushed one way only.'
);
jout(
  'j.sh',
  2,
  4,
  'S&H',
  'sh',
  'Sample-and-hold output: a stepped random voltage by default. It goes nowhere until you patch it.'
);
jout(
  'j.mult1',
  0,
  5,
  'MULT 1',
  'mult',
  'First copy of whatever is at the MULT input (the LFO by default).'
);
jout('j.mult2', 1, 5, 'MULT 2', 'mult', 'Second copy of whatever is at the MULT input.');
jout('j.midiGate', 2, 5, 'MIDI GATE', 'gate', 'High while a key is held.');
jout('j.att1', 0, 6, 'ATT 1', 'att1', 'Output of Attenuator 1.', {
  check: (v) =>
    num(v, 'att.1') <= 0
      ? 'The ATT 1 knob is at 0, so nothing comes out of this jack. Turn ATT 1 up.'
      : null,
});
jout(
  'j.att2',
  1,
  6,
  'ATT 2',
  'att2',
  'Output of Attenuator 2: the LFO at the level set by the ATT 2 knob, unless you patch something else into ATT2 IN.',
  {
    check: (v) =>
      num(v, 'att.2') <= 0
        ? 'The ATT 2 knob is at 0, so nothing comes out of this jack. Turn ATT 2 up.'
        : null,
  }
);
jout('j.slew', 2, 6, 'SLEW', 'slew', 'Output of the slew limiter.');
jout('j.sum1', 0, 7, 'SUM 1', 'sum1', 'Sum of the two SUM 1 inputs.');
jout('j.sum2', 1, 7, 'SUM 2', 'sum2', 'Sum of the two SUM 2 inputs.');
jout(
  'j.assign',
  2,
  7,
  'ASSIGN',
  'kbd',
  'An assignable MIDI-to-voltage output. In this app it carries the keyboard pitch.'
);

// ── Areas (the grouped regions the "Areas" view explains) ─────────────────
const areas: Area[] = [
  {
    id: 'osc1',
    label: 'Oscillator 1',
    module: 'osc',
    keywords: 'vco pitch waveform tone source',
    rects: [
      { x: 41, y: 138, w: 200, h: 100 },
      { x: 41, y: 238, w: 222, h: 226 },
      { x: 41, y: 464, w: 195, h: 137 },
    ],
    help: 'The first of two sound sources. TUNE sets its pitch, RANGE picks the octave, SHAPE morphs between five waveforms and WIDTH thins the pulse shapes. The lamps show which waveform and octave are selected.',
  },
  {
    id: 'osc2',
    label: 'Oscillator 2',
    module: 'osc',
    keywords: 'vco pitch waveform detune',
    rects: [
      { x: 319, y: 138, w: 186, h: 100 },
      { x: 297, y: 238, w: 208, h: 226 },
      { x: 324, y: 464, w: 181, h: 137 },
    ],
    help: 'The second sound source, with the same controls as Oscillator 1. Detune it slightly against Oscillator 1 for a thicker sound, or turn on OSC SYNC and use its TUNE knob to change the tone instead of the pitch.',
  },
  {
    id: 'oscmix',
    label: 'Oscillator mix',
    module: 'mixer',
    keywords: 'balance crossfade blend',
    rects: [{ x: 241, y: 96, w: 78, h: 102 }],
    help: 'Sets the balance between the two oscillators before they reach the filter. Fully left is Oscillator 1 only, fully right is Oscillator 2 only.',
  },
  {
    id: 'sync',
    label: 'Sync and paraphonic',
    module: 'mode',
    keywords: 'hard sync duophonic two notes',
    rects: [{ x: 238, y: 466, w: 84, h: 122 }],
    help: 'OSC SYNC locks Oscillator 2 to Oscillator 1’s pitch, for the hard, tearing sync sound. PARAPHONIC lets you play two notes at once, one on each oscillator.',
  },
  {
    id: 'vcf',
    label: 'Filter (VCF)',
    module: 'filter',
    keywords: 'cutoff resonance low-pass high-pass band-pass brightness tone',
    rects: [{ x: 518, y: 26, w: 166, h: 580 }],
    help: 'Removes part of the sound to shape its tone. MODE picks low-pass, band-pass or high-pass, FREQ sets where the filter cuts, and RESO emphasises the sound at that point. MOD DEPTH and ENV DEPTH set how far the LFO and Envelope 2 move the cutoff.',
  },
  {
    id: 'lfo',
    label: 'LFO',
    module: 'lfo',
    keywords: 'low frequency oscillator vibrato wobble tremolo modulation',
    rects: [{ x: 692, y: 26, w: 230, h: 310 }],
    help: 'A slow repeating wave that moves other settings; you do not hear it directly. RATE sets its speed and SHAPE morphs its waveform. With nothing patched it reaches the filter through MOD DEPTH, and pulse width through Attenuator 2.',
  },
  {
    id: 'noise',
    label: 'Noise',
    module: 'mixer',
    keywords: 'white noise hiss wind snare hat',
    rects: [{ x: 692, y: 346, w: 94, h: 124 }],
    help: 'Adds white noise to the oscillators before the filter. Use a little for breath and grit, or use it alone for wind, hi-hats and snares.',
  },
  {
    id: 'vcabias',
    label: 'VCA bias',
    module: 'amp',
    keywords: 'amplifier drone hold open',
    rects: [{ x: 692, y: 476, w: 94, h: 130 }],
    help: 'Holds the amplifier open without a key pressed. Turn it up for drones, or to hear the synth while you set up a patch.',
  },
  {
    id: 'delay',
    label: 'Delay',
    module: 'fx',
    keywords: 'echo repeats feedback bbd',
    rects: [{ x: 932, y: 26, w: 356, h: 150 }],
    help: 'An analogue-style echo at the end of the signal path. TIME sets the gap between echoes, REPEATS how many you hear, and MIX how loud they are against the dry sound.',
  },
  {
    id: 'overdrive',
    label: 'Overdrive',
    module: 'fx',
    keywords: 'distortion drive grit fuzz',
    rects: [{ x: 932, y: 186, w: 356, h: 150 }],
    help: 'Distortion placed after the filter. DRIVE sets how hard it clips, TONE makes it darker or brighter, and LEVEL sets the volume coming out. Everything passes through LEVEL, so at zero the synth is silent.',
  },
  {
    id: 'env1',
    label: 'Envelope 1 (loudness)',
    module: 'env',
    keywords: 'adsr attack decay sustain release amplifier volume',
    rects: [{ x: 794, y: 346, w: 494, h: 124 }],
    help: 'Shapes the loudness of each note: it is wired to the amplifier. A is the fade-in time, D the fall to the held level, S the level held while the key is down, and R the fade-out after you let go.',
  },
  {
    id: 'env2',
    label: 'Envelope 2 (filter)',
    module: 'env',
    keywords: 'adsr attack decay sustain release filter sweep',
    rects: [{ x: 794, y: 482, w: 494, h: 124 }],
    help: 'Shapes the filter over each note, by the amount set with ENV DEPTH. It has the same four stages as Envelope 1. Its signal is also at the ENV 2 jack, for patching to other things such as pitch.',
  },
  {
    id: 'output',
    label: 'Output',
    module: 'out',
    keywords: 'volume midi level',
    rects: [{ x: 1298, y: 26, w: 250, h: 150 }],
    help: 'VOLUME sets the main output level, and the lamp lights while a note is held. MIDI IN is where a keyboard or sequencer connects on the hardware.',
  },
  {
    id: 'sh',
    label: 'Sample and hold',
    module: 'util',
    keywords: 's&h random stepped',
    rects: [{ x: 1298, y: 186, w: 250, h: 150 }],
    help: 'Takes a reading of its input at the speed set by RATE and holds it until the next one. The input is noise unless you patch something else, so the result is a stepped random voltage. GLIDE smooths the steps. It does nothing until you patch the S&H output somewhere.',
  },
  {
    id: 'slew',
    label: 'Slew and portamento',
    module: 'glide',
    keywords: 'glide slide lag smooth',
    rects: [{ x: 1298, y: 346, w: 250, h: 124 }],
    help: 'SLEW smooths whatever is patched into SLEW IN, turning jumps into slides. PORTA TIME is separate: it makes the pitch slide from one played note to the next.',
  },
  {
    id: 'atten',
    label: 'Attenuators',
    module: 'util',
    keywords: 'level pwm pulse width modulation amount',
    rects: [{ x: 1298, y: 482, w: 250, h: 124 }],
    help: 'Two level controls for patch signals. Attenuator 2 carries the LFO to both oscillators’ pulse width unless you patch its jacks, so its knob sets pulse-width modulation depth. Attenuator 1 is free for anything you patch into ATT1 IN.',
  },
  {
    id: 'bayIn',
    label: 'Patch bay inputs',
    module: 'patch',
    keywords: 'jacks sockets cv in semi-modular',
    rects: [{ x: 1558, y: 26, w: 280, h: 580 }],
    help: '32 sockets that accept a signal. Patching into one replaces, or adds to, that section’s normal internal connection: a cable into FREQ MOD takes over from the LFO, for example. Hover over a jack with Explain sections off to see what it controls.',
  },
  {
    id: 'bayOut',
    label: 'Patch bay outputs',
    module: 'patch',
    keywords: 'jacks sockets cv out semi-modular',
    rects: [{ x: 1838, y: 26, w: 232, h: 580 }],
    help: '24 sockets that send a signal out, marked on the hardware by solid white labels. A cable always runs from an output to an input. To feed one output to two inputs, go through MULT.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const wheel = clamp(ctx.wheel || 0, 0, 1);
  const mix = (num(v, 'osc.mix') + 5) / 10;
  const osc = [1, 2].map((n) => {
    const range = String(v[`osc${n}.range`]);
    return {
      level: (n === 1 ? 1 - mix : mix) * 0.95,
      mix: morph(num(v, `osc${n}.shape`), OSC_SHAPES),
      pw: clamp(0.05 + (num(v, `osc${n}.width`) / 10) * 0.9, 0.03, 0.97),
      semi: RANGE_SEMI[range] + (num(v, `osc${n}.tune`) / 5) * (range === 'wide' ? 60 : 12),
      kbd: true,
      fixedNote: 60,
      syncTo: n === 2 && v['osc.sync'] ? 0 : -1,
    };
  });
  const mode = v['vcf.mode'] === 'hp' ? 'hp' : v['vcf.mode'] === 'bp' ? 'bp' : 'lp';
  return {
    osc,
    noise: { level: level10(num(v, 'mix.noise'), 0.8), color: 'white' },
    ext: { level: 0 },
    filter: {
      type: 'svf',
      mode,
      mode2: MODE2[mode],
      cutoff: cutoffHz(num(v, 'vcf.freq')),
      res: (num(v, 'vcf.reso') / 10) * 1.08,
      envAmt: (num(v, 'vcf.envDepth') / 10) * 8,
      envSrc: 'env2',
      kbd: v['vcf.keyTrk'] ? 1 : 0,
    },
    env1: {
      a: attackS(num(v, 'env1.a')),
      d: decayS(num(v, 'env1.d')),
      s: num(v, 'env1.s') / 10,
      r: releaseS(num(v, 'env1.r')),
    },
    env2: {
      a: attackS(num(v, 'env2.a')),
      d: decayS(num(v, 'env2.d')),
      s: num(v, 'env2.s') / 10,
      r: releaseS(num(v, 'env2.r')),
    },
    vca: { envSrc: 'none', bias: num(v, 'vca.bias') / 10 },
    lfo: {
      rate: lfoHz(num(v, 'lfo.rate')),
      mix: morph(num(v, 'lfo.shape'), LFO_SHAPES),
      keySync: !!v['lfo.keySync'],
    },
    glide: { time: portaS(num(v, 'porta.time')), legato: false },
    trig: { retrig: false, drone: false, repeat: false },
    paraphonic: !!v['osc.para'],
    routes: [],
    normals: {
      cutoff: ['lfo', freqModAmt(v, wheel)],
      amp: 'env1',
      pw1: ['att2', 0.45],
      pw2: ['att2', 0.45],
      att2In: 'lfo',
      att1In: 'att2',
      att1CV: 'kbd',
      multIn: 'lfo',
      invertIn: 'env2',
      shIn: 'noise',
    },
    od: {
      on: true,
      drive: num(v, 'od.drive') / 10,
      tone: num(v, 'od.tone') / 10,
      level: level10(num(v, 'od.level'), 1),
    },
    delay: {
      on: true,
      time: delayS(num(v, 'delay.time')),
      fb: (num(v, 'delay.repeats') / 10) * 0.97,
      mix: num(v, 'delay.mix') / 10,
    },
    sh: { rate: shHz(num(v, 'sh.rate')), glide: shGlideS(num(v, 'sh.glide')) },
    slew: { time: slewS(num(v, 'slew.time')) },
    att: [level10(num(v, 'att.1'), 1.58), level10(num(v, 'att.2'), 1)],
    tune: 0,
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const neutron: SynthDef & { version: number } = {
  id: 'neutron',
  version: 1,
  name: 'Neutron',
  maker: 'Behringer',
  year: 2018,
  heritage: 'An original Behringer design built around two 3340 oscillator chips',
  summary:
    'Two shape-morphing oscillators and noise feed a 12 dB multimode filter, then overdrive, amplifier and an analogue delay. A 56-point patch bay lets you rewire almost all of it.',
  view: { w: 2100, h: 620 },
  theme: {
    panel: '#d8231f',
    panel2: '#c41d19',
    ink: '#ffffff',
    font: 'din',
    weight: 600,
    cheeks: 'metal',
    cheekW: 24,
    tabs: true,
    knobRing: true,
    outPlates: true,
    bezel: true,
    jack: 'black',
  },
  signalNames: {
    mixer: 'the mix of oscillators and noise',
    vcf1: 'the filter’s main output (VCF 1)',
    vcf2: 'the filter’s second output (VCF 2)',
    gate: 'the MIDI gate',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default neutron;
