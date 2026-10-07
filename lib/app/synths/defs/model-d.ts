/**
 * Behringer Model D: the definition (D1). Coordinates are in the pixel space of the 2000×780
 * panel photo.
 *
 * Transliterated from `prototype/src/synths/model-d.js` (D3), and the pattern every other synth
 * follows (`.context/app/synths.md`). What changed on the way:
 *
 * - **No content.** The prototype kept its sounds (`presets`), its lineage and its "Unusual on…"
 *   notes on the definition. They are content, so they live in the catalogue tables (D13), and the
 *   guard test refuses them here. The unusual notes are no longer written onto the controls at load.
 * - **A version.** Stored sounds record the version they were made on (`SynthDef.version`).
 * - **Brand marks are tagged.** The two logos carry `brand: true`, so the neutral design (D11) can
 *   leave them out.
 * - **Typed value reads.** Panel values are `number | string | boolean`, so `toEngine()` and the
 *   jack checks read numbers through `num()`. For the values a valid sound holds, every result
 *   is the prototype's.
 * - **`jack()` is `jackIn()` and `jackOut()`**, one per direction, so each is typed.
 */
import type {
  Area,
  Control,
  ControlOption,
  ControlValues,
  Decor,
  EngineContext,
  EngineDest,
  EngineParams,
  EngineRoute,
  InputJack,
  Jack,
  KnobControl,
  KnobScale,
  KnobStyle,
  OscParams,
  OutputJack,
  RockerControl,
  SynthDef,
  WaveShape,
} from '@/lib/app/synths/contract';
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

/** `Omit` over each member of a union, so a discriminated control or jack keeps its variants. */
type OmitEach<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type KnobRest = OmitEach<KnobControl, 'id' | 'type' | 'x' | 'y' | 'r' | 'style'>;
type RockerRest = OmitEach<
  RockerControl,
  'id' | 'type' | 'color' | 'x' | 'y' | 'w' | 'h' | 'module' | 'labelPos'
> &
  Partial<Pick<RockerControl, 'module'>>;
type JackRest<J extends Jack> = Omit<J, 'id' | 'x' | 'y' | 'r' | 'label' | 'labelPos' | 'dir'>;

/** A panel value as a number. A continuous control always holds one. */
const num = (v: ControlValues, id: string): number => Number(v[id]);

// Contour time scale as printed on the panel: 10 M-SEC · 200 · 600 · 1 SEC · 5 · 10
const ENV_PTS: CurvePoint[] = [
  [0, 0.003],
  [2, 0.2],
  [4, 0.6],
  [6, 1],
  [8, 5],
  [10, 10],
];
const envTime = (v: number): number => pwl(v, ENV_PTS, true);
const ENV_SCALE: KnobScale = {
  ticks: 11,
  labels: [
    { at: 0, text: '10' },
    { at: 2, text: '200' },
    { at: 4, text: '600' },
    { at: 6, text: '1' },
    { at: 8, text: '5' },
    { at: 10, text: '10' },
  ],
};
const S10: KnobScale = { nums: [0, 2, 4, 6, 8, 10], ticks: 11 };
const cutoffHz = (v: number): number => expMap((v + 5) / 10, 20, 20000);
const lfoHz = (v: number): number => expMap(v / 10, 0.05, 200);

const RANGES: ControlOption[] = [
  { v: 'lo', label: 'LO', a: -100 },
  { v: '32', label: "32'", a: -60 },
  { v: '16', label: "16'", a: -20 },
  { v: '8', label: "8'", a: 20 },
  { v: '4', label: "4'", a: 60 },
  { v: '2', label: "2'", a: 100 },
];
const RANGE_SEMI: Record<string, number> = { lo: -72, 32: -24, 16: -12, 8: 0, 4: 12, 2: 24 };
const wavePositions = (third: string): ControlOption[] =>
  ['tri', third, 'saw', 'sq', 'wide', 'narrow'].map((v, i) => ({ v, label: '', a: -100 + i * 40 }));
const WAVE_MIX: Record<string, Pick<OscParams, 'mix' | 'pw'>> = {
  tri: { mix: { tri: 1 }, pw: 0.5 },
  shark: { mix: { shark: 1 }, pw: 0.5 },
  rsaw: { mix: { rsaw: 1 }, pw: 0.5 },
  saw: { mix: { saw: 1 }, pw: 0.5 },
  sq: { mix: { pulse: 1 }, pw: 0.5 },
  wide: { mix: { pulse: 1 }, pw: 0.3 },
  narrow: { mix: { pulse: 1 }, pw: 0.14 },
};

const OSC_Y = [215, 378, 541];
const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const knob = (
  id: string,
  x: number,
  y: number,
  r: number,
  style: KnobStyle,
  rest: KnobRest
): void => {
  controls.push({ id, type: 'knob', x, y, r, style, ...rest });
};
const text = (x: number, y: number, t: string, size = 17): void => {
  decor.push({ t: 'text', x, y, text: t, size, anchor: 'middle' });
};

