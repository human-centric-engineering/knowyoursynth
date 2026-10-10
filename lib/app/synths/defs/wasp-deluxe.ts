/**
 * Behringer WASP Deluxe: the definition (D1). Positions are pixels on the 1540×850 product image
 * (ref/behringer-wasp-deluxe.jpg), written in image space and moved by (OX, OY) at the end so the
 * view starts at the faceplate's top-left corner (the photo has black background above and below
 * the faceplate). The data model is ref/behringer-wasp-deluxe.synth.json (Quick Start Guide, 37
 * numbered controls, plus the two unnumbered FILTER CONTROL knobs and the OSC1 / OSC2 jacks read
 * from the panel), which follows the EDP Wasp Deluxe: two digital oscillators into one multimode
 * filter and a VCA, a control oscillator with six shapes, and two envelopes that can each repeat.
 *
 * Engine notes: the EXT knob with nothing in EXT AUDIO feeds the WASP's own output back into the
 * mixer (`normals.extIn`). NOTCH is the state-variable filter's `morph` mode at 0.5. REPEAT on both
 * envelopes is the envelope `loop` flag and HOLD is `freeze`. The control oscillator's NOISE and RND
 * shapes are the noise signal and the sample and hold clocked by the control oscillator.
 *
 * Transliterated from the prototype file `src/synths/wasp-deluxe.js` (D3), the way
 * `defs/model-d.ts` was: no content (sounds, lineage, unusual notes), a `version`, the maker's marks
 * tagged `brand` (the Behringer logo and the printed "WASP DELUXE"), and panel values read through
 * `num()`.
 */
import type {
  Area,
  Control,
  ControlCommon,
  ControlOption,
  ControlValues,
  Decor,
  EngineParams,
  EngineRoute,
  InputJack,
  Jack,
  KnobControl,
  LfoMix,
  OscParams,
  OutputJack,
  SynthDef,
  TextDecor,
  ViewRect,
  WaveShape,
} from '@/lib/app/synths/contract';
import { expMap, fmtHz, fmtSemi, fmtTime, level10 } from '@/lib/app/synths/lib/maps';

type KnobRest = Omit<ControlCommon, 'id' | 'x' | 'y'> &
  Pick<KnobControl, 'ring'> & {
    min?: number;
    max?: number;
    def?: number;
    fmt?: (v: number) => string;
  };
type RotaryRest = Pick<ControlCommon, 'name' | 'module' | 'help'>;
type JackRest<J extends Jack> = Omit<J, 'id' | 'x' | 'y' | 'r' | 'labelPos' | 'dir'>;

/** A panel value as a number. A continuous control always holds one. */
const num = (v: ControlValues, id: string): number => Number(v[id]);

// ── Ranges and tapers ─────────────────────────────────────────────────────
// The guide gives the control oscillator range (0.5 to 100 Hz) and the control envelope's delay (up to 1 s). Everything
// else here is this app's choice (see the "What is not modelled" entry).
const lfoHz = (v: number): number => expMap(v / 10, 0.5, 100);
const cutHz = (v: number): number => expMap(v / 10, 25, 16000);
const envA = (v: number): number => expMap(v / 10, 0.002, 4);
const envD = (v: number): number => expMap(v / 10, 0.01, 8);
const glideTime = (v: number): number => (v <= 0 ? 0 : 0.01 * Math.pow(300, v / 10)); // up to 3 s
const REP = 0.5; // below this the SUSTAIN LEVEL and DELAY knobs are in their REPEAT position
const sustainOf = (v: number): number => (v < REP ? 0 : (v - REP) / (10 - REP));
const delayOf = (v: number): number => (v < REP ? 0 : (v - REP) / (10 - REP));
const pitch2Semi = (v: number): number => (v - 5) * 2.4; // an octave either way, unison at the centre
const bendSemi = (v: number): number => v * 2.4; // an octave either way
const tuneSemi = (v: number): number => v * 0.2; // a semitone either way
const pitchModSemi = (v: number): number => (v > 0 ? Math.pow(v / 10, 2) * 24 : 0);
const signed = (v: number, max: number, curve = 1.4): number =>
  v === 0 ? 0 : Math.sign(v) * Math.pow(Math.abs(v) / 5, curve) * max;
const FT_SEMI: Record<string, number> = { 32: -24, 16: -12, 8: 0, 4: 12, 2: 24 };

const OX = 14,
  OY = 108; // image pixel of the view's top-left corner
const controls: Control[] = [];
const decor: Decor[] = [];
const jacks: Jack[] = [];
const INK = '#f5a91c';