// ── Frames ────────────────────────────────────────────────────────────────
decor.push(
  { t: 'frame', x: 55, y: 22, w: 325, h: 133, r: 12, labelAt: 'none' },
  {
    t: 'frame',
    x: 55,
    y: 167,
    w: 325,
    h: 523,
    r: 12,
    label: 'CONTROLLERS',
    labelAt: 'inside-bottom',
    labelSize: 25,
  },
  {
    t: 'frame',
    x: 390,
    y: 22,
    w: 460,
    h: 668,
    r: 12,
    label: 'OSCILLATOR BANK',
    labelAt: 'inside-bottom',
    labelSize: 25,
  },
  {
    t: 'frame',
    x: 860,
    y: 22,
    w: 388,
    h: 668,
    r: 12,
    label: 'MIXER',
    labelAt: 'inside-bottom',
    labelSize: 25,
  },
  {
    t: 'frame',
    x: 1350,
    y: 22,
    w: 365,
    h: 668,
    r: 12,
    label: 'MODIFIERS',
    labelAt: 'inside-bottom',
    labelSize: 25,
  },
  {
    t: 'frame',
    x: 1722,
    y: 22,
    w: 223,
    h: 668,
    r: 12,
    label: 'OUTPUT',
    labelAt: 'inside-bottom',
    labelSize: 25,
  },
  { t: 'path', d: 'M1350 444 H1715', w: 2 }
);
[
  [70, 12],
  [640, 12],
  [1230, 12],
  [1930, 12],
  [70, 702],
  [740, 702],
  [1230, 702],
  [1930, 702],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 8 }));

// ── MIDI ──────────────────────────────────────────────────────────────────
decor.push(
  { t: 'usb', x: 105, y: 108, w: 62, h: 52 },
  { t: 'din', x: 215, y: 105, r: 42 },
  { t: 'din', x: 330, y: 105, r: 42 }
);
text(215, 52, 'MIDI IN', 17);
text(330, 52, 'MIDI THRU', 17);

// ── Controllers ───────────────────────────────────────────────────────────
knob('ctl.tune', 215, 250, 40, 'd-silver', {
  kind: 'cont',
  min: -2.5,
  max: 2.5,
  def: 0,
  label: 'TUNE',
  labelPos: 'top',
  labelGap: -14,
  module: 'osc',
  scale: { nums: [-2, -1, 1, 2], ticks: 11 },
  fmt: fmtSemi,
  help: 'Master tuning for all three oscillators, roughly two semitones either way.',
});
knob('ctl.glide', 132, 378, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'GLIDE',
  labelPos: 'top',
  module: 'glide',
  scale: S10,
  fmt: (v) => (v === 0 ? 'off' : fmtTime(Math.pow(v / 10, 2) * 2)),
  help: 'Portamento. At 0 the pitch jumps between notes; turn it up and the pitch slides from one note to the next.',
});
knob('mod.mix', 298, 378, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 10,
  label: 'MOD MIX',
  labelPos: 'top',
  module: 'mod',
  scale: S10,
  help: 'Crossfades the two modulation sources. Fully left is the left switch’s source (OSC 3 or filter EG); fully right is the right switch’s source (noise or LFO).',
});
text(250, 434, 'OSC 3/\nFILTER EG', 11);
text(348, 434, 'NOISE/\nLFO', 11);
controls.push(
  {
    id: 'mod.srcA',
    type: 'slide',
    orient: 'h',
    x: 132,
    y: 468,
    w: 82,
    h: 40,
    kind: 'enum',
    module: 'mod',
    options: [
      { v: 'osc3', label: 'OSC 3' },
      { v: 'eg', label: 'FILTER EG' },
    ],
    def: 'osc3',
    label: 'Mod source A',
    labelPos: 'none',
    help: 'First modulation source: Oscillator 3 (use it as a second LFO, or at audio rate for clangy FM) or the filter envelope.',
  },
  {
    id: 'mod.srcB',
    type: 'slide',
    orient: 'h',
    x: 298,
    y: 468,
    w: 82,
    h: 40,
    kind: 'enum',
    module: 'mod',
    options: [
      { v: 'noise', label: 'NOISE' },
      { v: 'lfo', label: 'LFO' },
    ],
    def: 'lfo',
    label: 'Mod source B',
    labelPos: 'none',
    help: 'Second modulation source: noise (random wobble, or whatever is patched into MOD SOURCE) or the dedicated LFO.',
  }
);
text(96, 505, 'OSC 3', 12);
text(172, 505, 'FILTER EG', 12);
text(262, 505, 'NOISE (MOD SRC)', 12);
text(340, 505, 'LFO', 12);
knob('mod.depth', 132, 588, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'MOD DEPTH',
  labelPos: 'top',
  module: 'mod',
  scale: S10,
  help: 'How much of the mixed modulation signal reaches the oscillators and filter. The mod wheel adds to this.',
});
knob('lfo.rate', 298, 588, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 4.5,
  label: 'LFO RATE',
  labelPos: 'top',
  module: 'lfo',
  scale: S10,
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the LFO, from one cycle every 20 seconds up to 200 Hz (well into audio rate).',
});
controls.push({
  id: 'lfo.shape',
  type: 'slide',
  orient: 'v',
  x: 215,
  y: 588,
  w: 40,
  h: 80,
  kind: 'enum',
  module: 'lfo',
  options: [
    { v: 'sq', label: 'Square' },
    { v: 'tri', label: 'Triangle' },
  ],
  def: 'tri',
  label: 'LFO wave shape',
  labelPos: 'none',
  help: 'LFO shape sent to the mod bus. Triangle gives a smooth wobble (vibrato); square jumps between two values (trills).',
});
decor.push(
  { t: 'wave', x: 215, y: 537, size: 13, shape: 'sq' },
  { t: 'wave', x: 215, y: 640, size: 13, shape: 'tri' }
);
controls.push(
  {
    id: 'mod.toOsc',
    type: 'rocker',
    color: 'blue',
    x: 385,
    y: 255,
    w: 80,
    h: 42,
    kind: 'bool',
    def: false,
    module: 'mod',
    label: 'OSCILLATOR\nMODULATION',
    labelPos: 'top',
    labelSize: 12,
    help: 'Sends the mod bus to oscillator pitch: vibrato from the LFO, pitch sweeps from the filter EG, or growl from OSC 3.',
  },
  {
    id: 'osc3.kbd',
    type: 'rocker',
    color: 'blue',
    orient: 'v',
    x: 418,
    y: 545,
    w: 42,
    h: 80,
    kind: 'bool',
    def: true,
    module: 'osc',
    label: 'OSC 3\nCONTROL',
    labelPos: 'top',
    labelSize: 12,
    help: 'On: Oscillator 3 follows the keyboard like the others. Off: it runs at a fixed pitch, which is what you want when using it as a modulator.',
  }
);
text(423, 290, 'ON', 12);

// ── Oscillator bank ───────────────────────────────────────────────────────
text(513, 138, 'RANGE', 17);
text(647, 138, 'OSCILLATOR-1\nFREQUENCY', 17);
text(780, 138, 'WAVEFORM', 17);
text(647, 300, 'OSCILLATOR-2', 17);
text(647, 463, 'OSCILLATOR-3', 17);
[1, 2, 3].forEach((n) => {
  const y = OSC_Y[n - 1];
  knob(`osc${n}.range`, 513, y, 38, 'd-chicken', {
    kind: 'enum',
    options: RANGES,
    def: n === 1 ? '8' : n === 2 ? '8' : '16',
    label: `Osc ${n} range`,
    labelPos: 'none',
    module: 'osc',
    help: 'Octave of the oscillator in organ-pipe feet: 32’ is lowest, 2’ highest. LO drops it below hearing so it clicks or acts as an LFO.',
  });
  knob(`osc${n}.wave`, 780, y, 38, 'd-chicken', {
    kind: 'enum',
    options: wavePositions(n === 3 ? 'rsaw' : 'shark'),
    def: 'saw',
    label: `Osc ${n} waveform`,
    labelPos: 'none',
    module: 'osc',
    help: 'Raw tone of the oscillator. Triangle is soft and flute-like, sawtooth is bright and brassy, square is hollow, and the pulses get thinner and more nasal as they narrow.',
  });
  const shapes: WaveShape[] = ['tri', n === 3 ? 'rsaw' : 'shark', 'saw', 'sq', 'pulse', 'npulse'];
  shapes.forEach((shape, i) => {
    const a = ((-100 + i * 40) * Math.PI) / 180;
    decor.push({ t: 'wave', x: 780 + Math.sin(a) * 66, y: y - Math.cos(a) * 62, size: 11, shape });
  });
  if (n > 1) {
    knob(`osc${n}.freq`, 647, y, 40, 'd-silver', {
      kind: 'cont',
      min: -7.5,
      max: 7.5,
      def: 0,
      label: `Osc ${n} frequency`,
      labelPos: 'none',
      module: 'osc',
      scale: { nums: [-7, -5, -3, -1, 1, 3, 5, 7], ticks: 15 },
      fmt: fmtSemi,
      help:
        n === 2
          ? 'Detunes Oscillator 2 against Oscillator 1, up to a fifth either way. A tiny offset makes the two beat against each other and sound fatter.'
          : 'Detunes Oscillator 3. With OSC 3 CONTROL off this becomes the rate control for Oscillator 3 as a modulator.',
    });
  }
});