// ── Drawing helpers (image coordinates) ───────────────────────────────────
const polarXY = (x: number, y: number, r: number, a: number): [number, number] => [
  x + r * Math.sin((a * Math.PI) / 180),
  y - r * Math.cos((a * Math.PI) / 180),
];
/** Text centred on (x, y): the renderer places text by its baseline. */
const text = (
  x: number,
  y: number,
  t: string,
  size = 14,
  rest: Partial<Pick<TextDecor, 'anchor'>> = {}
): void => {
  decor.push({
    t: 'text',
    x,
    y: y + size * 0.35,
    text: t,
    size,
    anchor: 'middle',
    weight: 700,
    ...rest,
  });
};
const lines = (x: number, y: number, t: string, size = 14, gap = 13): void =>
  t.split('\n').forEach((s, i) => text(x, y + i * gap, s, size));
const line = (x1: number, y1: number, x2: number, y2: number, w = 3): void => {
  decor.push({ t: 'line', x1, y1, x2, y2, w });
};
const dashed = (x1: number, y1: number, x2: number, y2: number): void => {
  const n = Math.round(Math.hypot(x2 - x1, y2 - y1) / 12);
  for (let i = 0; i < n; i += 2)
    line(
      x1 + ((x2 - x1) * i) / n,
      y1 + ((y2 - y1) * i) / n,
      x1 + ((x2 - x1) * (i + 1)) / n,
      y1 + ((y2 - y1) * (i + 1)) / n,
      3
    );
};
const glyph = (x: number, y: number, shape: WaveShape, size = 9): void => {
  decor.push({ t: 'wave', x, y, size, shape, w: 2.2 });
};
/** The arc with an arrow at each end that the panel prints round a bipolar knob, with 0, − and +. */
const bipolarArc = (x: number, y: number): void => {
  decor.push(
    { t: 'arc', x, y, r: 46, a0: -112, a1: -16, w: 3, cap: 'butt' },
    { t: 'arc', x, y, r: 46, a0: 16, a1: 112, w: 3, cap: 'butt' }
  );
  const [lx, ly] = polarXY(x, y, 46, -112);
  const [rx, ry] = polarXY(x, y, 46, 112);
  decor.push(
    { t: 'arrow', x: lx, y: ly + 4, dir: 'down', size: 6 },
    { t: 'arrow', x: rx, y: ry + 4, dir: 'down', size: 6 }
  );
  text(x, y - 46, '0', 15);
  text(x - 47, y + 30, '−', 18);
  text(x + 47, y + 30, '+', 18);
};

const knob = (id: string, x: number, y: number, rest: KnobRest): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 34,
    style: 'wasp',
    kind: 'cont',
    min: 0,
    max: 10,
    def: 0,
    labelPos: 'none',
    ...rest,
  });
};
/** A rotary switch: printed positions are drawn by hand (labels ''), so the ticks and lettering sit where the panel has them. */
const rotary = (
  id: string,
  x: number,
  y: number,
  options: ControlOption[],
  def: string,
  rest: RotaryRest
): void => {
  controls.push({
    id,
    type: 'knob',
    x,
    y,
    r: 29,
    style: 'wasp',
    kind: 'enum',
    options,
    def,
    labelPos: 'none',
    ...rest,
  });
};
const at = (x: number, y: number, a: number, r: number, t: string, size = 13): void => {
  const [px, py] = polarXY(x, y, r, a);
  text(px, py, t, size);
};
const glyphAt = (x: number, y: number, a: number, r: number, shape: WaveShape): void => {
  const [px, py] = polarXY(x, y, r, a);
  glyph(px, py, shape);
};

// ── Faceplate ─────────────────────────────────────────────────────────────
[
  [73, 128],
  [542, 128],
  [998, 128],
  [1463, 128],
  [73, 627],
  [542, 627],
  [998, 627],
  [1463, 627],
].forEach(([x, y]) => decor.push({ t: 'screw', x, y, r: 9 }));
decor.push({ t: 'frame', x: 49, y: 119, w: 1435, h: 516, r: 14, labelAt: 'none', sw: 3 });
line(322, 119, 322, 236);
line(49, 236, 1484, 236);
line(49, 262, 1484, 262);
[172, 770, 1365].forEach((x) => line(x, 236, x, 635));
line(1008, 236, 1008, 478);
line(530, 236, 530, 392);
line(530, 598, 530, 635);
dashed(770, 478, 1008, 478);
dashed(889, 478, 889, 635);
line(1008, 435, 1365, 435);
(
  [
    ['KEYBOARD', 111],
    ['OSCILLATORS', 351],
    ['CONTROL OSC', 650],
    ['FILTER', 889],
    ['ENVELOPE GENERATORS', 1187],
    ['OUTPUT', 1425],
  ] as [string, number][]
).forEach(([t, x]) => text(x, 249, t, 17));