// ── Mixer ─────────────────────────────────────────────────────────────────
[1, 2, 3].forEach((n) => {
  const y = OSC_Y[n - 1];
  knob(`mix.osc${n}`, 915, y, 30, 'd-silver', {
    kind: 'cont',
    min: 0,
    max: 10,
    def: n === 1 ? 8 : 0,
    label: 'VOLUME',
    labelPos: 'top',
    module: 'mixer',
    scale: S10,
    help: `Level of Oscillator ${n} going into the filter. Past about 7 the mixer starts to overdrive the filter, which is a big part of the fat Model D tone.`,
  });
  controls.push({
    id: `mix.osc${n}On`,
    type: 'rocker',
    color: 'red',
    x: 1022,
    y,
    w: 80,
    h: 42,
    kind: 'bool',
    def: n === 1,
    module: 'mixer',
    label: `Osc ${n} on`,
    labelPos: 'none',
    help: `Connects Oscillator ${n} to the mixer. Switch it off when the oscillator is only being used as a modulator.`,
  });
  text(1056, y + 38, 'ON', 12);
});
controls.push(
  {
    id: 'mix.extOn',
    type: 'rocker',
    color: 'red',
    x: 1022,
    y: 297,
    w: 80,
    h: 42,
    kind: 'bool',
    def: false,
    module: 'mixer',
    label: 'External input on',
    labelPos: 'none',
    help: 'Connects the external input. With nothing plugged into EXT, this channel carries the synth’s own output fed back into the mixer — a built-in overdrive.',
  },
  {
    id: 'mix.noiseOn',
    type: 'rocker',
    color: 'red',
    x: 1022,
    y: 460,
    w: 80,
    h: 42,
    kind: 'bool',
    def: false,
    module: 'mixer',
    label: 'Noise on',
    labelPos: 'none',
    help: 'Connects the noise generator to the mixer.',
  }
);
text(1056, 335, 'ON', 12);
text(1056, 498, 'ON', 12);
knob('mix.ext', 1132, 297, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'EXT IN\nVOLUME',
  labelPos: 'top',
  module: 'mixer',
  scale: S10,
  help: 'Level of the external input. With no cable in EXT it sets how much of the output is fed back into the mixer: a little thickens the sound, a lot distorts it.',
});
knob('mix.noise', 1132, 460, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'NOISE\nVOLUME',
  labelPos: 'top',
  module: 'mixer',
  scale: S10,
  help: 'Level of noise into the filter. Use a little for breath and grit, or on its own for wind, surf and percussion.',
});
controls.push({
  id: 'noise.colour',
  type: 'rocker',
  color: 'red',
  orient: 'v',
  x: 1215,
  y: 460,
  w: 42,
  h: 80,
  kind: 'enum',
  module: 'mixer',
  options: [
    { v: 'white', label: 'WHITE' },
    { v: 'pink', label: 'PINK' },
  ],
  def: 'white',
  label: 'Noise colour',
  labelPos: 'none',
  help: 'White noise is bright and hissy. Pink noise has less top end and sounds deeper, more like wind or surf.',
});
text(1215, 412, 'WHITE', 12);
text(1215, 516, 'PINK', 12);
text(1215, 282, 'OVERLOAD', 12);
decor.push({ t: 'led', x: 1215, y: 298, r: 6, color: 'red', litWhen: 'overload' });
decor.push({ t: 'logo', x: 1052, y: 92, size: 74, style: 'outline-d', brand: true });
text(1172, 126, 'AUDIO', 12);
decor.push({ t: 'path', d: 'M1137 118 V178 M1131 170 L1137 180 L1143 170', w: 1.5 });

// ── Switch column between mixer and modifiers ────────────────────────────
const colSwitch = (
  id: string,
  y: number,
  color: RockerControl['color'],
  rest: RockerRest
): void => {
  controls.push({
    id,
    type: 'rocker',
    color,
    x: 1299,
    y,
    w: 80,
    h: 42,
    module: 'filter',
    labelPos: 'none',
    ...rest,
  });
};
colSwitch('filter.mode', 133, 'blue', {
  kind: 'enum',
  options: [
    { v: 'lp', label: 'LO' },
    { v: 'hp', label: 'HI' },
  ],
  def: 'lp',
  label: 'Filter mode',
  help: 'LO is the classic low-pass: it removes brightness above the cutoff. HI is high-pass: it removes bass below the cutoff, for thin, reedy tones.',
});
colSwitch('mod.toFilter', 215, 'blue', {
  kind: 'bool',
  def: false,
  module: 'mod',
  label: 'Filter modulation',
  help: 'Sends the mod bus to the filter cutoff: wah-style sweeps from the LFO, or a rasp when OSC 3 modulates at audio rate.',
});
colSwitch('filter.kbd1', 297, 'blue', {
  kind: 'bool',
  def: false,
  label: 'Keyboard control 1',
  help: 'Adds one third keyboard tracking: higher notes open the filter a little so they do not sound duller than low notes.',
});
colSwitch('filter.kbd2', 378, 'blue', {
  kind: 'bool',
  def: false,
  label: 'Keyboard control 2',
  help: 'Adds two thirds keyboard tracking. Switch both on for full tracking, where the cutoff follows the notes exactly.',
});
colSwitch('env.filterDecay', 460, 'white', {
  kind: 'bool',
  def: true,
  module: 'env',
  label: 'Filter decay',
  help: 'On: after you release a key the filter closes over the DECAY time. Off: it snaps shut at once.',
});
colSwitch('env.loudDecay', 541, 'white', {
  kind: 'bool',
  def: true,
  module: 'env',
  label: 'Loudness decay',
  help: 'On: after you release a key the note fades over the DECAY time. Off: the note stops dead.',
});
text(1299, 102, 'FILTER MODE', 11);
text(1270, 170, 'LO', 11);
text(1330, 170, 'HI', 11);
text(1299, 186, 'FILTER MODULATION', 10.5);
text(1333, 251, 'ON', 11);
text(1299, 342, 'KEYBOARD CONTROL', 10.5);
text(1262, 270, '1', 11);
text(1262, 415, '2', 11);
text(1333, 415, 'ON', 11);
text(1299, 432, 'FILTER DECAY', 11);
text(1333, 496, 'ON', 11);
text(1299, 513, 'LOUD DECAY', 11);
text(1333, 578, 'ON', 11);