decor.push({ t: 'usb', x: 79, y: 190, w: 44, h: 40 });
decor.push({ t: 'din', x: 172, y: 190, r: 32 }, { t: 'din', x: 259, y: 190, r: 32 });
text(172, 142, 'MIDI IN', 15);
text(259, 142, 'MIDI THRU', 15);
decor.push({
  t: 'text',
  x: 885,
  y: 222,
  text: 'WASP',
  size: 74,
  anchor: 'middle',
  weight: 800,
  spacing: 2,
  hw: true,
  brand: true,
});
decor.push({
  t: 'text',
  x: 1094,
  y: 225,
  text: 'DELUXE',
  size: 32,
  anchor: 'middle',
  weight: 800,
  hw: true,
  brand: true,
});
decor.push({
  t: 'logo',
  x: 1260,
  y: 212,
  size: 20,
  text: 'behringer',
  style: 'behringer',
  brand: true,
});

// ── Keyboard: bend, tune, glide ───────────────────────────────────────────
knob('pitch.bend', 112, 324, {
  min: -5,
  max: 5,
  def: 0,
  ring: false,
  name: 'Bend',
  module: 'glide',
  fmt: (v) => fmtSemi(bendSemi(v)),
  help: 'Bends the pitch of both oscillators up (clockwise) or down, up to an octave either way. Leave it at 0, the top, to play in tune.',
});
bipolarArc(112, 324);
text(112, 372, 'BEND', 16);
controls.push({
  id: 'pitch.tune',
  type: 'knob',
  x: 112,
  y: 434,
  r: 13,
  style: 'pro1',
  kind: 'cont',
  min: -5,
  max: 5,
  def: 0,
  ring: false,
  labelPos: 'none',
  name: 'Tune',
  module: 'glide',
  fmt: (v) => `${v > 0 ? '+' : ''}${Math.round(tuneSemi(v) * 100)} cents`,
  help: 'Fine tuning of the whole synth, about a semitone either way, to match other instruments.',
});
text(112, 462, 'TUNE', 16);
knob('pitch.glide', 112, 543, {
  name: 'Glide',
  module: 'glide',
  fmt: (v) => (v <= 0 ? 'off' : fmtTime(glideTime(v))),
  help: 'Portamento: each new note slides from the last one instead of jumping. Clockwise is a slower slide.',
});
text(112, 590, 'GLIDE', 16);

// ── Oscillators ───────────────────────────────────────────────────────────
const FT_OPTS: ControlOption[] = [
  { v: '32', label: '32', a: -66 },
  { v: '16', label: '16', a: -33 },
  { v: '8', label: '8', a: 0 },
  { v: '4', label: '4', a: 33 },
  { v: '2', label: '2', a: 66 },
];
const WAVE_OPTS: ControlOption[] = [
  { v: 'off', label: '', a: -54 },
  { v: 'saw', label: '', a: -18 },
  { v: 'square', label: '', a: 18 },
  { v: 'enh', label: '', a: 54 },
];
const waveLabels = (x: number, y: number): void => {
  at(x, y, -54, 50, 'OFF', 13);
  glyphAt(x, y, -18, 48, 'saw');
  glyphAt(x, y, 18, 48, 'sq');
  at(x, y, 54, 50, 'ENH', 13);
};
const ftLabels = (x: number, y: number): void =>
  FT_OPTS.forEach((o) => at(x, y, o.a ?? 0, 48, o.label, 13));

rotary(
  'osc1.ft',
  231,
  324,
  FT_OPTS.map((o) => ({ ...o, label: '' })),
  '8',
  {
    name: 'OSC 1 footage (FT)',
    module: 'osc',
    help: 'The octave of the upper oscillator, in organ feet: 32 is the lowest, 2 the highest, and each step is an octave.',
  }
);
ftLabels(231, 324);
text(231, 372, 'FT', 16);
knob('osc1.width', 350, 324, {
  min: 10,
  max: 50,
  def: 50,
  name: 'OSC 1 pulse width',
  module: 'osc',
  fmt: (v) => `${Math.round(v)} %`,
  help: 'The width of the upper oscillator’s square wave. At 50 % it is a hollow square; turned down towards 10 % it thins to a nasal, reedy pulse. It is heard with the square and ENH waveforms.',
});
text(326, 360, '10', 13);
text(382, 360, '50', 13);
text(350, 384, 'WIDTH %', 15);
rotary('osc1.wave', 473, 324, WAVE_OPTS, 'saw', {
  name: 'OSC 1 waveform',
  module: 'osc',
  help: 'The upper oscillator’s waveform: sawtooth (bright and buzzy), square (hollow), ENH (the two together, fuller and more biting), or OFF.',
});
waveLabels(473, 324);

rotary(
  'osc2.ft',
  231,
  543,
  FT_OPTS.map((o) => ({ ...o, label: '' })),
  '8',
  {
    name: 'OSC 2 footage (FT)',
    module: 'osc',
    help: 'The octave of the lower oscillator: 32 is the lowest, 2 the highest.',
  }
);
ftLabels(231, 543);
text(231, 590, 'FT', 16);
knob('osc2.pitch', 350, 543, {
  def: 5,
  name: 'OSC 2 pitch',
  module: 'osc',
  fmt: (v) => fmtSemi(pitch2Semi(v)),
  help: 'Tunes the lower oscillator against the upper one, up to an octave either way; in unison at the centre. A little off the centre makes the two beat and thicken; further round it sets an interval such as a fifth.',
});
text(350, 590, 'PITCH', 16);
rotary('osc2.wave', 473, 543, WAVE_OPTS, 'off', {
  name: 'OSC 2 waveform',
  module: 'osc',
  help: 'The lower oscillator’s waveform: sawtooth, square, ENH, or OFF.',
});
waveLabels(473, 543);