// ── Modifiers ─────────────────────────────────────────────────────────────
text(1532, 128, 'FILTER', 21);
knob('filter.cutoff', 1410, 215, 30, 'd-silver', {
  kind: 'cont',
  min: -5,
  max: 5,
  def: 1,
  label: 'CUTOFF\nFREQUENCY',
  labelPos: 'top',
  module: 'filter',
  scale: { nums: [-4, -2, 0, 2, 4], ticks: 11 },
  fmt: (v) => fmtHz(cutoffHz(v)),
  help: 'Where the filter starts cutting. Turn left and the low-pass removes more brightness until only a dull thud is left; turn right and the full buzz of the oscillators comes through.',
});
knob('filter.emphasis', 1532, 215, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'EMPHASIS',
  labelPos: 'top',
  module: 'filter',
  scale: S10,
  help: 'Resonance: boosts a narrow band right at the cutoff so sweeps sound vocal and squelchy. Near maximum the filter whistles on its own.',
});
knob('filter.contour', 1655, 215, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 0,
  label: 'AMOUNT\nOF CONTOUR',
  labelPos: 'top',
  module: 'filter',
  scale: S10,
  help: 'How far the filter envelope pushes the cutoff above its resting position each time you play a note.',
});
const envKnob = (
  id: string,
  x: number,
  y: number,
  label: string,
  isTime: boolean,
  help: string,
  def: number
): void =>
  knob(id, x, y, 30, 'd-silver', {
    kind: 'cont',
    min: 0,
    max: 10,
    def,
    label,
    labelPos: 'top',
    module: 'env',
    scale: isTime ? ENV_SCALE : S10,
    fmt: isTime ? (v) => fmtTime(envTime(v)) : undefined,
    help,
  });
envKnob(
  'fenv.attack',
  1410,
  378,
  'ATTACK',
  true,
  'How long the filter takes to open after a key is pressed. Short for plucks and basses, long for slow brassy swells.',
  0
);
envKnob(
  'fenv.decay',
  1532,
  378,
  'DECAY',
  true,
  'How long the filter takes to fall back from its peak to the sustain level. This sets the length of the "wow" at the start of each note.',
  4
);
envKnob(
  'fenv.sustain',
  1655,
  378,
  'SUSTAIN',
  false,
  'Where the filter settles while the key is held, as a share of the contour amount.',
  4
);
text(1532, 466, 'LOUDNESS CONTOUR', 19);
envKnob(
  'aenv.attack',
  1410,
  541,
  'ATTACK',
  true,
  'How quickly the note reaches full volume. Near zero it clicks in instantly; higher values fade the note in.',
  0
);
envKnob(
  'aenv.decay',
  1532,
  541,
  'DECAY',
  true,
  'How long the volume takes to fall to the sustain level, and (with LOUD DECAY on) how long the note rings after release.',
  3.5
);
envKnob(
  'aenv.sustain',
  1655,
  541,
  'SUSTAIN',
  false,
  'Volume while a key is held. At 10 the note holds at full level; at 0 it dies away even if you keep holding.',
  10
);
[
  [1410, 378],
  [1532, 378],
  [1410, 541],
  [1532, 541],
].forEach(([x, y]) => {
  text(x - 36, y + 58, 'M-SEC', 10);
  text(x + 34, y + 58, 'SEC', 10);
});

// ── Output ────────────────────────────────────────────────────────────────
knob('out.volume', 1778, 215, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 7,
  label: 'VOLUME',
  labelPos: 'top',
  module: 'out',
  scale: S10,
  help: 'Main output level. It also sets how hard the feedback path is driven when EXT IN is switched on with no cable.',
});
controls.push(
  {
    id: 'out.mainOn',
    type: 'rocker',
    color: 'red',
    x: 1887,
    y: 215,
    w: 80,
    h: 42,
    kind: 'bool',
    def: true,
    module: 'out',
    label: 'MAIN OUT',
    labelPos: 'top',
    labelSize: 17,
    help: 'Switches the main output on or off.',
  },
  {
    id: 'out.a440',
    type: 'rocker',
    color: 'red',
    x: 1778,
    y: 378,
    w: 80,
    h: 42,
    kind: 'bool',
    def: false,
    module: 'out',
    label: 'A-440',
    labelPos: 'top',
    labelSize: 13,
    help: 'Sounds a steady 440 Hz reference tone so you can tune the oscillators by ear.',
  }
);
text(1920, 251, 'ON', 12);
text(1812, 414, 'ON', 12);
text(1778, 282, 'POWER', 12);
decor.push({ t: 'led', x: 1778, y: 298, r: 6, color: 'red', litWhen: 'power' });
decor.push({
  t: 'logo',
  x: 1887,
  y: 372,
  size: 17,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});