// ── Mixer ─────────────────────────────────────────────────────────────────
text(228, 433, 'MIX', 16);
knob('mix.osc1', 291, 433, {
  def: 8,
  name: 'Mix OSC 1',
  module: 'mixer',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How loud the upper oscillator is in the mix going into the filter.',
});
text(291, 481, 'OSC 1', 16);
line(339, 433, 363, 433);
knob('mix.osc2', 411, 433, {
  name: 'Mix OSC 2',
  module: 'mixer',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'How loud the lower oscillator is in the mix.',
});
text(411, 481, 'OSC 2', 16);
line(459, 433, 484, 433);
knob('mix.ext', 532, 435, {
  name: 'Mix EXT',
  module: 'mixer',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Level of whatever is patched into EXT AUDIO. With nothing patched, the WASP’s own output is fed back in here: a little thickens the sound, more overdrives it, and near the top it howls.',
});
text(532, 483, 'EXT', 16);
line(578, 435, 592, 435);
line(592, 435, 592, 494);
knob('mix.noise', 592, 543, {
  name: 'Noise signal',
  module: 'mixer',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'White noise into the mix: hiss for breath, wind, surf and snare drums.',
});
lines(592, 590, 'NOISE\nSIGNAL', 15, 12);

// ── Control oscillator ────────────────────────────────────────────────────
knob('ctrl.freq', 590, 324, {
  def: 5,
  name: 'Control osc frequency',
  module: 'lfo',
  fmt: (v) => fmtHz(lfoHz(v)),
  help: 'Speed of the control oscillator, from one cycle every two seconds to 100 Hz. At the top it is fast enough to be heard as a growl or a rough edge rather than a wobble.',
});
text(590, 372, 'FREQ', 16);
knob('ctrl.pitchMod', 709, 324, {
  name: 'Pitch mod',
  module: 'mod',
  fmt: (v) => fmtSemi(pitchModSemi(v)),
  help: 'How far the control oscillator moves the pitch of both oscillators: a touch for vibrato, more for sirens and trills, and at high speeds a clangorous, metallic tone.',
});
lines(709, 372, 'PITCH\nMOD', 15, 12);
const CTRL_OPTS: ControlOption[] = [
  { v: 'sine', label: '', a: -90 },
  { v: 'up', label: '', a: -60 },
  { v: 'down', label: '', a: -30 },
  { v: 'square', label: '', a: 0 },
  { v: 'noise', label: '', a: 32 },
  { v: 'rnd', label: '', a: 62 },
];
rotary('ctrl.wave', 709, 543, CTRL_OPTS, 'sine', {
  name: 'Control osc waveform',
  module: 'lfo',
  help: 'The control oscillator’s shape: sine (smooth vibrato and sweeps), rising or falling sawtooth (ramps that repeat), square (jumps between two values, a trill), NOISE (fast random wobble, a rough edge), or RND (a new random value each cycle: stepped, computer-like patterns).',
});
glyphAt(709, 543, -90, 50, 'sine');
glyphAt(709, 543, -60, 48, 'saw');
glyphAt(709, 543, -30, 48, 'rsaw');
glyphAt(709, 543, 0, 47, 'sq');
text(732, 499, 'NOISE', 13, { anchor: 'start' });
text(746, 519, 'RND', 13, { anchor: 'start' });
line(709, 596, 709, 616);
line(709, 616, 830, 616);
line(830, 616, 830, 606);
decor.push({ t: 'arrow', x: 830, y: 603, dir: 'up', size: 6 });

// ── Filter ────────────────────────────────────────────────────────────────
knob('vcf.freq', 830, 324, {
  def: 6,
  name: 'Filter frequency',
  module: 'filter',
  fmt: (v) => fmtHz(cutHz(v)),
  help: 'The filter’s cutoff (low-pass and high-pass) or centre (band-pass and notch) frequency. In low-pass, turning it down makes the sound darker and duller.',
});
text(830, 372, 'FREQ', 16);
knob('vcf.q', 949, 324, {
  def: 2,
  name: 'Q',
  module: 'filter',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Resonance: boosts a band round the filter frequency, so sweeps sound vocal and squelchy, and in band-pass and notch makes the band narrower. Near the top the filter whistles on its own.',
});
text(949, 372, '‘Q’', 16);
const MODE_OPTS: ControlOption[] = [
  { v: 'lo', label: '', a: -54 },
  { v: 'band', label: '', a: -18 },
  { v: 'notch', label: '', a: 18 },
  { v: 'hi', label: '', a: 54 },
];
rotary('vcf.mode', 889, 435, MODE_OPTS, 'lo', {
  name: 'Filter mode',
  module: 'filter',
  help: 'Which part of the sound the filter keeps. LO (low-pass) keeps the bass and takes away brightness; HI (high-pass) the reverse, for thin sounds. BAND keeps only a band round the frequency, a nasal, telephone-like tone; NOTCH removes a band, a hollow, phasey tone.',
});
text(848, 402, 'LO', 13);
text(862, 386, 'BAND', 13);
text(921, 386, 'NOTCH', 13);
text(933, 402, 'HI', 13);
knob('vcf.oscAmt', 830, 543, {
  min: -5,
  max: 5,
  def: 0,
  ring: false,
  name: 'Filter control (control osc)',
  module: 'filter',
  fmt: (v) => `${v > 0 ? '+' : ''}${signed(v, 4).toFixed(1)} oct`,
  help: 'How far the control oscillator moves the filter frequency. At 0 (the top) not at all; clockwise it sweeps the filter with the oscillator, anticlockwise with the oscillator upside down. With a sine this is a wah; with a square, a jump between two tones.',
});
bipolarArc(830, 543);
knob('vcf.envAmt', 949, 543, {
  min: -5,
  max: 5,
  def: 1.5,
  ring: false,
  name: 'Filter control (control env)',
  module: 'filter',
  fmt: (v) => `${v > 0 ? '+' : ''}${signed(v, 7).toFixed(1)} oct`,
  help: 'How far the control envelope moves the filter on each note. Clockwise the filter opens and closes again with the envelope, the classic plucked or wah shape; anticlockwise it dips and comes back up instead.',
});
bipolarArc(949, 543);
text(889, 590, 'FILTER CONTROL', 16);

// ── Envelope generators ───────────────────────────────────────────────────
knob('vca.attack', 1068, 324, {
  name: 'VCA attack',
  module: 'amp',
  fmt: (v) => fmtTime(envA(v)),
  help: 'How long each note takes to reach full loudness. Fully anticlockwise it starts at once; turned up it swells in.',
});
text(1068, 372, 'ATTACK', 16);
knob('vca.decay', 1187, 324, {
  def: 4,
  name: 'VCA decay',
  module: 'amp',
  fmt: (v) => fmtTime(envD(v)),
  help: 'How long the loudness takes to fall from full to the sustain level while the key is held, and to fade out after the key is let go.',
});
text(1187, 372, 'DECAY', 16);
knob('vca.sustain', 1310, 324, {
  def: 8,
  name: 'VCA sustain level / repeat',
  module: 'amp',
  fmt: (v) => (v < REP ? 'REPEAT' : `${Math.round(sustainOf(v) * 100)} %`),
  help: 'How loud a held note stays after the decay. Turned fully anticlockwise, to REPEAT, a held note plays again and again, each time rising over ATTACK and falling over DECAY.',
});
text(1276, 380, 'REPEAT', 13);
lines(1334, 369, 'SUSTAIN\nLEVEL', 13, 11);
controls.push({
  id: 'vca.hold',
  type: 'toggle',
  x: 1127,
  y: 403,
  w: 22,
  h: 22,
  kind: 'bool',
  def: false,
  labelPos: 'none',
  name: 'Hold',
  module: 'amp',
  help: 'Freezes the loudness where it is at the moment you flip it, however it was moving, until you flip it back. Catch a note part way through its decay and it stays there. Flipped up with nothing playing, the synth stays silent until it is flipped back.',
});
text(1127, 380, 'HOLD', 13);
text(1019, 419, 'VCA ENV', 15, { anchor: 'start' });
text(1019, 450, 'CONTROL ENV', 15, { anchor: 'start' });
knob('cenv.attack', 1068, 543, {
  name: 'Control env attack',
  module: 'env',
  fmt: (v) => fmtTime(envA(v)),
  help: 'How long the control envelope takes to rise, and so how quickly FILTER CONTROL opens the filter at the start of a note.',
});
text(1068, 590, 'ATTACK', 16);
line(1068, 596, 1068, 616);
line(1068, 616, 949, 616);
line(949, 616, 949, 606);
decor.push({ t: 'arrow', x: 949, y: 603, dir: 'up', size: 6 });
knob('cenv.decay', 1187, 543, {
  def: 4,
  name: 'Control env decay',
  module: 'env',
  fmt: (v) => fmtTime(envD(v)),
  help: 'How long the control envelope takes to fall back after its peak, and so how long the filter sweep lasts. It falls whether the key is held or not.',
});
text(1187, 590, 'DECAY', 16);
knob('cenv.delay', 1310, 543, {
  def: 0.5,
  name: 'Control env delay / repeat',
  module: 'env',
  fmt: (v) => (v < REP ? 'REPEAT' : v === REP ? 'no delay' : fmtTime(delayOf(v))),
  help: 'Clockwise, a wait of up to a second after the key goes down before the control envelope starts, so the filter moves late. Fully anticlockwise, at REPEAT, the envelope rises and falls again and again for as long as the key is held.',
});
text(1276, 600, 'REPEAT', 13);
text(1336, 589, 'DELAY', 13);