knob('out.phones', 1778, 541, 30, 'd-silver', {
  kind: 'cont',
  min: 0,
  max: 10,
  def: 5,
  label: 'VOLUME',
  labelPos: 'top',
  module: 'out',
  scale: S10,
  help: 'Headphone level on the hardware. It has no effect in this app.',
});

// ── Jacks ─────────────────────────────────────────────────────────────────
const jackIn = (
  id: string,
  x: number,
  y: number,
  label: string,
  rest: JackRest<InputJack>
): void => {
  jacks.push({ id, x, y, r: 17, label, labelPos: 'top', dir: 'in', ...rest });
};
const jackOut = (
  id: string,
  x: number,
  y: number,
  label: string,
  rest: JackRest<OutputJack>
): void => {
  jacks.push({ id, x, y, r: 17, label, labelPos: 'top', dir: 'out', ...rest });
};
jackIn('j.modSrc', 513, 92, 'MOD SOURCE', {
  dest: 'multIn',
  amt: 1,
  hear: (_v, x) =>
    `${x.src.charAt(0).toUpperCase()}${x.src.slice(1)} takes the place of noise as the right-hand source of the mod bus. From there MOD MIX, MOD DEPTH (plus the mod wheel) and the OSCILLATOR and FILTER MODULATION switches decide how much of it reaches the pitch and the cutoff, exactly as they do for noise.`,
  check: (v) =>
    v['mod.srcB'] !== 'noise'
      ? 'Set the NOISE / LFO switch to NOISE. This jack takes the place of noise, so with the switch on LFO the cable is ignored.'
      : num(v, 'mod.mix') <= 0
        ? 'MOD MIX is fully left, which selects only the left-hand source. Turn it to the right to hear this cable.'
        : !v['mod.toOsc'] && !v['mod.toFilter']
          ? 'Switch on OSCILLATOR MODULATION or FILTER MODULATION so the mod bus goes somewhere.'
          : num(v, 'mod.depth') <= 0
            ? 'MOD DEPTH is at 0. Turn it up, or push the mod wheel.'
            : null,
  help: 'Replaces noise as the second mod source. Patch anything in: an envelope, the square LFO, even audio.',
});
jackIn('j.oscCv', 647, 92, 'OSC 1V/OCT', {
  dest: 'pitchAll',
  amt: 24,
  add: true,
  help: 'Pitch control voltage for the oscillators, added to the keyboard pitch.',
});
jackIn('j.lfoCv', 780, 92, 'LFO CV', {
  dest: 'lfoRate',
  amt: 3,
  add: true,
  help: 'Voltage control of LFO rate. Patch an envelope in and the wobble speeds up over each note.',
});
jackOut('j.lfoTri', 893, 92, 'LFO', {
  name: 'LFO (triangle)',
  signal: 'lfoTri',
  help: 'Triangle LFO, always available whatever the wave shape switch says.',
});
jackOut('j.lfoSq', 965, 92, 'LFO', {
  name: 'LFO (square)',
  signal: 'lfoSq',
  help: 'Square LFO, always available whatever the wave shape switch says.',
});
decor.push(
  { t: 'wave', x: 925, y: 50, size: 8, shape: 'tri' },
  { t: 'wave', x: 997, y: 50, size: 8, shape: 'sq' }
);
jackIn('j.ext', 1137, 92, 'EXT', {
  dest: 'extIn',
  amt: 1,
  check: (v) =>
    !v['mix.extOn']
      ? 'The external input is switched off in the mixer. Switch its rocker ON to hear this cable.'
      : num(v, 'mix.ext') <= 0
        ? 'EXT IN VOLUME is at 0. Turn it up to let this cable into the mixer.'
        : null,
  help: 'External audio into the mixer. Plugging in here breaks the internal output-to-mixer feedback loop.',
});
jackOut('j.mix', 1208, 92, 'MIX', {
  signal: 'mixer',
  help: 'The mixer output before the filter: raw oscillators and noise.',
});
jackIn('j.cutCv', 1388, 92, 'CUT CV', {
  dest: 'cutoff',
  amt: 5,
  add: true,
  help: 'Voltage control of filter cutoff, added to the knob.',
});
jackIn('j.fcGate', 1460, 92, 'FC GATE', {
  dest: 'gate1',
  amt: 1,
  add: true,
  help: 'External gate for the filter contour. Patch the square LFO here and the filter re-triggers rhythmically while you hold a note.',
});
jackOut('j.filtCont', 1532, 92, 'FILT CONT', {
  signal: 'env1',
  help: 'The filter contour (envelope) as a voltage, 0 to 4 V.',
});
jackIn('j.lcGate', 1604, 92, 'LC GATE', {
  dest: 'gate2',
  amt: 1,
  add: true,
  help: 'External gate for the loudness contour.',
});
jackOut('j.loudCont', 1676, 92, 'LOUD CONT', {
  signal: 'env2',
  help: 'The loudness contour (envelope) as a voltage.',
});
jackIn('j.loudCv', 1778, 92, 'LOUD CV', {
  dest: 'amp',
  amt: 1,
  add: true,
  help: 'Voltage control of loudness. Patch the triangle LFO here for tremolo.',
});
jackOut('j.main', 1887, 92, 'MAIN', {
  signal: 'out',
  help: 'Main audio output. Patch it back to EXT for the classic feedback trick with a cable.',
});
text(1887, 128, 'AUDIO', 12);
jacks.push({
  id: 'j.phones',
  x: 1887,
  y: 541,
  r: 17,
  label: 'PHONES',
  labelPos: 'top',
  dir: 'out',
  signal: 'out',
  help: 'Headphone output.',
});

// ── Areas (the grouped regions the "Areas" view explains) ─────────────────
const areas: Area[] = [
  {
    id: 'midi',
    label: 'MIDI and USB',
    module: 'out',
    keywords: 'connect keyboard computer',
    rects: [{ x: 55, y: 22, w: 325, h: 133 }],
    help: 'Where a keyboard, sequencer or computer connects on the hardware. In this app the on-screen keyboard plays the synth instead.',
  },
  {
    id: 'controllers',
    label: 'Controllers',
    module: 'mod',
    keywords: 'tune glide portamento lfo vibrato modulation mod mix',
    rects: [{ x: 55, y: 167, w: 332, h: 523 }],
    help: 'Tuning, glide and the modulation setup. TUNE moves all three oscillators together and GLIDE makes the pitch slide between notes. MOD MIX blends two modulation sources, chosen by the switches under it, and the LFO’s rate and shape are set here. The OSCILLATOR MODULATION switch sends that modulation to pitch.',
  },
  {
    id: 'patch',
    label: 'Patch points',
    module: 'patch',
    keywords: 'jacks sockets cv gate semi-modular',
    rects: [{ x: 390, y: 30, w: 1555, h: 82 }],
    help: 'The sockets along the top. Inputs accept a control voltage or audio, from other gear or from this synth’s own outputs. Outputs send the LFO, the mixer and the two contours. Hover over a jack with Explain sections off to see what it does.',
  },
  {
    id: 'oscbank',
    label: 'Oscillator bank',
    module: 'osc',
    keywords: 'vco range waveform detune pitch',
    rects: [{ x: 388, y: 120, w: 462, h: 570 }],
    help: 'Three oscillators make the raw sound. RANGE sets each one’s octave and WAVEFORM its shape. Oscillators 2 and 3 have a FREQUENCY knob to detune them against Oscillator 1. With OSC 3 CONTROL off, Oscillator 3 stops following the keyboard so it can be used as a modulation source.',
  },
  {
    id: 'mixer',
    label: 'Mixer',
    module: 'mixer',
    keywords: 'volume level noise external input overload',
    rects: [{ x: 860, y: 120, w: 388, h: 570 }],
    help: 'Sets how loud each source is going into the filter: the three oscillators, the external input and noise. Each has its own on/off switch. High levels push the filter into a thicker, slightly overdriven tone.',
  },
  {
    id: 'switches',
    label: 'Filter and contour switches',
    module: 'filter',
    keywords: 'keyboard control tracking decay release filter mode high-pass',
    rects: [{ x: 1250, y: 112, w: 98, h: 478 }],
    help: 'The column of rocker switches between the mixer and the filter. From the top: filter mode (low-pass or high-pass), modulation to the filter, two keyboard-tracking switches that make higher notes brighter, and a decay switch for each contour that decides whether notes fade out or stop dead when you let go.',
  },
  {
    id: 'filter',
    label: 'Filter and filter contour',
    module: 'filter',
    keywords: 'cutoff emphasis resonance contour envelope ladder brightness',
    rects: [{ x: 1350, y: 120, w: 365, h: 324 }],
    help: 'CUTOFF FREQUENCY sets how bright the sound is and EMPHASIS adds resonance at the cutoff. AMOUNT OF CONTOUR sets how far the ATTACK, DECAY and SUSTAIN knobs below it sweep the cutoff on each note.',
  },
  {
    id: 'loudness',
    label: 'Loudness contour',
    module: 'env',
    keywords: 'envelope attack decay sustain volume amplifier',
    rects: [{ x: 1350, y: 444, w: 365, h: 246 }],
    help: 'Shapes the volume of each note. ATTACK is the fade-in and DECAY is the fall to the SUSTAIN level, which holds while the key is down. With the loudness decay switch on, DECAY is also the fade-out time after you let go.',
  },
  {
    id: 'output',
    label: 'Output',
    module: 'out',
    keywords: 'volume headphones phones tuning a440',
    rects: [{ x: 1722, y: 120, w: 223, h: 570 }],
    help: 'Main VOLUME and the MAIN OUT on/off switch, a separate headphone volume and socket, and A-440, a steady reference tone for tuning the oscillators by ear.',
  },
];