// ── Output ────────────────────────────────────────────────────────────────
knob('out.volume', 1427, 324, {
  def: 7,
  name: 'Volume',
  module: 'out',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'The overall output level.',
});
text(1427, 372, 'VOLUME', 16);
line(1427, 458, 1427, 505);
knob('out.phones', 1427, 543, {
  def: 7,
  name: 'Phones level',
  module: 'out',
  fmt: (v) => `${Math.round(v * 10)} %`,
  help: 'Headphone level on the hardware. It does not change the sound here: use VOLUME.',
});
text(1427, 590, 'PHONES', 16);

// ── Jacks ─────────────────────────────────────────────────────────────────
const jackIn = (id: string, x: number, y: number, rest: JackRest<InputJack>): void => {
  jacks.push({ id, x, y, r: 15, labelPos: 'none', dir: 'in', ...rest });
};
const jackOut = (id: string, x: number, y: number, rest: JackRest<OutputJack>): void => {
  jacks.push({ id, x, y, r: 15, labelPos: 'none', dir: 'out', ...rest });
};
text(412, 152, 'OSC1', 14);
decor.push({ t: 'arrow', x: 412, y: 140, dir: 'up', size: 5 });
text(471, 152, 'OSC2', 14);
decor.push({ t: 'arrow', x: 471, y: 140, dir: 'up', size: 5 });
text(531, 152, 'EXT', 14);
decor.push({ t: 'arrow', x: 531, y: 165, dir: 'down', size: 5 });
text(531, 218, 'AUDIO', 14);
jackOut('j.osc1', 412, 190, {
  label: 'OSC1',
  name: 'OSC1 out',
  signal: 'osc1',
  help: 'The upper oscillator on its own, before the mixer and filter.',
});
jackOut('j.osc2', 471, 190, {
  label: 'OSC2',
  name: 'OSC2 out',
  signal: 'osc2',
  help: 'The lower oscillator on its own, before the mixer and filter.',
});
jackIn('j.ext', 531, 190, {
  label: 'EXT AUDIO',
  dest: 'extIn',
  amt: 1,
  check: (v) =>
    num(v, 'mix.ext') <= 0
      ? 'The EXT knob in the mixer is at 0, so nothing patched here reaches the filter. Turn EXT up.'
      : null,
  help: 'Outside audio into the mixer, set by the EXT knob, so it can be filtered like the oscillators. A cable here replaces the feedback of the WASP’s own output that EXT carries when nothing is patched.',
});
text(1365, 152, 'MAIN', 14);
decor.push({ t: 'arrow', x: 1365, y: 140, dir: 'up', size: 5 });
text(1365, 218, 'AUDIO', 14);
jackOut('j.main', 1365, 190, {
  label: 'MAIN AUDIO',
  signal: 'out',
  help: 'The main audio output.',
});
text(1427, 152, 'POWER', 14);
decor.push({ t: 'led', x: 1427, y: 190, r: 6, color: 'green', litWhen: 'power' });
jackOut('j.phones', 1427, 435, { label: 'PHONES', signal: 'out', help: 'Headphone output.' });