// ── Engine mapping ────────────────────────────────────────────────────────
function toEngine(v: ControlValues, ctx: EngineContext): EngineParams {
  const osc = [1, 2, 3].map((n) => {
    const kbd = n === 3 ? Boolean(v['osc3.kbd']) : true;
    const det = n === 1 ? 0 : num(v, `osc${n}.freq`);
    return {
      level: v[`mix.osc${n}On`] ? level10(num(v, `mix.osc${n}`), 0.9) : 0,
      ...WAVE_MIX[String(v[`osc${n}.wave`])],
      semi:
        RANGE_SEMI[String(v[`osc${n}.range`])] +
        (kbd ? det : det * (36 / 7)) +
        (kbd ? num(v, 'ctl.tune') : 0),
      kbd,
      fixedNote: 60,
      syncTo: -1,
    };
  });
  const m = num(v, 'mod.mix') / 10;
  const depth = clamp(Math.pow(num(v, 'mod.depth') / 10, 2) + (ctx.wheel || 0), 0, 1.2);
  const srcA = v['mod.srcA'] === 'osc3' ? 'osc3' : 'env1';
  const srcB = v['mod.srcB'] === 'lfo' ? 'lfo' : ctx.patched['j.modSrc'] ? 'mult' : 'noise';
  const routes: EngineRoute[] = [];
  const bus = (dst: EngineDest, max: number): void => {
    if ((1 - m) * depth > 0.0005) routes.push({ src: srcA, dst, amt: (1 - m) * depth * max });
    if (m * depth > 0.0005) routes.push({ src: srcB, dst, amt: m * depth * max });
  };
  if (v['mod.toOsc']) bus('pitchAll', 14);
  if (v['mod.toFilter']) bus('cutoff', 4.5);
  const fDecay = envTime(num(v, 'fenv.decay'));
  const aDecay = envTime(num(v, 'aenv.decay'));
  return {
    osc,
    noise: {
      level: v['mix.noiseOn'] ? level10(num(v, 'mix.noise'), 0.8) : 0,
      color: v['noise.colour'] === 'pink' ? 'pink' : 'white',
    },
    ext: {
      level: v['mix.extOn']
        ? level10(num(v, 'mix.ext'), 1.6) * (0.4 + num(v, 'out.volume') / 10)
        : 0,
    },
    filter: {
      type: 'ladder',
      mode: v['filter.mode'] === 'hp' ? 'hp' : 'lp',
      cutoff: cutoffHz(num(v, 'filter.cutoff')),
      res: (num(v, 'filter.emphasis') / 10) * 1.06,
      envAmt: (num(v, 'filter.contour') / 10) * 8.5,
      envSrc: 'env1',
      kbd: (v['filter.kbd1'] ? 1 / 3 : 0) + (v['filter.kbd2'] ? 2 / 3 : 0),
    },
    env1: {
      a: envTime(num(v, 'fenv.attack')),
      d: fDecay,
      s: num(v, 'fenv.sustain') / 10,
      r: v['env.filterDecay'] ? fDecay : 0.012,
    },
    env2: {
      a: envTime(num(v, 'aenv.attack')),
      d: aDecay,
      s: num(v, 'aenv.sustain') / 10,
      r: v['env.loudDecay'] ? aDecay : 0.012,
    },
    vca: { envSrc: 'env2', bias: 0 },
    lfo: {
      rate: lfoHz(num(v, 'lfo.rate')),
      mix: v['lfo.shape'] === 'tri' ? { tri: 1 } : { sq: 1 },
      keySync: false,
    },
    glide: { time: Math.pow(num(v, 'ctl.glide') / 10, 2) * 2, legato: false },
    trig: { retrig: false, drone: false, repeat: false },
    paraphonic: false,
    routes,
    normals: { extIn: 'out' },
    od: { on: false },
    delay: { on: false },
    sh: { rate: 5, glide: 0 },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: 0,
    a440: !!v['out.a440'],
    volume: v['out.mainOn'] ? level10(num(v, 'out.volume'), 1) : 0,
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const modelD: SynthDef & { version: number } = {
  id: 'model-d',
  version: 1,
  name: 'Model D',
  maker: 'Behringer',
  year: 2018,
  heritage: 'Modelled on the 1970 Minimoog Model D',
  summary:
    'Three oscillators and noise feed a mixer, then the 24 dB ladder filter and the amplifier. Two envelopes shape filter and loudness; one mod bus adds vibrato, sweeps and FM.',
  view: { w: 2000, h: 716 },
  theme: {
    panel: '#1b1c1e',
    panel2: '#121314',
    ink: '#ecebe6',
    font: 'din',
    cheeks: 'wood',
    cheekW: 40,
  },
  signalNames: {
    env1: 'the filter contour',
    env2: 'the loudness contour',
    mixer: 'the mixer output (oscillators and noise)',
  },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default modelD;