// ── Areas (image coordinates) ─────────────────────────────────────────────
const R = (x0: number, y0: number, x1: number, y1: number): ViewRect => ({
  x: x0,
  y: y0,
  w: x1 - x0,
  h: y1 - y0,
});
const areas: Area[] = [
  {
    id: 'midi',
    label: 'MIDI and USB',
    module: 'util',
    keywords: 'midi usb thru poly chain',
    rects: [R(14, 108, 322, 236)],
    help: 'The WASP Deluxe has no keyboard: it is played over MIDI IN or USB, here from the on-screen keyboard. MIDI THRU passes the notes on, which is how several units are chained for more voices.',
  },
  {
    id: 'patch',
    label: 'Oscillator outputs and EXT AUDIO',
    module: 'util',
    keywords: 'patch jack input output external audio',
    rects: [R(322, 108, 1320, 236)],
    help: 'OSC1 and OSC2 send each oscillator out on its own, before the filter. EXT AUDIO brings another sound into the mixer, where the EXT knob sets its level and the filter shapes it.',
  },
  {
    id: 'keyboard',
    label: 'Keyboard: bend, tune, glide',
    module: 'glide',
    keywords: 'pitch bend tune portamento glide',
    rects: [R(14, 236, 172, 645)],
    help: 'BEND bends the pitch up or down from the 0 at the top. TUNE is fine tuning, and GLIDE makes each note slide into the next.',
  },
  {
    id: 'osc1',
    label: 'Upper oscillator (OSC 1)',
    module: 'osc',
    keywords: 'oscillator footage octave pulse width pwm waveform sawtooth square enhanced',
    rects: [R(172, 236, 530, 385)],
    help: 'The upper oscillator. FT picks the octave, the waveform switch picks sawtooth, square, ENH or OFF, and WIDTH sets how thin the square is.',
  },
  {
    id: 'mixer',
    label: 'Mix',
    module: 'mixer',
    keywords: 'mixer level volume noise feedback external',
    rects: [R(172, 385, 560, 490), R(530, 490, 650, 645)],
    help: 'Levels for the two oscillators, EXT and white noise, all going into the filter. With nothing patched into EXT AUDIO, EXT feeds the WASP’s own output back in: from thickening, through overdrive, to a howl.',
  },
  {
    id: 'osc2',
    label: 'Lower oscillator (OSC 2)',
    module: 'osc',
    keywords: 'oscillator footage octave detune interval waveform',
    rects: [R(172, 490, 530, 645)],
    help: 'The lower oscillator: FT for the octave, the waveform switch, and PITCH to tune it against the upper one for detuning or intervals.',
  },
  {
    id: 'ctrl',
    label: 'Control oscillator',
    module: 'lfo',
    keywords: 'lfo vibrato wobble trill random sample hold noise rate',
    rects: [R(530, 236, 770, 385), R(560, 385, 770, 490), R(650, 490, 770, 645)],
    help: 'The control oscillator is the LFO: it makes no sound itself but moves other things. FREQ sets its speed, from slow to 100 Hz, and the switch picks one of six shapes. PITCH MOD sends it to both oscillators’ pitch; the left FILTER CONTROL knob sends it to the filter.',
  },
  {
    id: 'filter',
    label: 'Filter',
    module: 'filter',
    keywords:
      'cutoff resonance q brightness low-pass band-pass notch high-pass multimode filter control',
    rects: [R(770, 236, 1008, 645)],
    help: 'One multimode filter: LO, BAND, NOTCH or HI. FREQ sets where it acts and Q how sharply. The two FILTER CONTROL knobs below are its modulation: the control oscillator on the left, the control envelope on the right, each with 0 at the top so it can push the filter either way.',
  },
  {
    id: 'vcaenv',
    label: 'VCA envelope',
    module: 'amp',
    keywords: 'envelope loudness attack decay sustain release repeat hold amplifier',
    rects: [R(1008, 236, 1365, 435)],
    help: 'The envelope that shapes each note’s loudness: ATTACK, DECAY (which also sets how long the note fades after the key is let go) and SUSTAIN LEVEL. SUSTAIN LEVEL’s far end is REPEAT, and HOLD freezes the loudness where it is.',
  },
  {
    id: 'cenv',
    label: 'Control envelope',
    module: 'env',
    keywords: 'envelope filter envelope contour attack decay delay repeat',
    rects: [R(1008, 435, 1365, 645)],
    help: 'A second envelope for the filter, reaching it through the right-hand FILTER CONTROL knob. It rises over ATTACK and falls over DECAY on each note. Its third knob delays the start by up to a second, or at its far end, REPEAT, cycles it while the key is held.',
  },
  {
    id: 'output',
    label: 'Output',
    module: 'out',
    keywords: 'volume headphones main output',
    rects: [R(1320, 108, 1526, 236), R(1365, 236, 1526, 645)],
    help: 'VOLUME sets the output level, and PHONES the headphone level. MAIN AUDIO is the audio output.',
  },
];

// ── Move everything from image pixels to view units ───────────────────────
// `t` and `id` are only there so every decor item, control and jack fits the parameter (a path has no x or y).
const shiftXY = (
  o: Partial<Record<'t' | 'id' | 'x' | 'x1' | 'x2' | 'y' | 'y1' | 'y2', unknown>>
): void => {
  for (const k of ['x', 'x1', 'x2'] as const) {
    const n = o[k];
    if (typeof n === 'number') o[k] = n - OX;
  }
  for (const k of ['y', 'y1', 'y2'] as const) {
    const n = o[k];
    if (typeof n === 'number') o[k] = n - OY;
  }
};
[...controls, ...decor, ...jacks].forEach(shiftXY);
areas.forEach((a) => a.rects.forEach(shiftXY));

// ── Engine mapping ────────────────────────────────────────────────────────
const LFO_MIX: Record<string, LfoMix> = {
  sine: { sine: 1 },
  up: { saw: 1 },
  down: { rsaw: 1 },
  square: { sq: 1 },
};
const oscOf = (wave: string, width: number, semi: number, lvl: number): OscParams => {
  const pw = width / 100;
  if (wave === 'off') return { level: 0, mix: {}, pw: 0.5, semi, kbd: true, syncTo: -1 };
  const mix =
    wave === 'saw' ? { saw: 0.6 } : wave === 'square' ? { pulse: 0.6 } : { saw: 0.5, pulse: 0.42 };
  return { level: lvl, mix, pw, semi, kbd: true, syncTo: -1 };
};

function toEngine(v: ControlValues): EngineParams {
  const shape = String(v['ctrl.wave']);
  const src = shape === 'noise' ? 'noise' : shape === 'rnd' ? 'sh' : 'lfo';
  const routes: EngineRoute[] = [];
  const add = (s: string, dst: string, amt: number): void => {
    if (amt) routes.push({ src: s, dst, amt });
  };
  add(src, 'pitchAll', pitchModSemi(num(v, 'ctrl.pitchMod')));
  add(src, 'cutoff', signed(num(v, 'vcf.oscAmt'), 4));
  const mode = v['vcf.mode'];
  const vRep = num(v, 'vca.sustain') < REP;
  const cRep = num(v, 'cenv.delay') < REP;
  const vd = envD(num(v, 'vca.decay'));
  const cd = envD(num(v, 'cenv.decay'));
  const rate = lfoHz(num(v, 'ctrl.freq'));
  return {
    osc: [
      oscOf(
        String(v['osc1.wave']),
        num(v, 'osc1.width'),
        FT_SEMI[String(v['osc1.ft'])],
        level10(num(v, 'mix.osc1'), 1)
      ),
      oscOf(
        String(v['osc2.wave']),
        50,
        FT_SEMI[String(v['osc2.ft'])] + pitch2Semi(num(v, 'osc2.pitch')),
        level10(num(v, 'mix.osc2'), 1)
      ),
    ],
    noise: { level: level10(num(v, 'mix.noise'), 0.6), color: 'white' },
    ext: { level: level10(num(v, 'mix.ext'), 1.2) },
    filter: {
      type: 'svf',
      mode: mode === 'lo' ? 'lp' : mode === 'hi' ? 'hp' : mode === 'band' ? 'bp' : 'morph',
      ...(mode === 'notch' ? { morph: 0.5 } : {}),
      cutoff: cutHz(num(v, 'vcf.freq')),
      res: (num(v, 'vcf.q') / 10) * 1.03,
      envAmt: signed(num(v, 'vcf.envAmt'), 7),
      envSrc: 'env2',
      kbd: 0.5,
    },
    env1: {
      a: envA(num(v, 'vca.attack')),
      d: vd,
      s: sustainOf(num(v, 'vca.sustain')),
      r: vd,
      loop: vRep,
      freeze: v['vca.hold'] === true,
    },
    env2: {
      a: envA(num(v, 'cenv.attack')),
      d: cd,
      s: 0,
      r: cd,
      dly: cRep ? 0 : delayOf(num(v, 'cenv.delay')),
      loop: cRep,
    },
    vca: { envSrc: 'env1', bias: 0 },
    lfo: { rate, mix: LFO_MIX[shape] ?? { sine: 1 }, keySync: false },
    glide: { time: glideTime(num(v, 'pitch.glide')), legato: false },
    trig: { retrig: false, drone: false, repeat: false },
    routes,
    normals: { extIn: 'out' },
    od: { on: false },
    delay: { on: false },
    sh: { rate, glide: 0, clock: 'lfo' },
    slew: { time: 0.1 },
    att: [1, 1],
    tune: tuneSemi(num(v, 'pitch.tune')) + bendSemi(num(v, 'pitch.bend')),
    volume: level10(num(v, 'out.volume'), 1),
  };
}

const init: ControlValues = {};
controls.forEach((c) => {
  init[c.id] = c.def;
});

const waspDeluxe: SynthDef & { version: number } = {
  id: 'wasp-deluxe',
  version: 1,
  name: 'WASP Deluxe',
  maker: 'Behringer',
  year: 2020,
  heritage: 'Based on the EDP Wasp Deluxe, from Oxford in the late 1970s',
  summary:
    'A mono synth with two digital oscillators, each sawtooth, square or ENH in five octave ranges, into one multimode filter (low-pass, band-pass, notch, high-pass) and a VCA. A control oscillator with six shapes, a VCA envelope and a control envelope for the filter that can both repeat, and an EXT input that feeds the output back in when nothing is patched.',
  view: { w: 1512, h: 537 },
  theme: {
    panel: '#303133',
    panel2: '#26272a',
    ink: INK,
    font: 'din',
    weight: 700,
    cheeks: 'wood',
    cheekW: 26,
    knobRing: 'dots',
    jack: 'black',
  },
  signalNames: {
    osc1: 'OSC 1',
    osc2: 'OSC 2',
    env1: 'the VCA envelope',
    env2: 'the control envelope',
    lfo: 'the control oscillator',
    sh: 'the control oscillator’s RND shape',
    noise: 'the noise generator',
    out: 'the WASP’s output',
  },
  destNames: { extIn: 'the mixer’s EXT channel' },
  decor,
  areas,
  controls,
  jacks,
  init,
  toEngine,
};

export default waspDeluxe;
